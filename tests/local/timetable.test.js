import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import {
  saveSection,
  saveSubject,
  registerSection,
} from "../../backend/local/modules/academic/academic.service.js";
import {
  saveTerm,
  savePeriod,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import {
  lessons,
  weekday,
  addDays,
  sectionsOverlap,
} from "../../backend/local/modules/academic/timetable.rules.js";
import {
  saveTimetable,
  timetableOverview,
  validatePlan,
} from "../../backend/local/modules/academic/timetable.service.js";
import {
  saveRoom,
  saveExam,
  reviewExam,
  publishExam,
} from "../../backend/local/modules/exams/exam.service.js";
import {
  createSession,
  saveAttendance,
} from "../../backend/local/modules/attendance/attendance.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { fingerprint } from "../../backend/local/modules/ai/ai.actions.js";
const monday = addDays("2099-01-01", (1 - weekday("2099-01-01") + 7) % 7);
const end = addDays(monday, 27);
async function fixture() {
  const store = new MemoryStore();
  const account = async (role) => {
    const row = {
      id: randomUUID(),
      role,
      username: randomUUID(),
      email: randomUUID() + "@example.test",
      fullName: role,
      active: true,
      version: 1,
    };
    await store.insert("accounts", row);
    return row;
  };
  const manager = await account("MANAGER"),
    staff = await account("STAFF"),
    teacher = await account("LECTURER"),
    teacher2 = await account("LECTURER"),
    student = await account("STUDENT"),
    student2 = await account("STUDENT");
  const profile = {
    id: randomUUID(),
    accountId: student.id,
    code: "SV001",
    fullName: "Sinh viên A",
    classId: randomUUID(),
    version: 1,
  };
  await store.insert("students", profile);
  await store.insert("students", {
    ...profile,
    id: randomUUID(),
    accountId: student2.id,
    code: "SV002",
  });
  const term = await saveTerm(
    store,
    { code: "2099.1", name: "Học kỳ", maxCredits: 30, passScore: 5 },
    manager,
  );
  await savePeriod(
    store,
    {
      termId: term.id,
      title: "Đợt đăng ký",
      opensAt: Date.now() - 1000,
      closesAt: Date.now() + 600000,
      withdrawUntil: Date.now() + 700000,
      status: "OPEN",
    },
    manager,
  );
  const room = await saveRoom(
    store,
    { code: "A101", name: "Giảng đường A", capacity: 20, active: true },
    manager,
  );
  const room2 = await saveRoom(
    store,
    { code: "A102", name: "Giảng đường B", capacity: 20, active: true },
    manager,
  );
  const sections = [];
  for (let i = 0; i < 2; i++) {
    const subject = await saveSubject(
      store,
      { code: "MON" + i, name: "Môn " + i, credits: 3 },
      manager,
    );
    sections.push(
      await saveSection(
        store,
        {
          code: "LOP" + i,
          term: term.code,
          subjectId: subject.id,
          lecturerId: i === 0 ? teacher.id : teacher2.id,
          capacity: 10,
          startDate: monday,
          endDate: end,
          weekday: i === 0 ? 1 : 3,
          startTime: "08:00",
          endTime: "10:00",
          status: "OPEN",
        },
        manager,
      ),
    );
  }
  const meeting = (day = 1, extra = {}) => ({
    id: randomUUID(),
    weekday: day,
    startTime: "08:00",
    endTime: "10:00",
    roomId: room.id,
    ...extra,
  });
  const input = async (index = 0, extra = {}) => {
    const s = (await store.list("sections")).find(
        (r) => r.id === sections[index].id,
      ),
      p = (await store.list("timetablePlans")).find(
        (r) => r.sectionId === s.id,
      );
    return {
      version: p?.version || 0,
      sectionVersion: s.version,
      meetings: [meeting(index === 0 ? 1 : 3)],
      exceptions: [],
      reason: "Phân lịch theo kế hoạch đào tạo",
      requestId: randomUUID(),
      confirm: true,
      ...extra,
    };
  };
  const save = async (index = 0, extra = {}, actor = manager, source = store) =>
    saveTimetable(source, sections[index].id, await input(index, extra), actor);
  return {
    store,
    manager,
    staff,
    teacher,
    teacher2,
    student,
    student2,
    profile,
    sections,
    term,
    room,
    room2,
    meeting,
    input,
    save,
  };
}
test("Timetable: legacy recurrence, date boundaries, cancellation and make-up use actual dates", async () => {
  const f = await fixture(),
    s = f.sections[0];
  assert.equal(lessons(s).length, 4);
  const m = f.meeting(),
    p = {
      sectionId: s.id,
      meetings: [m],
      exceptions: [
        {
          meetingId: m.id,
          date: monday,
          kind: "MOVE",
          targetDate: addDays(monday, 1),
          startTime: "11:00",
          endTime: "12:00",
          roomId: f.room2.id,
          reason: "Đổi lịch",
        },
      ],
    };
  assert.equal(lessons(s, [p], monday, monday).length, 0);
  const moved = lessons(s, [p], addDays(monday, 1), addDays(monday, 1));
  assert.equal(moved.length, 1);
  assert.equal(moved[0].originalDate, monday);
  assert.equal(moved[0].roomId, f.room2.id);
  p.exceptions[0].kind = "CANCEL";
  assert.equal(lessons(s, [p]).length, 3);
  assert.equal(
    sectionsOverlap(s, { ...s, startTime: "10:00", endTime: "11:00" }),
    false,
  );
});
test("Timetable: rejects malformed, duplicate or orphaned meetings/exceptions and oversized range", async () => {
  const f = await fixture(),
    base = await f.input(),
    s = f.sections[0],
    m = base.meetings[0];
  for (const extra of [
    { meetings: [] },
    { meetings: [{ ...m, startTime: "25:00" }] },
    { meetings: [m, m] },
    {
      exceptions: [
        { meetingId: "missing", date: monday, kind: "CANCEL", reason: "Nghỉ" },
      ],
    },
    {
      exceptions: [
        { meetingId: m.id, date: "2099-02-30", kind: "CANCEL", reason: "Nghỉ" },
      ],
    },
    {
      exceptions: [
        {
          meetingId: m.id,
          date: monday,
          kind: "MOVE",
          targetDate: "2100-01-01",
          startTime: "08:00",
          endTime: "09:00",
          roomId: f.room.id,
          reason: "Đổi",
        },
      ],
    },
  ])
    assert.throws(() => validatePlan(s, { ...base, ...extra }));
  const e = { meetingId: m.id, date: monday, kind: "CANCEL", reason: "Nghỉ" };
  assert.throws(() => validatePlan(s, { ...base, exceptions: [e, e] }));
  assert.throws(() => validatePlan({ ...s, endDate: "2103-12-31" }, base));
});
test("Timetable: saves atomically, bumps class version, binds retry and requires confirmation/reason", async () => {
  const f = await fixture(),
    body = await f.input(),
    before = await fingerprint(f.store);
  for (const extra of [
    { confirm: false },
    { reason: "" },
    { requestId: "bad" },
  ])
    await assert.rejects(() =>
      saveTimetable(
        f.store,
        f.sections[0].id,
        { ...body, ...extra },
        f.manager,
      ),
    );
  const result = await saveTimetable(
    f.store,
    f.sections[0].id,
    body,
    f.manager,
  );
  assert.equal(result.row.version, 1);
  assert.equal(result.sectionVersion, 2);
  assert.notEqual(await fingerprint(f.store), before);
  assert.equal(
    (await saveTimetable(f.store, f.sections[0].id, body, f.manager)).replayed,
    true,
  );
  assert.equal((await f.store.list("timetablePlans")).length, 1);
  await assert.rejects(
    () =>
      saveTimetable(
        f.store,
        f.sections[0].id,
        { ...body, reason: "Nội dung khác" },
        f.manager,
      ),
    /nội dung khác/,
  );
  await assert.rejects(
    () =>
      saveTimetable(
        f.store,
        f.sections[0].id,
        { ...body, requestId: randomUUID() },
        f.manager,
      ),
    /thay đổi/,
  );
});
test("Timetable: only current manager/staff can write; concurrent stale edits do not overwrite", async () => {
  const f = await fixture();
  for (const a of [f.teacher, f.student])
    await assert.rejects(
      () => f.save(0, {}, a),
      (e) => e.status === 403,
    );
  await assert.rejects(
    () => f.save(0, {}, { ...f.manager, version: 0 }),
    (e) => e.status === 401,
  );
  const a = await f.input(),
    b = await f.input();
  const results = await Promise.allSettled([
    saveTimetable(f.store, f.sections[0].id, a, f.manager),
    saveTimetable(f.store, f.sections[0].id, b, f.manager),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});
test("Timetable: teacher conflicts use every weekly meeting and make-up; same-class overlaps blocked", async () => {
  const f = await fixture();
  await f.store.update(
    "sections",
    f.sections[1].id,
    { lecturerId: f.teacher.id },
    1,
  );
  await assert.rejects(
    () => f.save(0, { meetings: [f.meeting(), f.meeting(3)] }),
    /Giảng viên/,
  );
  await assert.rejects(
    () =>
      f.save(0, {
        meetings: [
          f.meeting(),
          f.meeting(1, { startTime: "09:00", endTime: "11:00" }),
        ],
      }),
    /cùng lớp/,
  );
  const m = f.meeting();
  await assert.rejects(
    () =>
      f.save(0, {
        meetings: [m],
        exceptions: [
          {
            meetingId: m.id,
            date: monday,
            kind: "MOVE",
            targetDate: addDays(monday, 2),
            startTime: "08:30",
            endTime: "09:30",
            roomId: f.room.id,
            reason: "Học bù",
          },
        ],
      }),
    /Giảng viên/,
  );
  await f.save(0, {
    meetings: [f.meeting(3, { startTime: "10:00", endTime: "11:00" })],
  });
});
test("Timetable: global room conflicts, inactive rooms and capacity are checked before write", async () => {
  const f = await fixture();
  await f.save();
  await assert.rejects(
    () => f.save(1, { meetings: [f.meeting(1)] }),
    /Phòng học đã/,
  );
  await assert.rejects(
    () => f.save(1, { meetings: [f.meeting(2, { roomId: randomUUID() })] }),
    /sức chứa/,
  );
  const small = await saveRoom(
    f.store,
    { code: "NHO", name: "Nhỏ", capacity: 5, active: true },
    f.manager,
  );
  await assert.rejects(
    () => f.save(1, { meetings: [f.meeting(2, { roomId: small.id })] }),
    /sức chứa/,
  );
  const m = f.meeting();
  await f.save(0, {
    meetings: [m],
    exceptions: [
      { meetingId: m.id, date: monday, kind: "CANCEL", reason: "Nghỉ" },
    ],
  });
  // Chỉ ngày đã hủy được giải phóng; tuần kế tiếp vẫn giữ phòng.
  const s = {
    ...f.sections[1],
    id: randomUUID(),
    startDate: monday,
    endDate: monday,
    weekday: 1,
  };
  await f.store.insert("sections", s);
  await saveTimetable(
    f.store,
    s.id,
    {
      version: 0,
      sectionVersion: 1,
      meetings: [f.meeting()],
      exceptions: [],
      reason: "Bố trí phòng ngày nghỉ",
      requestId: randomUUID(),
      confirm: true,
    },
    f.manager,
  );
});
test("Timetable: registration checks added/moved lessons, cancelled lesson frees the conflict", async () => {
  const f = await fixture();
  await registerSection(
    f.store,
    { sectionId: f.sections[1].id, requestId: randomUUID() },
    f.student,
  );
  await f.save(0, {
    meetings: [f.meeting(1), f.meeting(3, { roomId: f.room2.id })],
  });
  await assert.rejects(
    () =>
      registerSection(
        f.store,
        { sectionId: f.sections[0].id, requestId: randomUUID() },
        f.student,
      ),
    /trùng lịch/,
  );
  const m = f.meeting(1);
  await f.save(0, {
    meetings: [m],
    exceptions: [
      {
        meetingId: m.id,
        date: monday,
        kind: "MOVE",
        targetDate: addDays(monday, 2),
        startTime: "08:00",
        endTime: "09:00",
        roomId: f.room2.id,
        reason: "Học bù",
      },
    ],
  });
  await assert.rejects(
    () =>
      registerSection(
        f.store,
        { sectionId: f.sections[0].id, requestId: randomUUID() },
        f.student,
      ),
    /trùng lịch/,
  );
  await f.save(0, { meetings: [f.meeting(2)] });
  await registerSection(
    f.store,
    { sectionId: f.sections[0].id, requestId: randomUUID() },
    f.student,
  );
  await assert.rejects(
    () => f.save(0, { meetings: [f.meeting(3, { roomId: f.room2.id })] }),
    /sinh viên/,
  );
});
test("Timetable: room edits and class capacity/lecturer changes cannot invalidate an applied plan", async () => {
  const f = await fixture();
  await f.save();
  await assert.rejects(
    () => saveRoom(f.store, { ...f.room, capacity: 5 }, f.manager, f.room.id),
    /sĩ số tối đa/,
  );
  await assert.rejects(
    () => saveRoom(f.store, { ...f.room, active: false }, f.manager, f.room.id),
    /lịch học/,
  );
  const s = (await f.store.list("sections"))[0];
  await assert.rejects(
    () => saveSection(f.store, { ...s, capacity: 21 }, f.manager, s.id),
    /sức chứa/,
  );
  await assert.rejects(
    () => saveSection(f.store, { ...s, weekday: 2 }, f.manager, s.id),
    /Thời khóa biểu/,
  );
});
test("Timetable: exam room publication reads lessons and plan versions invalidate prior preview", async () => {
  const f = await fixture();
  await f.save();
  const draft = await saveExam(
    f.store,
    {
      sectionId: f.sections[1].id,
      roomId: f.room.id,
      invigilatorId: f.teacher2.id,
      examDate: monday,
      startTime: "08:00",
      endTime: "09:00",
    },
    f.manager,
  );
  await assert.rejects(
    () => reviewExam(f.store, draft.id, f.manager),
    /Phòng thi đang có lịch học/,
  );
  const second = await saveExam(
      f.store,
      { ...draft, examDate: addDays(monday, 1) },
      f.manager,
      draft.id,
    ),
    review = await reviewExam(f.store, second.id, f.manager);
  await f.save(0, { meetings: [f.meeting(4)] });
  await assert.rejects(
    () =>
      publishExam(
        f.store,
        second.id,
        {
          version: second.version,
          confirm: true,
          reviewHash: review.reviewHash,
        },
        f.manager,
      ),
    /thay đổi/,
  );
  const current = await reviewExam(f.store, second.id, f.manager);
  await publishExam(
    f.store,
    second.id,
    { version: second.version, confirm: true, reviewHash: current.reviewHash },
    f.manager,
  );
  await assert.rejects(
    () => f.save(0, { meetings: [f.meeting(2)] }),
    /lịch thi/,
  );
});
test("Timetable: attendance uses cancelled/moved dates and separates two lessons on the same day", async () => {
  const f = await fixture(),
    a = f.meeting(1),
    b = f.meeting(1, { startTime: "13:00", endTime: "15:00" });
  await f.save(0, {
    meetings: [a, b],
    exceptions: [
      {
        meetingId: a.id,
        date: monday,
        kind: "MOVE",
        targetDate: addDays(monday, 1),
        startTime: "10:00",
        endTime: "12:00",
        roomId: f.room.id,
        reason: "Học bù",
      },
    ],
  });
  await assert.rejects(
    () =>
      createSession(
        f.store,
        {
          kind: "CLASS",
          sectionId: f.sections[0].id,
          sessionDate: monday,
          lessonKey: a.id,
        },
        f.teacher,
      ),
    /buổi học/,
  );
  const moved = await createSession(
    f.store,
    {
      kind: "CLASS",
      sectionId: f.sections[0].id,
      sessionDate: addDays(monday, 1),
    },
    f.teacher,
  );
  assert.equal(moved.lessonStartTime, "10:00");
  assert.equal(moved.lessonKey, a.id);
  await assert.rejects(
    () =>
      createSession(
        f.store,
        {
          kind: "CLASS",
          sectionId: f.sections[0].id,
          sessionDate: addDays(monday, 7),
        },
        f.teacher,
      ),
    /buổi học/,
  );
  for (const m of [a, b])
    await createSession(
      f.store,
      {
        kind: "CLASS",
        sectionId: f.sections[0].id,
        sessionDate: addDays(monday, 7),
        lessonKey: m.id,
      },
      f.teacher,
    );
  assert.equal((await f.store.list("attendanceSessions")).length, 3);
  await assert.rejects(
    () =>
      createSession(
        f.store,
        {
          kind: "CLASS",
          sectionId: f.sections[0].id,
          sessionDate: addDays(monday, 7),
          lessonKey: a.id,
        },
        f.teacher,
      ),
    /đã có/,
  );
});
test("Timetable: cannot change an opened attendance date; audit failure rolls back plan and class", async () => {
  const f = await fixture(),
    m = f.meeting();
  await f.save(0, { meetings: [m] });
  await createSession(
    f.store,
    { kind: "CLASS", sectionId: f.sections[0].id, sessionDate: monday },
    f.teacher,
  );
  await assert.rejects(
    () =>
      f.save(0, { meetings: [{ ...m, startTime: "09:00", endTime: "11:00" }] }),
    /điểm danh/,
  );
  const before = structuredClone(f.store.data),
    original = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return original.call(this, kind, row);
  };
  await assert.rejects(() => f.save(1), /audit/);
  assert.deepEqual(f.store.data, before);
});
test("Timetable: read APIs limit student/lecturer data; staff scope does not hide global conflicts", async () => {
  const f = await fixture();
  await f.save();
  assert.equal(
    (await timetableOverview(f.store, f.student, { from: monday, to: end }))
      .rows.length,
    0,
  );
  await registerSection(
    f.store,
    { sectionId: f.sections[0].id, requestId: randomUUID() },
    f.student,
  );
  const student = await timetableOverview(f.store, f.student, {
    from: monday,
    to: end,
  });
  assert.equal(student.sections.length, 1);
  assert.equal(student.rooms.length, 0);
  assert.equal(student.plans.length, 0);
  assert.equal(student.manage, false);
  assert.equal(
    (await timetableOverview(f.store, f.teacher, { from: monday, to: end }))
      .sections.length,
    1,
  );
  const faculty = randomUUID(),
    cohort = randomUUID(),
    major = randomUUID(),
    cl = f.profile.classId;
  await f.store.insert("faculties", {
    id: faculty,
    name: "Khoa A",
    version: 1,
  });
  await f.store.insert("cohorts", { id: cohort, version: 1 });
  await f.store.insert("majors", { id: major, facultyId: faculty, version: 1 });
  await f.store.insert("classes", {
    id: cl,
    majorId: major,
    cohortId: cohort,
    version: 1,
  });
  await f.store.update(
    "sections",
    f.sections[0].id,
    { facultyId: faculty, cohortId: cohort },
    2,
  );
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "FACULTY",
    facultyId: faculty,
    cohortId: cohort,
    active: true,
    version: 1,
  });
  const scoped = staffStore(f.store, f.staff),
    overview = await timetableOverview(scoped, f.staff, {
      from: monday,
      to: end,
    });
  assert.equal(overview.sections.length, 1);
  assert.equal(overview.manageRooms, false);
  await assert.rejects(
    async () =>
      saveTimetable(scoped, f.sections[1].id, await f.input(1), f.staff),
    (e) => e.status === 404,
  );
  await f.save(1, { meetings: [f.meeting(2, { roomId: f.room2.id })] });
  await assert.rejects(
    async () =>
      saveTimetable(
        scoped,
        f.sections[0].id,
        await f.input(0, { meetings: [f.meeting(2, { roomId: f.room2.id })] }),
        f.staff,
      ),
    /Phòng học đã/,
  );
});
test("Timetable: AI lookup asks dates, returns authorized actual lessons with source and no write tool", async () => {
  const f = await fixture();
  await f.save();
  await registerSection(
    f.store,
    { sectionId: f.sections[0].id, requestId: randomUUID() },
    f.student,
  );
  const ai = new AiService(f.store, {}),
    sources = [];
  assert.ok(
    (await ai.runTool("lookup_timetable", {}, f.student, [], sources))
      .needsInformation,
  );
  const result = await ai.runTool(
    "lookup_timetable",
    { from: monday, to: end },
    f.student,
    [],
    sources,
  );
  assert.equal(result.rows.length, 4);
  assert.ok(result.source);
  assert.ok(result.asOf);
  assert.equal(result.rows[0].sectionId, f.sections[0].id);
  await assert.rejects(
    () =>
      timetableOverview(f.store, f.student, { from: monday, to: "2100-01-01" }),
    /63 ngày/,
  );
});
test("Timetable: HTTP enforces login, Origin and write roles", async (t) => {
  const f = await fixture(),
    origin = "http://lizz.test",
    token = "a".repeat(64);
  await f.store.insert("sessions", {
    tokenHash: tokenHash(token),
    accountId: f.student.id,
    accountVersion: 1,
    expiresAt: Date.now() + 60000,
  });
  const server = createApp({
    store: f.store,
    config: { origin },
    mode: "demo",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port + "/api/v1/timetable",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal((await fetch(url)).status, 401);
  const data = await fetch(url + "?from=" + monday + "&to=" + end, { headers });
  assert.equal(data.status, 200);
  assert.equal((await data.json()).rows.length, 0);
  assert.equal(
    (
      await fetch(url + "/sections/" + f.sections[0].id, {
        method: "POST",
        headers,
        body: JSON.stringify(await f.input()),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url + "/sections/" + f.sections[0].id, {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("Timetable: SQL mapping binds JSON and attendance lesson fields without interpolating content", async () => {
  const calls = [],
    conn = {
      execute: async (sql, args) => {
        calls.push({ sql, args });
        return [{ affectedRows: 1 }];
      },
    },
    store = new MysqlStore(conn),
    reason = "'); DROP TABLE accounts; --",
    id = randomUUID();
  await store.insert("timetablePlans", {
    id,
    sectionId: randomUUID(),
    meetings: [{ id: "m", weekday: 1 }],
    exceptions: [],
    reason,
    updatedBy: randomUUID(),
    updatedAt: 1,
    version: 1,
  });
  assert.match(calls[0].sql, /INSERT INTO timetable_plans/);
  assert.ok(!calls[0].sql.includes(reason));
  assert.ok(calls[0].args.includes(reason));
  assert.ok(calls[0].args.includes("[]"));
  await store.update("timetablePlans", id, { meetings: [] }, 1);
  assert.match(calls[1].sql, /meetings_json=\?/);
  await store.insert("attendanceSessions", {
    id: randomUUID(),
    lessonKey: "m",
    lessonStartTime: "08:00",
    lessonEndTime: "10:00",
    lessonRoomId: randomUUID(),
  });
  assert.match(calls[2].sql, /lesson_key/);
});
test("Timetable: renaming a meeting cannot detach its existing attendance register", async () => {
  const f = await fixture(),
    m = f.meeting();
  await f.save(0, { meetings: [m] });
  await createSession(
    f.store,
    { kind: "CLASS", sectionId: f.sections[0].id, sessionDate: monday },
    f.teacher,
  );
  await assert.rejects(
    () => f.save(0, { meetings: [{ ...m, id: randomUUID() }] }),
    /điểm danh/,
  );
});
test("Timetable: attendance start guard uses the selected lesson, not the old primary slot", async () => {
  const f = await fixture(),
    a = f.meeting(),
    b = f.meeting(1, { startTime: "13:00", endTime: "15:00" });
  await f.save(0, { meetings: [a, b] });
  await registerSection(
    f.store,
    { sectionId: f.sections[0].id, requestId: randomUUID() },
    f.student,
  );
  const morning = await createSession(
      f.store,
      {
        kind: "CLASS",
        sectionId: f.sections[0].id,
        sessionDate: monday,
        lessonKey: a.id,
      },
      f.teacher,
    ),
    afternoon = await createSession(
      f.store,
      {
        kind: "CLASS",
        sectionId: f.sections[0].id,
        sessionDate: monday,
        lessonKey: b.id,
      },
      f.teacher,
    );
  const realNow = Date.now;
  Date.now = () => Date.parse(monday + "T09:00:00+07:00");
  try {
    await saveAttendance(
      f.store,
      morning.id,
      {
        version: 1,
        rows: [
          {
            studentId: f.profile.id,
            status: "PRESENT",
            reason: "",
            version: 0,
          },
        ],
      },
      f.teacher,
    );
    await assert.rejects(
      () =>
        saveAttendance(
          f.store,
          afternoon.id,
          {
            version: 1,
            rows: [
              {
                studentId: f.profile.id,
                status: "PRESENT",
                reason: "",
                version: 0,
              },
            ],
          },
          f.teacher,
        ),
      /Chưa đến giờ/,
    );
  } finally {
    Date.now = realNow;
  }
});
