import { requireValue } from "../../core/errors.js";
import { STUDY_MODES } from "../../../../shared/study-attempts.js";
import { foldText } from "../../../../shared/local-validation.js";
import {
  academicOverview,
  checkRegistration,
  checkWithdrawal,
  validateSubject,
  validateSection,
} from "./academic.service.js";
const missing = (fields) => ({
  needsInformation: fields,
  note: "Hỏi lại phần thiếu; chưa ghi dữ liệu học vụ.",
});
export async function planAcademicAction(store, tool, args, actor) {
  const data = await academicOverview(store, actor);
  if (tool === "prepare_subject") {
    const absent = ["code", "name", "credits"].filter(
      (k) => args[k] === undefined || args[k] === "",
    );
    if (absent.length) return missing(absent);
    const fields = validateSubject(args);
    requireValue(
      !data.subjects.some((r) => foldText(r.code) === foldText(fields.code)),
      "Mã môn học đã tồn tại.",
      409,
    );
    return {
      action: "CREATE_SUBJECT",
      payload: { fields },
      title: "Thêm môn học " + fields.code,
      preview: [
        {
          "Mã môn": fields.code,
          "Tên môn": fields.name,
          "Số tín chỉ": fields.credits,
        },
      ],
    };
  }
  if (tool === "prepare_course_section") {
    const limited = store.staffScoped && !(await store.access()).all;
    if (limited && !args.facultyCode)
      return missing(["Mã khoa phụ trách lớp trong phạm vi được giao"]);
    const faculty = args.facultyCode
      ? data.faculties.find(
          (f) => foldText(f.code) === foldText(args.facultyCode),
        )
      : null;
    const cohort = args.cohortCode
      ? data.cohorts.find((c) => foldText(c.code) === foldText(args.cohortCode))
      : null;
    requireValue(
      !args.facultyCode || faculty,
      "Khoa không có trong phạm vi được giao.",
      403,
    );
    requireValue(
      !args.cohortCode || cohort,
      "Khóa không có trong phạm vi được giao.",
      403,
    );
    if (limited && !(await store.access()).belongs(faculty?.id, cohort?.id))
      return missing(["Khóa thuộc phạm vi được giao cho khoa này"]);
    const absent = [
      "code",
      "subjectCode",
      "lecturerEmail",
      "term",
      "capacity",
      "startDate",
      "endDate",
      "weekday",
      "startTime",
      "endTime",
    ].filter((k) => args[k] === undefined || args[k] === "");
    if (absent.length) return missing(absent);
    const subject = data.subjects.find(
      (r) => foldText(r.code) === foldText(args.subjectCode),
    );
    const lecturer = (await store.list("accounts")).find(
      (r) =>
        r.email.toLowerCase() === args.lecturerEmail.trim().toLowerCase() &&
        r.role === "LECTURER" &&
        r.active,
    );
    requireValue(subject, "Mã môn học chưa tồn tại.");
    requireValue(lecturer, "Chọn email giảng viên đang hoạt động.");
    const fields = await validateSection(store, {
      ...args,
      subjectId: subject.id,
      lecturerId: lecturer.id,
      facultyId: faculty?.id || null,
      cohortId: cohort?.id || null,
      status: "OPEN",
    });
    return {
      action: "CREATE_SECTION",
      payload: { fields },
      title: "Mở lớp học phần " + fields.code,
      preview: [
        {
          "Mã lớp": fields.code,
          "Môn học": subject.name,
          "Giảng viên": lecturer.fullName,
          "Học kỳ": fields.term,
          "Sĩ số tối đa": fields.capacity,
          "Từ ngày": fields.startDate,
          "Đến ngày": fields.endDate,
          "Ngày trong tuần": fields.weekday,
          "Bắt đầu": fields.startTime,
          "Kết thúc": fields.endTime,
        },
      ],
    };
  }
  if (!args.sectionCode)
    return missing(["Mã lớp học phần muốn đăng ký hoặc rút"]);
  const matches = data.sections.filter(
    (r) =>
      foldText(r.code) === foldText(args.sectionCode) &&
      (!args.term || foldText(r.term) === foldText(args.term)),
  );
  if (matches.length > 1)
    return missing(["Học kỳ của lớp " + args.sectionCode]);
  requireValue(
    matches.length === 1,
    "Không tìm thấy mã lớp học phần trong phạm vi của bạn.",
    404,
  );
  const section = matches[0];
  if (tool === "prepare_course_registration") {
    const { studyRules } = await checkRegistration(store, section.id, actor);
    requireValue(
      studyRules.studyAttempt.allowed,
      studyRules.studyAttempt.reasons.join(" "),
      409,
    );
    return {
      action: "REGISTER_SECTION",
      payload: {
        sectionId: section.id,
        studyMode: studyRules.studyAttempt.mode,
        studyReviewHash: studyRules.studyAttempt.reviewHash,
      },
      title: "Đăng ký lớp " + section.code,
      preview: [
        {
          "Mã lớp": section.code,
          "Môn học": section.subjectName,
          "Tín chỉ": section.credits,
          "Loại lượt học": STUDY_MODES[studyRules.studyAttempt.mode],
          "Lượt học dự kiến":
            studyRules.studyAttempt.attemptNumber || "Chưa đối chiếu",
          "Căn cứ học lại/cải thiện": studyRules.studyAttempt.note,
          "Tổng tín chỉ sau đăng ký":
            studyRules.nextCredits + " / " + studyRules.maxCredits,
          "Đợt đăng ký": studyRules.periodTitle,
          ...(studyRules.curriculum
            ? {
                "Chương trình áp dụng":
                  studyRules.curriculum.code +
                  " / Phiên bản " +
                  studyRules.curriculum.edition,
              }
            : {}),
          "Tiên quyết đã đối chiếu":
            studyRules.requirements.join(", ") ||
            "Không cấu hình môn tiên quyết",
          "Học kỳ": section.term,
          "Giảng viên": section.lecturerName,
          "Ngày trong tuần": section.weekday,
          "Lịch học": section.scheduleSummary,
          "Lưu ý lịch":
            "Có thể có ngày nghỉ/học bù; tra thời khóa biểu theo ngày trước khi đi học.",
          "Khoảng ngày": section.startDate + " → " + section.endDate,
          "Kết quả sau xác nhận":
            "Đăng ký nếu còn trong đợt, đủ điều kiện, tín chỉ, chỗ và không trùng lịch",
        },
      ],
    };
  }
  requireValue(
    section.registration?.status === "ACTIVE",
    "Bạn chưa có đăng ký đang hoạt động ở lớp này.",
    409,
  );
  await checkWithdrawal(store, section.registration.id, actor);
  return {
    action: "WITHDRAW_SECTION",
    payload: {
      id: section.registration.id,
      version: section.registration.version,
    },
    title: "Rút đăng ký " + section.code,
    preview: [
      {
        "Mã lớp": section.code,
        "Môn học": section.subjectName,
        "Học kỳ": section.term,
        "Tác động":
          "Rút đăng ký, trả lại một chỗ; giữ lịch sử, chưa xử lý học phí",
      },
    ],
  };
}
