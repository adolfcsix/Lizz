import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  reviewStudyAttempt,
  studyHistory,
  saveStudyPolicy,
  studyPolicyOverview,
} from "../../backend/local/modules/academic/study-attempts.service.js";
import {
  registerSection,
  checkRegistration,
  sectionRoster,
  saveSubject,
} from "../../backend/local/modules/academic/academic.service.js";
import { planAcademicAction } from "../../backend/local/modules/academic/academic.ai.js";
import {
  executeAction,
  fingerprint,
} from "../../backend/local/modules/ai/ai.actions.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (v) => (e) => e.status === v;
async function fixture() {
  const f = await serviceFixture();
  f.policyInput = (extra = {}) => ({
    termId: f.term.id,
    allowRetake: true,
    allowImprovement: true,
    maxAttempts: 3,
    maxImprovementScore: 8,
    reason: "Theo quy chế đào tạo học kỳ",
    confirm: true,
    ...extra,
  });
  f.policy = (extra = {}, actor = f.manager) =>
    saveStudyPolicy(f.store, f.policyInput(extra), actor);
  f.review = () => reviewStudyAttempt(f.store, f.profiles[0], f.section);
  f.body = async () => {
    const review = (await checkRegistration(f.store, f.section.id, f.student))
      .studyRules.studyAttempt;
    return {
      sectionId: f.section.id,
      requestId: randomUUID(),
      confirm: true,
      studyMode: review.mode,
      studyReviewHash: review.reviewHash,
    };
  };
  f.register = (input) => registerSection(f.store, input, f.student);
  f.old = async ({
    score = 4,
    passScore = 5,
    status = "PUBLISHED",
    enrollmentVersion = 1,
    enrollmentStatus = "ACTIVE",
    section = {},
  } = {}) => {
    const previous = {
      ...f.section,
      id: randomUUID(),
      code: "OLD" + (await f.store.list("sections")).length,
      term: "2019.1",
      startDate: "2019-01-07",
      endDate: "2019-06-01",
      ...section,
    };
    await f.store.insert("sections", previous);
    const e = {
      id: randomUUID(),
      studentId: f.profiles[0].id,
      sectionId: previous.id,
      status: enrollmentStatus,
      version: 1,
    };
    await f.store.insert("enrollments", e);
    const grade = {
      id: randomUUID(),
      enrollmentId: e.id,
      enrollmentVersion,
      score,
      passScore,
      status,
      version: 1,
    };
    await f.store.insert("grades", grade);
    return { section: previous, enrollment: e, grade };
  };
  return f;
}
test("Study attempts: absent policy preserves legacy registration and explicitly records unverified mode", async () => {
  const f = await fixture();
  await f.old({ score: 8 });
  const review = await f.review();
  assert.equal(review.policyConfigured, false);
  assert.equal(review.mode, "UNVERIFIED");
  const result = await f.register({
    sectionId: f.section.id,
    requestId: randomUUID(),
  });
  assert.equal(result.row.studyMode, "UNVERIFIED");
  assert.equal(result.row.studySnapshot.policyConfigured, false);
});
test("Study attempts: configured first enrollment requires matching review and confirmation", async () => {
  const f = await fixture();
  await f.policy();
  await assert.rejects(
    f.register({ sectionId: f.section.id, requestId: randomUUID() }),
    status(409),
  );
  const body = await f.body();
  assert.equal(body.studyMode, "FIRST");
  const result = await f.register(body);
  assert.equal(result.row.studySnapshot.attemptNumber, 1);
  assert.equal((await f.register(body)).replayed, true);
  await assert.rejects(
    f.register({ ...body, studyMode: "RETAKE" }),
    status(409),
  );
});
test("Study attempts: failed prior publication becomes retake and old grade/profile remain intact", async () => {
  const f = await fixture();
  await f.policy();
  await f.old();
  const grades = await f.store.list("grades"),
    students = await f.store.list("students");
  const result = await f.register(await f.body());
  assert.equal(result.row.studyMode, "RETAKE");
  assert.equal(result.row.studySnapshot.attemptNumber, 2);
  assert.deepEqual(await f.store.list("grades"), grades);
  assert.deepEqual(await f.store.list("students"), students);
  const history = await studyHistory(f.store, f.student);
  assert.equal(history.rows.length, 2);
  assert.equal(
    history.rows.find((r) => r.resultStatus === "PUBLISHED").score,
    4,
  );
  assert.equal(
    history.rows.find((r) => r.sectionCode === f.section.code).score,
    null,
  );
});
test("Study attempts: improvement uses best previously passed result and inclusive configured score ceiling", async () => {
  const f = await fixture();
  await f.policy();
  await f.old({ score: 8 });
  await f.old({ score: 3 });
  const review = await f.review();
  assert.equal(review.mode, "IMPROVEMENT");
  assert.equal(review.allowed, true);
  assert.equal((await f.register(await f.body())).row.studyMode, "IMPROVEMENT");
  const g = await fixture();
  await g.policy();
  await g.old({ score: 8.01 });
  await g.old({ score: 3 });
  assert.equal((await g.review()).allowed, false);
  await assert.rejects(
    g.register({ ...(await g.body()), studyMode: "RETAKE" }),
    status(409),
  );
});
test("Study attempts: closed modes and total attempt limit cannot be bypassed", async () => {
  for (const scenario of [
    { score: 4, allowRetake: false },
    { score: 6, allowImprovement: false },
    { score: 4, maxAttempts: 1 },
  ]) {
    const f = await fixture();
    await f.policy(scenario);
    await f.old({ score: scenario.score });
    const review = await f.review();
    assert.equal(review.allowed, false);
    await assert.rejects(f.register(await f.body()), status(409));
    assert.equal((await f.store.list("enrollments")).length, 1);
  }
});
test("Study attempts: unpublished, stale generation, absent threshold, corrupt scores and unfinished source block configured repeat", async () => {
  for (const scenario of [
    { status: "DRAFT" },
    { status: "SUBMITTED" },
    { enrollmentVersion: 0 },
    { passScore: null },
    { score: 12 },
    { section: { endDate: "2030-06-01" } },
    { section: { endDate: "2019-02-30" } },
  ]) {
    const f = await fixture();
    await f.policy();
    await f.old(scenario);
    const review = await f.review();
    assert.equal(review.mode, "UNVERIFIED");
    assert.equal(review.allowed, false);
    await assert.rejects(
      () =>
        f.register({
          sectionId: f.section.id,
          requestId: randomUUID(),
          confirm: true,
          studyMode: review.mode,
          studyReviewHash: review.reviewHash,
        }),
      status(409),
    );
  }
});
test("Study attempts: withdrawn entries do not count, missing source class needs review, old threshold is retained", async () => {
  const f = await fixture();
  await f.policy();
  await f.old({ enrollmentStatus: "WITHDRAWN" });
  assert.equal((await f.review()).mode, "FIRST");
  const g = await fixture();
  await g.policy();
  await g.old({ score: 4.5, passScore: 4 });
  assert.equal((await g.review()).mode, "IMPROVEMENT");
  await g.store.insert("enrollments", {
    id: randomUUID(),
    studentId: g.profiles[0].id,
    sectionId: randomUUID(),
    status: "ACTIVE",
    version: 1,
  });
  assert.equal((await g.review()).allowed, false);
});
test("Study attempts: changed policy, grade or source class invalidates the reviewed registration", async () => {
  for (const kind of ["policy", "grade", "section"]) {
    const f = await fixture(),
      p = await f.policy(),
      prior = await f.old(),
      body = await f.body();
    if (kind === "policy")
      await saveStudyPolicy(
        f.store,
        { ...f.policyInput(), version: p.version, maxAttempts: 4 },
        f.manager,
        p.id,
      );
    if (kind === "grade")
      await f.store.update("grades", prior.grade.id, { score: 6 }, 1);
    if (kind === "section")
      await f.store.update(
        "sections",
        prior.section.id,
        { endDate: "2019-07-01" },
        1,
      );
    await assert.rejects(f.register(body), status(409));
    assert.equal((await f.store.list("enrollments")).length, 1);
  }
});
test("Study attempts: concurrent registration has one winner and retry does not alter saved policy snapshot", async () => {
  const f = await fixture(),
    p = await f.policy();
  await f.old();
  const a = await f.body(),
    b = await f.body();
  const results = await Promise.allSettled([f.register(a), f.register(b)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  await saveStudyPolicy(
    f.store,
    { ...f.policyInput(), version: p.version, allowRetake: false },
    f.manager,
    p.id,
  );
  const replay = await f.register(a);
  assert.equal(replay.replayed, true);
  assert.equal(replay.row.studySnapshot.policyVersion, 1);
});
test("Study attempts: policy validates input, enforces unique term/version and restricts staff scope", async () => {
  const f = await fixture();
  for (const extra of [
    { confirm: false },
    { maxAttempts: 0 },
    { maxAttempts: 21 },
    { maxImprovementScore: 10.1 },
    { allowRetake: "true" },
    { reason: " " },
  ])
    await assert.rejects(f.policy(extra), status(400));
  for (const actor of [f.student, f.teacher, f.staff])
    await assert.rejects(f.policy({}, actor), status(403));
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  });
  const p = await f.policy({}, f.staff);
  await assert.rejects(f.policy(), status(409));
  await assert.rejects(
    saveStudyPolicy(
      f.store,
      { ...f.policyInput(), version: 0 },
      f.manager,
      p.id,
    ),
    status(409),
  );
  assert.equal(
    (await studyPolicyOverview(f.store, f.student)).canManage,
    false,
  );
});
test("Study attempts: history enforces ownership/scope, suppresses unpublished and stale scores; lecturer sees purpose only", async () => {
  const f = await fixture();
  await f.policy();
  const prior = await f.old({ status: "DRAFT", score: 9.99 });
  assert.equal((await studyHistory(f.store, f.student)).rows[0].score, null);
  await assert.rejects(
    studyHistory(f.store, f.student2, f.profiles[0].id),
    status(404),
  );
  await assert.rejects(
    studyHistory(f.store, f.teacher, f.profiles[0].id),
    status(403),
  );
  await assert.rejects(
    studyHistory(f.store, f.staff, f.profiles[0].id),
    status(404),
  );
  await f.store.update(
    "grades",
    prior.grade.id,
    { status: "PUBLISHED", score: 4 },
    1,
  );
  await f.register(await f.body());
  const roster = await sectionRoster(f.store, f.section.id, f.teacher);
  assert.equal(roster.rows[0].studyMode, "RETAKE");
  assert.ok(!JSON.stringify(roster.rows).includes("score"));
});
test("Study attempts: audit errors roll back policy and enrollment metadata together", async () => {
  const f = await fixture(),
    insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(f.policy(), /audit unavailable/);
  assert.equal((await f.store.list("studyPolicies")).length, 0);
  f.store.insert = insert;
  await f.policy();
  await f.old();
  const body = await f.body();
  f.store.insert = async function (kind, row) {
    if (kind === "events" && row.action === "COURSE_REGISTERED")
      throw Error("audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(f.register(body), /audit unavailable/);
  assert.equal((await f.store.list("enrollments")).length, 1);
  assert.equal((await f.store.list("academicRequests")).length, 0);
});
test("Study attempts: prerequisite cannot use grade from an earlier enrollment generation", async () => {
  const f = await fixture(),
    prior = await f.old({ score: 8 }),
    subject = await saveSubject(
      f.store,
      { code: "NANGCAO", name: "Học phần nâng cao", credits: 3 },
      f.manager,
    );
  await f.store.update(
    "sections",
    f.section.id,
    { subjectId: subject.id },
    f.section.version,
  );
  await f.store.insert("requirements", {
    id: randomUUID(),
    subjectId: subject.id,
    requiredSubjectId: prior.section.subjectId,
    active: true,
    version: 1,
  });
  await f.store.update(
    "enrollments",
    prior.enrollment.id,
    { status: "ACTIVE" },
    1,
  );
  await assert.rejects(
    checkRegistration(f.store, f.section.id, f.student),
    /tiên quyết/,
  );
});
test("Study attempts SQL: policy fields bound, booleans decoded, registration snapshot saved as JSON", async () => {
  const calls = [],
    sql = new MysqlStore({
      execute: async (query, args) => {
        calls.push({ query, args });
        return [{ affectedRows: 1 }];
      },
      query: async () => [
        [
          {
            id: "p",
            allow_retake: 0,
            allow_improvement: 1,
            study_snapshot_json: '{"mode":"RETAKE"}',
          },
        ],
      ],
    });
  await sql.insert("studyPolicies", {
    id: "p",
    termId: "term",
    allowRetake: true,
    allowImprovement: false,
    maxAttempts: 3,
    maxImprovementScore: 8,
  });
  assert.match(calls[0].query, /study_attempt_policies/);
  assert.ok(calls[0].args.includes(3));
  await sql.update(
    "enrollments",
    "e",
    { studyMode: "RETAKE", studySnapshot: { mode: "RETAKE" } },
    1,
  );
  assert.ok(calls[1].args.includes('{"mode":"RETAKE"}'));
  const row = (await sql.list("studyPolicies"))[0];
  assert.equal(row.allowRetake, false);
  assert.equal(row.allowImprovement, true);
  assert.equal(row.studySnapshot.mode, "RETAKE");
});
test("Study attempts AI: preview is read-only, binds policy/history and executes only after confirmation path", async () => {
  const f = await fixture(),
    p = await f.policy();
  await f.old({ score: 6 });
  const plan = await planAcademicAction(
    f.store,
    "prepare_course_registration",
    { sectionCode: f.section.code },
    f.student,
  );
  assert.equal(plan.payload.studyMode, "IMPROVEMENT");
  assert.equal((await f.store.list("enrollments")).length, 1);
  const before = await fingerprint(f.store);
  await saveStudyPolicy(
    f.store,
    { ...f.policyInput(), version: p.version, maxAttempts: 4 },
    f.manager,
    p.id,
  );
  assert.notEqual(await fingerprint(f.store), before);
  await assert.rejects(
    executeAction(f.store, { ...plan, id: randomUUID() }, f.student),
    status(409),
  );
  const fresh = await planAcademicAction(
    f.store,
    "prepare_course_registration",
    { sectionCode: f.section.code },
    f.student,
  );
  assert.equal(
    (await executeAction(f.store, { ...fresh, id: randomUUID() }, f.student))
      .row.studyMode,
    "IMPROVEMENT",
  );
});
test("Study attempts AI history: own published data only, asks for exact student, rejects lecturer", async () => {
  const f = await fixture();
  await f.old({ status: "SUBMITTED", score: 9.99 });
  const ai = new AiService(f.store, {}),
    sources = [];
  const run = (actor, args = {}) =>
    ai.runTool("lookup_study_history", args, actor, [], sources, randomUUID());
  assert.equal((await run(f.student)).rows[0].score, null);
  assert.ok(
    (await run(f.student2, { studentCode: f.profiles[0].code }))
      .needsInformation,
  );
  assert.ok((await run(f.manager)).needsInformation);
  await assert.rejects(run(f.teacher), status(403));
  assert.ok(sources.length > 0);
});
test("Study attempts HTTP: scoped history, policy role, eligibility and confirmed enrollment end to end", async () => {
  const f = await fixture();
  await f.old();
  const server = createApp({
    store: f.store,
    config: { origin: "http://localhost", ai: {} },
    aiProvider: {},
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/v1/academics`,
    cookies = {};
  try {
    for (const key of ["manager", "student", "student2", "teacher"]) {
      const token = randomBytes(32).toString("hex");
      cookies[key] = `lizz_session=${token}`;
      await f.store.insert("sessions", {
        tokenHash: tokenHash(token),
        accountId: f[key].id,
        accountVersion: 1,
        expiresAt: Date.now() + 60000,
      });
    }
    const send = (key, path, body, origin = "http://localhost") =>
      fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: cookies[key] || "",
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await send("none", "/study-policies")).status, 401);
    assert.equal(
      (await send("teacher", "/study-policies", f.policyInput())).status,
      403,
    );
    assert.equal(
      (await send("manager", "/study-policies", f.policyInput())).status,
      201,
    );
    assert.equal(
      (await send("student2", `/students/${f.profiles[0].id}/study-history`))
        .status,
      404,
    );
    assert.equal((await send("teacher", "/my-study-history")).status, 403);
    assert.equal((await send("student", "/my-study-history")).status, 200);
    const eligibility = await (
      await send("student", `/sections/${f.section.id}/eligibility`)
    ).json();
    assert.equal(eligibility.studyAttempt.mode, "RETAKE");
    const body = {
      sectionId: f.section.id,
      requestId: randomUUID(),
      confirm: true,
      studyMode: eligibility.studyAttempt.mode,
      studyReviewHash: eligibility.studyAttempt.reviewHash,
    };
    assert.equal(
      (
        await send("student", "/registrations", {
          sectionId: f.section.id,
          requestId: randomUUID(),
        })
      ).status,
      409,
    );
    assert.equal(
      (await send("student", "/registrations", body, "https://other.invalid"))
        .status,
      403,
    );
    const created = await send("student", "/registrations", body);
    assert.equal(created.status, 201);
    assert.equal((await created.json()).row.studyMode, "RETAKE");
    assert.equal(
      (await (await send("student", "/registrations", body)).json()).replayed,
      true,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
