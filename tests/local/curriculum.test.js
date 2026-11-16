import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  saveCurriculum,
  publishCurriculum,
  assignCurriculum,
  curriculumProgress,
  curriculumOverview,
  curriculumForRegistration,
} from "../../backend/local/modules/curriculum/curriculum.service.js";
import {
  saveSubject,
  checkRegistration,
} from "../../backend/local/modules/academic/academic.service.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { fingerprint } from "../../backend/local/modules/ai/ai.actions.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
async function fixture() {
  const f = await serviceFixture(),
    id = randomUUID;
  f.faculty = { id: id(), name: "Khoa CNTT", version: 1 };
  f.cohort = { id: id(), name: "Khóa 70", version: 1 };
  f.major = {
    id: id(),
    name: "Công nghệ thông tin",
    facultyId: f.faculty.id,
    version: 1,
  };
  f.group = {
    id: f.profiles[0].classId,
    majorId: f.major.id,
    cohortId: f.cohort.id,
    version: 1,
  };
  for (const [key, row] of [
    ["faculties", f.faculty],
    ["cohorts", f.cohort],
    ["majors", f.major],
    ["classes", f.group],
  ])
    await f.store.insert(key, row);
  const s0 = (await f.store.list("subjects"))[0],
    s1 = await saveSubject(
      f.store,
      { code: "WEB", name: "Lập trình web", credits: 3 },
      f.manager,
    ),
    s2 = await saveSubject(
      f.store,
      { code: "AI", name: "Trí tuệ nhân tạo", credits: 3 },
      f.manager,
    );
  f.subjects = [s0, s1, s2];
  f.input = {
    code: "CNTT",
    name: "Chương trình Công nghệ thông tin",
    edition: 1,
    majorId: f.major.id,
    cohortId: f.cohort.id,
    groups: [
      {
        code: "BB",
        name: "Kiến thức bắt buộc",
        kind: "REQUIRED",
        subjects: [{ subjectId: s0.id, semester: 1 }],
      },
      {
        code: "TC",
        name: "Học phần tự chọn",
        kind: "ELECTIVE",
        minCredits: 3,
        subjects: [
          { subjectId: s1.id, semester: 2 },
          { subjectId: s2.id, semester: 2 },
        ],
      },
    ],
  };
  f.draft = () => saveCurriculum(f.store, structuredClone(f.input), f.manager);
  f.publish = async () => {
    const p = await f.draft();
    return publishCurriculum(
      f.store,
      p.id,
      { version: p.version, confirm: true },
      f.manager,
    );
  };
  f.assignBody = (p) => ({
    curriculumId: p.id,
    version: p.version,
    studentId: f.profiles[0].id,
    studentVersion: 1,
    reason: "Áp dụng theo quyết định đào tạo",
    confirm: true,
    requestId: id(),
  });
  f.assign = async (p) => assignCurriculum(f.store, f.assignBody(p), f.manager);
  f.grade = async (
    index,
    {
      status = "PUBLISHED",
      score = 8,
      credits = 3,
      studentId = f.profiles[0].id,
      snapshot = true,
      version = 1,
      passScore = 5,
    } = {},
  ) => {
    const sectionId = id(),
      enrollmentId = id();
    await f.store.insert("sections", {
      ...f.section,
      id: sectionId,
      subjectId: f.subjects[index].id,
    });
    await f.store.insert("enrollments", {
      id: enrollmentId,
      studentId,
      sectionId,
      status: "ACTIVE",
      version,
    });
    await f.store.insert("grades", {
      id: id(),
      enrollmentId,
      enrollmentVersion: 1,
      score,
      passScore,
      status,
      publishedAt: Date.now(),
      version: 1,
      resultSnapshot: snapshot
        ? { subjectId: f.subjects[index].id, credits, endDate: "2020-03-30" }
        : null,
    });
  };
  return f;
}
test("Curriculum: required credits are derived; elective minimum and frozen subject snapshots are stored", async () => {
  const f = await fixture(),
    p = await f.draft();
  assert.equal(p.groups[0].minCredits, 3);
  assert.equal(p.groups[1].minCredits, 3);
  assert.equal(p.groups[0].subjects[0].subjectName, "Cơ sở dữ liệu");
  assert.equal(p.status, "DRAFT");
});
test("Curriculum: rejects duplicate subjects, group codes, impossible minimum and missing references atomically", async () => {
  const f = await fixture();
  for (const mutate of [
    (b) => b.groups[1].subjects.push(b.groups[0].subjects[0]),
    (b) => (b.groups[1].code = "bb"),
    (b) => (b.groups[1].minCredits = 10),
    (b) => (b.groups[0].subjects[0].semester = 0),
    (b) => (b.groups[0].subjects[0].subjectId = "missing"),
    (b) => (b.groups = []),
    (b) => (b.edition = 0),
  ]) {
    const b = structuredClone(f.input);
    mutate(b);
    await assert.rejects(saveCurriculum(f.store, b, f.manager));
    assert.equal((await f.store.list("curricula")).length, 0);
  }
});
test("Curriculum: duplicate editions and stale writes rejected; published records cannot be edited", async () => {
  const f = await fixture(),
    p = await f.draft();
  await assert.rejects(f.draft(), /đã tồn tại/);
  await assert.rejects(
    saveCurriculum(f.store, { ...f.input, version: 0 }, f.manager, p.id),
    /đã thay đổi/,
  );
  await publishCurriculum(
    f.store,
    p.id,
    { version: 1, confirm: true },
    f.manager,
  );
  await assert.rejects(
    saveCurriculum(f.store, { ...f.input, version: 2 }, f.manager, p.id),
    /giữ nguyên/,
  );
});
test("Curriculum: publishing needs manager, explicit confirmation and current version", async () => {
  const f = await fixture(),
    p = await f.draft();
  for (const [actor, body] of [
    [f.staff, { version: 1, confirm: true }],
    [f.student, { version: 1, confirm: true }],
    [f.manager, { version: 1 }],
    [f.manager, { version: 0, confirm: true }],
  ])
    await assert.rejects(publishCurriculum(f.store, p.id, body, actor));
  assert.equal((await f.store.list("curricula"))[0].status, "DRAFT");
});
test("Curriculum: publication detects changed catalog; published references prevent retrospective subject edits", async () => {
  const f = await fixture(),
    p = await f.draft();
  await f.store.update("subjects", f.subjects[1].id, { name: "Tên đã đổi" }, 1);
  await assert.rejects(
    publishCurriculum(f.store, p.id, { version: 1, confirm: true }, f.manager),
    /Danh mục/,
  );
  const saved = await saveCurriculum(
    f.store,
    { ...f.input, version: 1 },
    f.manager,
    p.id,
  );
  await publishCurriculum(
    f.store,
    p.id,
    { version: saved.version, confirm: true },
    f.manager,
  );
  await assert.rejects(
    saveSubject(
      f.store,
      { code: "WEB", name: "Đổi tên", credits: 4, version: 2 },
      f.manager,
      f.subjects[1].id,
    ),
    /chương trình đã công bố/,
  );
});
test("Curriculum: audit failure rolls publication back", async () => {
  const f = await fixture(),
    p = await f.draft(),
    original = f.store.insert;
  f.store.insert = async function (k, r) {
    if (k === "events") throw Error("audit unavailable");
    return original.call(this, k, r);
  };
  await assert.rejects(
    publishCurriculum(f.store, p.id, { version: 1, confirm: true }, f.manager),
    /audit/,
  );
  assert.equal((await f.store.list("curricula"))[0].status, "DRAFT");
});
test("Curriculum: assignment rejects draft, wrong cohort, stale profile and missing confirmation", async () => {
  const f = await fixture(),
    draft = await f.draft();
  await assert.rejects(f.assign(draft), /chưa công bố/);
  const p = await publishCurriculum(
    f.store,
    draft.id,
    { version: 1, confirm: true },
    f.manager,
  );
  for (const body of [
    { ...f.assignBody(p), studentVersion: 0 },
    { ...f.assignBody(p), confirm: false },
    { ...f.assignBody(p), studentId: f.profiles[1].id },
  ])
    await assert.rejects(assignCurriculum(f.store, body, f.manager));
  assert.equal((await f.store.list("curriculumAssignments")).length, 0);
});
test("Curriculum: assignment retry is idempotent, changed payload and replacement rejected", async () => {
  const f = await fixture(),
    p = await f.publish(),
    b = f.assignBody(p);
  const a = await assignCurriculum(f.store, b, f.manager);
  assert.equal((await assignCurriculum(f.store, b, f.manager)).id, a.id);
  await assert.rejects(
    assignCurriculum(f.store, { ...b, reason: "Khác" }, f.manager),
    /nội dung khác/,
  );
  await assert.rejects(f.assign(p), /đã có chương trình/);
  assert.equal((await f.store.list("curriculumAssignments")).length, 1);
});
test("Curriculum: concurrent assignments cannot attach two programs to one student", async () => {
  const f = await fixture(),
    p = await f.publish(),
    results = await Promise.allSettled([f.assign(p), f.assign(p)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("curriculumAssignments")).length, 1);
});
test("Curriculum: new publication never changes an existing student assignment", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  f.input.edition = 2;
  const p2 = await f.publish();
  const result = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(result.curriculum.id, p.id);
  assert.notEqual(result.curriculum.id, p2.id);
});
test("Curriculum: passing repeats count once and elective credits are capped at the group requirement", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  for (const i of [0, 0, 1, 2]) await f.grade(i);
  const r = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(r.earnedCredits, 6);
  assert.equal(r.groups[1].earnedCredits, 6);
  assert.equal(r.groups[1].countedCredits, 3);
  assert.equal(r.remainingCredits, 0);
  assert.equal(r.status, "VERIFIED");
  assert.match(r.note, /không phải/);
});
test("Curriculum: draft, failed, withdrawn-generation or insufficient-credit results cannot satisfy a course", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  await f.grade(0, { status: "DRAFT" });
  await f.grade(0, { score: 4 });
  await f.grade(1, { version: 2 });
  await f.grade(2, { credits: 2 });
  const r = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(r.earnedCredits, 0);
  assert.equal(r.groups[1].subjects[1].status, "CREDIT_SHORTFALL");
  assert.equal(r.remainingCredits, 6);
});
test("Curriculum: legacy grades without credit snapshots are explicitly unverified", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  await f.grade(0, { snapshot: false });
  const r = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(r.status, "NEEDS_REVIEW");
  assert.equal(r.remainingCredits, null);
  assert.equal(r.groups[0].subjects[0].status, "UNVERIFIED");
});
test("Curriculum: changed major/cohort requires review and blocks new registrations without deleting history", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  await f.store.update("classes", f.group.id, { cohortId: randomUUID() }, 1);
  const r = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(r.status, "NEEDS_REVIEW");
  await assert.rejects(
    curriculumForRegistration(f.store, f.profiles[0], f.section),
    /xét lại/,
  );
  assert.equal((await f.store.list("curriculumAssignments")).length, 1);
});
test("Curriculum: privacy excludes another student and lecturer progression; catalog hides drafts from lecturers", async () => {
  const f = await fixture();
  await f.draft();
  await assert.rejects(
    curriculumProgress(f.store, f.student, f.profiles[1].id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    curriculumProgress(f.store, f.teacher, f.profiles[0].id),
    (e) => e.status === 403,
  );
  assert.equal(
    (await curriculumOverview(f.store, f.teacher)).curricula.length,
    0,
  );
  assert.equal(
    (await curriculumOverview(f.store, f.student)).students.length,
    1,
  );
});
test("Curriculum: unassigned students preserve registration policy; assignment constrains eligibility and commit", async () => {
  const f = await fixture();
  await checkRegistration(f.store, f.section.id, f.student);
  const p = await f.publish();
  await f.assign(p);
  const allowed = await checkRegistration(f.store, f.section.id, f.student);
  assert.equal(allowed.studyRules.curriculum.id, p.id);
  const outside = await saveSubject(
    f.store,
    { code: "NGOAI", name: "Ngoài chương trình", credits: 3 },
    f.manager,
  );
  await f.store.update("sections", f.section.id, { subjectId: outside.id }, 1);
  await assert.rejects(
    checkRegistration(f.store, f.section.id, f.student),
    /ngoài chương trình/,
  );
  await assert.rejects(f.enroll(), /ngoài chương trình/);
  assert.equal((await f.store.list("enrollments")).length, 0);
});
test("Curriculum: staff scope filters programs, assignment and progress; incomplete scoped transcript not claimed complete", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "FACULTY",
    facultyId: f.faculty.id,
    cohortId: null,
    active: true,
    version: 1,
  });
  const scoped = staffStore(f.store, f.staff);
  assert.equal((await curriculumOverview(scoped, f.staff)).curricula.length, 1);
  const r = await curriculumProgress(scoped, f.staff, f.profiles[0].id);
  assert.equal(r.status, "NEEDS_REVIEW");
  assert.equal(r.remainingCredits, null);
  const noScope = staffStore(f.store, { ...f.teacher, role: "STAFF" });
  await assert.rejects(
    curriculumOverview(noScope, { ...f.teacher, role: "STAFF" }),
  );
  await assert.rejects(
    saveCurriculum(
      scoped,
      { ...f.input, edition: 2, cohortId: randomUUID() },
      f.staff,
    ),
  );
});
test("Curriculum: AI reads own program only and assignment changes proposal fingerprint", async () => {
  const f = await fixture(),
    p = await f.publish(),
    before = await fingerprint(f.store);
  await f.assign(p);
  assert.notEqual(await fingerprint(f.store), before);
  const ai = new AiService(f.store, {}),
    sources = [];
  const r = await ai.runTool(
    "lookup_curriculum_progress",
    { query: f.profiles[1].code },
    f.student,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(r.student.id, f.profiles[0].id);
  assert.equal(sources.length, 1);
  await assert.rejects(
    ai.runTool(
      "lookup_curriculum_progress",
      {},
      f.teacher,
      [],
      [],
      randomUUID(),
    ),
    (e) => e.status === 403,
  );
  const ambiguous = await ai.runTool(
    "lookup_curriculum_progress",
    {},
    f.manager,
    [],
    [],
    randomUUID(),
  );
  assert.ok(ambiguous.needsInformation);
});
test("Curriculum: MySQL mapping serializes groups and binds values; no SQL interpolation from user text", async () => {
  const calls = [],
    conn = {
      execute: async (sql, args) => {
        calls.push({ sql, args });
        return [{ affectedRows: 1 }];
      },
      query: async () => [
        [{ id: "p", groups_json: '[{"code":"BB"}]', edition: 1 }],
      ],
    },
    sql = new MysqlStore(conn),
    groups = [{ code: "BB", name: "x'); DROP TABLE accounts;--" }];
  await sql.insert("curricula", { id: "p", code: "CNTT", groups, edition: 1 });
  await sql.update("curricula", "p", { groups }, 1);
  assert.ok(calls.every((c) => !c.sql.includes("DROP TABLE")));
  assert.ok(calls[0].args.includes(JSON.stringify(groups)));
  assert.deepEqual((await sql.list("curricula"))[0].groups, [{ code: "BB" }]);
  await sql.insert("curriculumAssignments", {
    id: "a",
    studentId: "s",
    curriculumId: "p",
    requestHash: "hash",
    createdBy: "actor",
    createdAt: 1,
    reason: "decision",
    version: 1,
  });
  assert.match(calls.at(-1).sql, /student_curricula/);
});
test("Curriculum HTTP: authentication, Origin, role and ownership are enforced", async (t) => {
  const f = await fixture(),
    origin = "http://localhost:4173",
    token = "c".repeat(64);
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
  const base =
      "http://127.0.0.1:" + server.address().port + "/api/v1/curricula",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers })).status, 200);
  assert.equal(
    (
      await fetch(base + "/students/" + f.profiles[0].id + "/progress", {
        headers,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/students/" + f.profiles[1].id + "/progress", {
        headers,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(base, {
        method: "POST",
        headers,
        body: JSON.stringify(f.input),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base, {
        method: "POST",
        headers: { ...headers, Origin: "http://wrong.test" },
        body: "{}",
      })
    ).status,
    403,
  );
});

test("Curriculum: malformed nested data is rejected as validation, not a server crash", async () => {
  const f = await fixture();
  for (const groups of [[null], [{ ...f.input.groups[0], subjects: [null] }]])
    await assert.rejects(
      saveCurriculum(f.store, { ...f.input, groups }, f.manager),
      (e) => e.status === 400,
    );
});
test("Curriculum: scoped staff cannot create or read a program from another faculty", async () => {
  const f = await fixture(),
    facultyId = randomUUID(),
    majorId = randomUUID();
  await f.store.insert("faculties", {
    id: facultyId,
    name: "Khoa khác",
    version: 1,
  });
  await f.store.insert("majors", { id: majorId, facultyId, version: 1 });
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "FACULTY",
    facultyId: f.faculty.id,
    cohortId: null,
    active: true,
    version: 1,
  });
  const foreign = await saveCurriculum(
      f.store,
      { ...f.input, majorId },
      f.manager,
    ),
    scoped = staffStore(f.store, f.staff);
  assert.ok(
    !(await curriculumOverview(scoped, f.staff)).curricula.some(
      (p) => p.id === foreign.id,
    ),
  );
  await assert.rejects(
    saveCurriculum(scoped, { ...f.input, majorId, edition: 2 }, f.staff),
    (e) => e.status === 400,
  );
  await assert.rejects(
    saveCurriculum(
      scoped,
      { ...f.input, majorId, version: 1 },
      f.staff,
      foreign.id,
    ),
    (e) => e.status === 404,
  );
});
test("Curriculum: audit failure rolls assignment back and cannot leave a partially linked student", async () => {
  const f = await fixture(),
    p = await f.publish(),
    original = f.store.insert;
  f.store.insert = async function (k, r) {
    if (k === "events") throw Error("audit unavailable");
    return original.call(this, k, r);
  };
  await assert.rejects(f.assign(p), /audit/);
  assert.equal((await f.store.list("curriculumAssignments")).length, 0);
});

