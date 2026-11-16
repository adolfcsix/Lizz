import { foldText } from "./local-validation.js";
// Các phép tính hiển thị và xuất lịch; dữ liệu đầu vào đã được API lọc quyền.
const dateOK = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
export const addCalendarDays = (date, days) => {
  if (!dateOK(date) || !Number.isInteger(days))
    throw Error("Ngày không hợp lệ.");
  const result = new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
  if (!dateOK(result)) throw Error("Ngày nằm ngoài khoảng hỗ trợ.");
  return result;
};
export function calendarWeek(date) {
  if (!dateOK(date) || date < "1900-01-01" || date > "9998-12-24")
    throw Error("Chọn ngày từ năm 1900 đến 9998.");
  const day = new Date(date + "T00:00:00Z").getUTCDay() || 7,
    start = addCalendarDays(date, 1 - day);
  return Array.from({ length: 7 }, (_, i) => addCalendarDays(start, i));
}
export function lessonMinutes(value) {
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw Error("Giờ học chưa hợp lệ. Cần kiểm tra lại thời khóa biểu.");
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}
// Không gộp hoặc giấu các lớp diễn ra đồng thời trong lịch toàn trường.
export function weekLessons(rows, date) {
  const days = calendarWeek(date);
  return days.map((day) => ({
    date: day,
    rows: rows
      .filter((r) => r.date === day)
      .map((row) => {
        if (lessonMinutes(row.endTime) <= lessonMinutes(row.startTime))
          throw Error("Giờ kết thúc phải sau giờ bắt đầu.");
        return row;
      })
      .sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime) ||
          String(a.sectionCode).localeCompare(String(b.sectionCode)) ||
          String(a.meetingId).localeCompare(String(b.meetingId)),
      ),
  }));
}
export function filterLessonRows(
  rows,
  { query = "", term = "", sectionId = "", roomCode = "" } = {},
) {
  const q = foldText(query);
  return rows.filter(
    (r) =>
      (!term || r.term === term) &&
      (!sectionId || r.sectionId === sectionId) &&
      (!roomCode ||
        (roomCode === "__UNASSIGNED__"
          ? !r.roomCode
          : r.roomCode === roomCode)) &&
      foldText(
        [
          r.subjectName,
          r.sectionCode,
          r.lecturerName,
          r.roomCode,
          r.roomName,
          r.term,
        ].join(" "),
      ).includes(q),
  );
}
export function lessonTone(row) {
  let hash = 0;
  for (const c of String(row.subjectName || row.sectionCode || ""))
    hash = (hash * 31 + c.codePointAt(0)) >>> 0;
  return hash % 5;
}
const icsText = (value) =>
  String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,");
function folded(line) {
  const encoder = new TextEncoder(),
    parts = [];
  let current = "",
    bytes = 0;
  for (const c of line) {
    const n = encoder.encode(c).length;
    if (bytes + n > 75) {
      parts.push(current);
      current = " ";
      bytes = 1;
    }
    current += c;
    bytes += n;
  }
  parts.push(current);
  return parts.join("\r\n");
}
const utcStamp = (date, time) => {
  if (!dateOK(date)) throw Error("Ngày học chưa hợp lệ.");
  lessonMinutes(time);
  return new Date(date + "T" + time + ":00+07:00")
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
};
export function serializeTimetableIcs(rows, now = new Date()) {
  if (!Number.isFinite(now.getTime()))
    throw Error("Thời điểm xuất lịch không hợp lệ.");
  const stamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z"),
    lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Lizz University//Timetable//VI",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Lizz · Thời khóa biểu",
    ];
  for (const r of rows) {
    if (lessonMinutes(r.endTime) <= lessonMinutes(r.startTime))
      throw Error("Khoảng giờ học chưa hợp lệ.");
    const description = [
      "Lớp: " + r.sectionCode,
      "Giảng viên: " + (r.lecturerName || "Chưa phân công"),
      r.exception
        ? "Học bù từ " + r.originalDate + " · " + (r.reason || "")
        : "",
      "Tệp lịch của tuần được xuất; không tự đồng bộ thay đổi từ Lizz.",
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      "UID:" +
        encodeURIComponent([r.sectionId, r.meetingId, r.date].join("-")) +
        "@lizz.local",
      "DTSTAMP:" + stamp,
      "DTSTART:" + utcStamp(r.date, r.startTime),
      "DTEND:" + utcStamp(r.date, r.endTime),
      "SUMMARY:" + icsText(r.subjectName + " · " + r.sectionCode),
      "LOCATION:" +
        icsText(
          [r.roomCode, r.roomName].filter(Boolean).join(" · ") ||
            "Chưa phân phòng",
        ),
      "DESCRIPTION:" + icsText(description),
      "END:VEVENT",
    );
  }
  return [...lines, "END:VCALENDAR"].map(folded).join("\r\n") + "\r\n";
}
