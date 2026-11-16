import { lessons } from "../academic/timetable.rules.js";
import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { attendanceStatuses, eligibilitySnapshot } from "./attendance.rules.js";
const managers = ["MANAGER", "STAFF"],
  writers = [...managers, "LECTURER"],
  all = [...writers, "STUDENT"];
const date = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const why = (v) => typeof v === "string" && v.trim() && v.length <= 1000;
async function load(store) {
  const keys = [
    "sections",
    "timetablePlans",
    "subjects",
    "exams",
    "enrollments",
    "students",
    "attendanceSessions",
    "attendanceMarks",
    "attendancePolicies",
  ];
  const values = await Promise.all(keys.map((k) => store.list(k)));
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}
function allowedSections(d, actor) {
  const own = d.students.find((s) => s.accountId === actor.id);
  return d.sections.filter(
    (s) =>
      managers.includes(actor.role) ||
      (actor.role === "LECTURER"
        ? s.lecturerId === actor.id ||
          d.exams.some(
            (e) =>
              e.sectionId === s.id &&
              ["PUBLISHED", "CANCELLED"].includes(e.status) &&
              e.publishedAt &&
              e.invigilatorId === actor.id,
          )
        : d.enrollments.some(
            (e) =>
              e.sectionId === s.id &&
              e.studentId === own?.id &&
              e.status === "ACTIVE",
          )),
  );
}
function writable(d, session, actor) {
  return (
    managers.includes(actor.role) ||
    (actor.role === "LECTURER" &&
      (session.kind === "CLASS"
        ? d.sections.some(
            (s) => s.id === session.sectionId && s.lecturerId === actor.id,
          )
        : d.exams.some(
            (e) =>
              e.id === session.examId &&
              ["PUBLISHED", "CANCELLED"].includes(e.status) &&
              e.publishedAt &&
              e.invigilatorId === actor.id,
          )))
  );
}
function scope(d, sectionId, actor) {
  const section = allowedSections(d, actor).find((s) => s.id === sectionId);
  requireValue(section, "Không tìm thấy lớp trong quyền của bạn.", 404);
  return section;
}
function roster(d, sectionId) {
  return d.enrollments
    .filter((e) => e.sectionId === sectionId && e.status === "ACTIVE")
    .map((e) => ({
      studentId: e.studentId,
      enrollmentId: e.id,
      enrollmentVersion: e.version,
    }))
    .sort((a, b) => a.studentId.localeCompare(b.studentId));
}
function sameRoster(a, b) {
  return tokenHash(JSON.stringify(a)) === tokenHash(JSON.stringify(b));
}
function noLockedExam(d, sectionId) {
  const policy = d.attendancePolicies.find((p) => p.sectionId === sectionId);
  requireValue(
    !policy?.enforceForExams ||
      !d.exams.some(
        (e) => e.sectionId === sectionId && e.status === "PUBLISHED",
      ),
    "Lớp đã công bố lịch áp dụng điều kiện dự thi. Cần hủy lịch trước khi đổi dữ liệu điểm danh đã chốt.",
    409,
  );
}
export async function attendanceOverview(store, actor) {
  authorize(actor, all);
  const d = await load(store),
    sections = allowedSections(d, actor),
    ids = new Set(sections.map((s) => s.id)),
    own = d.students.find((s) => s.accountId === actor.id);
  return {
    sections: sections.map((s) => ({
      id: s.id,
      name:
        s.code +
        " · " +
        (d.subjects.find((m) => m.id === s.subjectId)?.name || ""),
      code: s.code,
      term: s.term,
      lecturerId: s.lecturerId,
    })),
    exams:
      actor.role === "STUDENT"
        ? []
        : d.exams
            .filter(
              (e) =>
                ids.has(e.sectionId) &&
                e.status === "PUBLISHED" &&
                (managers.includes(actor.role) || e.invigilatorId === actor.id),
            )
            .map(({ id, sectionId, examDate, startTime, endTime }) => ({
              id,
              sectionId,
              examDate,
              startTime,
              endTime,
            })),
    sessions: d.attendanceSessions
      .filter(
        (s) =>
          ids.has(s.sectionId) &&
          (actor.role !== "STUDENT" ||
            (s.status === "CLOSED" &&
              s.roster.some((r) => r.studentId === own?.id))),
      )
      .map((s) => ({
        id: s.id,
        sectionId: s.sectionId,
        kind: s.kind,
        sessionDate: s.sessionDate,
        lessonKey: s.lessonKey || "legacy",
        lessonStartTime: s.lessonStartTime,
        lessonEndTime: s.lessonEndTime,
        status: s.status,
        version: s.version,
        canEdit: actor.role !== "STUDENT" && writable(d, s, actor),
      })),
    canManage: managers.includes(actor.role),
  };
}
export async function sessionDetail(store, id, actor) {
  authorize(actor, all);
  const d = await load(store),
    session = d.attendanceSessions.find((s) => s.id === id);
  requireValue(session, "Không tìm thấy buổi điểm danh.", 404);
  const section = scope(d, session.sectionId, actor),
    own = d.students.find((s) => s.accountId === actor.id);
  if (actor.role === "STUDENT")
    requireValue(
      session.status === "CLOSED" &&
        session.roster.some((r) => r.studentId === own?.id),
      "Không tìm thấy buổi điểm danh đã chốt trong quyền của bạn.",
      404,
    );
  return {
    session: { ...session, roster: undefined },
    sectionCode: section.code,
    canEdit: actor.role !== "STUDENT" && writable(d, session, actor),
    rosterChanged: !sameRoster(session.roster, roster(d, session.sectionId)),
    rows: session.roster
      .filter((r) => actor.role !== "STUDENT" || r.studentId === own?.id)
      .map((r) => {
        const s = d.students.find((s) => s.id === r.studentId),
          mark = d.attendanceMarks.find(
            (m) => m.sessionId === id && m.studentId === r.studentId,
          );
        return {
          ...r,
          code: s?.code || "",
          fullName: s?.fullName || "",
          mark:
            mark &&
            mark.enrollmentId === r.enrollmentId &&
            mark.enrollmentVersion === r.enrollmentVersion
              ? mark
              : null,
          markVersion: mark?.version || 0,
        };
      }),
  };
}
export async function sectionEligibility(store, id, actor) {
  authorize(actor, all);
  const d = await load(store);
  scope(d, id, actor);
  const snapshot = await eligibilitySnapshot(store, id),
    own = d.students.find((s) => s.accountId === actor.id);
  return {
    sectionCode: snapshot.section.code,
    sectionId: id,
    policy: snapshot.policy,
    enforced: snapshot.enforced,
    rows: snapshot.rows.filter(
      (r) => actor.role !== "STUDENT" || r.studentId === own?.id,
    ),
  };
}
export async function saveAttendancePolicy(store, input, actor) {
  authorize(actor, managers);
  requireValue(
    input && typeof input === "object",
    "Thông tin điều kiện dự thi không hợp lệ.",
  );
  requireValue(
    Number.isInteger(input.expectedSessions) &&
      input.expectedSessions >= 1 &&
      input.expectedSessions <= 200 &&
      Number.isInteger(input.minAttendancePercent) &&
      input.minAttendancePercent >= 0 &&
      input.minAttendancePercent <= 100,
    "Nhập số buổi từ 1–200 và tỷ lệ từ 0–100.",
  );
  for (const key of [
    "latePresent",
    "excusedPresent",
    "requireFinanceClearance",
    "enforceForExams",
  ])
    requireValue(
      typeof input[key] === "boolean",
      "Chọn đầy đủ cách áp dụng điều kiện.",
    );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const d = await load(tx);
    scope(d, input.sectionId, actor);
    requireValue(
      !d.exams.some(
        (e) => e.sectionId === input.sectionId && e.status === "PUBLISHED",
      ),
      "Cần hủy lịch thi đã công bố trước khi thay đổi điều kiện dự thi.",
      409,
    );
    const prior = d.attendancePolicies.find(
      (p) => p.sectionId === input.sectionId,
    );
    requireValue(
      (prior?.version || 0) === input.version,
      "Điều kiện đã thay đổi. Tải lại trang.",
      409,
    );
    const clean = Object.fromEntries(
      [
        "sectionId",
        "expectedSessions",
        "minAttendancePercent",
        "latePresent",
        "excusedPresent",
        "requireFinanceClearance",
        "enforceForExams",
      ].map((k) => [k, input[k]]),
    );
    const row = {
      id: prior?.id || randomUUID(),
      ...clean,
      version: prior ? prior.version + 1 : 1,
    };
    if (prior)
      await tx.update("attendancePolicies", prior.id, clean, prior.version);
    else await tx.insert("attendancePolicies", row);
    await audit(tx, actor, "ATTENDANCE_POLICY_SAVED", row.id, {
      before: prior || null,
      after: row,
    });
    return row;
  });
}
export async function createSession(store, input, actor) {
  authorize(actor, writers);
  requireValue(
    input && ["CLASS", "EXAM"].includes(input.kind),
    "Chọn loại buổi điểm danh.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, writers);
    await lockAcademic(tx);
    const d = await load(tx),
      exam =
        input.kind === "EXAM"
          ? d.exams.find(
              (e) => e.id === input.examId && e.status === "PUBLISHED",
            )
          : null;
    let sectionId = input.sectionId,
      sessionDate = input.sessionDate;
    if (input.kind === "EXAM") {
      requireValue(exam, "Chọn lịch thi đang công bố.");
      sectionId = exam.sectionId;
      sessionDate = exam.examDate;
    }
    const section = scope(d, sectionId, actor),
      candidate = { sectionId, kind: input.kind, examId: exam?.id || null };
    requireValue(
      writable(d, candidate, actor),
      "Bạn không được điểm danh buổi này.",
      403,
    );
    requireValue(date(sessionDate), "Chọn ngày hợp lệ.");
    const slots =
      input.kind === "CLASS"
        ? lessons(section, d.timetablePlans, sessionDate, sessionDate)
        : [];
    const slot = input.lessonKey
      ? slots.find((r) => r.meetingId === input.lessonKey)
      : slots.length === 1
        ? slots[0]
        : null;
    if (input.kind === "CLASS")
      requireValue(
        slot,
        "Chọn đúng buổi học theo thời khóa biểu; ngày nghỉ không được mở điểm danh.",
      );
    requireValue(
      !d.attendanceSessions.some(
        (s) =>
          s.sectionId === sectionId &&
          s.kind === input.kind &&
          (input.kind === "CLASS"
            ? s.sessionDate === sessionDate &&
              (s.lessonKey || "legacy") === slot.meetingId
            : s.examId === exam.id),
      ),
      "Buổi này đã có sổ điểm danh.",
      409,
    );
    const row = {
      id: randomUUID(),
      ...candidate,
      sessionDate,
      lessonKey: slot?.meetingId || "legacy",
      lessonStartTime: slot?.startTime || null,
      lessonEndTime: slot?.endTime || null,
      lessonRoomId: slot?.roomId || null,
      status: "OPEN",
      roster: roster(d, sectionId),
      closedBy: null,
      closedAt: null,
      version: 1,
    };
    await tx.insert("attendanceSessions", row);
    await audit(tx, actor, "ATTENDANCE_SESSION_CREATED", row.id, {
      after: row,
    });
    return row;
  });
}
async function writeContext(tx, id, actor) {
  await freshActor(tx, actor, writers);
  await lockAcademic(tx);
  const d = await load(tx),
    session = d.attendanceSessions.find((s) => s.id === id);
  requireValue(session, "Không tìm thấy buổi điểm danh.", 404);
  scope(d, session.sectionId, actor);
  if (session.kind === "EXAM")
    requireValue(
      d.exams.some((e) => e.id === session.examId && e.status === "PUBLISHED"),
      "Lịch thi không còn hiệu lực để chỉnh điểm danh.",
      409,
    );
  requireValue(
    writable(d, session, actor),
    "Bạn không được chỉnh buổi điểm danh này.",
    403,
  );
  return { d, session };
}
export async function saveAttendance(store, id, input, actor) {
  authorize(actor, writers);
  requireValue(
    input &&
      Array.isArray(input.rows) &&
      input.rows.length > 0 &&
      input.rows.length <= 1000,
    "Chọn trạng thái điểm danh cho sinh viên.",
  );
  return store.transaction(async (tx) => {
    const { d, session } = await writeContext(tx, id, actor);
    requireValue(
      session.status === "OPEN" && session.version === input.version,
      "Buổi điểm danh đã thay đổi hoặc đã chốt.",
      409,
    );
    const section = d.sections.find((s) => s.id === session.sectionId),
      exam = d.exams.find((e) => e.id === session.examId);
    const starts = Date.parse(
      session.sessionDate +
        "T" +
        (session.kind === "CLASS"
          ? session.lessonStartTime || section.startTime
          : exam.startTime) +
        ":00+07:00",
    );
    requireValue(
      starts <= Date.now(),
      "Chưa đến giờ để ghi nhận điểm danh.",
      409,
    );
    requireValue(
      sameRoster(session.roster, roster(d, session.sectionId)),
      "Danh sách đăng ký đã thay đổi. Đồng bộ danh sách trước khi lưu.",
      409,
    );
    const ids = new Set();
    const eligibility =
      session.kind === "EXAM"
        ? await eligibilitySnapshot(tx, session.sectionId)
        : null;
    const before = [],
      after = [];
    for (const inputRow of input.rows) {
      requireValue(
        inputRow &&
          typeof inputRow === "object" &&
          !ids.has(inputRow.studentId),
        "Dòng sinh viên bị trùng hoặc không hợp lệ.",
      );
      ids.add(inputRow.studentId);
      const member = session.roster.find(
        (r) => r.studentId === inputRow.studentId,
      );
      requireValue(
        member && attendanceStatuses.includes(inputRow.status),
        "Sinh viên hoặc trạng thái điểm danh không hợp lệ.",
      );
      requireValue(
        typeof (inputRow.reason ?? "") === "string" &&
          (inputRow.reason || "").length <= 1000,
        "Ghi chú tối đa 1000 ký tự.",
      );
      if (
        eligibility?.enforced &&
        ["PRESENT", "LATE"].includes(inputRow.status)
      )
        requireValue(
          eligibility.rows.some(
            (r) =>
              r.studentId === inputRow.studentId && r.status === "ELIGIBLE",
          ),
          "Có sinh viên chưa đủ hoặc chưa xác minh điều kiện dự thi.",
          409,
        );
      const prior = d.attendanceMarks.find(
        (m) => m.sessionId === id && m.studentId === member.studentId,
      );
      requireValue(
        (prior?.version || 0) === inputRow.version,
        "Dòng điểm danh đã thay đổi. Tải lại để kiểm tra.",
        409,
      );
      const clean = {
        ...member,
        status: inputRow.status,
        reason: (inputRow.reason || "").trim(),
        enteredBy: actor.id,
      };
      const row = {
        id: prior?.id || randomUUID(),
        sessionId: id,
        ...clean,
        version: prior ? prior.version + 1 : 1,
      };
      if (prior)
        await tx.update("attendanceMarks", prior.id, clean, prior.version);
      else await tx.insert("attendanceMarks", row);
      before.push(prior || null);
      after.push(row);
    }
    await tx.update(
      "attendanceSessions",
      id,
      { status: "OPEN" },
      session.version,
    );
    await audit(tx, actor, "ATTENDANCE_SAVED", id, { before, after });
    return { ...session, version: session.version + 1 };
  });
}
export async function changeSession(store, id, input, actor, action) {
  authorize(actor, writers);
  requireValue(input && input.confirm === true, "Cần xác nhận thao tác.");
  return store.transaction(async (tx) => {
    const { d, session } = await writeContext(tx, id, actor);
    requireValue(
      session.version === input.version,
      "Buổi điểm danh đã thay đổi. Tải lại để kiểm tra.",
      409,
    );
    let changes;
    if (action === "sync") {
      requireValue(
        session.status === "OPEN",
        "Chỉ đồng bộ buổi chưa chốt.",
        409,
      );
      changes = { roster: roster(d, session.sectionId) };
    } else if (action === "close") {
      requireValue(
        session.status === "OPEN" &&
          session.roster.length > 0 &&
          sameRoster(session.roster, roster(d, session.sectionId)),
        "Danh sách trống, đã đổi hoặc buổi đã chốt.",
        409,
      );
      requireValue(
        session.roster.every((r) =>
          d.attendanceMarks.some(
            (m) =>
              m.sessionId === id &&
              m.studentId === r.studentId &&
              m.enrollmentId === r.enrollmentId &&
              m.enrollmentVersion === r.enrollmentVersion &&
              attendanceStatuses.includes(m.status),
          ),
        ),
        "Cần ghi nhận đủ từng sinh viên trước khi chốt.",
        409,
      );
      if (session.kind === "CLASS") noLockedExam(d, session.sectionId);
      if (session.kind === "EXAM") {
        const eligible = await eligibilitySnapshot(tx, session.sectionId);
        if (eligible.enforced)
          requireValue(
            session.roster.every((r) => {
              const mark = d.attendanceMarks.find(
                (m) => m.sessionId === id && m.studentId === r.studentId,
              );
              return (
                !["PRESENT", "LATE"].includes(mark.status) ||
                eligible.rows.some(
                  (e) => e.studentId === r.studentId && e.status === "ELIGIBLE",
                )
              );
            }),
            "Điều kiện dự thi đã thay đổi. Kiểm tra lại trước khi chốt.",
            409,
          );
      }
      changes = { status: "CLOSED", closedBy: actor.id, closedAt: Date.now() };
    } else {
      requireValue(
        action === "reopen" && session.status === "CLOSED" && why(input.reason),
        "Nhập lý do mở lại buổi đã chốt.",
      );
      if (session.kind === "CLASS") noLockedExam(d, session.sectionId);
      changes = { status: "OPEN", closedBy: null, closedAt: null };
    }
    await tx.update("attendanceSessions", id, changes, session.version);
    const after = { ...session, ...changes, version: session.version + 1 };
    await audit(tx, actor, "ATTENDANCE_" + action.toUpperCase(), id, {
      before: session,
      after,
      reason: input.reason || "",
    });
    return after;
  });
}
