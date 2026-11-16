import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { integrityStore } from "../access/staff-store.js";
import { seatingState, latestSeating } from "./seating.rules.js";
const readers = ["MANAGER", "STAFF", "LECTURER"];
const latest = (rows) =>
  [...rows].sort((a, b) => b.version - a.version)[0] || null;
async function load(store, id, actor, lock = false) {
  authorize(actor, readers);
  const kinds = [
    "exams",
    "rooms",
    "sections",
    "subjects",
    "students",
    "enrollments",
    "accounts",
    "attendanceSessions",
    "attendanceMarks",
    "examSeatings",
    "examReports",
  ];
  const data = Object.fromEntries(
    await Promise.all(kinds.map(async (k) => [k, await store.list(k, lock)])),
  );
  const exam = data.exams.find((row) => row.id === id);
  requireValue(
    exam && (actor.role !== "LECTURER" || exam.invigilatorId === actor.id),
    "Không tìm thấy ca thi được phân công trong quyền của bạn.",
    404,
  );
  const reports = data.examReports.filter((row) => row.examId === id);
  const globalLatest = latest(
    (await integrityStore(store).list("examReports", lock)).filter(
      (row) => row.examId === id,
    ),
  );
  requireValue(
    (latest(reports)?.version || 0) === (globalLatest?.version || 0),
    "Hồ sơ hoặc phạm vi đã thay đổi. Liên hệ Quản lý để kiểm tra.",
    409,
  );
  return { data, exam, reports };
}
function snapshot(data, exam) {
  const section = data.sections.find((row) => row.id === exam.sectionId),
    room = data.rooms.find((row) => row.id === exam.roomId),
    teacher = data.accounts.find((row) => row.id === exam.invigilatorId);
  const enrollments = data.enrollments
    .filter(
      (row) => row.sectionId === exam.sectionId && row.status === "ACTIVE",
    )
    .sort((a, b) => a.studentId.localeCompare(b.studentId));
  const sessions = data.attendanceSessions.filter(
    (row) => row.examId === exam.id && row.kind === "EXAM",
  );
  const session = sessions.length === 1 ? sessions[0] : null;
  const marks = data.attendanceMarks
    .filter((row) => row.sessionId === session?.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const seating = seatingState(data, exam),
    plan = latestSeating(data.examSeatings, exam.id);
  const issues = [];
  const ended =
    Date.parse(exam.examDate + "T" + exam.endTime + ":00+07:00") <= Date.now();
  if (!ended) issues.push("Ca thi chưa kết thúc.");
  if (exam.status !== "PUBLISHED")
    issues.push("Lịch thi chưa công bố hoặc đã hủy.");
  if (!session || session.status !== "CLOSED")
    issues.push("Chưa có sổ điểm danh thi được chốt.");
  if (
    session &&
    (session.sectionId !== exam.sectionId ||
      session.sessionDate !== exam.examDate)
  )
    issues.push("Sổ điểm danh chưa đúng lớp hoặc ngày thi.");
  const rosterMatches =
    session &&
    session.roster.length === enrollments.length &&
    enrollments.every((e) =>
      session.roster.some(
        (r) =>
          r.studentId === e.studentId &&
          r.enrollmentId === e.id &&
          r.enrollmentVersion === e.version,
      ),
    );
  if (!rosterMatches)
    issues.push("Danh sách đăng ký và sổ điểm danh chưa khớp.");
  const counts = {
    PRESENT: 0,
    LATE: 0,
    ABSENT: 0,
    EXCUSED: 0,
    NOT_RECORDED: 0,
  };
  const rows = enrollments
    .map((e) => {
      const student = data.students.find((s) => s.id === e.studentId),
        matching = marks.filter(
          (m) =>
            m.studentId === e.studentId &&
            m.enrollmentId === e.id &&
            m.enrollmentVersion === e.version,
        );
      const status =
        matching.length === 1 &&
        ["PRESENT", "LATE", "ABSENT", "EXCUSED"].includes(matching[0].status)
          ? matching[0].status
          : "NOT_RECORDED";
      counts[status]++;
      const seat = seating.plan?.payload.rows.find(
        (r) => r.studentId === e.studentId,
      );
      return {
        studentId: e.studentId,
        enrollmentId: e.id,
        enrollmentVersion: e.version,
        studentVersion: student?.version || 0,
        code: student?.code || "",
        fullName: student?.fullName || "",
        status,
        candidateNumber: seat?.candidateNumber || null,
        seatNumber: seat?.seatNumber || null,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "vi", { numeric: true }));
  if (
    !rows.length ||
    rows.some((row) => !row.code || !row.fullName) ||
    counts.NOT_RECORDED ||
    new Set(rows.map((r) => r.studentId)).size !== rows.length
  )
    issues.push("Cần đủ hồ sơ và trạng thái điểm danh từng thí sinh.");
  const meta = {
    examId: exam.id,
    sectionCode: section?.code || "",
    subjectName:
      data.subjects.find((s) => s.id === section?.subjectId)?.name || "",
    term: section?.term || "",
    roomCode: room?.code || "",
    roomName: room?.name || "",
    examDate: exam.examDate,
    startTime: exam.startTime,
    endTime: exam.endTime,
    invigilatorName: teacher?.fullName || "",
  };
  return {
    ...meta,
    rows,
    counts,
    ended,
    total: rows.length,
    attended: counts.PRESENT + counts.LATE,
    absent: counts.ABSENT + counts.EXCUSED,
    seatingStatus: seating.status,
    issues,
    sourceHash: tokenHash(
      JSON.stringify({
        exam,
        room,
        sectionVersion: section?.version,
        sessions,
        marks,
        rows,
        planId: plan?.id,
        planVersion: plan?.version,
      }),
    ),
  };
}
function publicReport(row, data) {
  if (!row) return null;
  const { requestId, requestHash, ...payload } = row.payload;
  return {
    ...row,
    payload,
    createdByName:
      data.accounts.find((a) => a.id === row.createdBy)?.fullName ||
      "Nhân sự nhà trường",
  };
}
export async function examReportDetail(store, id, actor, query = {}) {
  const { data, exam, reports } = await load(store, id, actor),
    current = latest(reports),
    live = snapshot(data, exam);
  const selected = query.revision
    ? reports.find((row) => String(row.version) === String(query.revision))
    : current;
  if (query.revision)
    requireValue(selected, "Không tìm thấy bản biên bản này.", 404);
  const isLatest = !selected || selected.id === current?.id;
  return {
    live,
    report: publicReport(selected, data),
    isLatest,
    sourceCurrent:
      !selected || selected.payload.snapshot.sourceHash === live.sourceHash,
    canDraft:
      isLatest &&
      actor.role === "LECTURER" &&
      live.ended &&
      exam.status === "PUBLISHED" &&
      (!current || ["DRAFT", "RETURNED"].includes(current.status)),
    canSubmit:
      isLatest &&
      live.ended &&
      actor.role === "LECTURER" &&
      current?.payload.authorId === actor.id &&
      current?.status === "DRAFT",
    canReview:
      isLatest &&
      ["MANAGER", "STAFF"].includes(actor.role) &&
      current?.payload.authorId !== actor.id &&
      current?.status === "SUBMITTED",
    canReopen:
      isLatest &&
      ["MANAGER", "STAFF"].includes(actor.role) &&
      current?.payload.authorId !== actor.id &&
      current?.status === "CONFIRMED",
    history: reports
      .sort((a, b) => b.version - a.version)
      .map((row) => ({
        version: row.version,
        status: row.status,
        createdAt: row.createdAt,
        createdByName:
          data.accounts.find((a) => a.id === row.createdBy)?.fullName ||
          "Nhân sự nhà trường",
        reason: row.payload.reason || "",
      })),
  };
}
export async function mutateExamReport(store, id, action, input, actor) {
  authorize(actor, readers);
  requireValue(
    ["save", "submit", "confirm", "return", "reopen"].includes(action),
    "Thao tác biên bản không hợp lệ.",
  );
  const writer = ["save", "submit"].includes(action);
  authorize(actor, writer ? ["LECTURER"] : ["MANAGER", "STAFF"]);
  requireValue(
    input &&
      Number.isInteger(input.version) &&
      input.version >= 0 &&
      typeof input.requestId === "string" &&
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.requestId),
    "Tải lại biên bản trước khi thao tác.",
  );
  const clean = {
    version: input.version,
    sourceHash: input.sourceHash,
    confirm: input.confirm,
    papers: input.papers,
    notes: input.notes,
    reason: input.reason,
  };
  const requestHash = tokenHash(
    JSON.stringify({ action, actorId: actor.id, ...clean }),
  );
  if (action !== "save")
    requireValue(input.confirm === true, "Cần xác nhận thao tác biên bản.");
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, readers);
    await lockAcademic(tx);
    for (const k of [
      "exams",
      "rooms",
      "attendanceSessions",
      "attendanceMarks",
      "examSeatings",
      "examReports",
    ])
      await tx.list(k, true);
    const { data, exam, reports } = await load(tx, id, actor, true),
      prior = latest(reports);
    const retry = reports.find(
      (row) => row.payload.requestId === input.requestId,
    );
    if (retry) {
      requireValue(
        retry.createdBy === actor.id &&
          retry.payload.requestHash === requestHash,
        "Mã yêu cầu đã được dùng cho nội dung khác.",
        409,
      );
      return { id: retry.id, version: retry.version, status: retry.status };
    }
    requireValue(
      (prior?.version || 0) === input.version,
      "Biên bản đã thay đổi. Tải lại trước khi xử lý.",
      409,
    );
    const live = snapshot(data, exam);
    requireValue(
      exam.status === "PUBLISHED",
      "Ca thi chưa công bố hoặc đã hủy.",
      409,
    );
    requireValue(
      Date.parse(exam.examDate + "T" + exam.endTime + ":00+07:00") <=
        Date.now(),
      "Ca thi chưa kết thúc; chưa được lập biên bản kết quả.",
      409,
    );
    let status,
      papers = prior?.payload.papers,
      notes = prior?.payload.notes,
      authorId = prior?.payload.authorId,
      reason = "";
    if (action === "save") {
      requireValue(
        !prior || ["DRAFT", "RETURNED"].includes(prior.status),
        "Chỉ sửa bản nháp hoặc biên bản được trả bổ sung.",
        409,
      );
      requireValue(
        typeof input.notes === "string" &&
          input.notes.length <= 4000 &&
          Number.isInteger(input.papers) &&
          input.papers >= 0 &&
          input.papers <= 1000,
        "Số bài thu từ 0–1000 và ghi chú tối đa 4000 ký tự.",
      );
      requireValue(
        input.sourceHash === live.sourceHash,
        "Dữ liệu ca thi đã thay đổi. Tải lại trước khi lưu.",
        409,
      );
      status = "DRAFT";
      papers = input.papers;
      notes = input.notes.trim();
      authorId = actor.id;
    } else if (action === "submit") {
      requireValue(
        prior?.status === "DRAFT" && prior.payload.authorId === actor.id,
        "Chỉ giảng viên lập được gửi bản nháp của mình.",
        409,
      );
      requireValue(
        input.sourceHash === live.sourceHash &&
          prior.payload.snapshot.sourceHash === live.sourceHash,
        "Nguồn điểm danh hoặc ca thi đã thay đổi. Lưu lại nháp trước khi gửi.",
        409,
      );
      requireValue(!live.issues.length, live.issues.join(" "), 409);
      requireValue(
        papers <= live.attended,
        "Số bài thu không được vượt số thí sinh có mặt/đến muộn.",
        409,
      );
      requireValue(
        (papers === live.attended && live.seatingStatus !== "STALE") ||
          notes.length >= 5,
        "Ghi rõ lý do thiếu bài hoặc chỗ ngồi chưa khớp trước khi gửi.",
      );
      status = "SUBMITTED";
    } else {
      requireValue(
        prior && actor.id !== prior.payload.authorId,
        "Người lập không tự xác nhận hoặc kiểm tra biên bản của mình.",
        403,
      );
      if (action === "confirm") {
        requireValue(
          prior.status === "SUBMITTED",
          "Chỉ xác nhận biên bản đang chờ kiểm tra.",
          409,
        );
        requireValue(
          input.sourceHash === live.sourceHash &&
            prior.payload.snapshot.sourceHash === live.sourceHash &&
            !live.issues.length,
          "Nguồn đã thay đổi hoặc chưa đầy đủ. Trả bổ sung để lập lại biên bản.",
          409,
        );
        status = "CONFIRMED";
      } else {
        requireValue(
          action === "return"
            ? prior.status === "SUBMITTED"
            : prior.status === "CONFIRMED",
          "Biên bản không ở trạng thái được trả hoặc mở lại.",
          409,
        );
        requireValue(
          typeof input.reason === "string" &&
            input.reason.trim().length >= 5 &&
            input.reason.length <= 1000,
          "Nhập lý do 5–1000 ký tự.",
        );
        reason = input.reason.trim();
        status = "RETURNED";
      }
    }
    const row = {
      id: randomUUID(),
      examId: id,
      status,
      version: input.version + 1,
      createdBy: actor.id,
      createdAt: Date.now(),
      payload: {
        requestId: input.requestId,
        requestHash,
        authorId,
        papers,
        notes,
        reason,
        previousId: prior?.id || null,
        snapshot: ["return", "reopen", "submit", "confirm"].includes(action)
          ? prior.payload.snapshot
          : live,
      },
    };
    await tx.insert("examReports", row);
    await audit(tx, actor, "EXAM_REPORT_" + action.toUpperCase(), row.id, {
      examId: id,
      revision: row.version,
      status,
      papers,
      reason,
    });
    return { id: row.id, version: row.version, status };
  });
}
