export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireValue(condition, message, status = 400) {
  if (!condition) throw new AppError(status, message);
}

export function databaseError(error) {
  if (error.code === "ER_DUP_ENTRY")
    return new AppError(409, "Mã hoặc email đã tồn tại.");
  if (error.code === "ER_NO_REFERENCED_ROW_2")
    return new AppError(400, "Danh mục liên kết không tồn tại.");
  if (error.code === "ER_LOCK_DEADLOCK")
    return new AppError(409, "Có cập nhật đồng thời. Vui lòng thử lại.");
  return error;
}
