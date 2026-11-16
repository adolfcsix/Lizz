// Một cách diễn giải lịch dùng chung cho đăng ký, lịch thi và trang thời khóa biểu.
export const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
export const validTime = (v) =>
  typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
export const weekday = (date) => new Date(date + "T00:00:00Z").getUTCDay() || 7;
export const addDays = (date, days) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
export const intersects = (a, b) =>
  a.date === b.date && a.startTime < b.endTime && b.startTime < a.endTime;
export function planFor(section, plans = []) {
  return (
    plans.find((p) => p.sectionId === section.id) || {
      version: 0,
      sectionId: section.id,
      meetings: [
        {
          id: "legacy",
          weekday: section.weekday,
          startTime: section.startTime,
          endTime: section.endTime,
          roomId: null,
        },
      ],
      exceptions: [],
    }
  );
}
export function occurs(section, meeting, date) {
  return (
    validDate(date) &&
    section.startDate <= date &&
    date <= section.endDate &&
    weekday(date) === meeting.weekday
  );
}
export function lessons(
  section,
  plans = [],
  from = section.startDate,
  to = section.endDate,
) {
  const plan = planFor(section, plans),
    rows = [];
  const start = from > section.startDate ? from : section.startDate;
  const end = to < section.endDate ? to : section.endDate;
  if (start > end) return rows;
  for (const meeting of plan.meetings) {
    const exceptions = plan.exceptions.filter(
      (e) => e.meetingId === meeting.id,
    );
    const replaced = new Set(exceptions.map((e) => e.date));
    let date = addDays(start, (meeting.weekday - weekday(start) + 7) % 7);
    while (date <= end) {
      if (!replaced.has(date))
        rows.push({
          sectionId: section.id,
          meetingId: meeting.id,
          date,
          startTime: meeting.startTime,
          endTime: meeting.endTime,
          roomId: meeting.roomId || null,
          exception: null,
        });
      // Không cộng ra ngoài năm 9999 khi đọc lịch cũ.
      if (date > "9999-12-24") break;
      date = addDays(date, 7);
    }
    for (const e of exceptions.filter(
      (e) => e.kind === "MOVE" && from <= e.targetDate && e.targetDate <= to,
    )) {
      rows.push({
        sectionId: section.id,
        meetingId: meeting.id,
        date: e.targetDate,
        startTime: e.startTime,
        endTime: e.endTime,
        roomId: e.roomId || null,
        exception: "MOVE",
        originalDate: e.date,
        reason: e.reason,
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.meetingId.localeCompare(b.meetingId),
  );
}
export function sectionsOverlap(a, b, plans = []) {
  const start = a.startDate > b.startDate ? a.startDate : b.startDate;
  const end = a.endDate < b.endDate ? a.endDate : b.endDate;
  if (start > end) return false;
  const other = lessons(b, plans, start, end),
    byDate = new Map();
  for (const slot of other) {
    if (!byDate.has(slot.date)) byDate.set(slot.date, []);
    byDate.get(slot.date).push(slot);
  }
  return lessons(a, plans, start, end).some((slot) =>
    (byDate.get(slot.date) || []).some((r) => intersects(slot, r)),
  );
}
export function examOverlapsLesson(exam, section, plans = []) {
  return lessons(section, plans, exam.examDate, exam.examDate).some((s) =>
    intersects({ ...exam, date: exam.examDate }, s),
  );
}
export function scheduleDescription(section, plans = [], rooms = []) {
  const plan = planFor(section, plans);
  return plan.meetings
    .map(
      (m) =>
        `${m.weekday === 7 ? "Chủ nhật" : "Thứ " + (m.weekday + 1)} · ${m.startTime}–${m.endTime} · ${rooms.find((r) => r.id === m.roomId)?.code || "Chưa phân phòng"}`,
    )
    .join("; ");
}
