import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import {
  savePeriod,
  requireWindow,
  policyOverview,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import {
  registerSection,
  withdrawSection,
  checkWithdrawal,
} from "../../backend/local/modules/academic/academic.service.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
async function fixture() {
  const store = new MemoryStore(),
    manager = { id: randomUUID(), role: "MANAGER", active: true, version: 1 },
    student = { id: randomUUID(), role: "STUDENT", active: true, version: 1 },
    staff = { id: randomUUID(), role: "STAFF", active: true, version: 1 };
  for (const a of [manager, student, staff]) await store.insert("accounts", a);
  const fa = randomUUID(),
    fb = randomUUID(),
    ca = randomUUID(),
    cb = randomUUID(),
    ma = randomUUID(),
    group = randomUUID();
  for (const [id, name] of [
    [fa, "Khoa A"],
    [fb, "Khoa B"],
  ])
    await store.insert("faculties", { id, name, version: 1 });
  for (const [id, name] of [
    [ca, "Khóa A"],
    [cb, "Khóa B"],
  ])
    await store.insert("cohorts", { id, name, version: 1 });
  await store.insert("majors", { id: ma, facultyId: fa, version: 1 });
  await store.insert("classes", {
    id: group,
    majorId: ma,
    cohortId: ca,
    version: 1,
  });
  const profile = {
    id: randomUUID(),
    accountId: student.id,
    classId: group,
    code: "SV001",
    version: 1,
  };
  await store.insert("students", profile);
  const term = {
    id: randomUUID(),
    code: "2099.1",
    name: "Học kỳ",
    maxCredits: 24,
    passScore: 5,
    version: 1,
  };
  await store.insert("terms", term);
  const subject = {
    id: randomUUID(),
    code: "MON1",
    name: "Học phần",
    credits: 3,
    version: 1,
  };
  await store.insert("subjects", subject);
  const section = {
    id: randomUUID(),
    code: "LOP1",
    term: term.code,
    subjectId: subject.id,
    lecturerId: randomUUID(),
    capacity: 40,
    startDate: "2099-01-01",
    endDate: "2099-06-30",
    weekday: 1,
    startTime: "08:00",
    endTime: "10:00",
    status: "OPEN",
    facultyId: fb,
    version: 1,
  };
  await store.insert("sections", section);
  const now = Date.now();
  const body = (extra = {}) => ({
    termId: term.id,
    title: "Đợt A",
    opensAt: now - 10000,
    closesAt: now + 10000,
    withdrawUntil: now + 20000,
    status: "OPEN",
    ...extra,
  });
  const period = async (extra = {}) => savePeriod(store, body(extra), manager);
  return {
    store,
    manager,
    student,
    staff,
    fa,
    fb,
    ca,
    cb,
    ma,
    group,
    profile,
    term,
    section,
    now,
    body,
    period,
  };
}
test("Registration audiences: disjoint faculties/cohorts can overlap but intersecting/wildcard audiences cannot", async () => {
  const f = await fixture();
  await f.period({ facultyId: f.fa, cohortId: f.ca });
  await f.period({ facultyId: f.fb, cohortId: f.ca });
  await f.period({ facultyId: f.fa, cohortId: f.cb });
  for (const x of [
    {},
    { facultyId: f.fa },
    { cohortId: f.ca },
    { facultyId: f.fa, cohortId: f.ca },
  ])
    await assert.rejects(() => f.period(x), /giao nhau/);
  await f.period({ status: "CLOSED" });
  assert.equal((await f.store.list("periods")).length, 4);
});
test("Registration audiences: invalid references and stale updates fail without creating periods", async () => {
  const f = await fixture();
  await assert.rejects(
    () => f.period({ facultyId: randomUUID() }),
    /khoa hợp lệ/,
  );
  await assert.rejects(
    () => f.period({ cohortId: randomUUID() }),
    /khóa hợp lệ/,
  );
  const p = await f.period({ facultyId: f.fa });
  await assert.rejects(
    () => savePeriod(f.store, { ...f.body(), version: 0 }, f.manager, p.id),
    /thay đổi/,
  );
  const preserved = await savePeriod(
    f.store,
    { ...f.body({ status: "CLOSED" }), version: p.version },
    f.manager,
    p.id,
  );
  assert.equal(preserved.facultyId, f.fa);
});
test("Registration audiences: selection follows student home class, not course faculty or account affiliation", async () => {
  const f = await fixture();
  const p = await f.period({ facultyId: f.fa, cohortId: f.ca });
  assert.equal(
    (await requireWindow(f.store, f.term.code, "REGISTER", f.now, f.profile))
      .period.id,
    p.id,
  );
  const registered = await registerSection(
    f.store,
    { sectionId: f.section.id, requestId: randomUUID() },
    f.student,
  );
  assert.equal(registered.row.registrationPeriodId, p.id);
  assert.equal(registered.row.withdrawalDeadline, p.withdrawUntil);
  assert.equal(registered.row.registrationPeriodVersion, 1);
  const fresh = await fixture();
  await fresh.period({ facultyId: fresh.fb });
  await assert.rejects(
    () =>
      registerSection(
        fresh.store,
        { sectionId: fresh.section.id, requestId: randomUUID() },
        fresh.student,
      ),
    /khoa\/khóa/,
  );
  await fresh.store.update(
    "accounts",
    fresh.student.id,
    { affiliationFacultyId: fresh.fb },
    1,
  );
  await assert.rejects(
    () =>
      registerSection(
        fresh.store,
        { sectionId: fresh.section.id, requestId: randomUUID() },
        { ...fresh.student, version: 2 },
      ),
    /khoa\/khóa/,
  );
});
test("Registration audiences: incomplete home data fails closed for scoped periods, old all-school periods still work", async () => {
  const f = await fixture();
  await f.period({ facultyId: f.fa });
  const unknown = { ...f.profile, classId: randomUUID() };
  await assert.rejects(
    () => requireWindow(f.store, f.term.code, "REGISTER", f.now, unknown),
    /khoa\/khóa/,
  );
  const g = await fixture();
  const p = await g.period();
  assert.equal(
    (
      await requireWindow(g.store, g.term.code, "REGISTER", g.now, {
        ...g.profile,
        classId: randomUUID(),
      })
    ).period.id,
    p.id,
  );
});
test("Registration audiences: period boundaries remain inclusive-open/exclusive-close for each audience", async () => {
  const f = await fixture(),
    p = await f.period({ cohortId: f.ca });
  assert.equal(
    (
      await requireWindow(
        f.store,
        f.term.code,
        "REGISTER",
        p.opensAt,
        f.profile,
      )
    ).period.id,
    p.id,
  );
  await assert.rejects(() =>
    requireWindow(f.store, f.term.code, "REGISTER", p.closesAt, f.profile),
  );
  assert.equal(
    (
      await requireWindow(
        f.store,
        f.term.code,
        "WITHDRAW",
        p.withdrawUntil - 1,
        f.profile,
      )
    ).period.id,
    p.id,
  );
  await assert.rejects(() =>
    requireWindow(f.store, f.term.code, "WITHDRAW", p.withdrawUntil, f.profile),
  );
});
test("Registration audiences: withdrawal binds original period/deadline, not a later open period or extension", async () => {
  const f = await fixture(),
    p = await f.period(),
    reg = await registerSection(
      f.store,
      { sectionId: f.section.id, requestId: randomUUID() },
      f.student,
    );
  await savePeriod(
    f.store,
    { ...p, version: 1, withdrawUntil: f.now + 80000 },
    f.manager,
    p.id,
  );
  await f.period({
    title: "Đợt sau",
    opensAt: f.now + 10001,
    closesAt: f.now + 90000,
    withdrawUntil: f.now + 100000,
  });
  const real = Date.now;
  Date.now = () => f.now + 25000;
  try {
    await assert.rejects(
      () => checkWithdrawal(f.store, reg.row.id, f.student),
      /đợt áp dụng/,
    );
  } finally {
    Date.now = real;
  }
  assert.equal(
    (await checkWithdrawal(f.store, reg.row.id, f.student)).period
      .withdrawUntil,
    p.withdrawUntil,
  );
});
test("Registration audiences: class transfer preserves bound withdrawal; re-registration captures new period", async () => {
  const f = await fixture(),
    p = await f.period({ facultyId: f.fa }),
    reg = await registerSection(
      f.store,
      { sectionId: f.section.id, requestId: randomUUID() },
      f.student,
    );
  const group = randomUUID(),
    major = randomUUID();
  await f.store.insert("majors", { id: major, facultyId: f.fb, version: 1 });
  await f.store.insert("classes", {
    id: group,
    majorId: major,
    cohortId: f.cb,
    version: 1,
  });
  await f.store.update("students", f.profile.id, { classId: group }, 1);
  await withdrawSection(
    f.store,
    reg.row.id,
    { version: 1, requestId: randomUUID() },
    f.student,
  );
  await assert.rejects(
    () =>
      registerSection(
        f.store,
        { sectionId: f.section.id, requestId: randomUUID() },
        f.student,
      ),
    /khoa\/khóa/,
  );
  const newPeriod = await f.period({ facultyId: f.fb, cohortId: f.cb });
  const again = await registerSection(
    f.store,
    { sectionId: f.section.id, requestId: randomUUID() },
    f.student,
  );
  assert.equal(again.row.registrationPeriodId, newPeriod.id);
  assert.equal(again.row.id, reg.row.id);
  assert.notEqual(newPeriod.id, p.id);
});
test("Registration audiences: cannot retarget a used period; closing/shortening still revokes withdrawal window", async () => {
  const f = await fixture(),
    p = await f.period();
  const reg = await registerSection(
    f.store,
    { sectionId: f.section.id, requestId: randomUUID() },
    f.student,
  );
  await assert.rejects(
    () => savePeriod(f.store, { ...p, facultyId: f.fb }, f.manager, p.id),
    /đã có đăng ký/,
  );
  await savePeriod(f.store, { ...p, status: "CLOSED" }, f.manager, p.id);
  await assert.rejects(
    () => checkWithdrawal(f.store, reg.row.id, f.student),
    /đợt áp dụng/,
  );
});
test("Registration audiences: student and scoped staff policy/AI reads exclude unrelated audiences", async () => {
  const f = await fixture(),
    a = await f.period({ facultyId: f.fa, cohortId: f.ca }),
    b = await f.period({ facultyId: f.fb, cohortId: f.ca });
  const data = await policyOverview(f.store, f.student);
  assert.deepEqual(
    data.periods.map((p) => p.id),
    [a.id],
  );
  assert.match(data.periods[0].audienceLabel, /Khoa A/);
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "FACULTY",
    facultyId: f.fa,
    cohortId: f.ca,
    active: true,
    version: 1,
  });
  const scoped = staffStore(f.store, f.staff);
  assert.equal((await policyOverview(scoped, f.staff)).periods.length, 1);
  await assert.rejects(
    () =>
      savePeriod(
        scoped,
        {
          ...f.body(),
          facultyId: f.fa,
          opensAt: f.now + 100000,
          closesAt: f.now + 110000,
          withdrawUntil: f.now + 120000,
        },
        f.staff,
      ),
    (e) => e.status === 403,
  );
  const ai = new AiService(f.store, {}),
    sources = [];
  const result = await ai.runTool(
    "lookup_registration_rules",
    {},
    f.student,
    [],
    sources,
  );
  assert.equal(result.periods.length, 1);
  assert.equal(result.periods[0].id, a.id);
  assert.ok(result.source);
  assert.ok(!JSON.stringify(result).includes(b.id));
});
test("Registration audiences: audit rollback and SQL mapping preserve binding atomically", async () => {
  const f = await fixture(),
    prior = structuredClone(f.store.data),
    insert = f.store.insert;
  f.store.insert = async function (k, v) {
    if (k === "events") throw Error("audit failed");
    return insert.call(this, k, v);
  };
  await assert.rejects(() => f.period({ facultyId: f.fa }), /audit/);
  assert.deepEqual(f.store.data, prior);
  const calls = [],
    sql = new MysqlStore({
      execute: async (q, v) => {
        calls.push([q, v]);
        return [{ affectedRows: 1 }];
      },
    });
  await sql.insert("enrollments", {
    id: randomUUID(),
    registrationPeriodId: randomUUID(),
    registrationPeriodVersion: 1,
    withdrawalDeadline: f.now + 1000,
  });
  assert.match(calls[0][0], /registration_period_id/);
  assert.ok(calls[0][1].includes(f.now + 1000));
});
test("Registration audiences: legacy unbound registrations prevent retargeting an existing period", async () => {
  const f = await fixture(),
    p = await f.period();
  await f.store.insert("enrollments", {
    id: randomUUID(),
    studentId: f.profile.id,
    sectionId: f.section.id,
    status: "ACTIVE",
    version: 1,
  });
  await assert.rejects(
    () => savePeriod(f.store, { ...p, facultyId: f.fa }, f.manager, p.id),
    /chưa xác minh đợt/,
  );
});
test("Registration audiences: AI preparation cannot bypass audience checks or write before confirmation", async () => {
  const f = await fixture(),
    p = await f.period({ facultyId: f.fb }),
    ai = new AiService(f.store, {}),
    drafts = [];
  await assert.rejects(
    () =>
      ai.runTool(
        "prepare_course_registration",
        { sectionCode: f.section.code },
        f.student,
        drafts,
        [],
        randomUUID(),
      ),
    /khoa\/khóa/,
  );
  assert.equal(drafts.length, 0);
  await savePeriod(f.store, { ...p, facultyId: f.fa }, f.manager, p.id);
  const result = await ai.runTool(
    "prepare_course_registration",
    { sectionCode: f.section.code },
    f.student,
    drafts,
    [],
    randomUUID(),
  );
  assert.equal(result.needsConfirmation, true);
  assert.equal(drafts.length, 1);
  assert.equal((await f.store.list("enrollments")).length, 0);
});
test("Registration audiences: HTTP binds the signed-in student and rejects forged audience data", async (t) => {
  const { once } = await import("node:events"),
    { createApp } = await import("../../backend/local/app.js"),
    { tokenHash } = await import("../../backend/local/core/password.js");
  const f = await fixture(),
    p = await f.period({ facultyId: f.fb }),
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
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal(
    (
      await fetch(
        base + "/academics/sections/" + f.section.id + "/eligibility",
        { headers },
      )
    ).status,
    409,
  );
  const body = {
    sectionId: f.section.id,
    studentId: randomUUID(),
    facultyId: f.fb,
    cohortId: f.cb,
    requestId: randomUUID(),
  };
  assert.equal(
    (
      await fetch(base + "/academics/registrations", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await fetch(base + "/academics/periods", {
        method: "POST",
        headers,
        body: JSON.stringify(f.body()),
      })
    ).status,
    403,
  );
  await savePeriod(f.store, { ...p, facultyId: f.fa }, f.manager, p.id);
  assert.equal(
    (
      await fetch(
        base + "/academics/sections/" + f.section.id + "/eligibility",
        { headers },
      )
    ).status,
    200,
  );
});
