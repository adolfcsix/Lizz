import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  createTask,
  updateTask,
} from "../../backend/local/modules/workflows/workflow.service.js";
import {
  createProfileRequest,
  changeProfileRequest,
} from "../../backend/local/modules/students/profile-request.service.js";
import {
  notificationOverview,
  markNotifications,
} from "../../backend/local/modules/notifications/notification.service.js";
import { audit } from "../../backend/local/modules/academic/academic.common.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
const status = (v) => (e) => e.status === v;
async function fixture() {
  const f = await serviceFixture();
  f.facultyId = randomUUID();
  f.majorId = randomUUID();
  f.cohortId = randomUUID();
  for (const [kind, row] of [
    ["faculties", { id: f.facultyId, name: "Khoa", version: 1 }],
    ["majors", { id: f.majorId, facultyId: f.facultyId, version: 1 }],
    ["cohorts", { id: f.cohortId, version: 1 }],
    [
      "classes",
      {
        id: f.profiles[0].classId,
        majorId: f.majorId,
        cohortId: f.cohortId,
        version: 1,
      },
    ],
  ])
    await f.store.insert(kind, row);
  f.grant = {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  };
  await f.store.insert("staffScopes", f.grant);
  f.inbox = (actor = f.staff, query) =>
    notificationOverview(f.store, actor, query);
  f.task = () =>
    createTask(
      f.store,
      {
        title: "Đối chiếu hồ sơ sinh viên",
        assignedTo: f.staff.id,
        dueDate: "2020-01-01",
        priority: "HIGH",
        notes: "Nội dung nội bộ",
      },
      f.manager,
    );
  f.request = () =>
    createProfileRequest(
      f.store,
      {
        baseProfileVersion: 1,
        proposedContact: { phone: "0901234567", address: "Địa chỉ riêng" },
        reason: "Lý do riêng",
        confirm: true,
        requestId: randomUUID(),
      },
      f.student,
    );
  f.step = async (id, action, actor = f.staff) =>
    changeProfileRequest(
      f.store,
      id,
      {
        version: (await f.store.list("profileRequests")).find(
          (r) => r.id === id,
        ).version,
        reason: "Đã đối chiếu",
        confirm: true,
        requestId: randomUUID(),
      },
      actor,
      action,
    );
  return f;
}
test("Notifications: task assignment and completion notify the other role, source title/deadline remain current", async () => {
  const f = await fixture(),
    task = await f.task(),
    inbox = await f.inbox();
  assert.equal(inbox.unreadCount, 1);
  assert.equal(inbox.rows[0].overdue, true);
  assert.equal(inbox.rows[0].taskTitle, task.title);
  assert.equal((await f.inbox(f.manager)).total, 0);
  await updateTask(
    f.store,
    task.id,
    { version: 1, status: "COMPLETED" },
    f.staff,
  );
  assert.equal((await f.inbox()).rows[0].overdue, false);
  assert.equal((await f.inbox(f.manager)).rows[0].route, "tasks");
  assert.equal((await f.inbox(f.student)).total, 0);
});
test("Notifications: profile student–staff–manager workflow creates scoped notices without personal contact/reasons", async () => {
  const f = await fixture(),
    request = await f.request();
  assert.ok((await f.inbox(f.manager)).unreadCount > 0);
  assert.ok((await f.inbox()).unreadCount > 0);
  assert.equal((await f.inbox(f.teacher)).total, 0);
  await f.step(request.id, "receive");
  await f.step(request.id, "recommend");
  await f.step(request.id, "approve", f.manager);
  const student = await f.inbox(f.student);
  assert.ok(student.rows.some((r) => r.title.includes("duyệt và cập nhật")));
  assert.equal((await f.inbox(f.student2)).total, 0);
  for (const value of ["0901234567", "Địa chỉ riêng", "Lý do riêng"]) {
    assert.ok(
      !JSON.stringify(await f.store.list("notifications")).includes(value),
    );
    assert.ok(!JSON.stringify(student).includes(value));
  }
});
test("Notifications: staff audience and current scope are enforced again for unread counts and reads", async () => {
  const f = await fixture();
  await f.store.update(
    "staffScopes",
    f.grant.id,
    { scopeType: "FACULTY", facultyId: f.facultyId, cohortId: f.cohortId },
    1,
  );
  await f.request();
  const original = await f.inbox();
  assert.equal(original.total, 1);
  await f.store.update(
    "staffScopes",
    f.grant.id,
    { facultyId: randomUUID() },
    2,
  );
  assert.equal((await f.inbox()).unreadCount, 0);
  await assert.rejects(
    markNotifications(f.store, f.staff, {
      read: true,
      rows: original.rows.map(({ id, version }) => ({ id, version })),
    }),
    status(404),
  );
  const outside = await fixture();
  await outside.store.update(
    "staffScopes",
    outside.grant.id,
    { active: false },
    1,
  );
  await outside.request();
  assert.equal(
    (await outside.store.list("notifications")).filter(
      (r) => r.accountId === outside.staff.id,
    ).length,
    0,
  );
});
test("Notifications: read/unread is persistent, idempotent, versioned, owned and atomic for a page", async () => {
  const f = await fixture();
  await f.task();
  await f.request();
  const rows = (await f.inbox()).rows.map(({ id, version }) => ({
    id,
    version,
  }));
  assert.equal(
    (await markNotifications(f.store, f.staff, { read: true, rows })).count,
    2,
  );
  assert.equal(
    (await markNotifications(f.store, f.staff, { read: true, rows })).count,
    0,
  );
  assert.equal((await f.inbox()).unreadCount, 0);
  await assert.rejects(
    markNotifications(f.store, f.staff, { read: false, rows }),
    status(409),
  );
  const current = (await f.inbox()).rows.map(({ id, version }) => ({
    id,
    version,
  }));
  await assert.rejects(
    markNotifications(f.store, f.student, { read: false, rows: current }),
    status(404),
  );
  await assert.rejects(
    markNotifications(f.store, f.staff, {
      read: false,
      rows: [current[0], { id: randomUUID(), version: 1 }],
    }),
    status(404),
  );
  assert.equal((await f.inbox()).unreadCount, 0);
  await markNotifications(f.store, f.staff, { read: false, rows: current });
  assert.equal((await f.inbox()).unreadCount, 2);
});
test("Notifications: role changes and revoked accounts suppress earlier inbox data", async () => {
  const f = await fixture();
  await f.task();
  await f.store.update("accounts", f.staff.id, { role: "LECTURER" }, 1);
  await assert.rejects(f.inbox(), status(401));
  assert.equal(
    (await f.inbox({ ...f.staff, role: "LECTURER", version: 2 })).total,
    0,
  );
  await f.store.update("accounts", f.staff.id, { active: false }, 2);
  await assert.rejects(
    f.inbox({ ...f.staff, role: "LECTURER", version: 3 }),
    status(401),
  );
});
test("Notifications: grade publication, timetable and exam events reach assigned lecturer/active students only", async () => {
  const f = await fixture();
  await f.enroll();
  const enrollment = (await f.store.list("enrollments"))[0],
    gradeId = randomUUID();
  await f.store.insert("grades", {
    id: gradeId,
    enrollmentId: enrollment.id,
    enrollmentVersion: enrollment.version,
    status: "PUBLISHED",
    version: 1,
  });
  const examId = randomUUID();
  await f.store.insert("exams", {
    id: examId,
    sectionId: f.section.id,
    invigilatorId: f.teacher2.id,
    status: "PUBLISHED",
    version: 1,
  });
  await f.store.insert("timetablePlans", {
    id: randomUUID(),
    sectionId: f.section.id,
    version: 1,
  });
  for (const [action, id] of [
    ["GRADES_SUBMITTED", f.section.id],
    ["GRADES_PUBLISHED", f.section.id],
    ["EXAM_PUBLISHED", examId],
    ["TIMETABLE_SAVED", f.section.id],
  ])
    await f.store.transaction((tx) =>
      audit(tx, f.manager, action, id, { rows: [{ id: gradeId }] }),
    );
  assert.equal(
    (await f.inbox(f.student)).rows.filter((r) => r.kind === "GRADES").length,
    1,
  );
  assert.ok(
    (await f.inbox(f.teacher)).rows.some((r) => r.kind === "TIMETABLE"),
  );
  assert.equal((await f.inbox(f.teacher2)).rows[0].kind, "EXAM");
  assert.equal((await f.inbox(f.student2)).total, 0);
  const e = (await f.store.list("enrollments"))[0];
  await f.store.update("enrollments", e.id, { status: "WITHDRAWN" }, e.version);
  assert.equal((await f.inbox(f.student)).total, 0);
});
test("Notifications: publication excludes students without that published grade and old enrollment generations", async () => {
  const f = await fixture();
  await f.enroll();
  await f.enroll(f.student2);
  const enrollment = (await f.store.list("enrollments")).find(
      (e) => e.studentId === f.profiles[0].id,
    ),
    gradeId = randomUUID();
  await f.store.insert("grades", {
    id: gradeId,
    enrollmentId: enrollment.id,
    enrollmentVersion: enrollment.version,
    status: "PUBLISHED",
    version: 1,
  });
  await f.store.transaction((tx) =>
    audit(tx, f.manager, "GRADES_PUBLISHED", f.section.id, {
      rows: [{ id: gradeId }],
    }),
  );
  assert.equal((await f.inbox(f.student)).total, 1);
  assert.equal((await f.inbox(f.student2)).total, 0);
  await f.store.update(
    "enrollments",
    enrollment.id,
    { status: "WITHDRAWN" },
    enrollment.version,
  );
  await f.store.update(
    "enrollments",
    enrollment.id,
    { status: "ACTIVE" },
    enrollment.version + 1,
  );
  assert.equal((await f.inbox(f.student)).total, 0);
});
test("Notifications: delivery failure rolls back source task and audit", async () => {
  const f = await fixture(),
    insert = f.store.insert,
    before = (await f.store.list("events")).length;
  f.store.insert = async function (kind, row) {
    if (kind === "notifications") throw Error("inbox unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(f.task(), /inbox unavailable/);
  assert.equal((await f.store.list("tasks")).length, 0);
  assert.equal((await f.store.list("events")).length, before);
});
test("Notifications: filters, pagination and mark validation use only visible data", async () => {
  const f = await fixture();
  for (let i = 0; i < 22; i++) await f.task();
  const page = await f.inbox(
    f.staff,
    new URLSearchParams({
      page: "2",
      kind: "TASK",
      q: "doi chieu",
      status: "unread",
    }),
  );
  assert.equal(page.rows.length, 2);
  assert.equal(page.total, 22);
  assert.equal(page.unreadCount, 22);
  for (const input of [
    { read: true, rows: [] },
    { read: "true", rows: page.rows },
    { read: true, rows: [page.rows[0], page.rows[0]] },
    { read: true, rows: [{ id: "x", version: 0 }] },
  ])
    await assert.rejects(
      markNotifications(f.store, f.staff, input),
      status(400),
    );
});
test("Notifications SQL: envelope uses bound values, owner/event columns, and versioned read timestamp", async () => {
  const calls = [],
    tx = new MysqlStore({
      execute: async (sql, args) => {
        calls.push({ sql, args });
        return [{ affectedRows: 1 }];
      },
    });
  await tx.insert("notifications", {
    id: "id",
    eventId: "event",
    accountId: "recipient",
    recipientRole: "STAFF",
    kind: "TASK",
    entityId: "task",
    action: "TASK_CREATED",
    createdAt: 1,
    readAt: null,
    version: 1,
  });
  assert.match(calls[0].sql, /event_id,account_id,recipient_role/);
  assert.ok(!calls[0].sql.includes("recipient'"));
  await tx.update("notifications", "id", { readAt: 2 }, 1);
  assert.match(calls[1].sql, /read_at=\?.*version=version\+1.*version=\?/);
});
test("Notifications AI: reads own scoped inbox without marking read or accepting another user", async () => {
  const f = await fixture();
  await f.task();
  await f.request();
  const ai = new AiService(f.store, {}),
    sources = [];
  const lookup = (actor, args = {}) =>
    ai.runTool(
      "lookup_my_notifications",
      args,
      actor,
      [],
      sources,
      randomUUID(),
    );
  assert.equal((await lookup(f.staff, { status: "unread" })).total, 2);
  assert.equal((await f.inbox()).unreadCount, 2);
  assert.equal((await lookup(f.student2)).total, 0);
  await assert.rejects(lookup(f.staff, { accountId: f.student.id }));
  assert.ok(sources.at(-1).asOf);
  await f.store.update("staffScopes", f.grant.id, { active: false }, 1);
  assert.equal((await lookup(f.staff)).total, 1); // Công việc được giao vẫn thuộc người nhận, hồ sơ riêng không còn trong phạm vi.
});
test("Notifications HTTP: every role has its own inbox, writes check Origin, guests denied", async () => {
  const f = await fixture();
  await f.task();
  const server = createApp({
    store: f.store,
    config: { origin: "http://localhost", ai: {} },
    aiProvider: {},
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/v1`,
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
      const response = await fetch(base + "/notifications", {
        headers: { Cookie: cookies[key] },
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).total, key === "staff" ? 1 : 0);
    }
    assert.equal((await fetch(base + "/notifications")).status, 401);
    const rows = (await f.inbox()).rows.map(({ id, version }) => ({
      id,
      version,
    }));
    const send = (key, origin) =>
      fetch(base + "/notifications/read", {
        method: "POST",
        headers: {
          Cookie: cookies[key],
          Origin: origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ read: true, rows }),
      });
    assert.equal((await send("staff", "https://other.invalid")).status, 403);
    assert.equal((await send("student", "http://localhost")).status, 404);
    assert.equal((await send("staff", "http://localhost")).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
