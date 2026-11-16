import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import {
  createTask,
  updateTask,
  workflowOverview,
  proposeTransfer,
  decideApproval,
  applyApproval,
} from "../../backend/local/modules/workflows/workflow.service.js";
import { updateStudent } from "../../backend/local/modules/students/student.service.js";
import {
  planAction,
  executeAction,
} from "../../backend/local/modules/ai/ai.actions.js";
async function fixture() {
  const store = new MemoryStore();
  const account = (role) => ({
    id: randomUUID(),
    role,
    fullName: role,
    email: randomUUID() + "@example.test",
    username: randomUUID(),
    active: true,
    version: 1,
  });
  const manager = account("MANAGER"),
    staff = account("STAFF"),
    other = account("STAFF"),
    student = account("STUDENT");
  for (const a of [manager, staff, other, student])
    await store.insert("accounts", a);
  const source = { id: randomUUID(), code: "IT01", capacity: 30, version: 1 },
    target = { id: randomUUID(), code: "IT02", capacity: 1, version: 1 };
  await store.insert("classes", source);
  await store.insert("classes", target);
  const profile = {
    id: randomUUID(),
    accountId: student.id,
    code: "SV001",
    fullName: "Mai Lan",
    classId: source.id,
    version: 1,
  };
  await store.insert("students", profile);
  const input = {
    requestId: randomUUID(),
    studentId: profile.id,
    classId: target.id,
    studentVersion: 1,
    reason: "Điều chỉnh theo đơn sinh viên",
  };
  return {
    store,
    manager,
    staff,
    other,
    student,
    source,
    target,
    profile,
    input,
  };
}
async function approved(f) {
  const { row } = await proposeTransfer(f.store, f.input, f.staff);
  return decideApproval(
    f.store,
    row.id,
    { version: row.version, decision: "APPROVED", reason: "Đã kiểm tra đơn" },
    f.manager,
  );
}
test("Workflow: assignment is scoped, reassignment requires manager and stale updates fail", async () => {
  const f = await fixture();
  const input = {
    title: "Kiểm tra hồ sơ",
    assignedTo: f.staff.id,
    dueDate: "2027-01-20",
    priority: "HIGH",
  };
  await assert.rejects(createTask(f.store, input, f.staff));
  await assert.rejects(
    createTask(f.store, { ...input, dueDate: "2027-02-30" }, f.manager),
  );
  const task = await createTask(f.store, input, f.manager);
  assert.equal((await workflowOverview(f.store, f.other)).tasks.length, 0);
  await assert.rejects(
    updateTask(f.store, task.id, { version: 1, status: "COMPLETED" }, f.other),
  );
  await assert.rejects(
    updateTask(
      f.store,
      task.id,
      { version: 1, assignedTo: f.other.id, reason: "Bàn giao" },
      f.staff,
    ),
  );
  await updateTask(
    f.store,
    task.id,
    { version: 1, status: "IN_PROGRESS" },
    f.staff,
  );
  await assert.rejects(
    updateTask(f.store, task.id, { version: 1, status: "WAITING" }, f.staff),
    /thay đổi/,
  );
  await updateTask(
    f.store,
    task.id,
    { version: 2, assignedTo: f.other.id, reason: "Bàn giao phụ trách" },
    f.manager,
  );
  assert.equal((await workflowOverview(f.store, f.staff)).tasks.length, 0);
  assert.equal((await workflowOverview(f.store, f.other)).tasks.length, 1);
});
test("Workflow: proposal, decision and confirmed application are separate; retries apply once", async () => {
  const f = await fixture();
  const row = await approved(f);
  assert.equal((await f.store.list("students"))[0].classId, f.source.id);
  await assert.rejects(
    applyApproval(f.store, row.id, { version: 2 }, f.staff),
    /xác nhận/,
  );
  await assert.rejects(
    applyApproval(f.store, row.id, { version: 2, confirm: true }, f.other),
  );
  const outcomes = await Promise.all([
    applyApproval(f.store, row.id, { version: 2, confirm: true }, f.staff),
    applyApproval(f.store, row.id, { version: 2, confirm: true }, f.staff),
  ]);
  assert.equal(outcomes.filter((r) => r.replayed).length, 1);
  assert.equal((await f.store.list("students"))[0].version, 2);
  assert.equal(
    (await f.store.list("events")).filter(
      (e) => e.action === "APPROVAL_APPLIED",
    ).length,
    1,
  );
});
test("Workflow: staff cannot bypass approval through profile update or a forged request context", async () => {
  const f = await fixture();
  const changes = { ...f.profile, classId: f.target.id };
  await assert.rejects(
    updateStudent(f.store, f.profile.id, changes, f.staff),
    /phê duyệt/,
  );
  await assert.rejects(
    updateStudent(f.store, f.profile.id, changes, f.staff, {
      approvedRequestId: randomUUID(),
    }),
    /phê duyệt/,
  );
  await proposeTransfer(f.store, f.input, f.staff);
  await assert.rejects(
    updateStudent(f.store, f.profile.id, changes, f.staff, {
      approvedRequestId: f.input.requestId,
    }),
    /phê duyệt/,
  );
  assert.equal((await f.store.list("students"))[0].classId, f.source.id);
});
test("Workflow: self approval, conflicting retry, role escalation and pending application are blocked", async () => {
  const f = await fixture();
  await assert.rejects(proposeTransfer(f.store, f.input, f.student));
  const { row } = await proposeTransfer(f.store, f.input, f.manager);
  await assert.rejects(
    decideApproval(
      f.store,
      row.id,
      { version: 1, decision: "APPROVED", reason: "Tự duyệt" },
      f.manager,
    ),
    /không tự/,
  );
  await assert.rejects(
    proposeTransfer(
      f.store,
      { ...f.input, reason: "Nội dung khác" },
      f.manager,
    ),
    /nội dung khác/,
  );
  await assert.rejects(
    applyApproval(f.store, row.id, { version: 1, confirm: true }, f.manager),
    /đã được duyệt/,
  );
});
test("Workflow: changed student or full destination blocks application without losing decision", async () => {
  for (const kind of ["student", "capacity"]) {
    const f = await fixture();
    const row = await approved(f);
    if (kind === "student")
      await f.store.update(
        "students",
        f.profile.id,
        { fullName: "Tên đã sửa" },
        1,
      );
    else
      await f.store.insert("students", {
        id: randomUUID(),
        accountId: randomUUID(),
        code: "SV002",
        classId: f.target.id,
        version: 1,
      });
    await assert.rejects(
      applyApproval(f.store, row.id, { version: 2, confirm: true }, f.staff),
      kind === "student" ? /thay đổi/ : /sĩ số/,
    );
    assert.equal((await f.store.list("approvals"))[0].status, "APPROVED");
    assert.equal((await f.store.list("students"))[0].classId, f.source.id);
  }
});
test("Workflow: audit failure rolls back profile and approval together", async () => {
  const f = await fixture();
  const row = await approved(f);
  const original = f.store.insert;
  f.store.insert = async function (kind, value) {
    if (kind === "events" && value.action === "APPROVAL_APPLIED")
      throw Error("Audit unavailable");
    return original.call(this, kind, value);
  };
  await assert.rejects(
    applyApproval(f.store, row.id, { version: 2, confirm: true }, f.staff),
    /Audit/,
  );
  assert.equal((await f.store.list("students"))[0].classId, f.source.id);
  assert.equal((await f.store.list("approvals"))[0].status, "APPROVED");
});
test("LizzChat: staff transfer asks for reason and confirmation submits approval without moving student", async () => {
  const f = await fixture();
  const args = { studentCode: "SV001", classCode: "IT02" };
  assert.ok(
    (await planAction(f.store, "prepare_student_change", args, f.staff))
      .needsInformation,
  );
  const plan = await planAction(
    f.store,
    "prepare_student_change",
    { ...args, reason: "Theo đơn sinh viên" },
    f.staff,
  );
  assert.equal(plan.action, "SUBMIT_TRANSFER");
  assert.equal((await f.store.list("approvals")).length, 0);
  await executeAction(f.store, { ...plan, id: randomUUID() }, f.staff);
  assert.equal((await f.store.list("approvals"))[0].status, "PENDING");
  assert.equal((await f.store.list("students"))[0].classId, f.source.id);
});
test("MySQL workflow mapping binds payload and decision values, does not interpolate input", async () => {
  const calls = [];
  const connection = {
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return [{ affectedRows: 1 }];
    },
  };
  const store = new MysqlStore(connection, true);
  const value = "'; DROP TABLE accounts; --";
  await store.insert("tasks", {
    id: randomUUID(),
    title: value,
    assignedTo: randomUUID(),
    assignedBy: randomUUID(),
    dueDate: "2027-01-20",
    priority: "HIGH",
    status: "NEW",
    notes: "",
    version: 1,
  });
  await store.update(
    "approvals",
    randomUUID(),
    { status: "APPROVED", decisionReason: value, result: { safe: true } },
    1,
  );
  assert.ok(calls[0].sql.includes("work_items"));
  assert.ok(calls[1].sql.includes("approval_requests"));
  assert.ok(calls.every((c) => !c.sql.includes(value)));
  assert.ok(calls.every((c) => c.params.includes(value)));
});