test("Curriculum HTTP: manager can save, publish and confirm assignment; stale edit rejected through routes", async (t) => {
  const f = await fixture(),
    origin = "http://localhost:4173",
    token = "d".repeat(64);
  await f.store.insert("sessions", {
    tokenHash: tokenHash(token),
    accountId: f.manager.id,
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
  const base =
      "http://127.0.0.1:" + server.address().port + "/api/v1/curricula",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  const create = await fetch(base, {
    method: "POST",
    headers,
    body: JSON.stringify(f.input),
  });
  assert.equal(create.status, 201);
  const draft = (await create.json()).row;
  const publish = await fetch(base + "/" + draft.id + "/publish", {
    method: "POST",
    headers,
    body: JSON.stringify({ version: 1, confirm: true }),
  });
  assert.equal(publish.status, 200);
  const p = (await publish.json()).row;
  assert.equal(
    (
      await fetch(base + "/" + draft.id, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ...f.input, version: 1 }),
      })
    ).status,
    409,
  );
  const assignment = await fetch(base + "/assignments", {
    method: "POST",
    headers,
    body: JSON.stringify(f.assignBody(p)),
  });
  assert.equal(assignment.status, 201);
  const progress = await fetch(
    base + "/students/" + f.profiles[0].id + "/progress",
    { headers },
  );
  assert.equal(progress.status, 200);
  assert.equal((await progress.json()).requiredCredits, 6);
});

test("Curriculum: a legacy published result missing enrollment generation is unverified, not silently treated as failed or passed", async () => {
  const f = await fixture(),
    p = await f.publish();
  await f.assign(p);
  await f.grade(0);
  const grade = (await f.store.list("grades"))[0];
  await f.store.update("grades", grade.id, { enrollmentVersion: null }, 1);
  const result = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(result.status, "NEEDS_REVIEW");
  assert.equal(result.earnedCredits, 0);
  assert.equal(result.remainingCredits, null);
  assert.equal(result.groups[0].subjects[0].status, "UNVERIFIED");
});
