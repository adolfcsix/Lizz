import { planAcademicAction } from "../academic/academic.ai.js";
import {
  saveSubject,
  saveSection,
  registerSection,
  withdrawSection,
} from "../academic/academic.service.js";
import { AppError, requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  catalogIssues,
  normalizeEmail,
  foldText,
} from "../../../../shared/local-validation.js";
import {
  validateStudentRow,
  importStudents,
  updateStudent,
} from "../students/student.service.js";
import { proposeTransfer } from "../workflows/workflow.service.js";
import { saveCatalog } from "../catalog/catalog.service.js";

export const actionRoles = {
  CREATE_SUBJECT: ["MANAGER", "STAFF"],
  CREATE_SECTION: ["MANAGER", "STAFF"],
  REGISTER_SECTION: ["STUDENT"],
  WITHDRAW_SECTION: ["STUDENT"],
  CREATE_STUDENTS: ["MANAGER", "STAFF"],
  CREATE_CATALOG: ["MANAGER", "STAFF"],
  SUBMIT_TRANSFER: ["MANAGER", "STAFF"],
  UPDATE_STUDENT: ["MANAGER", "STAFF"],
};

export async function fingerprint(store) {
  const result = [];
  // Chỉ giữ id/version trong hash nội bộ, không gửi toàn bảng cho mô hình.
  for (const kind of [
    "curricula",
    "curriculumAssignments",
    "creditRecognitions",
    "statusRequests",
    "terms",
    "studyPolicies",
    "periods",
    "requirements",
    "grades",
    "accounts",
    "cohorts",
    "faculties",
    "majors",
    "classes",
    "students",
    "subjects",
    "sections",
    "timetablePlans",
    "enrollments",
  ]) {
    result.push([
      kind,
      (await store.list(kind))
        .map((row) => [row.id, row.version])
        .sort((a, b) => a[0].localeCompare(b[0])),
    ]);
  }
  return tokenHash(JSON.stringify(result));
}

const byCode = (rows, code) =>
  rows.find((row) => foldText(row.code) === foldText(code));
const need = (missing) => ({
  needsInformation: missing,
  note: "Hỏi lại các trường này; chưa có đề xuất và chưa ghi hồ sơ.",
});

