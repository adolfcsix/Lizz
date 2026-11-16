import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import {
  saveSubject,
  saveSection,
  registerSection,
  withdrawSection,
  checkRegistration,
} from "../../backend/local/modules/academic/academic.service.js";
import {
  saveTerm,
  savePeriod,
  saveRequirement,
  requireWindow,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import {
  saveGradeDrafts,
  gradeRoster,
  gradeOverview,
  transitionGrades,
} from "../../backend/local/modules/grades/grade.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { fingerprint } from "../../backend/local/modules/ai/ai.actions.js";
import { planAcademicAction } from "../../backend/local/modules/academic/academic.ai.js";
import {
  parseVietnamDateTime,
  vietnamDateTimeInput,
} from "../../shared/academic-format.js";
async function fixture() {
  const store = new MemoryStore(),
    account = (name, role) => ({
      id: randomUUID(),
      username: name,
      email: name + "@example.test",
      fullName: name,
      role,
      active: true,
      version: 1,
    });
  const manager = account("manager", "MANAGER"),
    staff = account("staff", "STAFF"),
    teacher = account("teacher", "LECTURER"),
    otherTeacher = account("teacher2", "LECTURER"),
    student = account("mai", "STUDENT"),
    other = account("minh", "STUDENT");
  for (const a of [manager, staff, teacher, otherTeacher, student, other])
    await store.insert("accounts", a);
  const profile = {
      id: randomUUID(),
      accountId: student.id,
      code: "SV001",
      fullName: "Mai Lan",
      classId: randomUUID(),
      version: 1,
    },
    otherProfile = {
      id: randomUUID(),
      accountId: other.id,
      code: "SV002",
      fullName: "Minh Anh",
      classId: profile?.classId,
      version: 1,
    };
  for (const p of [profile, otherProfile]) await store.insert("students", p);
  const priorTerm = await saveTerm(
      store,
      { code: "2025.1", name: "Kỳ trước", maxCredits: 20, passScore: 5 },
      manager,
    ),
    term = await saveTerm(
      store,
      { code: "2026.1", name: "Kỳ hiện tại", maxCredits: 20, passScore: 5 },
      manager,
    );
  const periodInput = {
      title: "Đợt chính",
      opensAt: Date.now() - 100000,
      closesAt: Date.now() + 1000000,
      withdrawUntil: Date.now() + 2000000,
      status: "OPEN",
    },
    period = await savePeriod(
      store,
      { ...periodInput, termId: term.id },
      manager,
    );
  await savePeriod(store, { ...periodInput, termId: priorTerm.id }, manager);
  const a = await saveSubject(
      store,
      { code: "A", name: "Nhập môn", credits: 3 },
      manager,
    ),
    b = await saveSubject(
      store,
      { code: "B", name: "Nâng cao", credits: 3 },
      manager,
    ),
    c = await saveSubject(
      store,
      { code: "C", name: "Thực hành", credits: 3 },
      manager,
    );
  const si = {
    code: "A01",
    term: "2025.1",
    subjectId: a.id,
    lecturerId: teacher.id,
    capacity: 30,
    startDate: "2025-09-01",
    endDate: "2025-12-31",
    weekday: 1,
    startTime: "08:00",
    endTime: "10:00",
    status: "OPEN",
  };
  const prior = await saveSection(store, si, manager),
    target = await saveSection(
      store,
      {
        ...si,
        code: "B01",
        term: "2026.1",
        subjectId: b.id,
        startDate: "2026-11-02",
        endDate: "2027-05-30",
      },
      manager,
    ),
    extra = await saveSection(
      store,
      {
        ...si,
        code: "C01",
        term: "2026.1",
        subjectId: c.id,
        startDate: "2026-11-02",
        endDate: "2027-05-30",
        weekday: 3,
      },
      manager,
    );
  // Dữ liệu lịch sử chỉ tạo trong fixture, không phải đường tắt API cho người dùng.
  const oldEnrollment = {
    id: randomUUID(),
    studentId: profile.id,
    sectionId: prior.id,
    status: "ACTIVE",
    version: 1,
  };
  await store.insert("enrollments", oldEnrollment);
  return {
    store,
    manager,
    staff,
    teacher,
    otherTeacher,
    student,
    other,
    profile,
    otherProfile,
    priorTerm,
    term,
    period,
    periodInput,
    a,
    b,
    c,
    prior,
    target,
    extra,
    oldEnrollment,
  };
}
const request = (s) => ({ sectionId: s.id, requestId: randomUUID() });
const review = async (f) =>
  (await gradeRoster(f.store, f.prior.id, f.teacher)).rows.map((r) => ({
    id: r.grade?.id,
    version: r.grade?.version,
  }));
const draft = (f, score = 8) =>
  saveGradeDrafts(
    f.store,
    f.prior.id,
    {
      rows: [
        {
          enrollmentId: f.oldEnrollment.id,
          enrollmentVersion: 1,
          score,
          version: 0,
        },
      ],
    },
    f.teacher,
  );
const move = async (f, action, actor = f.manager, overrides = {}) =>
  transitionGrades(
    f.store,
    f.prior.id,
    {
      requestId: randomUUID(),
      sectionVersion: 1,
      termVersion: 1,
      rows: await review(f),
      ...overrides,
    },
    actor,
    action,
  );
async function publish(f, score = 8) {
  await draft(f, score);
  await move(f, "SUBMIT", f.teacher);
  await move(f, "PUBLISH");
}
const requireA = (f) =>
  saveRequirement(
    f.store,
    { subjectId: f.b.id, requiredSubjectId: f.a.id, active: true },
    f.manager,
  );

test("Study rules: missing term, closed and future windows block without writing a request", async () => {
  const f = await fixture();
  await f.store.update("periods", f.period.id, { status: "CLOSED" }, 1);
  await assert.rejects(
    registerSection(f.store, request(f.target), f.student),
    /đợt đã đóng/,
  );
  await f.store.update(
    "periods",
    f.period.id,
    {
      status: "OPEN",
      opensAt: Date.now() + 100000,
      closesAt: Date.now() + 200000,
      withdrawUntil: Date.now() + 300000,
    },
    2,
  );
  await assert.rejects(
    registerSection(f.store, request(f.target), f.student),
    /Chưa đến/,
  );
  f.store.data.terms = f.store.data.terms.filter((t) => t.id !== f.term.id);
  await assert.rejects(
    registerSection(f.store, request(f.target), f.student),
    /chưa có quy định/,
  );
  assert.equal((await f.store.list("academicRequests")).length, 0);
});
test("Study rules: opening is inclusive, closing exclusive; withdrawal has its own deadline", async () => {
  const f = await fixture(),
    p = f.period;
  await requireWindow(f.store, "2026.1", "REGISTER", p.opensAt);
  await assert.rejects(
    requireWindow(f.store, "2026.1", "REGISTER", p.closesAt),
    /đợt đã đóng/,
  );
  await requireWindow(f.store, "2026.1", "WITHDRAW", p.closesAt);
  await assert.rejects(
    requireWindow(f.store, "2026.1", "WITHDRAW", p.withdrawUntil),
    /rút/,
  );
});
test("Policies: invalid values, overlapping enabled rounds, changed code, role and stale edits rejected", async () => {
  const f = await fixture();
  for (const input of [
    { maxCredits: 0 },
    { maxCredits: 61 },
    { passScore: NaN },
    { passScore: 0 },
    { passScore: 5.001 },
  ])
    await assert.rejects(
      saveTerm(f.store, { ...f.term, ...input }, f.manager, f.term.id),
    );
  await assert.rejects(
    savePeriod(f.store, { ...f.period, opensAt: f.period.closesAt }, f.manager),
  );
  await assert.rejects(
    savePeriod(f.store, { ...f.period, title: "Chồng thời gian" }, f.manager),
    /chồng/,
  );
  await savePeriod(
    f.store,
    {
      ...f.period,
      title: "Đợt tiếp",
      opensAt: f.period.closesAt,
      closesAt: f.period.withdrawUntil,
      withdrawUntil: f.period.withdrawUntil + 100000,
    },
    f.manager,
  );
  await assert.rejects(
    saveTerm(f.store, { ...f.term, code: "NEW" }, f.manager, f.term.id),
    /giữ nguyên/,
  );
  await saveTerm(f.store, { ...f.term, name: "Đã sửa" }, f.manager, f.term.id);
  await assert.rejects(
    saveTerm(f.store, { ...f.term, name: "Bản cũ" }, f.manager, f.term.id),
    /thay đổi/,
  );
  await assert.rejects(saveTerm(f.store, f.term, f.student, f.term.id));
});
test("Credits: competing requests cannot exceed cap; committed retry survives closed window", async () => {
  const f = await fixture();
  await saveTerm(f.store, { ...f.term, maxCredits: 3 }, f.manager, f.term.id);
  const inputs = [request(f.target), request(f.extra)],
    results = await Promise.allSettled(
      inputs.map((i) => registerSection(f.store, i, f.student)),
    );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(
    results.find((r) => r.status === "rejected").reason.message,
    /hạn mức tín chỉ/,
  );
  await f.store.update("periods", f.period.id, { status: "CLOSED" }, 1);
  assert.equal(
    (
      await registerSection(
        f.store,
        inputs[results.findIndex((r) => r.status === "fulfilled")],
        f.student,
      )
    ).replayed,
    true,
  );
});
test("Requirements: self, duplicate and indirect cycle rejected; disabling keeps history", async () => {
  const f = await fixture();
  await assert.rejects(
    saveRequirement(
      f.store,
      { subjectId: f.a.id, requiredSubjectId: f.a.id, active: true },
      f.manager,
    ),
  );
  const ab = await requireA(f);
  await saveRequirement(
    f.store,
    { subjectId: f.c.id, requiredSubjectId: f.b.id, active: true },
    f.manager,
  );
  await assert.rejects(
    saveRequirement(
      f.store,
      { subjectId: f.a.id, requiredSubjectId: f.c.id, active: true },
      f.manager,
    ),
    /vòng lặp/,
  );
  await assert.rejects(requireA(f), /tồn tại/);
  await saveRequirement(f.store, { ...ab, active: false }, f.manager, ab.id);
  assert.equal((await f.store.list("requirements")).length, 2);
});
test("Prerequisites: only published passing results unlock registration and AI preparation", async () => {
  const f = await fixture();
  await requireA(f);
  await assert.rejects(
    checkRegistration(f.store, f.target.id, f.student),
    /tiên quyết/,
  );
  await draft(f);
  await assert.rejects(
    checkRegistration(f.store, f.target.id, f.student),
    /tiên quyết/,
  );
  assert.equal((await gradeOverview(f.store, f.student)).rows.length, 0);
  await move(f, "SUBMIT", f.teacher);
  await assert.rejects(
    checkRegistration(f.store, f.target.id, f.student),
    /tiên quyết/,
  );
  await move(f, "PUBLISH");
  assert.deepEqual(
    (await checkRegistration(f.store, f.target.id, f.student)).studyRules
      .requirements,
    ["A"],
  );
  const plan = await planAcademicAction(
    f.store,
    "prepare_course_registration",
    { sectionCode: "B01" },
    f.student,
  );
  assert.equal(plan.preview[0]["Tổng tín chỉ sau đăng ký"], "3 / 20");
  await registerSection(f.store, request(f.target), f.student);
  assert.equal((await gradeOverview(f.store, f.student)).rows[0].passed, true);
});
test("Prerequisites: failed, other student and not-yet-finished course do not qualify", async () => {
  for (const scenario of ["failed", "other", "date"]) {
    const f = await fixture();
    await requireA(f);
    await publish(f, scenario === "failed" ? 4 : 8);
    if (scenario === "other")
      await f.store.update(
        "enrollments",
        f.oldEnrollment.id,
        { studentId: f.otherProfile.id },
        1,
      );
    if (scenario === "date")
      await f.store.update(
        "sections",
        f.prior.id,
        { endDate: f.target.startDate, weekday: 5 },
        1,
      );
    await assert.rejects(
      checkRegistration(f.store, f.target.id, f.student),
      /tiên quyết/,
    );
  }
});
test("Drafts: assigned lecturer only, score validation, stale version and atomic batches", async () => {
  const f = await fixture(),
    row = {
      enrollmentId: f.oldEnrollment.id,
      enrollmentVersion: 1,
      score: 8,
      version: 0,
    };
  for (const actor of [f.manager, f.staff, f.student, f.otherTeacher])
    await assert.rejects(
      saveGradeDrafts(f.store, f.prior.id, { rows: [row] }, actor),
    );
  for (const score of [NaN, -1, 10.01, 8.123, "8"])
    await assert.rejects(draft(f, score));
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.prior.id,
      { rows: [row, { ...row, enrollmentId: randomUUID() }] },
      f.teacher,
    ),
    /không còn/,
  );
  assert.equal((await f.store.list("grades")).length, 0);
  await draft(f, 0);
  assert.equal((await f.store.list("grades"))[0].score, 0);
  await assert.rejects(draft(f), /thay đổi/);
});
test("Grades: submit, return with reason, revise, publish and idempotent retry", async () => {
  const f = await fixture();
  await draft(f);
  await move(f, "SUBMIT", f.teacher);
  for (const actor of [f.teacher, f.staff])
    await assert.rejects(move(f, "PUBLISH", actor));
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.prior.id,
      {
        rows: [
          {
            enrollmentId: f.oldEnrollment.id,
            enrollmentVersion: 1,
            score: 9,
            version: 2,
          },
        ],
      },
      f.teacher,
    ),
    /Không sửa/,
  );
  await assert.rejects(move(f, "RETURN"), /lý do/);
  await move(f, "RETURN", f.manager, { reason: "Đối chiếu lại điểm" });
  await saveGradeDrafts(
    f.store,
    f.prior.id,
    {
      rows: [
        {
          enrollmentId: f.oldEnrollment.id,
          enrollmentVersion: 1,
          score: 7.25,
          version: 3,
        },
      ],
    },
    f.teacher,
  );
  await move(f, "SUBMIT", f.teacher);
  const input = {
    requestId: randomUUID(),
    sectionVersion: 1,
    termVersion: 1,
    rows: await review(f),
  };
  await transitionGrades(f.store, f.prior.id, input, f.manager, "PUBLISH");
  assert.equal(
    (await transitionGrades(f.store, f.prior.id, input, f.manager, "PUBLISH"))
      .replayed,
    true,
  );
  await assert.rejects(
    transitionGrades(
      f.store,
      f.prior.id,
      { ...input, reason: "khác" },
      f.manager,
      "PUBLISH",
    ),
    /nội dung khác/,
  );
  const g = (await f.store.list("grades"))[0];
  assert.equal(g.score, 7.25);
  assert.equal(g.passScore, 5);
  assert.equal(g.publishedBy, f.manager.id);
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.prior.id,
      {
        rows: [
          {
            enrollmentId: f.oldEnrollment.id,
            enrollmentVersion: 1,
            score: 9,
            version: g.version,
          },
        ],
      },
      f.teacher,
    ),
    /Không sửa/,
  );
});
test("Grades: stale review and changed roster block publication; drafts and private rosters stay private", async () => {
  const f = await fixture();
  await draft(f);
  const stale = await review(f);
  await move(f, "SUBMIT", f.teacher);
  await assert.rejects(
    move(f, "PUBLISH", f.manager, { rows: stale }),
    /thay đổi/,
  );
  const current = await review(f);
  await f.store.insert("enrollments", {
    id: randomUUID(),
    studentId: f.otherProfile.id,
    sectionId: f.prior.id,
    status: "ACTIVE",
    version: 1,
  });
  await assert.rejects(
    move(f, "PUBLISH", f.manager, { rows: current }),
    /thiếu điểm/,
  );
  assert.equal((await gradeOverview(f.store, f.student)).rows.length, 0);
  assert.equal((await gradeOverview(f.store, f.other)).rows.length, 0);
  await assert.rejects(gradeRoster(f.store, f.prior.id, f.student));
  await assert.rejects(gradeRoster(f.store, f.prior.id, f.otherTeacher));
});
test("Grades: audit failure rolls back publication; no retroactive threshold or new enrollment after submission", async () => {
  const f = await fixture();
  await draft(f);
  await move(f, "SUBMIT", f.teacher);
  const original = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events" && row.action === "GRADES_PUBLISHED")
      throw Error("Audit failed");
    return original.call(this, kind, row);
  };
  await assert.rejects(move(f, "PUBLISH"), /Audit failed/);
  assert.equal((await f.store.list("grades"))[0].status, "SUBMITTED");
  f.store.insert = original;
  await move(f, "PUBLISH");
  await assert.rejects(
    saveTerm(
      f.store,
      { ...f.priorTerm, passScore: 4 },
      f.manager,
      f.priorTerm.id,
    ),
    /hồi tố/,
  );
  await assert.rejects(
    registerSection(f.store, request(f.prior), f.other),
    /công bố điểm/,
  );
  await assert.rejects(
    withdrawSection(
      f.store,
      f.oldEnrollment.id,
      { requestId: randomUUID(), version: 1 },
      f.student,
    ),
    /công bố/,
  );
});
test("AI: result scoping, policy source and fingerprint change; closed window blocks preparation", async () => {
  const f = await fixture();
  await publish(f);
  const ai = new AiService(f.store, { ready: false });
  assert.equal(
    (
      await ai.runTool(
        "lookup_learning_results",
        {},
        f.student,
        [],
        [],
        randomUUID(),
      )
    ).total,
    1,
  );
  assert.equal(
    (
      await ai.runTool(
        "lookup_learning_results",
        { query: "SV001" },
        f.other,
        [],
        [],
        randomUUID(),
      )
    ).total,
    0,
  );
  const rules = await ai.runTool(
    "lookup_registration_rules",
    { term: "2026.1" },
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.equal(rules.terms.length, 1);
  assert.equal(rules.periods.length, 1);
  const before = await fingerprint(f.store);
  await f.store.update("periods", f.period.id, { status: "CLOSED" }, 1);
  assert.notEqual(await fingerprint(f.store), before);
  await assert.rejects(
    planAcademicAction(
      f.store,
      "prepare_course_registration",
      { sectionCode: "B01" },
      f.student,
    ),
    /đợt đã đóng/,
  );
});
test("Vietnam time: fixed-zone roundtrip and impossible dates rejected", () => {
  const at = parseVietnamDateTime("2026-11-15T08:30");
  assert.equal(new Date(at).toISOString(), "2026-11-15T01:30:00.000Z");
  assert.equal(vietnamDateTimeInput(at), "2026-11-15T08:30");
  for (const value of [
    "2026-02-30T08:00",
    "2026-11-15",
    "2026-11-15T25:00",
    "bad",
  ])
    assert.throws(() => parseVietnamDateTime(value));
});
test("MySQL mapping: new policy and grade fields bound; input never interpolated", async () => {
  const calls = [],
    connection = {
      execute: async (sql, params) => {
        calls.push({ sql, params });
        return [{ affectedRows: 1 }];
      },
    };
  const store = new MysqlStore(connection, true);
  await store.insert("terms", {
    id: "id",
    code: "TERM",
    name: "'; DROP TABLE accounts; --",
    maxCredits: 24,
    passScore: 5,
    version: 1,
  });
  await store.insert("periods", {
    id: "id",
    termId: "term",
    title: "Đợt",
    opensAt: 1,
    closesAt: 2,
    withdrawUntil: 3,
    status: "OPEN",
    version: 1,
  });
  await store.update(
    "grades",
    "id",
    {
      status: "PUBLISHED",
      publishedBy: "manager",
      publishedAt: 100,
      passScore: 5,
    },
    2,
  );
  assert.ok(calls[0].sql.includes("academic_terms"));
  assert.ok(!calls[0].sql.includes("DROP TABLE"));
  assert.ok(calls[0].params.includes("'; DROP TABLE accounts; --"));
  assert.ok(calls[2].sql.includes("published_at=?"));
});
test("HTTP: authentication, Origin, private roster, policy role and publication boundaries", async (t) => {
  const f = await fixture(),
    origin = "http://localhost:3000";
  for (const [actor, key] of [
    [f.manager, "a"],
    [f.teacher, "b"],
    [f.student, "c"],
    [f.staff, "d"],
  ])
    await f.store.insert("sessions", {
      tokenHash: tokenHash(key.repeat(64)),
      accountId: actor.id,
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
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1",
    headers = (k) => ({
      Cookie: "lizz_session=" + k.repeat(64),
      Origin: origin,
      "Content-Type": "application/json",
    });
  assert.equal((await fetch(base + "/grades")).status, 401);
  assert.equal(
    (
      await fetch(base + "/grades/sections/" + f.prior.id, {
        headers: headers("c"),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/academics/terms", {
        method: "POST",
        headers: headers("c"),
        body: JSON.stringify({ ...f.term, code: "NEW" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/grades/sections/" + f.prior.id, {
        method: "PUT",
        headers: { ...headers("b"), Origin: "https://bad.test" },
        body: JSON.stringify({ rows: [] }),
      })
    ).status,
    403,
  );
  await draft(f);
  await move(f, "SUBMIT", f.teacher);
  const input = {
    requestId: randomUUID(),
    sectionVersion: 1,
    termVersion: 1,
    rows: await review(f),
  };
  assert.equal(
    (
      await fetch(base + "/grades/sections/" + f.prior.id + "/publish", {
        method: "POST",
        headers: headers("d"),
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(
    (await (await fetch(base + "/grades", { headers: headers("c") })).json())
      .rows.length,
    0,
  );
  assert.equal(
    (
      await fetch(base + "/grades/sections/" + f.prior.id + "/publish", {
        method: "POST",
        headers: headers("a"),
        body: JSON.stringify(input),
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await fetch(base + "/grades", { headers: headers("c") })).json())
      .rows[0].score,
    8,
  );
});
test("Grades: withdrawal and re-registration invalidates old draft until lecturer reviews current enrollment", async () => {
  const f = await fixture();
  await draft(f);
  await withdrawSection(
    f.store,
    f.oldEnrollment.id,
    { requestId: randomUUID(), version: 1 },
    f.student,
  );
  await registerSection(f.store, request(f.prior), f.student);
  await assert.rejects(move(f, "SUBMIT", f.teacher), /thay đổi/);
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.prior.id,
      {
        rows: [
          {
            enrollmentId: f.oldEnrollment.id,
            enrollmentVersion: 1,
            score: 8,
            version: 1,
          },
        ],
      },
      f.teacher,
    ),
    /Đăng ký đã thay đổi/,
  );
  assert.equal(
    (await gradeRoster(f.store, f.prior.id, f.teacher)).rows[0]
      .enrollmentVersion,
    3,
  );
  await saveGradeDrafts(
    f.store,
    f.prior.id,
    {
      rows: [
        {
          enrollmentId: f.oldEnrollment.id,
          enrollmentVersion: 3,
          score: 8,
          version: 1,
        },
      ],
    },
    f.teacher,
  );
  await move(f, "SUBMIT", f.teacher);
});
test("Grades: publication binds the exact reviewed class and term policy versions", async () => {
  for (const kind of ["term", "section"]) {
    const f = await fixture();
    await draft(f);
    await move(f, "SUBMIT", f.teacher);
    const input = {
      requestId: randomUUID(),
      sectionVersion: 1,
      termVersion: 1,
      rows: await review(f),
    };
    if (kind === "term")
      await saveTerm(
        f.store,
        { ...f.priorTerm, passScore: 6 },
        f.manager,
        f.priorTerm.id,
      );
    else await f.store.update("sections", f.prior.id, { code: "A-NEW" }, 1);
    await assert.rejects(
      transitionGrades(f.store, f.prior.id, input, f.manager, "PUBLISH"),
      /thay đổi/,
    );
    assert.equal((await f.store.list("grades"))[0].status, "SUBMITTED");
    await transitionGrades(
      f.store,
      f.prior.id,
      {
        ...input,
        requestId: randomUUID(),
        termVersion: kind === "term" ? 2 : 1,
        sectionVersion: kind === "section" ? 2 : 1,
      },
      f.manager,
      "PUBLISH",
    );
    assert.equal(
      (await f.store.list("grades"))[0].passScore,
      kind === "term" ? 6 : 5,
    );
  }
});
