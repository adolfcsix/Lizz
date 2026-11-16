import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { transferFixture } from "./curriculum-transfer-fixture.js";
import {
  currentStudyState,
  previewStudyStatus,
  submitStudyStatus,
  changeStudyStatus,
  studyStatusOverview,
} from "../../backend/local/modules/students/student-status.service.js";
import {
  registerSection,
  checkRegistration,
} from "../../backend/local/modules/academic/academic.service.js";
import { planAcademicAction } from "../../backend/local/modules/academic/academic.ai.js";
import { fingerprint } from "../../backend/local/modules/ai/ai.actions.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { notificationOverview } from "../../backend/local/modules/notifications/notification.service.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (n) => (e) => e.status === n;
async function fixture() {
  const f = await transferFixture();
  f.input = (kind = "LEAVE") => ({
    studentId: f.profiles[0].id,
    termId: f.term.id,
    kind,
  });
  f.preview = (kind = "LEAVE", actor = f.student) =>
    previewStudyStatus(f.store, f.input(kind), actor);
  f.body = async (kind = "LEAVE", actor = f.student) => ({
    ...f.input(kind),
    requestId: randomUUID(),
    confirm: true,
    reviewHash: (await f.preview(kind, actor)).reviewHash,
    reason: "Đề nghị xử lý theo quy chế học vụ",
  });
  f.submit = (body, actor = f.student) =>
    submitStudyStatus(f.store, body, actor);
  f.change = (
    row,
    action,
    actor = action === "review" || action === "apply" ? f.staff : f.manager,
    patch = {},
  ) =>
    changeStudyStatus(
      f.store,
      row.id,
      {
        version: row.version,
        confirm: true,
        reason: "Đã đối chiếu hồ sơ và căn cứ",
        ...patch,
      },
      actor,
      action,
    );
  f.approve = async (kind = "LEAVE") => {
    const p = (await f.submit(await f.body(kind))).row,
      r = (await f.change(p, "review")).row;
    return (await f.change(r, "approve")).row;
  };
  return f;
}
test("Study status: legacy state preserves registration; preview and pending/review/approval do not change state", async () => {
  const f = await fixture();
  assert.deepEqual(await currentStudyState(f.store, f.profiles[0].id), {
    state: "ACTIVE",
    sequence: 0,
    requestId: null,
    appliedAt: null,
    hasDecision: false,
  });
  const data = structuredClone(f.store.data);
  await f.preview();
  assert.deepEqual(f.store.data, data);
  await f.approve();
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).state,
    "ACTIVE",
  );
  assert.ok(await checkRegistration(f.store, f.section.id, f.student));
});
test("Study status: applied leave blocks new registration/UI eligibility/AI and return restores eligibility without changing original data", async () => {
  const f = await fixture(),
    before = structuredClone(f.store.data),
    a = await f.approve();
  await f.change(a, "apply");
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).state,
    "ON_LEAVE",
  );
  await assert.rejects(
    checkRegistration(f.store, f.section.id, f.student),
    status(409),
  );
  await assert.rejects(
    registerSection(
      f.store,
      { sectionId: f.section.id, requestId: randomUUID() },
      f.student,
    ),
    status(409),
  );
  await assert.rejects(
    planAcademicAction(
      f.store,
      "prepare_course_registration",
      { sectionCode: f.section.code },
      f.student,
    ),
    status(409),
  );
  for (const k of [
    "students",
    "classes",
    "curriculumAssignments",
    "enrollments",
    "grades",
    "charges",
  ])
    assert.deepEqual(await f.store.list(k), before[k]);
  const back = await f.approve("RETURN");
  await f.change(back, "apply");
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).sequence,
    2,
  );
  assert.ok(await checkRegistration(f.store, f.section.id, f.student));
});
test("Study status: return needs applied leave, duplicate leave disallowed; no date-based automatic return", async () => {
  const f = await fixture();
  await assert.rejects(f.preview("RETURN"), status(409));
  const a = await f.approve();
  await f.change(a, "apply");
  await assert.rejects(f.preview("LEAVE"), status(409));
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).state,
    "ON_LEAVE",
  );
});
test("Study status: all write steps require confirmation/reason/version; submit binds review and UUID", async () => {
  const f = await fixture(),
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
  const p = (await f.submit(body)).row;
  await assert.rejects(
    f.change(p, "review", f.staff, { confirm: false }),
    status(400),
  );
  await assert.rejects(
    f.change(p, "review", f.staff, { reason: "" }),
    status(400),
  );
  await assert.rejects(
    f.change(p, "review", f.staff, { version: 3 }),
    status(409),
  );
});
test("Study status: student own records only, lecturer forbidden, staff cannot approve, reviewers/proposers cannot self approve", async () => {
  const f = await fixture();
  await assert.rejects(f.preview("LEAVE", f.student2), status(404));
  await assert.rejects(f.preview("LEAVE", f.teacher), status(403));
  const p = (await f.submit(await f.body())).row;
  await assert.rejects(f.change(p, "review", f.student), status(403));
  assert.equal((await studyStatusOverview(f.store, f.student2)).rows.length, 0);
  const r = (await f.change(p, "review")).row;
  await assert.rejects(f.change(r, "approve", f.staff), status(403));
  const g = await fixture(),
    q = (await g.submit(await g.body("LEAVE", g.manager), g.manager)).row,
    rr = (await g.change(q, "review")).row;
  await assert.rejects(g.change(rr, "approve", g.manager), status(403));
  const h = await fixture(),
    p2 = (await h.submit(await h.body())).row,
    r2 = (await h.change(p2, "review", h.manager)).row;
  await assert.rejects(h.change(r2, "approve", h.manager), status(403));
});
test("Study status: faculty staff reviews and applies within scope; scope revocation hides and blocks; unrelated staff cannot apply", async () => {
  const f = await fixture();
  await f.store.update(
    "staffScopes",
    f.grantId,
    { scopeType: "FACULTY", facultyId: f.facultyId },
    1,
  );
  const a = await f.approve();
  assert.equal(
    (await studyStatusOverview(f.store, f.staff)).rows[0].deciderName,
    f.manager.fullName,
  );
  const other = {
    ...f.staff,
    id: randomUUID(),
    username: "other",
    email: "other@example.test",
  };
  await f.store.insert("accounts", other);
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: other.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  });
  await assert.rejects(f.change(a, "apply", other), status(403));
  await f.store.update("staffScopes", f.grantId, { active: false }, 2);
  assert.equal((await studyStatusOverview(f.store, f.staff)).rows.length, 0);
  await assert.rejects(f.change(a, "apply"), status(404));
  assert.equal((await f.change(a, "apply", f.manager)).row.status, "APPLIED");
});
test("Study status: duplicate pending checked across actors; concurrent submit/apply commits once; replay does not add history or decisions", async () => {
  const f = await fixture(),
    body = await f.body(),
    r = await Promise.allSettled([
      f.submit(body),
      f.submit({ ...body, requestId: randomUUID() }),
    ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await f.submit(body)).replayed, true);
  await assert.rejects(f.submit({ ...body, reason: "Khác" }), status(409));
  const p = (await f.store.list("statusRequests"))[0],
    reviewed = (await f.change(p, "review")).row,
    a = (await f.change(reviewed, "approve")).row,
    results = await Promise.all([f.change(a, "apply"), f.change(a, "apply")]);
  assert.equal(results.filter((x) => !x.replayed).length, 1);
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).sequence,
    1,
  );
  assert.equal(results[1].row.payload.history.length, 4);
});
test("Study status: changed student, term or enrollment invalidates every boundary without changing active state", async () => {
  for (const stage of ["submit", "review", "approve", "apply"])
    for (const kind of ["student", "term", "enrollment"]) {
      const f = await fixture(),
        body = await f.body();
      let row;
      if (stage !== "submit") row = (await f.submit(body)).row;
      if (["approve", "apply"].includes(stage))
        row = (await f.change(row, "review")).row;
      if (stage === "apply") row = (await f.change(row, "approve")).row;
      if (kind === "student")
        await f.store.update(
          "students",
          f.profiles[0].id,
          { fullName: "Tên thay đổi" },
          1,
        );
      if (kind === "term")
        await f.store.update(
          "terms",
          f.term.id,
          { name: "Học kỳ cập nhật" },
          1,
        );
      if (kind === "enrollment") await f.enroll();
      await assert.rejects(
        stage === "submit" ? f.submit(body) : f.change(row, stage),
        status(409),
      );
      assert.equal(
        (await currentStudyState(f.store, f.profiles[0].id)).state,
        "ACTIVE",
      );
    }
});
test("Study status: student cancels own pending; reviewed/approved requires manager cancellation, rejected/applied terminal", async () => {
  const f = await fixture(),
    p = (await f.submit(await f.body())).row;
  assert.equal(
    (await f.change(p, "cancel", f.student)).row.status,
    "CANCELLED",
  );
  const q = (await f.submit(await f.body())).row,
    r = (await f.change(q, "review")).row;
  await assert.rejects(f.change(r, "cancel", f.student), status(403));
  assert.equal((await f.change(r, "reject")).row.status, "REJECTED");
  const a = await f.approve();
  assert.equal((await f.change(a, "cancel")).row.status, "CANCELLED");
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).state,
    "ACTIVE",
  );
});
test("Study status: audit/notification failure rolls back status, history and notices together", async () => {
  for (const table of ["events", "notifications"]) {
    const f = await fixture(),
      a = await f.approve(),
      before = structuredClone(f.store.data),
      insert = f.store.insert;
    f.store.insert = async function (k, r) {
      if (k === table) throw Error("write failure");
      return insert.call(this, k, r);
    };
    await assert.rejects(f.change(a, "apply"), /write failure/);
    assert.deepEqual(f.store.data, before);
  }
});
test("Study status: existing successful registration retry returns original result while leave blocks a new request", async () => {
  const f = await fixture(),
    body = { sectionId: f.section.id, requestId: randomUUID() },
    registered = await registerSection(f.store, body, f.student),
    a = await f.approve();
  await f.change(a, "apply");
  assert.equal(
    (await registerSection(f.store, body, f.student)).row.id,
    registered.row.id,
  );
  assert.equal((await f.store.list("enrollments")).length, 1);
  await assert.rejects(
    registerSection(f.store, { ...body, requestId: randomUUID() }, f.student),
    status(409),
  );
});
test("Study status: notifications target manager/student/reviewer and still enforce source scope", async () => {
  const f = await fixture(),
    p = (await f.submit(await f.body())).row;
  assert.ok(
    (await notificationOverview(f.store, f.manager)).rows.some(
      (r) => r.kind === "STUDY_STATUS",
    ),
  );
  const r = (await f.change(p, "review")).row,
    a = (await f.change(r, "approve")).row;
  assert.ok(
    (await notificationOverview(f.store, f.student)).rows.some(
      (r) => r.kind === "STUDY_STATUS",
    ),
  );
  await f.change(a, "apply");
  assert.ok(
    (await notificationOverview(f.store, f.staff)).rows.some(
      (r) => r.kind === "STUDY_STATUS",
    ),
  );
  assert.equal(
    (await notificationOverview(f.store, f.student2)).rows.length,
    0,
  );
});
test("Study status AI: scoped lookup omits private reasons, asks for exact student and fingerprints invalidate prepared work", async () => {
  const f = await fixture(),
    ai = new AiService(f.store, {}),
    run = (actor, args = {}) =>
      ai.runTool("lookup_study_status", args, actor, [], [], randomUUID()),
    before = await fingerprint(f.store);
  assert.ok((await run(f.manager)).needsInformation);
  assert.ok(
    (await run(f.student2, { studentCode: f.profiles[0].code }))
      .needsInformation,
  );
  await assert.rejects(run(f.teacher), status(403));
  const a = await f.approve();
  await f.change(a, "apply");
  assert.notEqual(await fingerprint(f.store), before);
  const data = await run(f.student);
  assert.equal(data.student.state, "ON_LEAVE");
  assert.equal(data.rows.length, 1);
  assert.ok(!JSON.stringify(data).includes("Đề nghị xử lý"));
  assert.ok(!JSON.stringify(data).includes("reviewHash"));
});
test("Study status SQL: declared table, reviewer field, JSON history and optimistic version use bound parameters", async () => {
  const calls = [],
    connection = {
      query: async (q) => {
        calls.push(q);
        return [
          [{ id: "x", reviewed_by: "a", payload_json: '{"history":[]}' }],
        ];
      },
      execute: async (q, v) => {
        calls.push({ q, v });
        return [{ affectedRows: 1 }];
      },
    };
  const store = new MysqlStore(connection);
  assert.equal((await store.list("statusRequests"))[0].reviewedBy, "a");
  await store.update(
    "statusRequests",
    "x",
    {
      reviewedBy: "b",
      payload: { history: [{ reason: "x'" }] },
      status: "REVIEWED",
    },
    1,
  );
  assert.ok(calls[0].includes("student_status_requests"));
  assert.ok(calls[1].q.includes("version=version+1"));
  assert.ok(!calls[1].q.includes("x'"));
  assert.ok(
    calls[1].v.some((v) => typeof v === "string" && v.includes("history")),
  );
});
test("Study status HTTP: Origin/authentication, four-role read and submit/review/approve/apply/registration hold", async () => {
  const f = await fixture(),
    server = createApp({
      store: f.store,
      config: { origin: "http://localhost", ai: {} },
      aiProvider: {},
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1",
    cookies = {};
  try {
    for (const a of [f.manager, f.staff, f.teacher, f.student, f.student2]) {
      const token = randomBytes(32).toString("hex");
      cookies[a.id] = "lizz_session=" + token;
      await f.store.insert("sessions", {
        tokenHash: tokenHash(token),
        accountId: a.id,
        accountVersion: 1,
        expiresAt: Date.now() + 60000,
      });
    }
    const send = async (actor, path, body, origin = "http://localhost") => {
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
    assert.equal((await fetch(base + "/student-status")).status, 401);
    assert.equal((await send(f.teacher, "/student-status")).status, 403);
    const preview = await send(f.student, "/student-status/preview", f.input());
    const body = {
      ...f.input(),
      requestId: randomUUID(),
      reviewHash: preview.data.reviewHash,
      confirm: true,
      reason: "Căn cứ học vụ",
    };
    assert.equal(
      (await send(f.student, "/student-status", body, "https://other.test"))
        .status,
      403,
    );
    const p = await send(f.student, "/student-status", body);
    assert.equal(p.status, 201);
    assert.equal(
      (await send(f.student2, "/student-status")).data.rows.length,
      0,
    );
    const path = "/student-status/" + p.data.row.id;
    assert.equal(
      (
        await send(f.staff, path + "/review", {
          version: 1,
          confirm: true,
          reason: "Kiểm tra",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await send(f.staff, path + "/approve", {
          version: 2,
          confirm: true,
          reason: "Duyệt",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await send(f.manager, path + "/approve", {
          version: 2,
          confirm: true,
          reason: "Duyệt",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await send(f.staff, path + "/apply", {
          version: 3,
          confirm: true,
          reason: "Áp dụng",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await send(
          f.student,
          "/academics/sections/" + f.section.id + "/eligibility",
        )
      ).status,
      409,
    );
    assert.equal(
      (await send(f.student, "/student-status")).data.students[0].state,
      "ON_LEAVE",
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("Study status: existing published grades and finance remain readable; leave does not silently withdraw and withdrawal stays explicit", async () => {
  const f = await fixture(),
    registered = await f.enroll(),
    grade = {
      id: randomUUID(),
      enrollmentId: registered.row.id,
      enrollmentVersion: 1,
      status: "PUBLISHED",
      score: 8,
      passScore: 5,
      version: 1,
    };
  await f.store.insert("grades", grade);
  await f.bill();
  const grades = await f.store.list("grades"),
    charges = await f.store.list("charges"),
    a = await f.approve();
  await f.change(a, "apply");
  assert.deepEqual(await f.store.list("grades"), grades);
  assert.deepEqual(await f.store.list("charges"), charges);
  assert.equal((await f.store.list("enrollments"))[0].status, "ACTIVE");
  const { studyHistory } =
    await import("../../backend/local/modules/academic/study-attempts.service.js");
  assert.equal((await studyHistory(f.store, f.student)).rows[0].score, 8);
  const { withdrawSection } =
    await import("../../backend/local/modules/academic/academic.service.js");
  await assert.rejects(
    withdrawSection(
      f.store,
      registered.row.id,
      { version: 1, requestId: randomUUID() },
      f.student,
    ),
    status(409),
  );
  const g = await fixture(),
    enrolled = await g.enroll(),
    leave = await g.approve();
  await g.change(leave, "apply");
  await withdrawSection(
    g.store,
    enrolled.row.id,
    { version: 1, requestId: randomUUID() },
    g.student,
  );
  assert.equal((await g.store.list("enrollments"))[0].status, "WITHDRAWN");
  assert.equal(
    (await currentStudyState(f.store, f.profiles[0].id)).state,
    "ON_LEAVE",
  );
});
