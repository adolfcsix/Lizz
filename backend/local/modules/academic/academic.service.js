import { assertStudyRegistration } from "../students/student-status.service.js";
import { curriculumForRegistration } from "../curriculum/curriculum.service.js";
import { reviewStudyAttempt } from "./study-attempts.service.js";
import {
  sectionsOverlap,
  scheduleDescription,
  planFor,
} from "./timetable.rules.js";
import { timetableData, assertTimetable } from "./timetable.service.js";
import { integrityStore } from "../access/staff-store.js";
import {
  checkExamRegistration,
  checkExamSectionUpdate,
} from "../exams/exam.rules.js";
import { freshActor, audit, lockAcademic } from "./academic.common.js";
import {
  checkStudyRules,
  requireWindow,
} from "./registration-policy.service.js";
import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { tokenHash } from "../../core/password.js";
import { foldText } from "../../../../shared/local-validation.js";

export const managers = ["MANAGER", "STAFF"];
const all = [...managers, "LECTURER", "STUDENT"];
const code = (value) =>
  typeof value === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(value);
const date = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + "T00:00:00Z")) &&
  new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
const time = (value) =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const same = (a, b) => foldText(a) === foldText(b);

export function validateSubject(input) {
  requireValue(
    code(input.code),
    "Mã môn học cần 1–40 ký tự chữ, số, chấm, gạch ngang hoặc gạch dưới.",
  );
  requireValue(
    typeof input.name === "string" &&
      input.name.trim() &&
      input.name.length <= 160,
    "Nhập tên môn học, tối đa 160 ký tự.",
  );
  requireValue(
    Number.isInteger(input.credits) &&
      input.credits >= 1 &&
      input.credits <= 10,
    "Số tín chỉ cần là số nguyên từ 1 đến 10.",
  );
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    credits: input.credits,
  };
}

