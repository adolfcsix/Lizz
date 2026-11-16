import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { transferFixture } from "./curriculum-transfer-fixture.js";
import {
  curriculumTransferOverview,
  submitCurriculumTransfer,
} from "../../backend/local/modules/curriculum/curriculum-transfer.service.js";
import {
  assignCurriculum,
  curriculumProgress,
  curriculumForRegistration,
} from "../../backend/local/modules/curriculum/curriculum.service.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import { notificationOverview } from "../../backend/local/modules/notifications/notification.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (n) => (e) => e.status === n;
test("Program transfer: preview does not write, submit/approve do not replace, apply updates link preserving all source data", async () => {
  const f = await transferFixture(),
    original = structuredClone(f.store.data);
  const preview = await f.preview();
  assert.equal(preview.comparison.subjects[0].after.semester, 2);
  assert.deepEqual(f.store.data, original);
  const body = await f.body(),
    pending = (await f.submit(body)).row;
  assert.equal(
    (await f.store.list("curriculumAssignments"))[0].curriculumId,
    f.before.id,
  );
  const approved = (await f.change(pending, "approve")).row;
  assert.equal((await f.store.list("curriculumAssignments"))[0].version, 1);
  const applied = await f.change(approved, "apply");
  assert.equal(applied.row.status, "APPLIED");
  assert.equal(
    (await f.store.list("curriculumAssignments"))[0].curriculumId,
    f.after.id,
  );
  for (const k of ["students", "classes", "enrollments", "grades", "curricula"])
    assert.deepEqual(await f.store.list(k), original[k]);
  assert.equal(
    (await curriculumProgress(f.store, f.student, f.profiles[0].id)).curriculum
      .id,
    f.after.id,
  );
  assert.equal(
    (await curriculumForRegistration(f.store, f.profiles[0], f.section)).id,
    f.after.id,
  );
  assert.equal(
    (await curriculumTransferOverview(f.store, f.student)).rows[0].after.id,
    f.after.id,
  );
});
test("Program transfer: confirmation, reason, UUID and preview hash are mandatory", async () => {
  const f = await transferFixture(),
    body = await f.body();
  for (const patch of [
    { confirm: false },
    { reason: "" },
    { requestId: "x" },
    { reviewHash: "wrong" },
  ])
    await assert.rejects(
      f.submit({ ...body, ...patch }),
      status(patch.reviewHash ? 409 : 400),
    );
  assert.equal((await f.store.list("curriculumTransfers")).length, 0);
});
test("Program transfer: cannot self approve, staff cannot decide, students/lecturers cannot propose or read office records", async () => {
  const f = await transferFixture();
  await assert.rejects(f.preview(f.student), status(403));
  await assert.rejects(f.preview(f.teacher), status(403));
  const p = (await f.submit(await f.body())).row;
  await assert.rejects(f.change(p, "approve", f.staff), status(403));
  await assert.rejects(f.change(p, "apply"), status(409));
  assert.equal(
    (await curriculumTransferOverview(f.store, f.student)).rows.length,
    0,
  );
  await assert.rejects(
    curriculumTransferOverview(f.store, f.teacher),
    status(403),
  );
  const g = await transferFixture(),
    own = (await g.submit(await g.body(g.manager), g.manager)).row;
  await assert.rejects(g.change(own, "approve", g.manager), status(403));
});
test("Program transfer: original assignment retry returns original result; request/apply replay do not rewrite", async () => {
  const f = await transferFixture(),
    body = await f.body(),
    p = (await f.submit(body)).row,
    a = (await f.change(p, "approve")).row;
  await f.change(a, "apply");
  const original = await assignCurriculum(f.store, f.assignmentInput, f.staff);
  assert.deepEqual(original, f.assignment);
  assert.equal((await f.submit(body)).replayed, true);
  assert.equal((await f.change(a, "apply")).replayed, true);
  await assert.rejects(f.submit({ ...body, reason: "Khác" }), status(409));
  assert.equal((await f.store.list("curriculumAssignments"))[0].version, 2);
});
test("Program transfer: concurrent submissions have a single open request and concurrent apply writes once", async () => {
  const f = await transferFixture(),
    body = await f.body(),
    result = await Promise.allSettled([
      f.submit(body),
      f.submit({ ...body, requestId: randomUUID() }),
    ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  const p = (await f.store.list("curriculumTransfers"))[0],
    a = (await f.change(p, "approve")).row,
    r = await Promise.all([f.change(a, "apply"), f.change(a, "apply")]);
  assert.equal(r.filter((x) => !x.replayed).length, 1);
  assert.equal((await f.store.list("curriculumAssignments"))[0].version, 2);
});
test("Program transfer: source changes invalidate preview, approval and apply without touching active link", async () => {
  for (const stage of ["submit", "approve", "apply"])
    for (const kind of ["student", "class", "enrollment", "grade"]) {
      const f = await transferFixture(),
        e = {
          id: randomUUID(),
          studentId: f.profiles[0].id,
          sectionId: f.section.id,
          status: "ACTIVE",
          version: 1,
        };
      await f.store.insert("enrollments", e);
      const g = {
        id: randomUUID(),
        enrollmentId: e.id,
        enrollmentVersion: 1,
        score: 7,
        passScore: 5,
        status: "PUBLISHED",
        version: 1,
      };
      await f.store.insert("grades", g);
      const body = await f.body();
      let row;
      if (stage !== "submit") row = (await f.submit(body)).row;
      if (stage === "apply") row = (await f.change(row, "approve")).row;
      if (kind === "student")
        await f.store.update(
          "students",
          f.profiles[0].id,
          { fullName: "Đổi hồ sơ" },
          1,
        );
      if (kind === "class")
        await f.store.update(
          "classes",
          f.profiles[0].classId,
          { code: "Khác" },
          1,
        );
      if (kind === "enrollment")
        await f.store.update("enrollments", e.id, { status: "WITHDRAWN" }, 1);
      if (kind === "grade")
        await f.store.update("grades", g.id, { score: 8 }, 1);
      await assert.rejects(
        stage === "submit" ? f.submit(body) : f.change(row, stage),
        status(409),
      );
      assert.equal(
        (await f.store.list("curriculumAssignments"))[0].curriculumId,
        f.before.id,
      );
    }
});
test("Program transfer: draft, same/older edition, other program/major/cohort and missing assignment are rejected", async () => {
  for (const patch of [
    { status: "DRAFT" },
    { edition: 1 },
    { code: "OTHER" },
    { majorId: randomUUID() },
    { cohortId: randomUUID() },
  ]) {
    const f = await transferFixture();
    await f.store.update("curricula", f.after.id, patch, 2);
    await assert.rejects(f.preview(), status(409));
  }
  const f = await transferFixture();
  f.input.studentId = f.profiles[1].id;
  await assert.rejects(f.preview(), status(404));
});
test("Program transfer: reject/cancel/stale versions are terminal; manager can cancel stale approved request", async () => {
  const f = await transferFixture(),
    p = (await f.submit(await f.body())).row,
    r = (await f.change(p, "reject")).row;
  await assert.rejects(f.change(r, "apply"), status(409));
  await assert.rejects(f.change(p, "approve"), status(409));
  const q = (await f.submit(await f.body())).row,
    a = (await f.change(q, "approve")).row;
  await assert.rejects(f.change(a, "cancel", f.staff), status(409));
  const c = (await f.change(a, "cancel")).row;
  assert.equal(c.status, "CANCELLED");
  await assert.rejects(f.change(c, "apply"), status(409));
});
test("Program transfer: scoped staff cannot see others requests or bypass pending conflict; revocation blocks access", async () => {
  const f = await transferFixture(),
    other = {
      ...f.staff,
      id: randomUUID(),
      username: "staffOther",
      email: "staffOther@example.test",
    };
  await f.store.insert("accounts", other);
  const grant = {
    id: randomUUID(),
    accountId: other.id,
    scopeType: "FACULTY",
    facultyId: f.facultyId,
    active: true,
    version: 1,
  };
  await f.store.insert("staffScopes", grant);
  const p = (await f.submit(await f.body())).row;
  assert.equal(
    (await curriculumTransferOverview(f.store, other)).rows.length,
    0,
  );
  await assert.rejects(f.change(p, "cancel", other), status(404));
  await assert.rejects(f.submit(await f.body(other), other), status(409));
  await f.store.update("staffScopes", grant.id, { active: false }, 1);
  await assert.rejects(f.preview(other), status(404));
  assert.equal(
    (await curriculumTransferOverview(f.store, other)).rows.length,
    0,
  );
});
test("Program transfer: audit or notice insert failure rolls back link and status together", async () => {
  for (const kind of ["events", "notifications"]) {
    const f = await transferFixture(),
      p = (await f.submit(await f.body())).row,
      a = (await f.change(p, "approve")).row,
      original = structuredClone(f.store.data),
      insert = f.store.insert;
    f.store.insert = async function (k, r) {
      if (k === kind) throw Error("storage failure");
      return insert.call(this, k, r);
    };
    await assert.rejects(f.change(a, "apply"), /storage failure/);
    assert.deepEqual(f.store.data, original);
  }
});
test("Program transfer: notices go to manager/requester then own student; source and current role still govern visibility", async () => {
  const f = await transferFixture(),
    p = (await f.submit(await f.body())).row;
  assert.ok(
    (await notificationOverview(f.store, f.manager)).rows.some(
      (n) => n.kind === "PROGRAM_CHANGE",
    ),
  );
  assert.equal((await notificationOverview(f.store, f.student)).rows.length, 1); // initial assignment only
  const a = (await f.change(p, "approve")).row;
  assert.ok(
    (await notificationOverview(f.store, f.staff)).rows.some(
      (n) => n.kind === "PROGRAM_CHANGE",
    ),
  );
  await f.change(a, "apply");
  assert.ok(
    (await notificationOverview(f.store, f.student)).rows.some(
      (n) => n.kind === "PROGRAM_CHANGE",
    ),
  );
  assert.equal(
    (await notificationOverview(f.store, f.student2)).rows.length,
    0,
  );
});
test("Program transfer AI: own applied history only, exact code and scoped staff; lecturer denied", async () => {
  const f = await transferFixture(),
    ai = new AiService(f.store, {}),
    run = (actor, args = {}) =>
      ai.runTool(
        "lookup_curriculum_transfers",
        args,
        actor,
        [],
        [],
        randomUUID(),
      );
  assert.ok((await run(f.manager)).needsInformation);
  assert.equal((await run(f.student)).rows.length, 0);
  const p = (await f.submit(await f.body())).row,
    a = (await f.change(p, "approve")).row;
  await f.change(a, "apply");
  assert.equal((await run(f.student)).rows[0].after.id, f.after.id);
  assert.ok(
    (await run(f.student2, { studentCode: f.profiles[0].code }))
      .needsInformation,
  );
  await assert.rejects(run(f.teacher), status(403));
  assert.ok(!JSON.stringify(await run(f.student)).includes("requestHash"));
});
test("Program transfer SQL: declared table, JSON and versioned active-link update use bound parameters", async () => {
  const calls = [],
    connection = {
      query: async (q) => {
        calls.push(q);
        return [
          [
            {
              id: "r",
              payload_json: '{"assignment":{"id":"a"}}',
              preview_json: "{}",
            },
          ],
        ];
      },
      execute: async (q, v) => {
        calls.push({ q, v });
        return [{ affectedRows: 1 }];
      },
    };
  const store = new MysqlStore(connection);
  assert.equal(
    (await store.list("curriculumTransfers"))[0].payload.assignment.id,
    "a",
  );
  await store.insert("curriculumTransfers", {
    id: "r",
    studentId: "s",
    payload: { reason: "x'" },
    preview: {},
    status: "PENDING",
  });
  await store.update(
    "curriculumAssignments",
    "a",
    { curriculumId: "new", reason: "x'" },
    1,
  );
  assert.ok(calls[0].includes("curriculum_transfer_requests"));
  assert.ok(calls[2].q.includes("version=version+1"));
  assert.ok(!calls[2].q.includes("x'"));
  assert.equal(calls[1].v[2], '{"reason":"x\'"}');
});
test("Program transfer HTTP: authenticated four-role read, Origin, preview/submit/approve/apply and own history", async () => {
  const f = await transferFixture(),
    server = createApp({
      store: f.store,
      config: {
        origin: "http://127.0.0.1",
        sessionTtlMs: 3600000,
        ai: {},
        database: {},
      },
      mode: "demo",
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const tokens = {};
    for (const a of [f.manager, f.staff, f.student, f.teacher]) {
      tokens[a.role] = randomBytes(32).toString("hex");
      await f.store.insert("sessions", {
        tokenHash: tokenHash(tokens[a.role]),
        accountId: a.id,
        accountVersion: a.version,
        expiresAt: Date.now() + 60000,
      });
    }
    const req = async (
      path,
      role = "STAFF",
      body,
      origin = "http://127.0.0.1",
    ) => {
      const r = await fetch(base + "/api/v1/curricula" + path, {
        method: body ? "POST" : "GET",
        headers: {
          Cookie: "lizz_session=" + tokens[role],
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: r.status, data: await r.json() };
    };
    assert.equal(
      (await fetch(base + "/api/v1/curricula/transfers")).status,
      401,
    );
    assert.equal((await req("/transfers", "LECTURER")).status, 403);
    assert.equal((await req("/transfers", "STUDENT")).status, 200);
    const preview = await req("/transfers/preview", "STAFF", f.input);
    assert.equal(preview.status, 200);
    const body = {
      ...f.input,
      requestId: randomUUID(),
      confirm: true,
      reason: "Căn cứ đào tạo",
      reviewHash: preview.data.reviewHash,
    };
    assert.equal(
      (await req("/transfers", "STAFF", body, "https://other.test")).status,
      403,
    );
    const p = await req("/transfers", "STAFF", body);
    assert.equal(p.status, 201);
    assert.equal(
      (
        await req("/transfers/" + p.data.row.id + "/approve", "STAFF", {
          version: 1,
          confirm: true,
          reason: "Đồng ý",
        })
      ).status,
      403,
    );
    const a = await req("/transfers/" + p.data.row.id + "/approve", "MANAGER", {
      version: 1,
      confirm: true,
      reason: "Đồng ý",
    });
    assert.equal(a.status, 200);
    assert.equal(
      (
        await req("/transfers/" + p.data.row.id + "/apply", "STAFF", {
          version: 2,
          confirm: true,
          reason: "Áp dụng quyết định",
        })
      ).status,
      200,
    );
    assert.equal(
      (await req("/transfers", "STUDENT")).data.rows[0].after.id,
      f.after.id,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("Program transfer: removed enrolled subject is warned and preserved, subsequent registration uses target curriculum", async () => {
  const f = await transferFixture(),
    subjectId = randomUUID();
  await f.store.insert("subjects", {
    id: subjectId,
    code: "WEB",
    name: "Lập trình Web",
    credits: 3,
    version: 1,
  });
  const { saveCurriculum, publishCurriculum } =
    await import("../../backend/local/modules/curriculum/curriculum.service.js");
  const draft = await saveCurriculum(
    f.store,
    {
      ...f.definition,
      edition: 3,
      groups: [
        { ...f.definition.groups[0], subjects: [{ subjectId, semester: 2 }] },
      ],
    },
    f.manager,
  );
  const target = await publishCurriculum(
    f.store,
    draft.id,
    { version: 1, confirm: true },
    f.manager,
  );
  f.input.curriculumId = target.id;
  const e = {
    id: randomUUID(),
    studentId: f.profiles[0].id,
    sectionId: f.section.id,
    status: "ACTIVE",
    version: 1,
  };
  await f.store.insert("enrollments", e);
  const grade = {
    id: randomUUID(),
    enrollmentId: e.id,
    enrollmentVersion: 1,
    status: "PUBLISHED",
    score: 8,
    passScore: 5,
    version: 1,
  };
  await f.store.insert("grades", grade);
  const preview = await f.preview();
  assert.equal(preview.outside[0].enrollmentId, e.id);
  assert.ok(preview.comparison.subjects.some((s) => s.change === "REMOVED"));
  const p = (await f.submit(await f.body())).row,
    a = (await f.change(p, "approve")).row;
  await f.change(a, "apply");
  assert.deepEqual((await f.store.list("enrollments"))[0], e);
  assert.deepEqual((await f.store.list("grades"))[0], grade);
  await assert.rejects(
    curriculumForRegistration(f.store, f.profiles[0], f.section),
    status(409),
  );
  assert.equal(
    (await curriculumForRegistration(f.store, f.profiles[0], { subjectId })).id,
    target.id,
  );
});
test("Program transfer: original assignment replay remains stable after successive transfers by another staff member", async () => {
  const f = await transferFixture(),
    p = (await f.submit(await f.body())).row,
    a = (await f.change(p, "approve")).row;
  await f.change(a, "apply");
  const { saveCurriculum, publishCurriculum } =
    await import("../../backend/local/modules/curriculum/curriculum.service.js");
  const d = await saveCurriculum(
      f.store,
      { ...f.definition, edition: 3 },
      f.manager,
    ),
    next = await publishCurriculum(
      f.store,
      d.id,
      { version: 1, confirm: true },
      f.manager,
    );
  f.input.curriculumId = next.id;
  const other = {
    ...f.staff,
    id: randomUUID(),
    username: "staff3",
    email: "staff3@example.test",
  };
  await f.store.insert("accounts", other);
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: other.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  });
  const p2 = (await f.submit(await f.body(other), other)).row,
    a2 = (await f.change(p2, "approve")).row;
  await f.change(a2, "apply", other);
  assert.deepEqual(
    await assignCurriculum(f.store, f.assignmentInput, f.staff),
    f.assignment,
  );
  assert.equal((await f.store.list("curriculumAssignments"))[0].version, 3);
});

test("Program transfer: faculty-scoped requester can complete their own in-scope proposal and apply approved decision", async () => {
  const f = await transferFixture();
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId },
    1,
  );
  const p = (await f.submit(await f.body())).row;
  assert.equal(
    (await curriculumTransferOverview(f.store, f.staff)).rows.length,
    1,
  );
  const a = (await f.change(p, "approve")).row;
  assert.equal((await f.change(a, "apply")).row.status, "APPLIED");
  assert.equal(
    (await f.store.list("curriculumAssignments"))[0].curriculumId,
    f.after.id,
  );
});
