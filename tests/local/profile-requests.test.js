import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  cleanContact,
  createProfileRequest,
  changeProfileRequest,
  profileRequestOverview,
} from "../../backend/local/modules/students/profile-request.service.js";
import {
  importStudents,
  updateStudent,
  listStudents,
} from "../../backend/local/modules/students/student.service.js";
import {
  contactValues,
  profileActions,
} from "../../shared/profile-workflow.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const contact = {
  phone: "0901234567",
  personalEmail: "student@example.test",
  address: "Địa chỉ kiểm tra",
  emergencyName: "Người liên hệ",
  emergencyPhone: "0912345678",
  relationship: "Người thân",
};
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
    version: 1,
  });
  await f.store.insert("cohorts", { id: f.cohortId, version: 1 });
  for (const p of f.profiles)
    await f.store.insert("classes", {
      id: p.classId,
      majorId: f.majorId,
      cohortId: f.cohortId,
      version: 1,
    });
  f.staff2 = {
    id: randomUUID(),
    role: "STAFF",
    fullName: "Nhân viên khác",
    version: 1,
    active: true,
  };
  await f.store.insert("accounts", f.staff2);
  for (const a of [f.staff, f.staff2])
    await f.store.insert("staffScopes", {
      id: randomUUID(),
      accountId: a.id,
      scopeType: "ALL",
      facultyId: null,
      cohortId: null,
      active: true,
      version: 1,
    });
  f.input = () => ({
    baseProfileVersion: 1,
    proposedContact: contact,
    reason: "Cập nhật thông tin liên hệ",
    confirm: true,
    requestId: randomUUID(),
  });
  f.create = () => createProfileRequest(f.store, f.input(), f.student);
  f.row = async (id) =>
    (await f.store.list("profileRequests")).find((r) => r.id === id);
  f.step = async (id, action, actor = f.staff, extra = {}) =>
    changeProfileRequest(
      f.store,
      id,
      {
        version: (await f.row(id)).version,
        reason: "Đã đối chiếu thông tin",
        confirm: true,
        requestId: randomUUID(),
        ...extra,
      },
      actor,
      action,
    );
  f.recommended = async () => {
    const r = await f.create();
    await f.step(r.id, "receive");
    await f.step(r.id, "recommend");
    return r;
  };
  return f;
}
test("Profile contact: validates and normalizes optional contact fields, rejects protected fields and incomplete emergency pair", () => {
  assert.equal(
    cleanContact({
      ...contact,
      phone: "090 123 4567",
      personalEmail: "Student@Example.Test",
    }).phone,
    contact.phone,
  );
  assert.equal(
    cleanContact({ ...contact, personalEmail: "Student@Example.Test" })
      .personalEmail,
    "student@example.test",
  );
  for (const body of [
    null,
    [],
    { ...contact, role: "MANAGER" },
    { ...contact, phone: "invalid" },
    { ...contact, personalEmail: "bad" },
    { ...contact, emergencyPhone: "" },
    { ...contact, address: "a".repeat(501) },
  ])
    assert.throws(() => cleanContact(body));
  assert.deepEqual(cleanContact({}), contactValues());
});
test("Profile request: student submission is linked by session, cannot choose another student or mutate current profile", async () => {
  const f = await fixture(),
    r = await createProfileRequest(
      f.store,
      { ...f.input(), studentId: f.profiles[1].id },
      f.student,
    );
  assert.equal((await f.row(r.id)).studentId, f.profiles[0].id);
  assert.equal((await f.store.list("students"))[0].contactDetails, undefined);
});
test("Profile request: explicit confirm, valid reason, changed data and current profile version are required", async () => {
  const f = await fixture();
  for (const b of [
    { ...f.input(), confirm: false },
    { ...f.input(), reason: "" },
    { ...f.input(), baseProfileVersion: 0 },
    { ...f.input(), proposedContact: {} },
  ])
    await assert.rejects(createProfileRequest(f.store, b, f.student));
  assert.equal((await f.store.list("profileRequests")).length, 0);
});
test("Profile request: create retry is idempotent; another pending request or changed reused ID is rejected", async () => {
  const f = await fixture(),
    body = f.input(),
    r = await createProfileRequest(f.store, body, f.student);
  assert.equal((await createProfileRequest(f.store, body, f.student)).id, r.id);
  await assert.rejects(
    createProfileRequest(f.store, { ...body, reason: "Khác" }, f.student),
    /nội dung khác/,
  );
  await assert.rejects(f.create(), /chưa xử lý/);
});
test("Profile workflow: student → staff receive/recommend → manager apply updates only contact, preserves official identity/account/role", async () => {
  const f = await fixture(),
    original = (await f.store.list("students"))[0],
    r = await f.recommended();
  assert.equal((await f.store.list("students"))[0].contactDetails, undefined);
  await f.step(r.id, "approve", f.manager);
  const student = (await f.store.list("students"))[0];
  assert.deepEqual(student.contactDetails, contact);
  for (const k of ["accountId", "code", "fullName", "classId"])
    assert.equal(student[k], original[k]);
  assert.equal(student.version, 2);
  assert.equal((await f.row(r.id)).status, "APPLIED");
  assert.equal(
    (await f.store.list("accounts")).find((a) => a.id === f.student.id).role,
    "STUDENT",
  );
});
test("Profile workflow: staff cannot approve, student cannot review, lecturer cannot read or act", async () => {
  const f = await fixture(),
    r = await f.recommended();
  await assert.rejects(
    f.step(r.id, "approve", f.staff),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.step(r.id, "recommend", f.student),
    (e) => e.status === 403,
  );
  await assert.rejects(
    profileRequestOverview(f.store, f.teacher),
    (e) => e.status === 403,
  );
  await assert.rejects(
    f.step(r.id, "approve", f.teacher),
    (e) => e.status === 403,
  );
  assert.equal((await f.row(r.id)).status, "RECOMMENDED");
});
test("Profile workflow: only assigned staff can review; manager can take over explicitly with history", async () => {
  const f = await fixture(),
    r = await f.create();
  await f.step(r.id, "receive");
  await assert.rejects(
    f.step(r.id, "recommend", f.staff2),
    (e) => e.status === 403,
  );
  await f.step(r.id, "takeover", f.manager);
  await assert.rejects(
    f.step(r.id, "recommend", f.staff),
    (e) => e.status === 403,
  );
  await f.step(r.id, "recommend", f.manager);
  assert.equal((await f.row(r.id)).assignedTo, f.manager.id);
  assert.ok(
    (await f.row(r.id)).reviewHistory.some((h) => h.action === "takeover"),
  );
});
test("Profile workflow: request-info allows owner to amend and resubmit, preserving previous proposal history", async () => {
  const f = await fixture(),
    r = await f.create();
  await f.step(r.id, "receive");
  await f.step(r.id, "request-info");
  const amended = { ...contact, address: "Địa chỉ đã bổ sung" };
  await f.step(r.id, "resubmit", f.student, {
    baseProfileVersion: 1,
    proposedContact: amended,
  });
  const next = await f.row(r.id);
  assert.equal(next.status, "SUBMITTED");
  assert.equal(next.assignedTo, null);
  assert.equal(next.proposedContact.address, amended.address);
  assert.equal(
    next.reviewHistory.at(-1).previousProposal.address,
    contact.address,
  );
});
test("Profile workflow: stale source blocks apply; manager returns and student re-confirms against refreshed profile", async () => {
  const f = await fixture(),
    r = await f.recommended();
  await f.store.update(
    "students",
    f.profiles[0].id,
    { fullName: "Tên đã đối chiếu" },
    1,
  );
  await assert.rejects(
    f.step(r.id, "approve", f.manager),
    /Hồ sơ gốc đã thay đổi/,
  );
  await f.step(r.id, "request-info", f.manager);
  await f.step(r.id, "resubmit", f.student, {
    baseProfileVersion: 2,
    proposedContact: contact,
  });
  await f.step(r.id, "receive");
  await f.step(r.id, "recommend");
  await f.step(r.id, "approve", f.manager);
  assert.equal(
    (await f.store.list("students"))[0].fullName,
    "Tên đã đối chiếu",
  );
  assert.equal((await f.store.list("students"))[0].version, 3);
});
test("Profile workflow: action retry after a later action does not repeat or rewind state", async () => {
  const f = await fixture(),
    r = await f.create(),
    body = {
      version: 1,
      reason: "Tiếp nhận",
      confirm: true,
      requestId: randomUUID(),
    };
  await changeProfileRequest(f.store, r.id, body, f.staff, "receive");
  await f.step(r.id, "recommend");
  assert.equal(
    (await changeProfileRequest(f.store, r.id, body, f.staff, "receive"))
      .status,
    "RECOMMENDED",
  );
  await assert.rejects(
    changeProfileRequest(
      f.store,
      r.id,
      { ...body, reason: "Khác" },
      f.staff,
      "receive",
    ),
    /nội dung khác/,
  );
});
test("Profile workflow: approve is atomic and cannot increment student version twice during racing confirmations", async () => {
  const f = await fixture(),
    r = await f.recommended(),
    results = await Promise.allSettled([
      f.step(r.id, "approve", f.manager),
      f.step(r.id, "approve", f.manager),
    ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("students"))[0].version, 2);
});
test("Profile workflow: audit failure rolls profile and request state back together", async () => {
  const f = await fixture(),
    r = await f.recommended(),
    original = f.store.insert;
  f.store.insert = async function (k, row) {
    if (k === "events") throw Error("audit unavailable");
    return original.call(this, k, row);
  };
  await assert.rejects(f.step(r.id, "approve", f.manager), /audit/);
  assert.equal((await f.row(r.id)).status, "RECOMMENDED");
  assert.equal((await f.store.list("students"))[0].contactDetails, undefined);
  assert.equal((await f.store.list("students"))[0].version, 1);
});
test("Profile workflow: cancellation and rejection are terminal, do not change current contact", async () => {
  const f = await fixture(),
    r = await f.create();
  await f.step(r.id, "cancel", f.student);
  await assert.rejects(f.step(r.id, "receive"), (e) => e.status === 403);
  const r2 = await f.create();
  await f.step(r2.id, "receive");
  await f.step(r2.id, "reject", f.manager);
  assert.equal((await f.row(r2.id)).status, "REJECTED");
  assert.equal((await f.store.list("students"))[0].contactDetails, undefined);
});
test("Profile privacy: student cannot see or cancel another request; internal idempotency hashes are not returned", async () => {
  const f = await fixture(),
    r = await f.create();
  assert.equal(
    (await profileRequestOverview(f.store, f.student2)).rows.length,
    0,
  );
  await assert.rejects(
    f.step(r.id, "cancel", f.student2),
    (e) => e.status === 404,
  );
  const output = JSON.stringify(
    await profileRequestOverview(f.store, f.student),
  );
  assert.ok(!output.includes("requestHash"));
  assert.ok(!output.includes('"hash"'));
});
test("Profile scope: staff outside faculty cannot see or process request even when ID is known; revoked scope is rechecked", async () => {
  const f = await fixture(),
    r = await f.create(),
    scopes = await f.store.list("staffScopes"),
    grant = scopes.find((s) => s.accountId === f.staff.id);
  await f.store.update(
    "staffScopes",
    grant.id,
    { scopeType: "FACULTY", facultyId: randomUUID() },
    1,
  );
  assert.equal((await profileRequestOverview(f.store, f.staff)).rows.length, 0);
  await assert.rejects(f.step(r.id, "receive"), (e) => e.status === 404);
  await f.store.update(
    "staffScopes",
    grant.id,
    { scopeType: "ALL", facultyId: null },
    2,
  );
  await f.step(r.id, "receive");
  await f.store.update("staffScopes", grant.id, { active: false }, 3);
  await assert.rejects(f.step(r.id, "recommend"), (e) => e.status === 404);
});
test("Profile AI: status tool respects role and ownership; personal contact is excluded from model tool output", async () => {
  const f = await fixture(),
    r = await f.create(),
    ai = new AiService(f.store, {}),
    sources = [];
  const result = await ai.runTool(
    "lookup_profile_requests",
    {},
    f.student,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(result.rows[0].id, r.id);
  for (const privateText of [
    contact.phone,
    contact.personalEmail,
    contact.address,
    contact.emergencyPhone,
  ])
    assert.ok(!JSON.stringify(result).includes(privateText));
  assert.equal(
    (
      await ai.runTool(
        "lookup_profile_requests",
        {},
        f.student2,
        [],
        [],
        randomUUID(),
      )
    ).total,
    0,
  );
  await assert.rejects(
    ai.runTool("lookup_profile_requests", {}, f.teacher, [], [], randomUUID()),
    (e) => e.status === 403,
  );
  await f.step(r.id, "receive");
  await f.step(r.id, "recommend");
  await f.step(r.id, "approve", f.manager);
  const lookup = await ai.runTool(
    "lookup_students",
    {},
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.ok(!JSON.stringify(lookup).includes(contact.phone));
});
test("Student services: internal write entry points also reject student/lecturer actors", async () => {
  const f = await fixture();
  for (const actor of [f.student, f.teacher]) {
    await assert.rejects(
      updateStudent(f.store, f.profiles[0].id, {}, actor),
      (e) => e.status === 403,
    );
    await assert.rejects(
      importStudents(f.store, {}, actor),
      (e) => e.status === 403,
    );
  }
  await assert.rejects(
    listStudents(f.store, f.teacher, new URLSearchParams()),
    (e) => e.status === 403,
  );
});
test("Profile SQL mapping: JSON contact/history bound, request versioned, no input interpolated", async () => {
  const calls = [],
    sql = new MysqlStore({
      execute: async (query, args) => {
        calls.push({ query, args });
        return [{ affectedRows: 1 }];
      },
      query: async () => [
        [
          {
            id: "r",
            before_contact_json: "{}",
            proposed_contact_json: JSON.stringify(contact),
            review_history_json: "[]",
            base_profile_version: 1,
          },
        ],
      ],
    });
  await sql.insert("profileRequests", {
    id: "r",
    studentId: "s",
    beforeContact: {},
    proposedContact: contact,
    reviewHistory: [],
    baseProfileVersion: 1,
  });
  await sql.update("students", "s", { contactDetails: contact }, 1);
  assert.ok(calls[0].args.includes(JSON.stringify(contact)));
  assert.match(calls[0].query, /profile_change_requests/);
  assert.match(calls[1].query, /contact_details_json=\?/);
  assert.equal(
    (await sql.list("profileRequests"))[0].proposedContact.phone,
    contact.phone,
  );
});
test("Profile HTTP: full cross-role workflow updates student view, while student cannot review and lecturer cannot read", async (t) => {
  const f = await fixture(),
    origin = "http://localhost:4173",
    tokens = {};
  for (const [key, actor] of Object.entries({
    manager: f.manager,
    staff: f.staff,
    student: f.student,
    teacher: f.teacher,
  })) {
    tokens[key] =
      key === "manager"
        ? "a".repeat(64)
        : key === "staff"
          ? "b".repeat(64)
          : key === "student"
            ? "c".repeat(64)
            : "d".repeat(64);
    await f.store.insert("sessions", {
      tokenHash: tokenHash(tokens[key]),
      accountId: actor.id,
      accountVersion: 1,
      expiresAt: Date.now() + 60000,
    });
  }
  const server = createApp({
    store: f.store,
    config: { origin },
    mode: "demo",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1";
  const send = (role, path, body, originValue = origin) =>
    fetch(base + path, {
      method: body ? "POST" : "GET",
      headers: {
        Cookie: "lizz_session=" + tokens[role],
        Origin: originValue,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  assert.equal((await fetch(base + "/profile-requests")).status, 401);
  assert.equal((await send("teacher", "/profile-requests")).status, 403);
  assert.equal(
    (await send("student", "/profile-requests", f.input(), "http://wrong.test"))
      .status,
    403,
  );
  const created = await send("student", "/profile-requests", f.input());
  assert.equal(created.status, 201);
  const r = (await created.json()).row;
  const action = async (role, name) => {
    const b = {
      version: (await f.row(r.id)).version,
      reason: "Đã kiểm tra",
      confirm: true,
      requestId: randomUUID(),
    };
    return send(role, "/profile-requests/" + r.id + "/" + name, b);
  };
  assert.equal((await action("student", "receive")).status, 403);
  assert.equal((await action("staff", "receive")).status, 200);
  assert.equal((await action("staff", "recommend")).status, 200);
  assert.equal((await action("staff", "approve")).status, 403);
  assert.equal((await action("manager", "approve")).status, 200);
  const own = await send("student", "/students");
  assert.equal((await own.json()).rows[0].contactDetails.phone, contact.phone);
});