function hasOccurrence(start, end, weekday) {
  const d = new Date(start + "T00:00:00Z");
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + ((weekday - day + 7) % 7));
  return d.toISOString().slice(0, 10) <= end;
}
export const schedulesOverlap = sectionsOverlap;
export async function validateSection(store, input, exceptId = null) {
  requireValue(
    code(input.code) && code(input.term),
    "Nhập mã lớp học phần và mã học kỳ hợp lệ.",
  );
  requireValue(
    (await store.list("subjects")).some((r) => r.id === input.subjectId),
    "Chọn môn học đã tồn tại.",
  );
  requireValue(
    (await store.list("accounts")).some(
      (r) => r.id === input.lecturerId && r.active && r.role === "LECTURER",
    ),
    "Chọn giảng viên đang hoạt động.",
  );
  requireValue(
    Number.isInteger(input.capacity) &&
      input.capacity >= 1 &&
      input.capacity <= 1000,
    "Sĩ số tối đa từ 1 đến 1000.",
  );
  requireValue(
    date(input.startDate) &&
      date(input.endDate) &&
      input.startDate <= input.endDate,
    "Khoảng ngày học không hợp lệ.",
  );
  requireValue(
    Number.isInteger(input.weekday) && input.weekday >= 1 && input.weekday <= 7,
    "Ngày trong tuần cần từ 1 (thứ Hai) đến 7 (Chủ nhật).",
  );
  requireValue(
    time(input.startTime) &&
      time(input.endTime) &&
      input.startTime < input.endTime,
    "Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.",
  );
  requireValue(
    hasOccurrence(input.startDate, input.endDate, input.weekday),
    "Khoảng ngày không có buổi học vào thứ đã chọn.",
  );
  requireValue(
    ["OPEN", "CLOSED"].includes(input.status),
    "Trạng thái lớp học phần không hợp lệ.",
  );
  const sections = await integrityStore(store).list("sections");
  requireValue(
    !sections.some(
      (r) =>
        r.id !== exceptId &&
        same(r.code, input.code) &&
        same(r.term, input.term),
    ),
    "Mã lớp học phần đã tồn tại trong học kỳ.",
    409,
  );
  const clean = Object.fromEntries(
    [
      "code",
      "subjectId",
      "lecturerId",
      "term",
      "capacity",
      "startDate",
      "endDate",
      "weekday",
      "startTime",
      "endTime",
      "status",
    ].map((k) => [k, input[k]]),
  );
  const prior = exceptId
    ? (await store.list("sections")).find((s) => s.id === exceptId)
    : null;
  clean.facultyId =
    input.facultyId === undefined
      ? prior?.facultyId || null
      : input.facultyId || null;
  clean.cohortId =
    input.cohortId === undefined
      ? prior?.cohortId || null
      : input.cohortId || null;
  requireValue(
    !clean.facultyId ||
      (await store.list("faculties")).some((f) => f.id === clean.facultyId),
    "Chọn khoa phụ trách trong phạm vi được giao.",
  );
  requireValue(
    !clean.cohortId ||
      (clean.facultyId &&
        (await store.list("cohorts")).some((c) => c.id === clean.cohortId)),
    "Chọn khoa trước và khóa hợp lệ.",
  );
  const timetable = await timetableData(integrityStore(store));
  const existingPlan = timetable.timetablePlans.find(
    (p) => p.sectionId === exceptId,
  );
  if (existingPlan)
    for (const key of [
      "startDate",
      "endDate",
      "weekday",
      "startTime",
      "endTime",
    ])
      requireValue(
        clean[key] === prior[key],
        "Lớp đã có lịch nhiều buổi. Sửa lịch tại Thời khóa biểu; giữ khoảng ngày học phần.",
        409,
      );
  assertTimetable(timetable, { id: exceptId || "new", ...clean });
  // Lớp đóng đăng ký vẫn có lịch học; không bỏ qua kiểm tra xung đột.
  requireValue(
    !sections.some(
      (r) =>
        r.id !== exceptId &&
        r.lecturerId === input.lecturerId &&
        schedulesOverlap(
          r,
          { id: exceptId || "new", ...clean },
          timetable.timetablePlans,
        ),
    ),
    "Giảng viên đã có lớp trùng lịch.",
    409,
  );
  return clean;
}

export async function saveSubject(store, input, actor, id = null) {
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const clean = validateSubject(input);
    const rows = await tx.list("subjects", true);
    const old = rows.find((r) => r.id === id);
    if (id) requireValue(old, "Không tìm thấy môn học.", 404);
    requireValue(
      !rows.some((r) => r.id !== id && same(r.code, clean.code)),
      "Mã môn học đã tồn tại.",
      409,
    );
    if (id)
      requireValue(
        !(await tx.list("curricula")).some(
          (p) =>
            p.status === "PUBLISHED" &&
            p.groups.some((g) => g.subjects.some((s) => s.subjectId === id)),
        ),
        "Học phần thuộc chương trình đã công bố; không sửa hồi tố thông tin.",
        409,
      );
    // Không sửa nội dung học phần đã được mở lớp trong đợt này.
    if (id)
      requireValue(
        !(await tx.list("sections")).some((r) => r.subjectId === id),
        "Môn học đã có lớp học phần nên không thể thay đổi thông tin.",
        409,
      );
    const row = {
      id: id || randomUUID(),
      ...clean,
      version: (old?.version || 0) + 1,
    };
    if (old) await tx.update("subjects", id, clean, input.version);
    else await tx.insert("subjects", row);
    await audit(
      tx,
      actor,
      old ? "SUBJECT_UPDATED" : "SUBJECT_CREATED",
      row.id,
      { before: old || null, after: row },
    );
    return row;
  });
}

