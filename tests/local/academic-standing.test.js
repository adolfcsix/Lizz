import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { standingFixture } from "./standing-fixture.js";
import {
  evaluateStanding,
  standingSettings,
  saveStandingPolicy,
} from "../../backend/local/modules/grades/standing.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (n) => (e) => e.status === n;
function pure() {
  const student = { id: "s", code: "SV", fullName: "Sinh viên", classId: "c" },
    term = { id: "t", code: "2020.1" },
    policy = {
      id: "p",
      version: 1,
      payload: {
        gpa4Below: 2.5,
        failedCreditsAtLeast: 3,
        bands: [
          { minGpa4: 0, label: "Thấp" },
          { minGpa4: 2.5, label: "Đạt" },
        ],
      },
    },
    sections = [],
    enrollments = [],
    grades = [];
  function add({
    points = 3,
    score = 8,
    credits = 3,
    subjectId = randomUUID(),
    endDate = "2020-06-01",
    repeatRule = "HIGHEST",
    passScore = 5,
    termCode = term.code,
    ...extra
  } = {}) {
    const section = {
        id: randomUUID(),
        code: "L" + sections.length,
        subjectId,
        term: termCode,
        endDate,
      },
      e = {
        id: randomUUID(),
        studentId: student.id,
        sectionId: section.id,
        status: "ACTIVE",
        version: 1,
      },
      g = {
        id: randomUUID(),
        enrollmentId: e.id,
        enrollmentVersion: 1,
        status: "PUBLISHED",
        score,
        passScore,
        publishedAt: Date.now(),
        version: 1,
        resultSnapshot: {
          subjectId,
          subjectCode: "M" + sections.length,
          term: termCode,
          endDate,
          credits,
          points,
          gpaPolicy: { repeatRule },
        },
        ...extra,
      };
    sections.push(section);
    enrollments.push(e);
    grades.push(g);
    return { section, e, g };
  }
  return {
    student,
    term,
    policy,
    sections,
    enrollments,
    grades,
    today: "2026-11-16",
    add,
    run(extra = {}) {
      return evaluateStanding({ ...this, ...extra });
    },
  };
}
test("Standing: no policy is explicit; real publication pipeline supplies verified semester GPA and own report", async () => {
  const f = await standingFixture();
  const missing = await f.overview(f.student);
  assert.equal(missing.rows[0].status, "POLICY_MISSING");
  assert.equal(missing.rows[0].gpa4, null);
  await f.policy();
  const before = structuredClone(f.store.data),
    result = await f.overview(f.student);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].status, "MEETS_RULES");
  assert.equal(result.rows[0].classification, "Tốt");
  assert.equal(result.rows[0].gpa4, 3);
  assert.equal(result.rows[0].basis[0].score, 8);
  assert.deepEqual(f.store.data, before);
});
test("Standing: exact GPA and failed-credit boundaries use configured OR conditions", () => {
  const f = pure();
  f.add({ points: 2.5 });
  assert.equal(f.run().status, "MEETS_RULES");
  assert.equal(f.run().classification, "Đạt");
  const g = pure();
  g.add({ points: 2.49 });
  assert.equal(g.run().status, "NEEDS_REVIEW");
  const h = pure();
  h.add({ points: 3, score: 4, credits: 3 });
  assert.equal(h.run().failedCredits, 3);
  assert.ok(h.run().reasons[0].includes("Tín chỉ"));
});
test("Standing: classification and warning compare unrounded weighted GPA rather than rounded display", () => {
  const f = pure();
  f.add({ points: 2.49, credits: 1 });
  f.add({ points: 2.5, credits: 1 });
  const r = f.run();
  assert.equal(r.gpa4, 2.5);
  assert.equal(r.rawGpa4, 2.495);
  assert.equal(r.status, "NEEDS_REVIEW");
  assert.equal(r.classification, "Thấp");
});
test("Standing: missing/unpublished/stale generation/invalid score/snapshot/future end never becomes verified or zero GPA", () => {
  for (const kind of [
    "draft",
    "submitted",
    "stale",
    "score",
    "threshold",
    "snapshot",
    "points",
    "rule",
    "future",
    "badDate",
    "credits",
  ]) {
    const f = pure(),
      { g, e, section } = f.add();
    if (kind === "draft") g.status = "DRAFT";
    if (kind === "submitted") g.status = "SUBMITTED";
    if (kind === "stale") e.version = 2;
    if (kind === "score") g.score = 20;
    if (kind === "threshold") g.passScore = null;
    if (kind === "snapshot") g.resultSnapshot = null;
    if (kind === "points") g.resultSnapshot.points = null;
    if (kind === "rule") g.resultSnapshot.gpaPolicy.repeatRule = "UNKNOWN";
    if (kind === "future") section.endDate = "2030-01-01";
    if (kind === "badDate") section.endDate = "2020-02-30";
    if (kind === "credits") g.resultSnapshot.credits = 0;
    const r = f.run();
    assert.equal(r.status, "NOT_VERIFIED", kind);
    assert.equal(r.gpa4, null, kind);
    assert.equal(r.classification, null);
    assert.equal(r.basis.length, 0);
    assert.equal(r.issues.length, 1);
  }
});
test("Standing: incomplete coverage blocks partial GPA; missing class blocks; withdrawn rows ignored and empty enrollment stays explicit", () => {
  const f = pure();
  f.add();
  const next = f.add();
  next.g.status = "DRAFT";
  assert.equal(f.run().status, "NOT_VERIFIED");
  next.e.status = "WITHDRAWN";
  assert.equal(f.run().status, "MEETS_RULES");
  next.e.status = "ACTIVE";
  f.sections.pop();
  assert.equal(f.run().status, "NOT_VERIFIED");
  const g = pure();
  assert.equal(g.run().status, "NO_ENROLLMENT");
  assert.equal(g.run().gpa4, null);
});
test("Standing: repeat rules share transcript selection, failed credits do not count same subject twice, mixed modes unverified", () => {
  const f = pure(),
    subjectId = randomUUID();
  f.add({ subjectId, points: 0, score: 4 });
  f.add({ subjectId, points: 3, score: 8, endDate: "2020-07-01" });
  const r = f.run();
  assert.equal(r.failedCredits, 0);
  assert.equal(r.creditsAttempted, 3);
  assert.equal(r.basis.length, 1);
  const g = pure();
  g.add({ subjectId, points: 3, score: 8, repeatRule: "LATEST" });
  g.add({
    subjectId,
    points: 0,
    score: 4,
    repeatRule: "LATEST",
    endDate: "2020-07-01",
  });
  assert.equal(g.run().failedCredits, 3);
  g.grades[0].resultSnapshot.gpaPolicy.repeatRule = "HIGHEST";
  assert.equal(g.run().status, "NOT_VERIFIED");
});
test("Standing: semester-only excludes other terms and never returns another student data", () => {
  const f = pure();
  f.add({ points: 3 });
  f.add({ points: 0, score: 4, termCode: "2019.1" });
  const other = f.add({ points: 0, score: 4 });
  other.e.studentId = "other";
  assert.equal(f.run().gpa4, 3);
  assert.equal(f.run().enrollmentCount, 1);
});
test("Standing policy: validates thresholds, coverage, distinct bands, reason and confirmation", async () => {
  const f = await standingFixture(),
    valid = f.policyInput();
  for (const payload of [
    { ...valid.payload, gpa4Below: -1 },
    { ...valid.payload, gpa4Below: 4.01 },
    { ...valid.payload, gpa4Below: null, failedCreditsAtLeast: null },
    { ...valid.payload, failedCreditsAtLeast: 0 },
    { ...valid.payload, failedCreditsAtLeast: 1.5 },
    { ...valid.payload, bands: [] },
    {
      ...valid.payload,
      bands: [
        { minGpa4: 1, label: "A" },
        { minGpa4: 2, label: "B" },
      ],
    },
    {
      ...valid.payload,
      bands: [
        { minGpa4: 0, label: "A" },
        { minGpa4: 0, label: "B" },
      ],
    },
    {
      ...valid.payload,
      bands: [
        { minGpa4: 0, label: "A" },
        { minGpa4: 2, label: "a" },
      ],
    },
  ])
    await assert.rejects(f.policy({ payload }), status(400));
  await assert.rejects(f.policy({ confirm: false }), status(400));
  await assert.rejects(f.policy({ reason: "" }), status(400));
  assert.equal((await f.store.list("standingPolicies")).length, 0);
});
test("Standing policy: unique semester/version, audit history, no retroactive grade changes and unused criterion can be disabled", async () => {
  const f = await standingFixture(),
    p = await f.policy(),
    grades = await f.store.list("grades");
  await assert.rejects(f.policy(), status(409));
  const updated = await f.policy({
    version: p.version,
    payload: { ...p.payload, gpa4Below: null, failedCreditsAtLeast: 1 },
  });
  assert.equal(updated.version, 2);
  assert.equal((await f.store.list("standingPolicies")).length, 1);
  assert.deepEqual(await f.store.list("grades"), grades);
  assert.equal(
    (await f.store.list("events")).filter(
      (e) => e.action === "STANDING_POLICY_SAVED",
    ).length,
    2,
  );
});
test("Standing: policy writes limited to manager/global staff, students own only and lecturers denied", async () => {
  const f = await standingFixture();
  await assert.rejects(f.policy({}, f.student), status(403));
  await assert.rejects(f.policy({}, f.teacher), status(403));
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId },
    1,
  );
  await assert.rejects(f.policy({}, f.staff), status(403));
  assert.equal((await standingSettings(f.store, f.staff)).canManage, false);
  await f.policy();
  assert.equal((await f.overview(f.student)).rows.length, 1);
  assert.equal(
    (await f.overview(f.student, { studentId: f.profiles[1].id })).rows.length,
    0,
  );
  await assert.rejects(f.overview(f.teacher), status(403));
});
test("Standing: scoped staff gets all results of authorized student even cross-faculty class, revocation hides results", async () => {
  const f = await standingFixture();
  await f.policy();
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId },
    1,
  );
  await f.store.update(
    "sections",
    f.section.id,
    { facultyId: randomUUID() },
    1,
  );
  const report = await f.overview(f.staff);
  assert.equal(
    report.rows.find((r) => r.studentId === f.profiles[0].id).gpa4,
    3,
  );
  await f.store.update("staffScopes", f.grantId, { active: false }, 2);
  assert.equal((await f.overview(f.staff)).rows.length, 0);
});
test("Standing policy: audit failure rolls back policy and event, simultaneous creates cannot duplicate term", async () => {
  const f = await standingFixture(),
    before = structuredClone(f.store.data),
    insert = f.store.insert;
  f.store.insert = async function (k, r) {
    if (k === "events") throw Error("audit failure");
    return insert.call(this, k, r);
  };
  await assert.rejects(f.policy(), /audit failure/);
  assert.deepEqual(f.store.data, before);
  f.store.insert = insert;
  const r = await Promise.allSettled([f.policy(), f.policy()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
});
test("Standing: GPA changes update live review but do not modify historical grade or apply an administrative decision", async () => {
  const f = await standingFixture();
  await f.policy();
  const old = (await f.overview(f.student)).rows[0],
    g = (await f.store.list("grades"))[0];
  await f.store.update(
    "grades",
    g.id,
    { score: 4, resultSnapshot: { ...g.resultSnapshot, points: 0 } },
    g.version,
  );
  const next = (await f.overview(f.student)).rows[0];
  assert.equal(old.status, "MEETS_RULES");
  assert.equal(next.status, "NEEDS_REVIEW");
  assert.equal((await f.store.list("statusRequests")).length, 0);
  assert.equal(
    (await f.store.list("notifications")).filter(
      (n) => n.action === "STANDING_POLICY_SAVED",
    ).length,
    0,
  );
});
test("Standing AI: asks for exact semester/student, returns own scoped live data and denies lecturer", async () => {
  const f = await standingFixture();
  await f.policy();
  const ai = new AiService(f.store, {}),
    run = (actor, args = {}) =>
      ai.runTool("lookup_academic_standing", args, actor, [], [], randomUUID());
  assert.ok((await run(f.student)).needsInformation);
  assert.ok((await run(f.manager, { termCode: f.term.code })).needsInformation);
  assert.ok(
    (
      await run(f.student2, {
        termCode: f.term.code,
        studentCode: f.profiles[0].code,
      })
    ).needsInformation,
  );
  const data = await run(f.student, { termCode: f.term.code });
  assert.equal(data.rows.length, 1);
  assert.equal(data.rows[0].studentId, f.profiles[0].id);
  assert.equal(data.rows[0].gpa4, 3);
  assert.ok(data.source);
  await assert.rejects(run(f.teacher, { termCode: f.term.code }), status(403));
});
test("Standing SQL: declared policy JSON fields and bound optimistic update", async () => {
  const calls = [],
    connection = {
      query: async (q) => {
        calls.push(q);
        return [[{ id: "p", payload_json: '{"bands":[]}' }]];
      },
      execute: async (q, v) => {
        calls.push({ q, v });
        return [{ affectedRows: 1 }];
      },
    };
  const store = new MysqlStore(connection);
  assert.deepEqual((await store.list("standingPolicies"))[0].payload.bands, []);
  await store.update(
    "standingPolicies",
    "p",
    { payload: { gpa4Below: 2 }, reason: "x'" },
    1,
  );
  assert.ok(calls[0].includes("academic_standing_policies"));
  assert.ok(calls[1].q.includes("version=version+1"));
  assert.ok(!calls[1].q.includes("x'"));
  assert.equal(calls[1].v[0], '{"gpa4Below":2}');
});
test("Standing HTTP: auth/Origin, policy rights and own semester report end to end", async () => {
  const f = await standingFixture(),
    server = createApp({
      store: f.store,
      config: { origin: "http://localhost", ai: {} },
      aiProvider: {},
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1/grades",
    cookies = {};
  try {
    for (const a of [f.manager, f.staff, f.student, f.student2, f.teacher]) {
      const token = randomBytes(32).toString("hex");
      cookies[a.id] = "lizz_session=" + token;
      await f.store.insert("sessions", {
        tokenHash: tokenHash(token),
        accountId: a.id,
        accountVersion: 1,
        expiresAt: Date.now() + 60000,
      });
    }
    const req = async (actor, path, body, origin = "http://localhost") => {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: cookies[actor.id],
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, data: await r.json() };
    };
    assert.equal((await fetch(base + "/standing/settings")).status, 401);
    assert.equal((await req(f.teacher, "/standing/settings")).status, 403);
    assert.equal(
      (await req(f.student, "/standing/policies", f.policyInput())).status,
      403,
    );
    assert.equal(
      (
        await req(
          f.manager,
          "/standing/policies",
          f.policyInput(),
          "https://other.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (await req(f.manager, "/standing/policies", f.policyInput())).status,
      200,
    );
    const data = await req(f.student, "/standing?termId=" + f.term.id);
    assert.equal(data.status, 200);
    assert.equal(data.data.rows.length, 1);
    assert.equal(data.data.rows[0].gpa4, 3);
    assert.equal(
      (
        await req(
          f.student2,
          "/standing?termId=" + f.term.id + "&studentId=" + f.profiles[0].id,
        )
      ).data.rows.length,
      0,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("Standing: global staff can save policy; narrowing scope prevents later edits without changing published grade data", async () => {
  const f = await standingFixture(),
    p = await f.policy({}, f.staff),
    grades = await f.store.list("grades");
  assert.equal(p.version, 1);
  assert.equal((await standingSettings(f.store, f.staff)).canManage, true);
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId },
    1,
  );
  await assert.rejects(f.policy({ version: 1 }, f.staff), status(403));
  assert.equal((await f.store.list("standingPolicies"))[0].version, 1);
  assert.deepEqual(await f.store.list("grades"), grades);
});
