import { examOverlapsLesson } from "../academic/timetable.rules.js";
import { integrityStore } from "../access/staff-store.js";
import { assertStudentExamEligibility } from "../attendance/attendance.rules.js";
import { requireValue } from "../../core/errors.js";
export const overlaps = (a, b) =>
  a.examDate === b.examDate &&
  a.startTime < b.endTime &&
  b.startTime < a.endTime;
export const candidates = (enrollments, sectionId) =>
  new Set(
    enrollments
      .filter((r) => r.sectionId === sectionId && r.status === "ACTIVE")
      .map((r) => r.studentId),
  );
export const overlapsLesson = examOverlapsLesson;
// Dùng cùng quy tắc khi công bố lịch và khi sinh viên đăng ký thêm lớp.
export async function checkExamRegistration(
  store,
  section,
  student,
  ownSections,
) {
  const exams = (await store.list("exams")).filter(
    (r) => r.status === "PUBLISHED",
  );
  const plans = await store.list("timetablePlans");
  const incoming = exams.filter((r) => r.sectionId === section.id);
  const ownIds = new Set(ownSections.map((r) => r.id));
  const own = exams.filter((r) => ownIds.has(r.sectionId));
  const rooms = await store.list("rooms"),
    enrollments = await store.list("enrollments");
  if (incoming.length)
    await assertStudentExamEligibility(store, section.id, student.id);
  for (const exam of incoming) {
    requireValue(
      Date.parse(exam.examDate + "T" + exam.endTime + ":00+07:00") > Date.now(),
      "Lớp đã kết thúc kỳ thi. Vui lòng liên hệ bộ phận đào tạo.",
      409,
    );
    const room = rooms.find((r) => r.id === exam.roomId);
    requireValue(
      room?.active && candidates(enrollments, section.id).size < room.capacity,
      "Phòng thi đã hết chỗ hoặc ngừng sử dụng.",
      409,
    );
    requireValue(
      !own.some((other) => overlaps(exam, other)),
      "Lớp học phần trùng lịch thi với lớp bạn đã đăng ký.",
      409,
    );
    requireValue(
      !ownSections.some((other) => overlapsLesson(exam, other, plans)),
      "Lịch thi của lớp trùng với lịch học của bạn.",
      409,
    );
  }
  requireValue(
    !own.some((exam) => overlapsLesson(exam, section, plans)),
    "Lịch học của lớp trùng với lịch thi đã công bố của bạn.",
    409,
  );
}
export async function checkExamSectionUpdate(store, section, id) {
  store = integrityStore(store);
  const plans = await store.list("timetablePlans");
  const exams = (await store.list("exams")).filter(
    (r) => r.status === "PUBLISHED",
  );
  requireValue(
    !exams.some((e) => e.sectionId === id && e.examDate < section.startDate),
    "Ngày bắt đầu học phần không được sau lịch thi đã công bố.",
    409,
  );
  requireValue(
    !exams.some(
      (e) =>
        e.sectionId !== id &&
        e.invigilatorId === section.lecturerId &&
        overlapsLesson(e, section, plans),
    ),
    "Lịch giảng dạy trùng với lịch coi thi đã công bố.",
    409,
  );
}
