// Dùng chung ở frontend/backend. Backend luôn kiểm tra lại trước khi ghi DB.
export const ROLES = {
  MANAGER: "Quản lý",
  STAFF: "Nhân viên",
  LECTURER: "Giảng viên",
  STUDENT: "Sinh viên",
};
export const normalizeEmail = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();
export const foldText = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();

export function accountIssues(value) {
  if (!value || typeof value !== "object")
    return ["Thông tin tài khoản không hợp lệ."];
  const errors = [];
  if (
    typeof value.username !== "string" ||
    !/^[A-Za-z0-9._-]{3,60}$/.test(value.username || "")
  )
    errors.push(
      "Tên đăng nhập cần 3–60 ký tự chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.",
    );
  if (
    typeof value.fullName !== "string" ||
    !value.fullName.trim() ||
    value.fullName.length > 160
  )
    errors.push("Họ tên cần từ 1 đến 160 ký tự.");
  if (
    typeof value.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value.email)) ||
    value.email.length > 254
  )
    errors.push("Email không hợp lệ.");
  if (!Object.hasOwn(ROLES, value.role))
    errors.push("Chọn một vai trò hợp lệ.");
  if (
    typeof value.password !== "string" ||
    value.password.length < 12 ||
    value.password.length > 128
  )
    errors.push("Mật khẩu cần 12–128 ký tự.");
  if (value.password !== value.passwordConfirm)
    errors.push("Hai lần nhập mật khẩu chưa khớp.");
  return errors;
}

export const CATALOGS = {
  cohorts: { label: "Khóa", fields: ["code", "name", "startYear"] },
  faculties: { label: "Khoa", fields: ["code", "name"] },
  majors: { label: "Ngành", fields: ["code", "name", "facultyId"] },
  classes: {
    label: "Lớp",
    fields: ["code", "name", "majorId", "cohortId", "capacity"],
  },
};

export function catalogIssues(kind, value) {
  if (!Object.hasOwn(CATALOGS, kind) || !value || typeof value !== "object")
    return ["Danh mục không hợp lệ."];
  const errors = [];
  if (
    typeof value.code !== "string" ||
    !/^[A-Za-z0-9._-]{1,40}$/.test(value.code || "")
  )
    errors.push("Mã cần 1–40 ký tự chữ, số hoặc . _ -");
  if (
    typeof value.name !== "string" ||
    !value.name.trim() ||
    value.name.length > 160
  )
    errors.push("Tên cần từ 1 đến 160 ký tự.");
  if (
    kind === "cohorts" &&
    (!Number.isInteger(Number(value.startYear)) ||
      Number(value.startYear) < 1900 ||
      Number(value.startYear) > 2200)
  )
    errors.push("Năm bắt đầu không hợp lệ.");
  if (
    kind === "classes" &&
    (!Number.isInteger(Number(value.capacity)) ||
      Number(value.capacity) < 1 ||
      Number(value.capacity) > 1000)
  )
    errors.push("Sĩ số tối đa cần từ 1 đến 1000.");
  for (const key of CATALOGS[kind].fields.filter((k) => k.endsWith("Id"))) {
    if (!String(value[key] || "").trim())
      errors.push("Chọn đầy đủ danh mục liên kết.");
  }
  return errors;
}
