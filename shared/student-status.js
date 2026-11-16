export const STUDY_STATES = { ACTIVE: "Đang học", ON_LEAVE: "Đang bảo lưu" };
export const STATUS_REQUEST_KINDS = {
  LEAVE: "Bảo lưu",
  RETURN: "Quay lại học",
};
export const STATUS_REQUEST_STATES = {
  SUBMITTED: "Chờ kiểm tra",
  REVIEWED: "Chờ Quản lý duyệt",
  APPROVED: "Đã duyệt · Chưa áp dụng",
  APPLIED: "Đã áp dụng",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
};
export function statusRequestActions(actor, row) {
  if (actor.role === "STUDENT")
    return row.requestedBy === actor.id && row.status === "SUBMITTED"
      ? ["cancel"]
      : [];
  if (!["MANAGER", "STAFF"].includes(actor.role)) return [];
  const actions = [],
    manager = actor.role === "MANAGER";
  if (row.status === "SUBMITTED") actions.push("review");
  if (
    manager &&
    row.status === "REVIEWED" &&
    row.requestedBy !== actor.id &&
    row.reviewedBy !== actor.id
  )
    actions.push("approve");
  if (manager && ["SUBMITTED", "REVIEWED"].includes(row.status))
    actions.push("reject");
  if (row.status === "APPROVED" && (manager || row.reviewedBy === actor.id))
    actions.push("apply");
  if (
    (row.requestedBy === actor.id && row.status === "SUBMITTED") ||
    (manager && ["SUBMITTED", "REVIEWED", "APPROVED"].includes(row.status))
  )
    actions.push("cancel");
  return actions;
}
export const STATUS_ACTION_LABELS = {
  review: "Kiểm tra hồ sơ",
  approve: "Phê duyệt",
  reject: "Từ chối",
  apply: "Áp dụng quyết định",
  cancel: "Hủy yêu cầu",
};