export async function planAction(store, tool, args, actor) {
  if (
    [
      "prepare_subject",
      "prepare_course_section",
      "prepare_course_registration",
      "prepare_course_withdrawal",
    ].includes(tool)
  )
    return planAcademicAction(store, tool, args, actor);
  if (tool === "prepare_student_profiles") {
    if (!args.rows?.length)
      return need(["Danh sách sinh viên: email, mã sinh viên, họ tên, mã lớp"]);
    const missing = [];
    for (const [index, row] of args.rows.entries())
      for (const [key, label] of Object.entries({
        email: "email",
        code: "mã sinh viên",
        fullName: "họ tên",
        classCode: "mã lớp",
      })) {
        if (!row[key]?.trim()) missing.push(`Dòng ${index + 1}: ${label}`);
      }
    if (missing.length) return need(missing);
    const accounts = await store.list("accounts");
    const classes = await store.list("classes");
    const profiles = await store.list("students");
    const rows = [],
      preview = [];
    for (const row of args.rows) {
      const account = accounts.find(
        (a) => a.email === normalizeEmail(row.email),
      );
      const classRow = byCode(classes, row.classCode);
      requireValue(
        account,
        "Email chưa có tài khoản được cấp. Cấp tài khoản trước khi tạo hồ sơ.",
      );
      requireValue(classRow, "Mã lớp chưa tồn tại. Chọn lại danh mục lớp.");
      const clean = validateStudentRow(
        { ...row, accountId: account.id, classId: classRow.id },
        accounts,
        classes,
        profiles,
      );
      if (store.staffScoped)
        await store.guard("students", { id: "preview", ...clean });
      rows.push({ ...clean, email: account.email });
      profiles.push({ id: "draft-" + rows.length, ...clean });
      preview.push({
        "Mã sinh viên": clean.code,
        "Họ tên": clean.fullName,
        "Email tài khoản": account.email,
        Lớp: classRow.code + " · " + classRow.name,
      });
    }
    return {
      action: "CREATE_STUDENTS",
      payload: { rows },
      preview,
      title: `Tạo ${rows.length} hồ sơ sinh viên`,
    };
  }
  if (tool === "prepare_catalog_entry") {
    if (!args.kind) return need(["Loại danh mục: khóa, khoa, ngành hoặc lớp"]);
    const fields = { code: args.code, name: args.name };
    const all = {};
    for (const kind of ["cohorts", "faculties", "majors", "classes"])
      all[kind] = await store.list(kind);
    const missing = ["code", "name"]
      .filter((key) => !args[key]?.trim())
      .map((key) => (key === "code" ? "mã danh mục" : "tên danh mục"));
    if (args.kind === "cohorts") {
      fields.startYear = args.startYear;
      if (args.startYear === undefined) missing.push("năm bắt đầu");
    }
    if (args.kind === "majors") {
      fields.facultyId = byCode(all.faculties, args.facultyCode)?.id;
      if (!args.facultyCode) missing.push("mã khoa");
    }
    if (args.kind === "classes") {
      fields.majorId = byCode(all.majors, args.majorCode)?.id;
      fields.cohortId = byCode(all.cohorts, args.cohortCode)?.id;
      fields.capacity = args.capacity;
      for (const [key, label] of [
        ["majorCode", "mã ngành"],
        ["cohortCode", "mã khóa"],
        ["capacity", "sĩ số tối đa"],
      ])
        if (args[key] === undefined || args[key] === "") missing.push(label);
    }
    if (missing.length) return need(missing);
    const issues = catalogIssues(args.kind, fields);
    requireValue(!issues.length, issues.join(" "));
    requireValue(
      !all[args.kind].some((row) => foldText(row.code) === foldText(args.code)),
      "Mã danh mục đã tồn tại.",
      409,
    );
    if (args.kind === "cohorts")
      requireValue(
        !all.cohorts.some((row) => row.startYear === args.startYear),
        "Năm này đã có khóa.",
        409,
      );
    if (store.staffScoped)
      await store.guard(args.kind, { id: "preview", ...fields });
    const preview = [
      {
        Loại: {
          cohorts: "Khóa",
          faculties: "Khoa",
          majors: "Ngành",
          classes: "Lớp",
        }[args.kind],
        Mã: args.code,
        Tên: args.name,
      },
    ];
    for (const [key, label] of [
      ["startYear", "Năm"],
      ["facultyCode", "Khoa"],
      ["majorCode", "Ngành"],
      ["cohortCode", "Khóa"],
      ["capacity", "Sĩ số tối đa"],
    ])
      if (args[key] !== undefined) preview[0][label] = args[key];
    return {
      action: "CREATE_CATALOG",
      payload: { kind: args.kind, fields },
      preview,
      title: "Thêm danh mục " + args.code,
    };
  }
  if (tool === "prepare_student_change") {
    if (!args.studentCode) return need(["mã sinh viên cần sửa"]);
    if (!args.fullName && !args.classCode)
      return need(["họ tên mới hoặc mã lớp muốn chuyển đến"]);
    const profiles = await store.list("students");
    const prior = byCode(profiles, args.studentCode);
    requireValue(prior, "Không tìm thấy mã sinh viên.", 404);
    const accounts = await store.list("accounts");
    const classes = await store.list("classes");
    const target = args.classCode
      ? byCode(classes, args.classCode)
      : classes.find((row) => row.id === prior.classId);
    requireValue(target, "Mã lớp chưa tồn tại.");
    if (actor.role === "STAFF" && target.id !== prior.classId) {
      if (!args.reason?.trim()) return need(["lý do và căn cứ chuyển lớp"]);
      if (args.fullName && args.fullName !== prior.fullName)
        return need(["xử lý đổi họ tên riêng trước khi đề nghị chuyển lớp"]);
      return {
        action: "SUBMIT_TRANSFER",
        payload: {
          studentId: prior.id,
          studentVersion: prior.version,
          classId: target.id,
          reason: args.reason,
        },
        title: "Gửi đề nghị chuyển lớp " + prior.code,
        preview: [
          {
            "Sinh viên": prior.code + " · " + prior.fullName,
            "Lớp trước": classes.find((row) => row.id === prior.classId)?.code,
            "Lớp đề nghị": target.code,
            "Lý do": args.reason,
            "Kết quả khi xác nhận":
              "Chỉ gửi hồ sơ chờ Quản lý duyệt; chưa chuyển lớp",
          },
        ],
      };
    }
    const changes = validateStudentRow(
      {
        ...prior,
        fullName: args.fullName || prior.fullName,
        classId: target.id,
      },
      accounts,
      classes,
      profiles,
      prior.id,
    );
    return {
      action: "UPDATE_STUDENT",
      payload: { id: prior.id, fields: { ...changes, version: prior.version } },
      title: "Cập nhật hồ sơ " + prior.code,
      preview: [
        {
          "Mã sinh viên": prior.code,
          "Họ tên trước": prior.fullName,
          "Họ tên sau": changes.fullName,
          "Lớp trước": classes.find((row) => row.id === prior.classId)?.code,
          "Lớp sau": target.code,
        },
      ],
    };
  }
  throw new AppError(400, "Hành động chưa được triển khai.");
}

export async function executeAction(store, proposal, actor) {
  if (proposal.action === "SUBMIT_TRANSFER")
    return proposeTransfer(
      store,
      { ...proposal.payload, requestId: proposal.id },
      actor,
    );
  if (proposal.action === "CREATE_SUBJECT")
    return saveSubject(store, proposal.payload.fields, actor);
  if (proposal.action === "CREATE_SECTION")
    return saveSection(store, proposal.payload.fields, actor);
  if (proposal.action === "REGISTER_SECTION")
    return registerSection(
      store,
      {
        sectionId: proposal.payload.sectionId,
        requestId: proposal.id,
        confirm: true,
        studyMode: proposal.payload.studyMode,
        studyReviewHash: proposal.payload.studyReviewHash,
      },
      actor,
    );
  if (proposal.action === "WITHDRAW_SECTION")
    return withdrawSection(
      store,
      proposal.payload.id,
      { version: proposal.payload.version, requestId: proposal.id },
      actor,
    );
  if (proposal.action === "CREATE_STUDENTS")
    return importStudents(
      store,
      { batchId: proposal.id, rows: proposal.payload.rows },
      actor,
    );
  if (proposal.action === "CREATE_CATALOG")
    return saveCatalog(
      store,
      proposal.payload.kind,
      proposal.payload.fields,
      actor,
    );
  if (proposal.action === "UPDATE_STUDENT")
    return updateStudent(
      store,
      proposal.payload.id,
      proposal.payload.fields,
      actor,
    );
  throw new AppError(400, "Hành động chưa được cho phép.");
}