export async function saveSection(store, input, actor, id = null) {
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const sections = await tx.list("sections", true);
    const enrollments = await tx.list("enrollments", true);
    const old = sections.find((r) => r.id === id);
    if (id) requireValue(old, "Không tìm thấy lớp học phần.", 404);
    const clean = await validateSection(tx, input, id);
    await checkExamSectionUpdate(tx, clean, id);
    const active = enrollments.filter(
      (r) => r.sectionId === id && r.status === "ACTIVE",
    );
    requireValue(
      clean.capacity >= active.length,
      "Sĩ số tối đa không được nhỏ hơn số đã đăng ký.",
      409,
    );
    if (active.length)
      for (const key of [
        "subjectId",
        "term",
        "startDate",
        "endDate",
        "weekday",
        "startTime",
        "endTime",
      ])
        requireValue(
          clean[key] === old[key],
          "Lớp đã có sinh viên. Đợt này chỉ cho đổi giảng viên, sức chứa, mã và trạng thái nhận đăng ký.",
          409,
        );
    const row = {
      id: id || randomUUID(),
      ...clean,
      version: (old?.version || 0) + 1,
    };
    if (old) await tx.update("sections", id, clean, input.version);
    else await tx.insert("sections", row);
    await audit(
      tx,
      actor,
      old ? "SECTION_UPDATED" : "SECTION_CREATED",
      row.id,
      { before: old || null, after: row },
    );
    return row;
  });
}

export async function academicOverview(store, actor) {
  authorize(actor, all);
  const subjects = await store.list("subjects");
  const accounts = await store.list("accounts");
  let sections = await store.list("sections");
  const plans = await store.list("timetablePlans"),
    rooms = await store.list("rooms");
  const registrations = await store.list("enrollments");
  const student =
    actor.role === "STUDENT"
      ? (await store.list("students")).find((r) => r.accountId === actor.id)
      : null;
  const mine = student
    ? registrations.filter((r) => r.studentId === student.id)
    : [];
  if (actor.role === "LECTURER")
    sections = sections.filter((r) => r.lecturerId === actor.id);
  const rows = sections
    .map((r) => ({
      ...r,
      scheduleSummary: scheduleDescription(r, plans, rooms),
      timetableVersion: planFor(r, plans).version,
      subjectName: subjects.find((s) => s.id === r.subjectId)?.name || "",
      subjectCode: subjects.find((s) => s.id === r.subjectId)?.code || "",
      credits: subjects.find((s) => s.id === r.subjectId)?.credits || 0,
      lecturerName: accounts.find((s) => s.id === r.lecturerId)?.fullName || "",
      enrolled: registrations.filter(
        (e) => e.sectionId === r.id && e.status === "ACTIVE",
      ).length,
      registration: mine.find((e) => e.sectionId === r.id) || null,
    }))
    .map((r) => ({ ...r, available: Math.max(0, r.capacity - r.enrolled) }));
  return {
    faculties: await store.list("faculties"),
    cohorts: await store.list("cohorts"),
    subjects,
    sections: rows,
    teachers: managers.includes(actor.role)
      ? accounts
          .filter((r) => r.role === "LECTURER" && r.active)
          .map(({ id, fullName }) => ({ id, name: fullName }))
      : [],
    profileLinked: actor.role !== "STUDENT" || Boolean(student),
  };
}
export async function sectionRoster(store, id, actor) {
  authorize(actor, [...managers, "LECTURER"]);
  const section = (await store.list("sections")).find(
    (r) =>
      r.id === id &&
      (managers.includes(actor.role) || r.lecturerId === actor.id),
  );
  requireValue(
    section,
    "Không tìm thấy lớp học phần trong phân công của bạn.",
    404,
  );
  const enrollments = (await store.list("enrollments")).filter(
    (r) => r.sectionId === id && r.status === "ACTIVE",
  );
  const ids = new Set(enrollments.map((r) => r.studentId));
  return {
    section,
    rows: (await store.list("students"))
      .filter((r) => ids.has(r.id))
      .map(({ id, code, fullName }) => ({
        id,
        code,
        fullName,
        studyMode:
          enrollments.find((e) => e.studentId === id)?.studyMode ||
          "UNVERIFIED",
      })),
  };
}