test("Workflow HTTP: authentication, Origin, manager assignment and staff visibility are enforced", async (t) => {
  const { once } = await import("node:events");
  const { tokenHash } = await import("../../backend/local/core/password.js");
  const { createApp } = await import("../../backend/local/app.js");
  const f = await fixture(),
    origin = "http://localhost:3000";
  for (const [account, token] of [
    [f.manager, "a".repeat(64)],
    [f.staff, "b".repeat(64)],
    [f.other, "c".repeat(64)],
    [f.student, "d".repeat(64)],
  ])
    await f.store.insert("sessions", {
      tokenHash: tokenHash(token),
      accountId: account.id,
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
    "http://127.0.0.1:" + server.address().port + "/api/v1/workflows";
  const headers = (token) => ({
    Cookie: "lizz_session=" + token.repeat(64),
    Origin: origin,
    "Content-Type": "application/json",
  });
  const input = {
    title: "Đối chiếu hồ sơ",
    assignedTo: f.staff.id,
    dueDate: "2027-01-20",
    priority: "NORMAL",
  };
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: headers("d") })).status, 403);
  assert.equal(
    (
      await fetch(base + "/tasks", {
        method: "POST",
        headers: headers("b"),
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/tasks", {
        method: "POST",
        headers: { ...headers("a"), Origin: "https://bad.test" },
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/tasks", {
        method: "POST",
        headers: headers("a"),
        body: JSON.stringify(input),
      })
    ).status,
    201,
  );
  assert.equal(
    (await (await fetch(base, { headers: headers("b") })).json()).tasks.length,
    1,
  );
  assert.equal(
    (await (await fetch(base, { headers: headers("c") })).json()).tasks.length,
    0,
  );
});
