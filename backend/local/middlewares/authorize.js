import { AppError } from "../core/errors.js";

export function authorize(account, roles) {
  if (!account) throw new AppError(401, "Vui lòng đăng nhập.");
  if (!roles.includes(account.role))
    throw new AppError(403, "Bạn không có quyền thực hiện thao tác này.");
}

export function checkOrigin(request, origin) {
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.origin !== origin
  ) {
    throw new AppError(403, "Nguồn yêu cầu không hợp lệ.");
  }
}
