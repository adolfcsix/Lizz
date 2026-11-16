// datetime-local luôn được hiểu theo giờ Việt Nam, không theo múi giờ máy khách.
export function vietnamDateTimeInput(value) {
  return Number.isFinite(value)
    ? new Date(value + 7 * 3600000).toISOString().slice(0, 16)
    : "";
}
export function parseVietnamDateTime(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
  )
    throw Error("Nhập đầy đủ ngày và giờ Việt Nam.");
  const timestamp = Date.parse(value + ":00+07:00");
  if (!Number.isFinite(timestamp) || vietnamDateTimeInput(timestamp) !== value)
    throw Error("Ngày hoặc giờ không hợp lệ.");
  return timestamp;
}
export function formatVietnamTime(value) {
  return Number.isFinite(value)
    ? new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        dateStyle: "short",
        timeStyle: "short",
      }).format(value)
    : "—";
}
