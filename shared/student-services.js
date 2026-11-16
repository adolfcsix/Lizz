export const SERVICE_STATES = {
  DRAFT: "Bản nháp", SUBMITTED: "Chờ tiếp nhận", IN_PROGRESS: "Đang xử lý",
  NEEDS_INFO: "Cần bổ sung", READY: "Có kết quả", DELIVERED: "Đã trả kết quả",
  REJECTED: "Từ chối", CANCELLED: "Đã hủy",
};
export const DELIVERY_METHODS = { COUNTER: "Nhận trực tiếp", EMAIL: "Nhận qua email trường" };
export const SERVICE_ACTIONS = {
  edit: "Lưu bổ sung", submit: "Gửi hồ sơ", take: "Tiếp nhận", reassign: "Đổi người phụ trách",
  "request-info": "Yêu cầu bổ sung", ready: "Ghi nhận kết quả", deliver: "Xác nhận đã trả",
  reject: "Từ chối", cancel: "Hủy hồ sơ",
  "link-charge": "Liên kết khoản thu", "unlink-charge": "Gỡ liên kết khoản thu",
};
export function serviceActions(row, actor) {
  if (actor.role === "STUDENT") {
    if (row.requestedBy !== actor.id) return [];
    return ["DRAFT", "NEEDS_INFO"].includes(row.status) ? ["edit", "submit", "cancel"]
      : row.status === "SUBMITTED" ? ["cancel"] : [];
  }
  if (!["MANAGER", "STAFF"].includes(actor.role) || row.status === "DRAFT") return [];
  if (row.status === "SUBMITTED") return actor.role === "MANAGER" ? ["take", "reject", "reassign"]
    : !row.assignedTo || row.assignedTo === actor.id ? ["take", "reject"] : [];
  const owner = actor.role === "MANAGER" || row.assignedTo === actor.id;
  if (!owner) return [];
  const more = [ ...(actor.role === "MANAGER" ? ["reassign"] : []),
    ...(!row.chargeId && row.payload?.details?.estimatedAmount > 0 ? ["link-charge"] : row.chargeId && actor.role === "MANAGER" ? ["unlink-charge"] : []) ];
  if (row.status === "IN_PROGRESS") return ["request-info", "ready", "reject", ...more];
  if (row.status === "NEEDS_INFO") return ["reject", ...more];
  if (row.status === "READY") return ["deliver", ...more];
  return [];
}
export const serviceMoney = (n) => Number(n).toLocaleString("vi-VN") + " đ";
