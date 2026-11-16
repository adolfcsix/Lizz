import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarWeek,
  addCalendarDays,
  weekLessons,
  filterLessonRows,
  lessonTone,
  serializeTimetableIcs,
} from "../../shared/timetable-view.js";
const row = (startTime = "08:00", endTime = "10:00", extra = {}) => ({
  sectionId: "section-1",
  meetingId: "m1",
  date: "2026-11-17",
  startTime,
  endTime,
  subjectName: "Cơ sở dữ liệu",
  sectionCode: "CSDL01",
  lecturerName: "Giảng viên A",
  term: "2026.1",
  roomCode: "A101",
  roomName: "Giảng đường",
  ...extra,
});
test("Week view: Monday–Sunday remains correct across month/year and leap day", () => {
  assert.deepEqual(calendarWeek("2026-11-15"), [
    "2026-11-09",
    "2026-11-10",
    "2026-11-11",
    "2026-11-12",
    "2026-11-13",
    "2026-11-14",
    "2026-11-15",
  ]);
  assert.equal(calendarWeek("2027-01-01")[0], "2026-12-28");
  assert.equal(calendarWeek("2024-02-29")[6], "2024-03-03");
  assert.equal(addCalendarDays("2024-02-28", 1), "2024-02-29");
});
test("Week view: impossible or unsupported dates fail rather than drift to another week", () => {
  for (const v of ["2026-02-30", "2026-2-1", "bad", "1899-12-31", "9999-12-31"])
    assert.throws(() => calendarWeek(v));
  assert.throws(() => addCalendarDays("bad", 1));
});
test("Week board: retains all simultaneous classes and sorts actual times without mutating input", () => {
  const rows = [
    row("13:20", "15:05"),
    row("05:30", "06:20", { sectionCode: "EARLY" }),
    row("13:20", "14:00", { sectionCode: "B" }),
    row("13:20", "14:00", { sectionCode: "A" }),
    row("22:15", "23:50", { sectionCode: "LATE" }),
  ];
  const prior = structuredClone(rows),
    week = weekLessons(rows, "2026-11-17");
  assert.equal(week.length, 7);
  assert.equal(week[1].rows.length, 5);
  assert.deepEqual(
    week[1].rows.map((r) => r.sectionCode),
    ["EARLY", "A", "B", "CSDL01", "LATE"],
  );
  assert.deepEqual(rows, prior);
  assert.ok(week.filter((d) => d.rows.length === 0).length === 6);
});
test("Week board: no sessions spill into another week; impossible intervals rejected", () => {
  assert.equal(
    weekLessons([row()], "2026-11-09").flatMap((d) => d.rows).length,
    0,
  );
  for (const r of [row("10:00", "08:00"), row("25:00", "26:00")])
    assert.throws(() => weekLessons([r], "2026-11-17"));
  assert.throws(() => weekLessons([], "2026-02-30"));
});
test("Week board: stable subject colors do not depend on lesson time", () => {
  assert.equal(lessonTone(row()), lessonTone(row("14:00", "16:00")));
  assert.ok(lessonTone(row()) >= 0 && lessonTone(row()) < 5);
});
test("Lesson filters: combine accented search, term, class and room exactly", () => {
  const rows = [
    row(),
    row("13:00", "15:00", {
      sectionId: "s2",
      roomCode: "B202",
      term: "2026.2",
    }),
  ];
  assert.deepEqual(
    filterLessonRows(rows, {
      query: "co so du lieu",
      term: "2026.1",
      sectionId: "section-1",
      roomCode: "A101",
    }),
    [rows[0]],
  );
  assert.equal(
    filterLessonRows(rows, { sectionId: "section-1", roomCode: "B202" }).length,
    0,
  );
  assert.equal(filterLessonRows(rows, { query: "khong ton tai" }).length, 0);
  assert.equal(filterLessonRows(rows).length, 2);
});
test("Lesson filters: unassigned room is explicit and identical course names don't merge classes", () => {
  const a = row(),
    b = row("13:00", "15:00", {
      sectionId: "s2",
      roomCode: "",
      sectionCode: "CSDL02",
    });
  assert.deepEqual(filterLessonRows([a, b], { roomCode: "__UNASSIGNED__" }), [
    b,
  ]);
  assert.deepEqual(filterLessonRows([a, b], { sectionId: "s2" }), [b]);
  assert.equal(weekLessons([a, b], a.date)[1].rows.length, 2);
});
test("Calendar export: Vietnam times convert to UTC including prior date; stable IDs and exact event count", () => {
  const data = [
      row("00:30", "01:30"),
      row("13:00", "15:00", { meetingId: "m2" }),
    ],
    a = serializeTimetableIcs(data, new Date("2026-11-15T00:00:00Z")),
    b = serializeTimetableIcs(data, new Date("2026-11-16T00:00:00Z"));
  assert.match(a, /DTSTART:20261116T173000Z/);
  assert.match(a, /DTEND:20261116T183000Z/);
  assert.equal((a.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.deepEqual(a.match(/UID:[^\r]+/g), b.match(/UID:[^\r]+/g));
  assert.ok(a.endsWith("END:VCALENDAR\r\n"));
});
test("Calendar export: Unicode folds at 75 bytes, escaping text prevents injected calendar records", () => {
  const r = row("08:00", "10:00", {
      subjectName:
        "Học phần; dữ liệu, " + "Đại học ".repeat(40) + "\r\nBEGIN:VEVENT",
      roomName: "Phòng\\ A",
      exception: "MOVE",
      originalDate: "2026-11-16",
      reason: "Chuyển phòng, học bù",
    }),
    text = serializeTimetableIcs([r]);
  assert.equal(
    text.split("\r\n").filter((l) => l === "BEGIN:VEVENT").length,
    1,
  );
  assert.ok(text.includes("\\;"));
  assert.ok(text.includes("\\,"));
  assert.ok(text.includes("\\nBEGIN:VEVENT"));
  assert.ok(text.includes("Phòng\\\\ A"));
  for (const line of text.split("\r\n"))
    assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.ok(text.replace(/\r\n /g, "").includes("Học bù từ 2026-11-16"));
});
test("Calendar export: empty calendar and invalid event data are explicit, no synthetic lessons", () => {
  assert.equal(
    (serializeTimetableIcs([]).match(/BEGIN:VEVENT/g) || []).length,
    0,
  );
  for (const r of [
    row("10:00", "09:00"),
    row("08:00", "10:00", { date: "2026-02-30" }),
  ])
    assert.throws(() => serializeTimetableIcs([r]));
  assert.throws(() => serializeTimetableIcs([], new Date("bad")));
});