export async function checkRegistration(store, sectionId, actor) {
  authorize(actor, ["STUDENT"]);
  const student = (await store.list("students")).find(
    (r) => r.accountId === actor.id,
  );
  requireValue(
    student,
    "Tài khoản chưa liên kết hồ sơ sinh viên. Liên hệ cán bộ để hoàn tất hồ sơ.",
    409,
  );
  await assertStudyRegistration(store, student.id);
  const sections = await store.list("sections");
  const section = sections.find((r) => r.id === sectionId);
  requireValue(section, "Không tìm thấy lớp học phần.", 404);
  requireValue(section.status === "OPEN", "Lớp đã đóng nhận đăng ký.", 409);
  const registrations = await store.list("enrollments");
  const prior = registrations.find(
    (r) => r.studentId === student.id && r.sectionId === sectionId,
  );
  requireValue(
    prior?.status !== "ACTIVE",
    "Bạn đã đăng ký lớp học phần này.",
    409,
  );
  requireValue(
    registrations.filter(
      (r) => r.sectionId === sectionId && r.status === "ACTIVE",
    ).length < section.capacity,
    "Lớp học phần đã hết chỗ.",
    409,
  );
  const ids = new Set(
    registrations.filter((e) => e.sectionId === section.id).map((e) => e.id),
  );
  requireValue(
    !(await store.list("grades")).some(
      (g) => ids.has(g.enrollmentId) && g.status !== "DRAFT",
    ),
    "Lớp đã gửi hoặc công bố điểm; không nhận đăng ký mới.",
    409,
  );
  const plans = await store.list("timetablePlans");
  const ownSections = registrations
    .filter((r) => r.studentId === student.id && r.status === "ACTIVE")
    .map((r) => sections.find((s) => s.id === r.sectionId))
    .filter(Boolean);
  requireValue(
    !ownSections.some(
      (s) => same(s.term, section.term) && s.subjectId === section.subjectId,
    ),
    "Bạn đã đăng ký một lớp khác của môn này trong cùng học kỳ.",
    409,
  );
  requireValue(
    !ownSections.some((s) => schedulesOverlap(s, section, plans)),
    "Lớp học phần trùng lịch với lớp bạn đã đăng ký.",
    409,
  );
  const plannedLessons = planFor(section, plans);
  for (const m of [
    ...plannedLessons.meetings,
    ...plannedLessons.exceptions.filter((e) => e.kind === "MOVE"),
  ])
    if (m.roomId)
      requireValue(
        (await store.list("rooms")).some(
          (r) =>
            r.id === m.roomId && r.active && r.capacity >= section.capacity,
        ),
        "Phòng học không còn đủ điều kiện nhận đăng ký.",
        409,
      );
  await checkExamRegistration(store, section, student, ownSections);
  const studyRules = await checkStudyRules(
    store,
    student,
    section,
    ownSections,
  );
  studyRules.curriculum = await curriculumForRegistration(
    store,
    student,
    section,
  );
  studyRules.studyAttempt = await reviewStudyAttempt(store, student, section);
  return { student, section, prior, studyRules };
}
async function requestTransaction(store, actor, input, action, work) {
  requireValue(
    typeof input.requestId === "string" &&
      /^[a-f0-9-]{36}$/.test(input.requestId),
    "Thiếu mã yêu cầu chống gửi lặp.",
  );
  const digest = tokenHash(JSON.stringify({ action, ...input }));
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, ["STUDENT"]);
    // Cùng thứ tự khóa ở đăng ký, rút và sửa lớp; giữ nguyên kiểm tra tại lúc ghi.
    await lockAcademic(tx);
    const old = (await tx.list("academicRequests", true)).find(
      (r) => r.id === input.requestId,
    );
    if (old) {
      requireValue(
        old.actorId === actor.id && old.requestHash === digest,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { ...old.result, replayed: true };
    }
    const result = await work(tx);
    await tx.insert("academicRequests", {
      id: input.requestId,
      actorId: actor.id,
      requestHash: digest,
      result,
    });
    return result;
  });
}
export async function registerSection(store, input, actor) {
  return requestTransaction(store, actor, input, "REGISTER", async (tx) => {
    const { student, section, prior, studyRules } = await checkRegistration(
      tx,
      input.sectionId,
      actor,
    );
    const row = {
      id: prior?.id || randomUUID(),
      studentId: student.id,
      sectionId: section.id,
      registrationPeriodId: studyRules.periodId,
      registrationPeriodVersion: studyRules.periodVersion,
      withdrawalDeadline: studyRules.withdrawalDeadline,
      studyMode: studyRules.studyAttempt.mode,
      studySnapshot: studyRules.recognizedPrerequisites?.length
        ? {
            ...studyRules.studyAttempt,
            recognizedPrerequisites: studyRules.recognizedPrerequisites,
          }
        : studyRules.studyAttempt,
      status: "ACTIVE",
      version: (prior?.version || 0) + 1,
    };
    const attempt = studyRules.studyAttempt;
    requireValue(attempt.allowed, attempt.reasons.join(" "), 409);
    if (attempt.policyConfigured)
      requireValue(
        input.confirm === true &&
          input.studyMode === attempt.mode &&
          input.studyReviewHash === attempt.reviewHash,
        "Quy chế hoặc lịch sử học đã thay đổi, hoặc chưa xác nhận đúng loại lượt học. Kiểm tra lại trước khi đăng ký.",
        409,
      );
    if (prior)
      await tx.update(
        "enrollments",
        prior.id,
        {
          status: "ACTIVE",
          registrationPeriodId: row.registrationPeriodId,
          registrationPeriodVersion: row.registrationPeriodVersion,
          withdrawalDeadline: row.withdrawalDeadline,
          studyMode: row.studyMode,
          studySnapshot: row.studySnapshot,
        },
        prior.version,
      );
    else await tx.insert("enrollments", row);
    await audit(tx, actor, "COURSE_REGISTERED", row.id, {
      studentCode: student.code,
      sectionCode: section.code,
      term: section.term,
    });
    return { row };
  });
}
export async function checkWithdrawal(store, id, actor) {
  authorize(actor, ["STUDENT"]);
  const student = (await store.list("students")).find(
      (r) => r.accountId === actor.id,
    ),
    row = (await store.list("enrollments")).find(
      (r) => r.id === id && r.studentId === student?.id,
    );
  requireValue(row, "Không tìm thấy đăng ký của bạn.", 404);
  requireValue(row.status === "ACTIVE", "Đăng ký đã được rút.", 409);
  const section = (await store.list("sections")).find(
    (r) => r.id === row.sectionId,
  );
  requireValue(
    section?.status === "OPEN",
    "Lớp đã đóng đợt đăng ký. Liên hệ cán bộ để xử lý rút học.",
    409,
  );
  const { period } = await requireWindow(
      store,
      section.term,
      "WITHDRAW",
      Date.now(),
      student,
      row,
    ),
    grade = (await store.list("grades")).find((g) => g.enrollmentId === id);
  requireValue(
    !grade || grade.status === "DRAFT",
    "Điểm đã gửi hoặc công bố. Không được tự rút lớp.",
    409,
  );
  return { student, section, row, period };
}
export async function withdrawSection(store, id, input, actor) {
  return requestTransaction(
    store,
    actor,
    { ...input, enrollmentId: id },
    "WITHDRAW",
    async (tx) => {
      const { student, section, row } = await checkWithdrawal(tx, id, actor);
      await tx.update(
        "enrollments",
        id,
        { status: "WITHDRAWN" },
        input.version,
      );
      await audit(tx, actor, "COURSE_WITHDRAWN", id, {
        studentCode: student.code,
        sectionCode: section.code,
        term: section.term,
      });
      return { row: { ...row, status: "WITHDRAWN", version: row.version + 1 } };
    },
  );
}
