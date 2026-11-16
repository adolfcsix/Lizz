// Nhãn và thao tác hiển thị dùng chung. Backend vẫn kiểm tra lại quyền và dữ liệu.
export const CONTACT_FIELDS = [
  { key: "phone", label: "Số điện thoại", max: 24 },
  { key: "personalEmail", label: "Email cá nhân", max: 160 },
  { key: "address", label: "Địa chỉ liên hệ", max: 500 },
  { key: "emergencyName", label: "Người liên hệ khi cần", max: 100 },
  { key: "emergencyPhone", label: "Điện thoại người liên hệ", max: 24 },
  { key: "relationship", label: "Mối quan hệ", max: 80 },
];
export const PROFILE_STATUS = {
  SUBMITTED: "Chờ tiếp nhận",
  IN_REVIEW: "Đang xử lý",
  NEEDS_INFO: "Cần bổ sung",
  RECOMMENDED: "Chờ quản lý duyệt",
  APPLIED: "Đã cập nhật",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
};
export const PROFILE_ACTION = {
  receive: "Tiếp nhận",
  takeover: "Nhận lại xử lý",
  "request-info": "Yêu cầu bổ sung",
  recommend: "Đề nghị duyệt",
  approve: "Duyệt và cập nhật",
  reject: "Từ chối",
  cancel: "Hủy yêu cầu",
  resubmit: "Bổ sung và gửi lại",
};
export const CONTACT_ROLES = ["MANAGER", "STAFF", "STUDENT"];
export function contactValues(value = {}) {
  return Object.fromEntries(
    CONTACT_FIELDS.map((f) => [
      f.key,
      typeof value?.[f.key] === "string" ? value[f.key] : "",
    ]),
  );
}
export function profileActions(actor, row) {
  if (actor.role === "STUDENT")
    return row.requestedBy === actor.id
      ? row.status === "NEEDS_INFO"
        ? ["resubmit", "cancel"]
        : row.status === "SUBMITTED"
          ? ["cancel"]
          : []
      : [];
  if (!["MANAGER", "STAFF"].includes(actor.role)) return [];
  const manager = actor.role === "MANAGER",
    owned = manager || row.assignedTo === actor.id,
    actions = [];
  if (row.status === "SUBMITTED") actions.push("receive");
  if (
    manager &&
    ["IN_REVIEW", "RECOMMENDED"].includes(row.status) &&
    row.assignedTo !== actor.id
  )
    actions.push("takeover");
  if (owned && row.status === "IN_REVIEW")
    actions.push("request-info", "recommend");
  if (owned && row.status === "RECOMMENDED") actions.push("request-info");
  if (manager && row.status === "RECOMMENDED") actions.push("approve");
  if (manager && ["IN_REVIEW", "RECOMMENDED"].includes(row.status))
    actions.push("reject");
  return actions;
}
