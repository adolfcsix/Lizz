import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  saveCurriculum,
  publishCurriculum,
  assignCurriculum,
  curriculumProgress,
} from "../../backend/local/modules/curriculum/curriculum.service.js";
import {
  previewCurriculumBatch,
  applyCurriculumBatch,
  compareCurricula,
} from "../../backend/local/modules/curriculum/curriculum-batch.service.js";
import { compareCurriculumContents } from "../../shared/curriculum-comparison.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
const status = (value) => (e) => e.status === value;
async function fixture() {
  const f = await serviceFixture();
  f.facultyId = randomUUID();
  f.majorId = randomUUID();
  f.cohortId = randomUUID();
  await f.store.insert("faculties", {
    id: f.facultyId,
    name: "Khoa A",
    version: 1,
  });
  await f.store.insert("majors", {
    id: f.majorId,
    facultyId: f.facultyId,
    name: "Ngành A",
    version: 1,
  });
  await f.store.insert("cohorts", {
    id: f.cohortId,
    name: "Khóa A",
    version: 1,
  });
  for (const p of f.profiles)
    await f.store.insert("classes", {
      id: p.classId,
      name: "Lớp " + p.code,
      majorId: f.majorId,
      cohortId: f.cohortId,
      version: 1,
    });
  f.grantId = randomUUID();
  await f.store.insert("staffScopes", {
    id: f.grantId,
    accountId: f.staff.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  });
  f.definition = {
    code: "CT",
    name: "Chương trình đào tạo",
    edition: 1,
    majorId: f.majorId,
    cohortId: f.cohortId,
    groups: [
      {
        code: "BB",
        name: "Bắt buộc",
        kind: "REQUIRED",
        subjects: [{ subjectId: f.section.subjectId, semester: 1 }],
      },
    ],
  };
  f.draft = await saveCurriculum(f.store, f.definition, f.manager);
  f.program = await publishCurriculum(
    f.store,
    f.draft.id,
    { version: 1, confirm: true },
    f.manager,
  );
  f.input = () => ({
    curriculumId: f.program.id,
    version: f.program.version,
    students: f.profiles.map((s) => ({
      studentId: s.id,
      studentVersion: s.version,
    })),
    reason: "Áp dụng theo quyết định đào tạo",
  });
  f.preview = (input = f.input(), actor = f.manager) =>
    previewCurriculumBatch(f.store, input, actor);
  f.commitBody = async (input = f.input(), actor = f.manager) => ({
    ...input,
    previewHash: (await f.preview(input, actor)).previewHash,
    requestId: randomUUID(),
    confirm: true,
  });
  f.apply = (body, actor = f.manager) =>
    applyCurriculumBatch(f.store, body, actor);
  return f;
}
test("Curriculum batch: review is read-only, commit creates all assignments and students see own program", async () => {
  const f = await fixture();
  await f.enroll();
  const enrollments = await f.store.list("enrollments"),
    profiles = await f.store.list("students");
  const p = await f.preview();
  assert.equal(p.canApply, true);
  assert.equal(p.eligibleCount, 2);
  assert.equal((await f.store.list("curriculumAssignments")).length, 0);
  const result = await f.apply({
    ...f.input(),
    previewHash: p.previewHash,
    requestId: randomUUID(),
    confirm: true,
  });
  assert.equal(result.count, 2);
  assert.equal((await f.store.list("curriculumBatches")).length, 1);
  assert.equal((await f.store.list("curriculumAssignments")).length, 2);
  assert.deepEqual(await f.store.list("enrollments"), enrollments);
  assert.deepEqual(await f.store.list("students"), profiles);
  for (const [actor, profile] of [
    [f.student, f.profiles[0]],
    [f.student2, f.profiles[1]],
  ]) {
    const progress = await curriculumProgress(f.store, actor, profile.id);
    assert.equal(progress.curriculum.id, f.program.id);
    assert.equal(progress.assignment.studentId, profile.id);
  }
});
test("Curriculum batch: retry keeps one ledger and one assignment per student, stable under reordered selection", async () => {
  const f = await fixture(),
    body = await f.commitBody(),
    result = await f.apply(body);
  await f.store.update(
    "students",
    f.profiles[0].id,
    { fullName: "Tên đã cập nhật" },
    1,
  );
  const replay = await f.apply({
    ...body,
    students: [...body.students].reverse(),
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.batchId, result.batchId);
  assert.equal((await f.store.list("curriculumAssignments")).length, 2);
  assert.equal((await f.store.list("students"))[0].fullName, "Tên đã cập nhật");
  await assert.rejects(
    f.apply({ ...body, reason: "Căn cứ khác" }),
    status(409),
  );
  await assert.rejects(f.apply(body, f.staff), status(409));
});
test("Curriculum batch: rejects unconfirmed, malformed, oversized and duplicate selections without any writes", async () => {
  const f = await fixture(),
    input = f.input();
  for (const extra of [
    { students: [] },
    { students: Array.from({ length: 51 }, () => input.students[0]) },
    { students: [input.students[0], input.students[0]] },
    { students: [{ studentId: "x", studentVersion: 1 }] },
    { students: [{ ...input.students[0], studentVersion: "1" }] },
    { reason: " " },
    { version: 0 },
  ])
    await assert.rejects(f.preview({ ...input, ...extra }), status(400));
  const body = await f.commitBody();
  for (const extra of [
    { confirm: false },
    { previewHash: "" },
    { previewHash: "0".repeat(64) },
    { requestId: "invalid" },
  ])
    await assert.rejects(f.apply({ ...body, ...extra }));
  assert.equal((await f.store.list("curriculumAssignments")).length, 0);
});
test("Curriculum batch: preview marks assigned, wrong audience, stale and unknown records; commit is all-or-nothing", async () => {
  const f = await fixture();
  const single = {
    curriculumId: f.program.id,
    version: 2,
    ...f.input().students[0],
    reason: "Đã áp dụng riêng",
    confirm: true,
    requestId: randomUUID(),
  };
  await assignCurriculum(f.store, single, f.manager);
  const first = await f.preview();
  assert.equal(
    first.rows.find((r) => r.studentId === f.profiles[0].id).status,
    "ASSIGNED",
  );
  assert.equal(first.canApply, false);
  await assert.rejects(
    f.apply({
      ...f.input(),
      previewHash: first.previewHash,
      requestId: randomUUID(),
      confirm: true,
    }),
    status(409),
  );
  assert.equal((await f.store.list("curriculumAssignments")).length, 1);
  const second = f.profiles[1];
  await f.store.update(
    "classes",
    second.classId,
    { cohortId: randomUUID() },
    1,
  );
  const wrong = await f.preview({
    ...f.input(),
    students: [{ studentId: second.id, studentVersion: 1 }],
  });
  assert.equal(wrong.rows[0].status, "WRONG_AUDIENCE");
  const stale = await f.preview({
    ...f.input(),
    students: [{ studentId: second.id, studentVersion: 2 }],
  });
  assert.equal(stale.rows[0].status, "STALE");
  const absent = await f.preview({
    ...f.input(),
    students: [{ studentId: randomUUID(), studentVersion: 1 }],
  });
  assert.equal(absent.rows[0].status, "UNAVAILABLE");
  assert.equal(absent.rows[0].studentName, "");
});
test("Curriculum batch: snapshot prevents applying after student, class or assigned program changes", async () => {
  for (const kind of ["student", "class", "assignment"]) {
    const f = await fixture(),
      body = await f.commitBody();
    if (kind === "student")
      await f.store.update(
        "students",
        f.profiles[0].id,
        { fullName: "Tên mới" },
        1,
      );
    if (kind === "class")
      await f.store.update(
        "classes",
        f.profiles[0].classId,
        { name: "Lớp đã đổi tên" },
        1,
      );
    if (kind === "assignment")
      await assignCurriculum(
        f.store,
        {
          ...f.input().students[0],
          curriculumId: f.program.id,
          version: 2,
          reason: "Đợt riêng",
          confirm: true,
          requestId: randomUUID(),
        },
        f.manager,
      );
    await assert.rejects(f.apply(body), status(409));
    assert.equal((await f.store.list("curriculumBatches")).length, 0);
    assert.equal(
      (await f.store.list("curriculumAssignments")).length,
      kind === "assignment" ? 1 : 0,
    );
  }
});
test("Curriculum batch: staff service respects faculty/cohort scope and revoked grants, including replay", async () => {
  const f = await fixture();
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId, cohortId: f.cohortId },
    1,
  );
  await f.store.update(
    "classes",
    f.profiles[1].classId,
    { cohortId: randomUUID() },
    1,
  );
  const limited = await f.preview(f.input(), f.staff);
  assert.equal(
    limited.rows.find((r) => r.studentId === f.profiles[1].id).status,
    "UNAVAILABLE",
  );
  const one = { ...f.input(), students: [f.input().students[0]] },
    body = await f.commitBody(one, f.staff);
  assert.equal((await f.apply(body, f.staff)).count, 1);
  await f.store.update("staffScopes", f.grantId, { active: false }, 2);
  await assert.rejects(f.apply(body, f.staff), status(403));
  await assert.rejects(f.preview(one, f.staff), status(404));
});
test("Curriculum batch: revoked actor and wrong role cannot preview, commit or compare private draft", async () => {
  const f = await fixture(),
    body = await f.commitBody();
  for (const actor of [f.student, f.teacher]) {
    await assert.rejects(f.preview(f.input(), actor), status(403));
    await assert.rejects(f.apply(body, actor), status(403));
  }
  await f.store.update("accounts", f.manager.id, { active: false }, 1);
  await assert.rejects(f.apply(body), status(401));
});
test("Curriculum batch: concurrent batches cannot both assign the same students", async () => {
  const f = await fixture(),
    a = await f.commitBody(),
    b = await f.commitBody();
  const result = await Promise.allSettled([f.apply(a), f.apply(b)]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("curriculumAssignments")).length, 2);
  assert.equal((await f.store.list("curriculumBatches")).length, 1);
});
test("Curriculum batch: accepts exactly 50 students and keeps existing source records intact", async () => {
  const f = await fixture();
  for (let i = 2; i < 50; i++) {
    const accountId = randomUUID();
    await f.store.insert("accounts", {
      id: accountId,
      role: "STUDENT",
      active: true,
      version: 1,
    });
    const student = {
      id: randomUUID(),
      accountId,
      code: "SV" + i,
      fullName: "Sinh viên " + i,
      classId: f.profiles[0].classId,
      version: 1,
    };
    await f.store.insert("students", student);
    f.profiles.push(student);
  }
  const before = await f.store.list("students"),
    body = await f.commitBody();
  assert.equal((await f.apply(body)).count, 50);
  assert.deepEqual(await f.store.list("students"), before);
  assert.equal((await f.store.list("curriculumAssignments")).length, 50);
});
test("Curriculum batch: another actor cannot reuse a hidden batch ID for disjoint students", async () => {
  const f = await fixture();
  const a = await f.commitBody({
    ...f.input(),
    students: [f.input().students[0]],
  });
  await f.apply(a);
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId, cohortId: f.cohortId },
    1,
  );
  const b = await f.commitBody(
    { ...f.input(), students: [f.input().students[1]] },
    f.staff,
  );
  await assert.rejects(
    f.apply({ ...b, requestId: a.requestId }, f.staff),
    status(409),
  );
  assert.equal((await f.store.list("curriculumAssignments")).length, 1);
  assert.equal((await f.store.list("curriculumBatches")).length, 1);
});
test("Curriculum batch: audit failure rolls back all rows and ledger, then safe retry succeeds", async () => {
  const f = await fixture(),
    body = await f.commitBody(),
    insert = f.store.insert,
    count = (await f.store.list("events")).length;
  f.store.insert = async function (kind, record) {
    if (kind === "events" && record.action === "CURRICULUM_BATCH_ASSIGNED")
      throw Error("audit unavailable");
    return insert.call(this, kind, record);
  };
  await assert.rejects(f.apply(body), /audit unavailable/);
  assert.equal((await f.store.list("curriculumAssignments")).length, 0);
  assert.equal((await f.store.list("curriculumBatches")).length, 0);
  assert.equal((await f.store.list("events")).length, count);
  f.store.insert = insert;
  assert.equal((await f.apply(body)).count, 2);
});
test("Curriculum comparison: additions, removals, movement, credits/semester and group criteria remain separate", () => {
  const a = {
    name: "Tên cũ",
    groups: [
      {
        code: "BB",
        name: "Bắt buộc",
        kind: "REQUIRED",
        minCredits: 6,
        subjects: [
          {
            subjectId: "a",
            subjectCode: "A",
            subjectName: "A",
            credits: 3,
            semester: 1,
          },
          {
            subjectId: "b",
            subjectCode: "B",
            subjectName: "B",
            credits: 3,
            semester: 2,
          },
        ],
      },
      {
        code: "TC",
        name: "Tự chọn",
        kind: "ELECTIVE",
        minCredits: 3,
        subjects: [
          {
            subjectId: "c",
            subjectCode: "C",
            subjectName: "C",
            credits: 3,
            semester: 3,
          },
        ],
      },
    ],
  };
  const b = {
    name: "Tên mới",
    groups: [
      {
        code: "BB",
        name: "Bắt buộc",
        kind: "REQUIRED",
        minCredits: 7,
        subjects: [
          {
            subjectId: "a",
            subjectCode: "A",
            subjectName: "A mới",
            credits: 4,
            semester: 2,
          },
          {
            subjectId: "c",
            subjectCode: "C",
            subjectName: "C",
            credits: 3,
            semester: 3,
          },
        ],
      },
      {
        code: "TC",
        name: "Tự chọn",
        kind: "ELECTIVE",
        minCredits: 4,
        subjects: [
          {
            subjectId: "d",
            subjectCode: "D",
            subjectName: "D",
            credits: 4,
            semester: 4,
          },
        ],
      },
    ],
  };
  const d = compareCurriculumContents(a, b);
  assert.deepEqual(d.counts, {
    ADDED: 1,
    REMOVED: 1,
    CHANGED: 2,
    UNCHANGED: 0,
  });
  assert.equal(d.title.after, "Tên mới");
  assert.equal(d.minimumCredits.delta, 2);
  assert.ok(
    d.subjects.find((s) => s.subjectId === "c").fields.includes("groupCode"),
  );
  assert.equal(d.groups.length, 2);
  const reordered = structuredClone(a);
  reordered.groups.reverse();
  for (const g of reordered.groups) g.subjects.reverse();
  assert.equal(compareCurriculumContents(a, reordered).subjects.length, 0);
});
test("Curriculum comparison: same family required, lecturer sees published only and student cannot compare", async () => {
  const f = await fixture(),
    draft = await saveCurriculum(
      f.store,
      { ...f.definition, edition: 2, name: "Chương trình mới" },
      f.manager,
    );
  assert.equal(
    (await compareCurricula(f.store, f.manager, f.program.id, draft.id)).title
      .after,
    "Chương trình mới",
  );
  await assert.rejects(
    compareCurricula(f.store, f.teacher, f.program.id, draft.id),
    status(404),
  );
  await assert.rejects(
    compareCurricula(f.store, f.student, f.program.id, draft.id),
    status(403),
  );
  const published = await publishCurriculum(
    f.store,
    draft.id,
    { version: 1, confirm: true },
    f.manager,
  );
  assert.equal(
    (await compareCurricula(f.store, f.teacher, f.program.id, published.id))
      .after.id,
    published.id,
  );
  const other = await saveCurriculum(
    f.store,
    { ...f.definition, code: "KHAC" },
    f.manager,
  );
  await assert.rejects(
    compareCurricula(f.store, f.manager, f.program.id, other.id),
    status(409),
  );
  await assert.rejects(
    compareCurricula(f.store, f.manager, f.program.id, f.program.id),
    status(409),
  );
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: randomUUID() },
    1,
  );
  await assert.rejects(
    compareCurricula(f.store, f.staff, f.program.id, published.id),
    status(404),
  );
});
test("Curriculum batch SQL: ledger values bound with JSON result and immutable mapping", async () => {
  const calls = [],
    store = new MysqlStore({
      execute: async (query, args) => {
        calls.push({ query, args });
        return [{ affectedRows: 1 }];
      },
    });
  await store.insert("curriculumBatches", {
    id: randomUUID(),
    actorId: randomUUID(),
    curriculumId: randomUUID(),
    requestHash: "a".repeat(64),
    staffScopeToken: null,
    result: { reason: "O'Reilly", count: 2 },
    createdAt: Date.now(),
  });
  assert.match(calls[0].query, /^INSERT INTO curriculum_assignment_batches/);
  assert.ok(!calls[0].query.includes("O'Reilly"));
  assert.equal(JSON.parse(calls[0].args[5]).reason, "O'Reilly");
  await assert.rejects(
    store.update("curriculumBatches", "x", { result: {} }, 1),
  );
});
test("Curriculum AI: comparison asks for missing/ambiguous details, respects roles/scope and does not assign", async () => {
  const f = await fixture(),
    ai = new AiService(f.store, {}),
    sources = [];
  const p2 = await saveCurriculum(
    f.store,
    {
      ...f.definition,
      edition: 2,
      groups: [
        {
          ...f.definition.groups[0],
          subjects: [{ subjectId: f.section.subjectId, semester: 2 }],
        },
      ],
    },
    f.manager,
  );
  await publishCurriculum(
    f.store,
    p2.id,
    { version: 1, confirm: true },
    f.manager,
  );
  const run = (args, actor = f.manager) =>
    ai.runTool(
      "compare_curriculum_versions",
      args,
      actor,
      [],
      sources,
      randomUUID(),
    );
  assert.ok((await run({})).needsInformation.length >= 3);
  const args = { programCode: "ct", beforeEdition: 1, afterEdition: 2 };
  const result = await run(args, f.teacher);
  assert.equal(result.counts.CHANGED, 1);
  assert.equal(result.truncated, false);
  assert.ok(sources.at(-1).asOf);
  assert.ok(!JSON.stringify(result).includes(f.profiles[0].id));
  await assert.rejects(run(args, f.student), status(403));
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: randomUUID() },
    1,
  );
  assert.ok((await run(args, f.staff)).needsInformation.length > 0);
  const cohortId = randomUUID();
  await f.store.insert("cohorts", {
    id: cohortId,
    name: "Khóa khác",
    version: 1,
  });
  for (const edition of [1, 2])
    await saveCurriculum(
      f.store,
      { ...f.definition, cohortId, edition },
      f.manager,
    );
  const ambiguous = await run(args);
  assert.equal(ambiguous.choices.length, 2);
  assert.ok(ambiguous.needsInformation[0].includes("ngành và khóa"));
  assert.equal((await f.store.list("curriculumAssignments")).length, 0);
  assert.equal((await f.store.list("curriculumBatches")).length, 0);
});
test("Curriculum batch HTTP: authenticated preview/confirm, ownership and role checks", async () => {
  const f = await fixture(),
    server = createApp({
      store: f.store,
      config: { origin: "http://localhost", ai: {} },
      mode: "demo",
      aiProvider: {},
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`,
    cookies = {};
  try {
    for (const key of ["manager", "staff", "teacher", "student"]) {
      const token = randomBytes(32).toString("hex");
      cookies[key] = `lizz_session=${token}`;
      await f.store.insert("sessions", {
        tokenHash: tokenHash(token),
        accountId: f[key].id,
        accountVersion: 1,
        expiresAt: Date.now() + 60000,
      });
    }
    const post = (path, body, key = "manager", origin = "http://localhost") =>
      fetch(base + "/api/v1/curricula/" + path, {
        method: "POST",
        headers: {
          Cookie: cookies[key] || "",
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await post("assignment-batches/preview", f.input(), "none")).status,
      401,
    );
    for (const k of ["teacher", "student"])
      assert.equal(
        (await post("assignment-batches/preview", f.input(), k)).status,
        403,
      );
    const response = await post(
      "assignment-batches/preview",
      f.input(),
      "staff",
    );
    assert.equal(response.status, 200);
    const preview = await response.json(),
      body = {
        ...f.input(),
        confirm: true,
        requestId: randomUUID(),
        previewHash: preview.previewHash,
      };
    assert.equal(
      (await post("assignment-batches", body, "staff", "https://other.invalid"))
        .status,
      403,
    );
    assert.equal((await post("assignment-batches", body, "staff")).status, 201);
    assert.equal(
      (await (await post("assignment-batches", body, "staff")).json()).replayed,
      true,
    );
    const doc = await fetch(base + "/api/v1/curricula", {
      headers: { Cookie: cookies.student },
    });
    const own = await doc.json();
    assert.equal(own.assignments.length, 1);
    assert.equal(own.students.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
