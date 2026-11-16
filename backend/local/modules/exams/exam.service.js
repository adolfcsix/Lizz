import { seatingState } from "./seating.rules.js";
import { lessons, intersects } from "../academic/timetable.rules.js";
import { timetableData } from "../academic/timetable.service.js";
import { integrityStore } from "../access/staff-store.js";
import { assertExamEligibility } from "../attendance/attendance.rules.js";
import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { tokenHash } from "../../core/password.js";
import { foldText } from "../../../../shared/local-validation.js";
import { overlaps, candidates, overlapsLesson } from "./exam.rules.js";
const managers = ["MANAGER", "STAFF"],
  all = [...managers, "LECTURER", "STUDENT"];
const code = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(v);
const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const time = (v) =>
  typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
async function data(store) {
  const [rooms, exams, sections, subjects, accounts, enrollments, students] =
    await Promise.all(
      [
        "rooms",
        "exams",
        "sections",
        "subjects",
        "accounts",
        "enrollments",
        "students",
      ].map((k) => store.list(k)),
    );
  return {
    rooms,
    exams,
    sections,
    subjects,
    accounts,
    enrollments,
    students,
    timetablePlans: await store.list("timetablePlans"),
    examSeatings: await store.list("examSeatings"),
    examReports: await store.list("examReports"),
  };
}
function visible(d, actor) {
  if (managers.includes(actor.role)) return d.exams;
  const student = d.students.find((r) => r.accountId === actor.id);
  const ids = new Set(
    d.enrollments
      .filter((r) => r.studentId === student?.id && r.status === "ACTIVE")
      .map((r) => r.sectionId),
  );
  return d.exams.filter(
    (exam) =>
      exam.publishedAt &&
      (exam.status === "PUBLISHED" || exam.status === "CANCELLED") &&
      (actor.role === "STUDENT"
        ? ids.has(exam.sectionId)
        : exam.invigilatorId === actor.id ||
          d.sections.some(
            (s) => s.id === exam.sectionId && s.lecturerId === actor.id,
          )),
  );
}
function decorate(d, exam) {
  const section = d.sections.find((r) => r.id === exam.sectionId),
    room = d.rooms.find((r) => r.id === exam.roomId);
  return {
    ...exam,
    sectionCode: section?.code || "",
    subjectName:
      d.subjects.find((r) => r.id === section?.subjectId)?.name || "",
    term: section?.term || "",
    roomName: room?.name || "",
    roomCode: room?.code || "",
    capacity: room?.capacity || 0,
    enrolled: candidates(d.enrollments, exam.sectionId).size,
    invigilatorName:
      d.accounts.find((r) => r.id === exam.invigilatorId)?.fullName || "",
  };
}
export async function examOverview(store, actor, query = {}) {
  authorize(actor, all);
  const d = await data(store),
    q = foldText(query.q || ""),
    manage = managers.includes(actor.role);
  const rows = visible(d, actor)
    .map((r) => {
      const row = decorate(d, r),
        seating = seatingState(d, r);
      row.seatingStatus = seating.status;
      row.seatingVersion = seating.version;
      if (manage || (actor.role === "LECTURER" && r.invigilatorId === actor.id))
        row.reportStatus =
          d.examReports
            .filter((report) => report.examId === r.id)
            .sort((a, b) => b.version - a.version)[0]?.status || "NOT_CREATED";
      if (actor.role === "STUDENT") {
        const student = d.students.find((s) => s.accountId === actor.id);
        const seat = seating.plan?.payload.rows.find(
          (s) => s.studentId === student?.id,
        );
        row.mySeat = seat
          ? {
              candidateNumber: seat.candidateNumber,
              seatNumber: seat.seatNumber,
            }
          : null;
      }
      if (!manage) {
        delete row.reviewHash;
        delete row.publishedBy;
        delete row.cancelledBy;
      }
      return row;
    })
    .filter(
      (r) =>
        (!query.term || r.term === query.term) &&
        foldText(
          `${r.sectionCode} ${r.subjectName} ${r.roomCode} ${r.roomName}`,
        ).includes(q),
    )
    .sort(
      (a, b) =>
        a.examDate.localeCompare(b.examDate) ||
        a.startTime.localeCompare(b.startTime) ||
        a.id.localeCompare(b.id),
    );
  // Không gửi danh sách tài khoản hoặc danh sách thí sinh cho sinh viên.
  return {
    rows,
    rooms: manage ? d.rooms : [],
    sections: manage
      ? d.sections.map((r) => ({
          id: r.id,
          code: r.code,
          term: r.term,
          subjectName: d.subjects.find((s) => s.id === r.subjectId)?.name || "",
        }))
      : [],
    teachers: manage
      ? d.accounts
          .filter((r) => r.role === "LECTURER" && r.active)
          .map(({ id, fullName }) => ({ id, name: fullName }))
      : [],
  };
}
export async function saveRoom(store, input, actor, id = null) {
  authorize(actor, managers);
  requireValue(
    input && typeof input === "object",
    "Thông tin phòng không hợp lệ.",
  );
  requireValue(
    code(input.code) &&
      typeof input.name === "string" &&
      input.name.trim() &&
      input.name.length <= 160,
    "Nhập mã và tên phòng hợp lệ.",
  );
  requireValue(
    Number.isInteger(input.capacity) &&
      input.capacity >= 1 &&
      input.capacity <= 1000,
    "Sức chứa phòng từ 1 đến 1000.",
  );
  requireValue(
    typeof input.active === "boolean",
    "Chọn trạng thái sử dụng phòng.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const d = await data(tx),
      prior = d.rooms.find((r) => r.id === id);
    if (id)
      requireValue(
        prior && prior.version === input.version,
        "Phòng đã thay đổi. Tải lại danh sách.",
        409,
      );
    requireValue(
      !d.rooms.some(
        (r) => r.id !== id && foldText(r.code) === foldText(input.code),
      ),
      "Mã phòng đã tồn tại.",
      409,
    );
    const scheduled = d.exams.filter(
      (r) => r.roomId === id && r.status === "PUBLISHED",
    );
    requireValue(
      !scheduled.length || input.active,
      "Phòng đang có lịch thi công bố. Hủy hoặc bố trí lại lịch trước khi ngừng sử dụng.",
      409,
    );
    requireValue(
      scheduled.every(
        (r) => candidates(d.enrollments, r.sectionId).size <= input.capacity,
      ),
      "Sức chứa mới nhỏ hơn số thí sinh trong lịch thi đã công bố.",
      409,
    );
    if (id) {
      const allData = await timetableData(integrityStore(tx));
      const used = allData.sections.filter((s) =>
        lessons(s, allData.timetablePlans).some((slot) => slot.roomId === id),
      );
      requireValue(
        !used.length || input.active,
        "Phòng đang có lịch học. Bố trí lại lịch trước khi ngừng sử dụng.",
        409,
      );
      requireValue(
        used.every((s) => s.capacity <= input.capacity),
        "Sức chứa mới nhỏ hơn sĩ số tối đa của lớp đang dùng phòng.",
        409,
      );
    }
    const clean = {
      code: input.code.trim(),
      name: input.name.trim(),
      capacity: input.capacity,
      active: input.active,
    };
    const row = {
      id: id || randomUUID(),
      ...clean,
      version: prior ? prior.version + 1 : 1,
    };
    if (prior) await tx.update("rooms", id, clean, input.version);
    else await tx.insert("rooms", row);
    await audit(tx, actor, prior ? "ROOM_UPDATED" : "ROOM_CREATED", row.id, {
      before: prior || null,
      after: row,
    });
    return row;
  });
}
function validateDraft(d, input, id) {
  requireValue(
    input && typeof input === "object",
    "Thông tin lịch thi không hợp lệ.",
  );
  const section = d.sections.find((r) => r.id === input.sectionId);
  requireValue(section, "Chọn lớp học phần đã tồn tại.");
  requireValue(
    d.rooms.some((r) => r.id === input.roomId && r.active),
    "Chọn phòng đang sử dụng.",
  );
  requireValue(
    d.accounts.some(
      (r) => r.id === input.invigilatorId && r.role === "LECTURER" && r.active,
    ),
    "Chọn giảng viên coi thi đang hoạt động.",
  );
  requireValue(
    validDate(input.examDate) && input.examDate >= section.startDate,
    "Ngày thi không hợp lệ hoặc trước ngày bắt đầu học phần.",
  );
  requireValue(
    time(input.startTime) &&
      time(input.endTime) &&
      input.startTime < input.endTime,
    "Giờ bắt đầu phải trước giờ kết thúc.",
  );
  requireValue(
    !d.exams.some(
      (r) =>
        r.id !== id && r.sectionId === section.id && r.status !== "CANCELLED",
    ),
    "Lớp đã có lịch thi. Chỉnh sửa bản nháp hoặc hủy lịch cũ trước khi lập lịch thay thế.",
    409,
  );
  return {
    sectionId: section.id,
    roomId: input.roomId,
    invigilatorId: input.invigilatorId,
    examDate: input.examDate,
    startTime: input.startTime,
    endTime: input.endTime,
  };
}
export async function saveExam(store, input, actor, id = null) {
  authorize(actor, managers);
  requireValue(
    input && typeof input === "object",
    "Thông tin lịch thi không hợp lệ.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const d = await data(tx),
      prior = d.exams.find((r) => r.id === id);
    if (id)
      requireValue(
        prior && prior.status === "DRAFT" && prior.version === input.version,
        "Chỉ sửa được bản nháp mới nhất. Lịch đã công bố cần hủy rồi lập lịch thay thế.",
        409,
      );
    const clean = validateDraft(d, input, id),
      row = {
        id: id || randomUUID(),
        ...clean,
        status: "DRAFT",
        publishedBy: null,
        publishedAt: null,
        reviewHash: null,
        cancelledBy: null,
        cancelReason: null,
        version: prior ? prior.version + 1 : 1,
      };
    if (prior) await tx.update("exams", id, clean, input.version);
    else await tx.insert("exams", row);
    await audit(tx, actor, prior ? "EXAM_UPDATED" : "EXAM_CREATED", row.id, {
      before: prior || null,
      after: row,
    });
    return row;
  });
}
function publication(d, row, eligibility) {
  validateDraft(d, row, row.id);
  const room = d.rooms.find((r) => r.id === row.roomId),
    ids = candidates(d.enrollments, row.sectionId);
  requireValue(
    ids.size <= room.capacity,
    "Số thí sinh vượt sức chứa phòng thi.",
    409,
  );
  for (const other of d.exams.filter(
    (r) => r.id !== row.id && r.status === "PUBLISHED" && overlaps(row, r),
  )) {
    requireValue(
      other.roomId !== row.roomId,
      "Phòng thi đã có lịch trong khoảng thời gian này.",
      409,
    );
    requireValue(
      other.invigilatorId !== row.invigilatorId,
      "Giảng viên coi thi bị trùng lịch.",
      409,
    );
    requireValue(
      ![...candidates(d.enrollments, other.sectionId)].some((id) =>
        ids.has(id),
      ),
      "Sinh viên bị trùng lịch thi giữa các lớp học phần.",
      409,
    );
  }
  requireValue(
    !d.sections.some(
      (s) =>
        s.lecturerId === row.invigilatorId &&
        overlapsLesson(row, s, d.timetablePlans),
    ),
    "Giảng viên coi thi bị trùng lịch giảng dạy.",
    409,
  );
  const registered = new Set(
    d.enrollments
      .filter(
        (r) =>
          ids.has(r.studentId) &&
          r.status === "ACTIVE" &&
          r.sectionId !== row.sectionId,
      )
      .map((r) => r.sectionId),
  );
  requireValue(
    !d.sections.some(
      (s) => registered.has(s.id) && overlapsLesson(row, s, d.timetablePlans),
    ),
    "Lịch thi trùng với lịch học của sinh viên.",
    409,
  );
  requireValue(
    !d.sections.some((s) =>
      lessons(s, d.timetablePlans, row.examDate, row.examDate).some(
        (slot) =>
          slot.roomId === row.roomId &&
          intersects(slot, { ...row, date: row.examDate }),
      ),
    ),
    "Phòng thi đang có lịch học trong giờ này.",
    409,
  );
  requireValue(
    !d.sections.some(
      (s) => s.id === row.sectionId && overlapsLesson(row, s, d.timetablePlans),
    ),
    "Lịch thi trùng với buổi học của chính lớp học phần.",
    409,
  );
  const section = d.sections.find((s) => s.id === row.sectionId),
    teacher = d.accounts.find((a) => a.id === row.invigilatorId);
  const roster = d.enrollments
    .filter((r) => r.sectionId === row.sectionId && r.status === "ACTIVE")
    .map((r) => ({ id: r.id, studentId: r.studentId, version: r.version }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return {
    reviewHash: tokenHash(
      JSON.stringify({
        row,
        room,
        section,
        teacherVersion: teacher.version,
        roster,
        timetablePlans: d.timetablePlans
          .map((p) => [p.id, p.version])
          .sort((a, b) => a[0].localeCompare(b[0])),
        eligibility: eligibility.fingerprint,
      }),
    ),
    count: ids.size,
    capacity: room.capacity,
  };
}
export async function reviewExam(store, id, actor) {
  authorize(actor, managers);
  const d = await data(store),
    row = d.exams.find((r) => r.id === id);
  requireValue(
    row && row.status === "DRAFT",
    "Không tìm thấy bản nháp lịch thi.",
    404,
  );
  return {
    ...publication(
      await data(integrityStore(store)),
      row,
      await assertExamEligibility(store, row.sectionId),
    ),
    exam: decorate(d, row),
  };
}
export async function publishExam(store, id, input, actor) {
  requireValue(
    input && typeof input === "object",
    "Thông tin xác nhận không hợp lệ.",
  );
  authorize(actor, managers);
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const d = await data(tx),
      row = d.exams.find((r) => r.id === id);
    requireValue(row, "Không tìm thấy lịch thi.", 404);
    requireValue(
      input.confirm === true &&
        typeof input.reviewHash === "string" &&
        input.reviewHash.length === 64,
      "Cần kiểm tra và xác nhận công bố lịch thi.",
    );
    if (
      row.status === "PUBLISHED" &&
      row.reviewHash === input.reviewHash &&
      row.version === input.version + 1
    )
      return row;
    requireValue(
      row.status === "DRAFT" && row.version === input.version,
      "Lịch thi đã thay đổi. Tải lại để kiểm tra.",
      409,
    );
    const review = publication(
      await data(integrityStore(tx)),
      row,
      await assertExamEligibility(tx, row.sectionId),
    );
    requireValue(
      review.reviewHash === input.reviewHash,
      "Danh sách thí sinh, phòng hoặc phân công đã thay đổi. Kiểm tra lại trước khi công bố.",
      409,
    );
    const changes = {
      status: "PUBLISHED",
      publishedBy: actor.id,
      publishedAt: Date.now(),
      reviewHash: review.reviewHash,
    };
    await tx.update("exams", id, changes, input.version);
    const after = { ...row, ...changes, version: row.version + 1 };
    await audit(tx, actor, "EXAM_PUBLISHED", id, {
      before: row,
      after,
      candidateCount: review.count,
    });
    return after;
  });
}
export async function cancelExam(store, id, input, actor) {
  requireValue(
    input && typeof input === "object",
    "Thông tin hủy lịch không hợp lệ.",
  );
  authorize(actor, managers);
  requireValue(
    input.confirm === true &&
      typeof input.reason === "string" &&
      input.reason.trim() &&
      input.reason.length <= 1000,
    "Nhập lý do và xác nhận hủy lịch thi.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    const row = (await tx.list("exams", true)).find((r) => r.id === id);
    requireValue(row, "Không tìm thấy lịch thi.", 404);
    requireValue(
      row.status !== "CANCELLED" && row.version === input.version,
      "Lịch thi đã thay đổi. Tải lại để kiểm tra.",
      409,
    );
    const changes = {
      status: "CANCELLED",
      cancelReason: input.reason.trim(),
      cancelledBy: actor.id,
    };
    await tx.update("exams", id, changes, input.version);
    const after = { ...row, ...changes, version: row.version + 1 };
    await audit(tx, actor, "EXAM_CANCELLED", id, { before: row, after });
    return after;
  });
}
export async function examRoster(store, id, actor) {
  authorize(actor, [...managers, "LECTURER"]);
  const d = await data(store),
    exam = visible(d, actor).find((r) => r.id === id);
  requireValue(exam, "Không tìm thấy lịch thi trong quyền của bạn.", 404);
  const ids = candidates(d.enrollments, exam.sectionId),
    seating = seatingState(d, exam);
  return {
    exam: decorate(d, exam),
    seatingStatus: seating.status,
    seatingVersion: seating.version,
    seatingHistory: managers.includes(actor.role)
      ? d.examSeatings
          .filter((p) => p.examId === id)
          .sort((a, b) => b.version - a.version)
          .map((p) => ({
            version: p.version,
            createdAt: p.createdAt,
            reason: p.payload.reason,
            count: p.payload.rows.length,
          }))
      : [],
    rows: d.students
      .filter((s) => ids.has(s.id))
      .map(({ id, code, fullName }) => {
        const seat = seating.plan?.payload.rows.find(
          (row) => row.studentId === id,
        );
        return {
          id,
          code,
          fullName,
          candidateNumber: seat?.candidateNumber || null,
          seatNumber: seat?.seatNumber || null,
        };
      })
      .sort((a, b) => a.code.localeCompare(b.code, "vi")),
  };
}
