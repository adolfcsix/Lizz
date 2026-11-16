import {
  saveTerm,
  savePeriod,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import {
  saveSubject,
  saveSection,
  registerSection,
  withdrawSection,
  academicOverview,
  sectionRoster,
  schedulesOverlap,
} from "../../backend/local/modules/academic/academic.service.js";

async function fixture(capacity = 2) {
  const store = new MemoryStore();
  const make = (username, role) => ({
    id: randomUUID(),
    username,
    email: username + "@example.test",
    fullName: username,
    role,
    active: true,
    version: 1,
  });
  const admin = make("manager", "MANAGER"),
    teacher = make("teacher", "LECTURER"),
    otherTeacher = make("other-teacher", "LECTURER"),
    student = make("mai", "STUDENT"),
    other = make("minh", "STUDENT");
  for (const row of [admin, teacher, otherTeacher, student, other])
    await store.insert("accounts", row);
  for (const [account, code] of [
    [student, "SV001"],
    [other, "SV002"],
  ])
    await store.insert("students", {
      id: randomUUID(),
      accountId: account.id,
      code,
      fullName: account.fullName,
      classId: randomUUID(),
      version: 1,
    });
  const term = await saveTerm(
    store,
    { code: "2099.1", name: "Học kỳ kiểm thử", maxCredits: 30, passScore: 5 },
    admin,
  );
  await savePeriod(
    store,
    {
      termId: term.id,
      title: "Đợt kiểm thử",
      opensAt: Date.now() - 100000,
      closesAt: Date.now() + 1000000,
      withdrawUntil: Date.now() + 2000000,
      status: "OPEN",
    },
    admin,
  );
  const subject = await saveSubject(
    store,
    { code: "CSDL", name: "Cơ sở dữ liệu", credits: 3 },
    admin,
  );
  const input = {
    code: "CSDL01",
    term: "2099.1",
    subjectId: subject.id,
    lecturerId: teacher.id,
    capacity,
    startDate: "2099-01-01",
    endDate: "2099-06-30",
    weekday: 1,
    startTime: "08:00",
    endTime: "10:00",
    status: "OPEN",
  };
  const section = await saveSection(store, input, admin);
  return {
    store,
    admin,
    teacher,
    otherTeacher,
    student,
    other,
    subject,
    input,
    section,
  };
}
const request = (section) => ({
  sectionId: section.id,
  requestId: randomUUID(),
});

test("Academic validation rejects bad credits, calendar, weekday, time and references", async () => {
  const f = await fixture();
  for (const credits of [0, 11, 1.5, NaN])
    await assert.rejects(
      saveSubject(f.store, { code: "M", name: "Môn", credits }, f.admin),
      /tín chỉ/,
    );
  for (const changes of [
    { startDate: "2099-02-30" },
    { weekday: 8 },
    { startTime: "25:00" },
    { endTime: "07:59" },
    { lecturerId: f.student.id },
    { subjectId: "missing" },
    { startDate: "2099-01-01", endDate: "2099-01-01", weekday: 1 },
  ])
    await assert.rejects(
      saveSection(f.store, { ...f.input, code: "BAD", ...changes }, f.admin),
    );
  assert.equal((await f.store.list("sections")).length, 1);
});

test("Weekly conflicts respect actual date overlap and adjacent time boundaries", async () => {
  const f = await fixture();
  await assert.rejects(
    saveSection(
      f.store,
      { ...f.input, code: "CSDL02", status: "CLOSED" },
      f.admin,
    ),
    /trùng lịch/,
  );
  const next = await saveSection(
    f.store,
    { ...f.input, code: "CSDL02", startTime: "10:00", endTime: "12:00" },
    f.admin,
  );
  assert.equal(schedulesOverlap(f.section, next), false);
  assert.equal(
    schedulesOverlap(
      {
        ...f.section,
        startDate: "2099-01-01",
        endDate: "2099-01-03",
        weekday: 1,
      },
      f.section,
    ),
    false,
  );
  await saveSection(
    f.store,
    {
      ...f.input,
      code: "CSDL03",
      startDate: "2099-07-01",
      endDate: "2099-12-31",
    },
    f.admin,
  );
});

test("Concurrent final place is allocated once and replay does not create more records", async () => {
  const f = await fixture(1),
    a = request(f.section),
    b = request(f.section);
  const results = await Promise.allSettled([
    registerSection(f.store, a, f.student),
    registerSection(f.store, b, f.other),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const index = results.findIndex((r) => r.status === "fulfilled");
  const replay = await registerSection(
    f.store,
    index === 0 ? a : b,
    index === 0 ? f.student : f.other,
  );
  assert.equal(replay.replayed, true);
  assert.equal((await f.store.list("enrollments")).length, 1);
  assert.equal(
    (await f.store.list("events")).filter(
      (r) => r.action === "COURSE_REGISTERED",
    ).length,
    1,
  );
  await assert.rejects(
    registerSection(
      f.store,
      index === 0 ? a : b,
      index === 0 ? f.other : f.student,
    ),
    /nội dung khác/,
  );
});

test("Registration rejects duplicate subject, timetable conflict, closed class and missing profile", async () => {
  const f = await fixture();
  await registerSection(f.store, request(f.section), f.student);
  const duplicate = await saveSection(
    f.store,
    { ...f.input, code: "CSDL02", lecturerId: f.otherTeacher.id, weekday: 5 },
    f.admin,
  );
  await assert.rejects(
    registerSection(f.store, request(duplicate), f.student),
    /môn này/,
  );
  const subject = await saveSubject(
    f.store,
    { code: "WEB", name: "Lập trình web", credits: 3 },
    f.admin,
  );
  const clash = await saveSection(
    f.store,
    {
      ...f.input,
      code: "WEB01",
      subjectId: subject.id,
      lecturerId: f.otherTeacher.id,
      startTime: "09:00",
      endTime: "11:00",
      weekday: 3,
    },
    f.admin,
  );
  // Move to a different teacher's free Monday after creation; same service validates teacher conflicts.
  const conflict = await saveSection(
    f.store,
    { ...clash, weekday: 1, startTime: "10:00", endTime: "12:00" },
    f.admin,
    clash.id,
  );
  const newSlot = await saveSection(
    f.store,
    {
      ...f.input,
      code: "WEB02",
      subjectId: subject.id,
      lecturerId: f.otherTeacher.id,
      startTime: "08:00",
      endTime: "10:00",
    },
    f.admin,
  );
  await assert.rejects(
    registerSection(f.store, request(newSlot), f.student),
    /trùng lịch/,
  );
  const closed = await saveSection(
    f.store,
    { ...conflict, status: "CLOSED" },
    f.admin,
    conflict.id,
  );
  await assert.rejects(
    registerSection(f.store, request(closed), f.other),
    /đóng/,
  );
  const orphan = { ...f.other, id: randomUUID() };
  await f.store.insert("accounts", orphan);
  await assert.rejects(
    registerSection(f.store, request(f.section), orphan),
    /chưa liên kết/,
  );
});

test("Withdrawal preserves history, rejects forged ownership/version and permits explicit re-registration", async () => {
  const f = await fixture();
  const first = await registerSection(f.store, request(f.section), f.student);
  await assert.rejects(
    withdrawSection(
      f.store,
      first.row.id,
      { requestId: randomUUID(), version: 1 },
      f.other,
    ),
    /của bạn/,
  );
  await assert.rejects(
    withdrawSection(
      f.store,
      first.row.id,
      { requestId: randomUUID(), version: 0 },
      f.student,
    ),
    /đã thay đổi/,
  );
  const input = { requestId: randomUUID(), version: 1 };
  const result = await withdrawSection(f.store, first.row.id, input, f.student);
  assert.equal(result.row.status, "WITHDRAWN");
  assert.equal(
    (await withdrawSection(f.store, first.row.id, input, f.student)).replayed,
    true,
  );
  const next = await registerSection(f.store, request(f.section), f.student);
  assert.equal(next.row.id, first.row.id);
  assert.equal(next.row.version, 3);
  assert.equal((await f.store.list("enrollments")).length, 1);
});

test("Manager edits cannot shrink occupied capacity, rewrite registered schedules or use stale versions", async () => {
  const f = await fixture(3);
  await registerSection(f.store, request(f.section), f.student);
  await registerSection(f.store, request(f.section), f.other);
  await assert.rejects(
    saveSection(f.store, { ...f.section, capacity: 1 }, f.admin, f.section.id),
    /nhỏ hơn/,
  );
  await assert.rejects(
    saveSection(f.store, { ...f.section, weekday: 3 }, f.admin, f.section.id),
    /đã có sinh viên/,
  );
  const closed = await saveSection(
    f.store,
    { ...f.section, status: "CLOSED" },
    f.admin,
    f.section.id,
  );
  await assert.rejects(
    saveSection(f.store, f.section, f.admin, f.section.id),
    /đã thay đổi/,
  );
  const registration = (await academicOverview(f.store, f.student)).sections[0]
    .registration;
  await assert.rejects(
    withdrawSection(
      f.store,
      registration.id,
      { requestId: randomUUID(), version: registration.version },
      f.student,
    ),
    /đóng/,
  );
  assert.equal(closed.status, "CLOSED");
});

test("Role boundaries scope lecturer rosters and keep student lists private", async () => {
  const f = await fixture();
  await registerSection(f.store, request(f.section), f.student);
  assert.equal(
    (await academicOverview(f.store, f.otherTeacher)).sections.length,
    0,
  );
  assert.equal(
    (await sectionRoster(f.store, f.section.id, f.teacher)).rows[0].code,
    "SV001",
  );
  await assert.rejects(
    sectionRoster(f.store, f.section.id, f.otherTeacher),
    /phân công/,
  );
  await assert.rejects(sectionRoster(f.store, f.section.id, f.student));
  await assert.rejects(
    saveSubject(f.store, { code: "BAD", name: "Sai", credits: 3 }, f.teacher),
  );
  const info = await academicOverview(f.store, f.other);
  assert.equal(info.sections[0].enrolled, 1);
  assert.equal(info.sections[0].registration, null);
  assert.deepEqual(info.teachers, []);
  assert.equal(JSON.stringify(info).includes(f.student.email), false);
  const changed = (await f.store.list("accounts")).find(
    (r) => r.id === f.student.id,
  );
  changed.version = 2;
  await f.store.update("accounts", changed.id, { active: false }, 1);
  await assert.rejects(
    registerSection(f.store, request(f.section), f.student),
    /Phiên hoặc quyền/,
  );
});

test("Audit failure rolls back enrollment and idempotency records", async () => {
  const f = await fixture();
  const original = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return original.call(this, kind, row);
  };
  await assert.rejects(
    registerSection(f.store, request(f.section), f.student),
    /audit unavailable/,
  );
  assert.equal((await f.store.list("enrollments")).length, 0);
  assert.equal((await f.store.list("academicRequests")).length, 0);
});

class ScriptedProvider {
  ready = true;
  constructor(tool, args) {
    this.responses = [
      {
        steps: [],
        calls: [{ id: randomUUID(), name: tool, arguments: args }],
        text: "",
      },
      { steps: [], calls: [], text: "Xem trước" },
    ];
  }
  async generate() {
    return this.responses.shift();
  }
}
async function proposal(f, actor, tool, args) {
  const ai = new AiService(f.store, new ScriptedProvider(tool, args));
  const result = await ai.message(
    {
      conversationId: randomUUID(),
      requestId: randomUUID(),
      version: 0,
      message: "Yêu cầu kiểm thử",
    },
    actor,
  );
  return { ai, proposal: result.proposals[0], result };
}

test("LizzChat student registration waits for confirmation and commits once", async () => {
  const f = await fixture();
  const { ai, proposal: p } = await proposal(
    f,
    f.student,
    "prepare_course_registration",
    { sectionCode: f.section.code, term: f.section.term },
  );
  assert.equal((await f.store.list("enrollments")).length, 0);
  await assert.rejects(ai.decide(p.id, { version: 1 }, f.student), /xác nhận/);
  await assert.rejects(
    ai.decide(p.id, { version: 1, confirm: true }, f.other),
    /trong quyền/,
  );
  const results = await Promise.all([
    ai.decide(p.id, { version: 1, confirm: true }, f.student),
    ai.decide(p.id, { version: 1, confirm: true }, f.student),
  ]);
  assert.equal(results.filter((r) => r.replayed).length, 1);
  assert.equal((await f.store.list("enrollments")).length, 1);
});

test("LizzChat cancellation and changing occupancy never silently register another class", async () => {
  for (const cancel of [true, false]) {
    const f = await fixture(1);
    const { ai, proposal: p } = await proposal(
      f,
      f.student,
      "prepare_course_registration",
      { sectionCode: f.section.code },
    );
    if (!cancel) await registerSection(f.store, request(f.section), f.other);
    const result = await ai.decide(
      p.id,
      { version: 1, confirm: true },
      f.student,
      cancel,
    );
    assert.equal(result.proposal.status, cancel ? "CANCELLED" : "STALE");
    const own = (await academicOverview(f.store, f.student)).sections[0]
      .registration;
    assert.equal(own, null);
  }
});

test("LizzChat lecturer tools use assigned classes and deny manager write tools", async () => {
  const f = await fixture();
  await registerSection(f.store, request(f.section), f.student);
  const ai = new AiService(f.store, { ready: false });
  const list = await ai.runTool(
    "lookup_section_students",
    { sectionCode: f.section.code },
    f.teacher,
    [],
    [],
    randomUUID(),
  );
  assert.equal(list.rows[0].code, "SV001");
  await assert.rejects(
    ai.runTool(
      "lookup_section_students",
      { sectionCode: f.section.code },
      f.otherTeacher,
      [],
      [],
      randomUUID(),
    ),
    /trong quyền/,
  );
  await assert.rejects(
    ai.runTool(
      "prepare_subject",
      { code: "BAD", name: "Sai", credits: 3 },
      f.teacher,
      [],
      [],
      randomUUID(),
    ),
    /quyền/,
  );
  const missing = await ai.runTool(
    "prepare_course_registration",
    {},
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.ok(missing.needsInformation);
});

test("LizzChat manager creates subject and section only after confirmation; withdrawal uses same service", async () => {
  const f = await fixture();
  const subject = await proposal(f, f.admin, "prepare_subject", {
    code: "WEB",
    name: "Lập trình web",
    credits: 3,
  });
  assert.equal((await f.store.list("subjects")).length, 1);
  await subject.ai.decide(
    subject.proposal.id,
    { version: 1, confirm: true },
    f.admin,
  );
  const draft = await proposal(f, f.admin, "prepare_course_section", {
    code: "WEB01",
    subjectCode: "WEB",
    lecturerEmail: f.teacher.email,
    term: f.input.term,
    capacity: 20,
    startDate: f.input.startDate,
    endDate: f.input.endDate,
    weekday: 3,
    startTime: "08:00",
    endTime: "10:00",
  });
  assert.equal((await f.store.list("sections")).length, 1);
  await draft.ai.decide(
    draft.proposal.id,
    { version: 1, confirm: true },
    f.admin,
  );
  assert.equal((await f.store.list("sections")).length, 2);
  await registerSection(f.store, request(f.section), f.student);
  const withdraw = await proposal(f, f.student, "prepare_course_withdrawal", {
    sectionCode: f.section.code,
  });
  await withdraw.ai.decide(
    withdraw.proposal.id,
    { version: 1, confirm: true },
    f.student,
  );
  assert.equal((await f.store.list("enrollments"))[0].status, "WITHDRAWN");
});

test("Academic HTTP enforces authentication, Origin, role and explicit request IDs", async (t) => {
  const f = await fixture();
  const token = "a".repeat(64),
    origin = "http://localhost:3000";
  await f.store.insert("sessions", {
    tokenHash: tokenHash(token),
    accountId: f.student.id,
    accountVersion: 1,
    expiresAt: Date.now() + 100000,
  });
  const server = createApp({
    store: f.store,
    config: { origin },
    mode: "demo",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base =
    "http://127.0.0.1:" + server.address().port + "/api/v1/academics";
  assert.equal((await fetch(base)).status, 401);
  const headers = {
    Cookie: "lizz_session=" + token,
    Origin: origin,
    "Content-Type": "application/json",
  };
  assert.equal((await fetch(base, { headers })).status, 200);
  assert.equal(
    (
      await fetch(base + "/subjects", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: "WEB", name: "Web", credits: 3 }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/registrations", {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: JSON.stringify(request(f.section)),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/registrations", {
        method: "POST",
        headers,
        body: JSON.stringify({ sectionId: f.section.id }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(base + "/registrations", {
        method: "POST",
        headers,
        body: JSON.stringify(request(f.section)),
      })
    ).status,
    201,
  );
});

test("MySQL academic writes use declared columns and bound parameters", async () => {
  const calls = [];
  const connection = {
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return [{ affectedRows: 1 }];
    },
    query: async (sql) => {
      calls.push({ sql });
      return [[]];
    },
  };
  const store = new MysqlStore(connection, true);
  await store.insert("sections", {
    id: "id",
    code: "CLASS",
    subjectId: "subject",
    lecturerId: "lecturer",
    term: "TERM",
    capacity: 1,
    startDate: "2099-01-01",
    endDate: "2099-02-01",
    weekday: 1,
    startTime: "08:00",
    endTime: "10:00",
    status: "OPEN",
    version: 1,
  });
  await store.update("enrollments", "id", { status: "WITHDRAWN" }, 1);
  await store.list("sections", true);
  assert.match(calls[0].sql, /INSERT INTO course_sections/);
  assert.equal(calls[0].sql.includes("CLASS"), false);
  assert.ok(calls[0].values.includes("CLASS"));
  assert.match(calls[2].sql, /FOR UPDATE$/);
});
