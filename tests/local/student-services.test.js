import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { studentServiceFixture } from "./student-service-fixture.js";
import { saveServiceDefinition, changeServiceDefinition, createServiceRequest, studentServicesOverview } from "../../backend/local/modules/students/student-services.service.js";
import { notificationOverview } from "../../backend/local/modules/notifications/notification.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { serviceActions } from "../../shared/student-services.js";
import { createReceipt, decideReceipt } from "../../backend/local/modules/finance/finance.service.js";
const denied = (n) => (e) => e.status === n;

test("Services: manager publishes; staff only prepares; published definitions remain immutable", async () => {
  const f = await studentServiceFixture();
  const d = await saveServiceDefinition(f.store, { ...f.definitionInput, edition: 2 }, f.staff);
  await assert.rejects(changeServiceDefinition(f.store, d.id, "publish", { version: 1, confirm: true, reason: "Quy chế" }, f.staff), denied(403));
  await assert.rejects(saveServiceDefinition(f.store, { ...f.definitionInput, version: f.definition.version }, f.manager, f.definition.id), denied(409));
  await assert.rejects(changeServiceDefinition(f.store, d.id, "publish", { version: 1, confirm: true, reason: "Quy chế" }, f.manager), /Đóng phiên bản/);
  await assert.rejects(saveServiceDefinition(f.store, f.definitionInput, f.manager), /đã tồn tại/);
});
test("Services: malformed configuration and price/quantity/methods never produce records", async () => {
  const f = await studentServiceFixture();
  for (const p of [null, { ...f.definitionInput.payload, unitPrice: -1 }, { ...f.definitionInput.payload, unitPrice: 0.1 }, { ...f.definitionInput.payload, maxQuantity: 0 }, { ...f.definitionInput.payload, deliveryMethods: [] }, { ...f.definitionInput.payload, deliveryMethods: ["HACK"] }])
    await assert.rejects(saveServiceDefinition(f.store, { ...f.definitionInput, edition: 2, payload: p }, f.manager), denied(400));
  assert.equal((await f.store.list("serviceDefinitions")).length, 1);
});
test("Services: unlinked profile cannot create; own draft is hidden from staff and manager", async () => {
  const f = await studentServiceFixture(), d = await f.create();
  assert.equal((await f.detail(d.id)).status, "DRAFT");
  assert.equal((await studentServicesOverview(f.store, f.staff)).rows.length, 0);
  assert.equal((await studentServicesOverview(f.store, f.manager)).rows.length, 0);
  assert.equal((await studentServicesOverview(f.store, f.student2)).rows.length, 0);
  const account = { ...f.student, id: randomUUID(), username: "unlinked", email: "unlinked@example.test" };
  await f.store.insert("accounts", account);
  await assert.rejects(createServiceRequest(f.store, f.body(), account), denied(409));
});
test("Services: complete submit, receive, request information, resubmit, result and delivery retains timeline", async () => {
  const f = await studentServiceFixture(); let r = await f.submit();
  r = await f.change(r, "take");
  r = await f.change(r, "request-info");
  const b = f.body();
  r = await f.change(r, "edit", f.student, { details: { ...b.details, documentsNote: "Đã bổ sung mã giấy tờ" }, studentVersion: 1 });
  r = await f.change(r, "submit"); r = await f.change(r, "take");
  r = await f.change(r, "ready", f.staff, { reference: "XN-001", message: "Nhận tại phòng tiếp nhận hồ sơ." });
  r = await f.change(r, "deliver", f.staff, { reference: "Sổ bàn giao 001" });
  const row = await f.detail(r.id);
  assert.equal(row.status, "DELIVERED"); assert.equal(row.result.reference, "XN-001");
  assert.equal(row.payload.details.estimatedAmount, 20000); assert.equal(row.history.length, 9);
  assert.equal((await f.store.list("charges")).length, 0);
  assert.ok(row.history.every((h) => !Object.hasOwn(h, "hash") && !Object.hasOwn(h, "requestId")));
});
test("Services: closed catalog blocks draft submission; previously submitted request retains original price", async () => {
  const f = await studentServiceFixture(), submitted = await f.submit(), other = await f.create();
  await changeServiceDefinition(f.store, f.definition.id, "close", { version: f.definition.version, confirm: true, reason: "Đổi biểu phí" }, f.manager);
  await assert.rejects(f.change(other, "submit"), /đóng nhận/);
  const d = await saveServiceDefinition(f.store, { ...f.definitionInput, edition: 2, payload: { ...f.definitionInput.payload, unitPrice: 30000 } }, f.manager);
  await changeServiceDefinition(f.store, d.id, "publish", { version: 1, confirm: true, reason: "Biểu phí mới" }, f.manager);
  const taken = await f.change(submitted, "take");
  const row = await f.detail(taken.id);
  assert.equal(row.payload.service.payload.unitPrice, 10000); assert.equal(row.payload.details.estimatedAmount, 20000);
  assert.equal((await studentServicesOverview(f.store, f.student)).definitions[0].id, d.id);
});
test("Services: editable incomplete drafts cannot submit missing purpose or required documents", async () => {
  const f = await studentServiceFixture(), b = f.body();
  b.details.purpose = ""; b.details.documentsNote = "";
  let r = await f.create(b); await assert.rejects(f.change(r, "submit"), denied(400));
  r = await f.change(r, "edit", f.student, { studentVersion: 1, serviceVersion: f.definition.version, details: f.body().details });
  assert.equal((await f.change(r, "submit")).status, "SUBMITTED");
});
test("Services: altered identity requires explicit review before submit and stale source blocks draft writes", async () => {
  const f = await studentServiceFixture(), b = f.body(), r = await f.create(b);
  await f.store.update("students", f.profiles[0].id, { fullName: "Tên mới" }, 1);
  await assert.rejects(f.change(r, "submit"), /sinh viên đã đổi/);
  await assert.rejects(f.create(), /hồ sơ đã thay đổi/);
  const saved = await f.change(r, "edit", f.student, { studentVersion: 2, serviceVersion: f.definition.version, details: f.body().details });
  assert.equal((await f.change(saved, "submit")).status, "SUBMITTED");
});
test("Services: quantity, delivery method, missing confirmation and forged profiles are validated", async () => {
  const f = await studentServiceFixture();
  for (const changes of [{ quantity: 6 }, { quantity: -1 }, { quantity: 1.5 }, { deliveryMethod: "OTHER" }, { purpose: null }]) {
    const b = f.body(); Object.assign(b.details, changes);
    await assert.rejects(f.create(b), denied(400));
  }
  await assert.rejects(f.create({ ...f.body(), confirm: false }), denied(400));
  const d = await f.create({ ...f.body(), studentId: f.profiles[1].id });
  assert.equal((await f.detail(d.id)).studentId, f.profiles[0].id);
});
test("Services: stale action and stale actor never overwrite a newer workflow", async () => {
  const f = await studentServiceFixture(), r = await f.submit(), taken = await f.change(r, "take");
  await assert.rejects(f.change(r, "reject"), denied(409));
  await f.store.update("accounts", f.staff.id, { active: false }, 1);
  await assert.rejects(f.change(taken, "ready", f.staff, { reference: "A", message: "B" }), denied(401));
  assert.equal((await f.detail(r.id)).status, "IN_PROGRESS");
});
test("Services: idempotent creates/actions and competing submissions cannot duplicate an active procedure", async () => {
  const f = await studentServiceFixture(), b = f.body(), r = await f.create(b);
  assert.equal((await f.create(b)).replayed, true);
  await assert.rejects(f.create({ ...b, details: { ...b.details, quantity: 1 } }), denied(409));
  const d2 = await f.create(), results = await Promise.allSettled([f.change(r, "submit"), f.change(d2, "submit")]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const current = results.find((r) => r.status === "fulfilled").value,
    op = { requestId: randomUUID() }, taken = await f.change(current, "take", f.staff, op);
  assert.equal((await f.change(current, "take", f.staff, op)).replayed, true);
  await assert.rejects(f.change(current, "take", f.staff, { ...op, reason: "Khác" }), denied(409));
  assert.equal(taken.status, "IN_PROGRESS");
});
test("Services: student cannot process or cancel a received request; lecturer cannot access workflow", async () => {
  const f = await studentServiceFixture(), r = await f.submit();
  await assert.rejects(f.change(r, "take", f.student), denied(403));
  await assert.rejects(studentServicesOverview(f.store, f.teacher), denied(403));
  await assert.rejects(f.change(r, "take", f.teacher), denied(403));
  const taken = await f.change(r, "take");
  await assert.rejects(f.change(taken, "cancel"), denied(403));
});
test("Services: cancellation and rejection are terminal, permitting a new request rather than overwriting history", async () => {
  const f = await studentServiceFixture();
  const d = await f.create(), cancelled = await f.change(d, "cancel");
  await assert.rejects(f.change(cancelled, "submit"), denied(403));
  const s = await f.submit(), rejected = await f.change(s, "reject");
  await assert.rejects(f.change(rejected, "take"), denied(403));
  assert.equal((await f.submit()).status, "SUBMITTED");
});
test("Services: receiving requires ownership; manager can reassign without discarding request history", async () => {
  const f = await studentServiceFixture(), r = await f.change(await f.submit(), "take");
  await assert.rejects(f.change(r, "request-info", f.staff2), denied(403));
  const moved = await f.change(r, "reassign", f.manager, { assignedTo: f.staff2.id });
  await assert.rejects(f.change(moved, "request-info", f.staff), denied(403));
  assert.equal((await f.change(moved, "request-info", f.staff2)).status, "NEEDS_INFO");
  assert.equal((await f.detail(r.id)).assignedTo, f.staff2.id);
});
test("Services: scoped staff read/process only matching students; cannot edit shared catalog or take foreign assignment", async () => {
  const f = await studentServiceFixture(), r = await f.submit();
  await f.store.update("staffScopes", f.scopeId, { scopeType: "FACULTY", facultyId: f.facultyId, cohortId: f.cohortId }, 1);
  assert.equal((await studentServicesOverview(f.store, f.staff)).rows.length, 1);
  await assert.rejects(saveServiceDefinition(f.store, { ...f.definitionInput, edition: 2 }, f.staff), denied(403));
  const taken = await f.change(r, "take");
  await f.store.update("staffScopes", f.scopeId, { facultyId: randomUUID() }, 2);
  assert.equal((await studentServicesOverview(f.store, f.staff)).rows.length, 0);
  await assert.rejects(f.change(taken, "request-info"), denied(404));
  await assert.rejects(f.change(taken, "reassign", f.manager, { assignedTo: f.staff.id }), denied(403));
});
test("Services: ready/delivery require genuine result references and current state", async () => {
  const f = await studentServiceFixture(), r = await f.change(await f.submit(), "take");
  await assert.rejects(f.change(r, "ready", f.staff, { reference: "", message: "Có kết quả" }), denied(400));
  await assert.rejects(f.change(r, "deliver", f.staff, { reference: "Đã trả" }), denied(403));
  const ready = await f.change(r, "ready", f.staff, { reference: "XN-001", message: "Nhận tại quầy" });
  await assert.rejects(f.change(ready, "deliver", f.staff, { reference: "" }), denied(400));
  assert.equal((await f.change(ready, "deliver", f.staff, { reference: "Sổ nhận 001" })).status, "DELIVERED");
});
test("Services: audit and notification failure roll the whole submission back", async () => {
  for (const kind of ["events", "notifications"]) {
    const f = await studentServiceFixture(), d = await f.create(), original = f.store.insert;
    f.store.insert = async function (k, r) { if (k === kind) throw Error("write failed"); return original.call(this, k, r); };
    await assert.rejects(f.change(d, "submit"), /write failed/);
    assert.equal((await f.detail(d.id)).status, "DRAFT");
    assert.equal((await f.store.list("notifications")).length, 0);
  }
});
test("Services: notices contain no purpose/documents; scope revocation hides old notices", async () => {
  const f = await studentServiceFixture(), r = await f.submit();
  assert.equal((await notificationOverview(f.store, f.staff)).rows.filter((n) => n.kind === "STUDENT_SERVICE").length, 1);
  const taken = await f.change(r, "take");
  const notices = await notificationOverview(f.store, f.student);
  assert.equal(notices.rows[0].route, "student-services");
  assert.ok(!JSON.stringify(notices).includes("Bổ sung hồ sơ cá nhân"));
  await f.store.update("staffScopes", f.scopeId, { active: false }, 1);
  assert.equal((await notificationOverview(f.store, f.staff)).rows.filter((n) => n.kind === "STUDENT_SERVICE").length, 0);
  assert.equal(taken.status, "IN_PROGRESS");
});
test("Services: AI uses same privacy filters, omits private notes and never reports a payment", async () => {
  const f = await studentServiceFixture(), r = await f.submit(), ai = new AiService(f.store, {}), sources = [];
  const own = await ai.runTool("lookup_student_services", { studentCode: f.profiles[1].code }, f.student, [], sources, randomUUID());
  assert.equal(own.total, 1); assert.equal(own.rows[0].id, r.id); assert.equal(sources.length, 1);
  assert.ok(!JSON.stringify(own).includes("Bổ sung hồ sơ cá nhân"));
  const other = await ai.runTool("lookup_student_services", { requestId: r.id }, f.student2, [], [], randomUUID());
  assert.equal(other.total, 0);
  await assert.rejects(ai.runTool("lookup_student_services", {}, f.teacher, [], [], randomUUID()), denied(403));
});
test("Services: MySQL maps both tables, serializes snapshots and updates via bound values", async () => {
  const calls = [], conn = { execute: async (sql, args) => { calls.push({ sql, args }); return [{ affectedRows: 1 }]; }, query: async () => [[{ id: "s", payload_json: '{"unitPrice":0}', version: 1 }]] }, sql = new MysqlStore(conn);
  const payload = { instructions: "x'); DROP TABLE accounts;--", unitPrice: 0 };
  await sql.insert("serviceDefinitions", { id: "s", code: "A", edition: 1, payload });
  await sql.update("serviceDefinitions", "s", { status: "PUBLISHED", payload }, 1);
  await sql.insert("serviceRequests", { id: "r", serviceId: "s", payload, history: [] });
  await sql.update("serviceRequests", "r", { status: "READY", result: { reference: "A" }, history: [] }, 1);
  assert.ok(calls.every((c) => !c.sql.includes("DROP TABLE"))); assert.ok(calls[0].args.includes(JSON.stringify(payload)));
  assert.match(calls[0].sql, /student_service_definitions/); assert.match(calls[2].sql, /student_service_requests/);
  assert.deepEqual((await sql.list("serviceDefinitions"))[0].payload, { unitPrice: 0 });
});
test("Services HTTP: role, authentication, Origin, ownership, route and version checks", async (t) => {
  const f = await studentServiceFixture(), origin = "http://localhost:4173", token = "e".repeat(64);
  await f.store.insert("sessions", { tokenHash: tokenHash(token), accountId: f.student.id, accountVersion: 1, expiresAt: Date.now() + 60000 });
  const server = createApp({ store: f.store, config: { origin }, mode: "demo" }); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port + "/api/v1/student-services", headers = { Cookie: "lizz_session=" + token, Origin: origin, "Content-Type": "application/json" };
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers })).status, 200);
  assert.equal((await fetch(url + "/requests", { method: "POST", headers: { ...headers, Origin: "http://bad.test" }, body: JSON.stringify(f.body()) })).status, 403);
  const created = await fetch(url + "/requests", { method: "POST", headers, body: JSON.stringify(f.body()) }); assert.equal(created.status, 201);
  const d = (await created.json()).row;
  assert.equal((await fetch(url + "/requests/" + d.id + "/submit", { method: "POST", headers, body: JSON.stringify({ version: d.version, requestId: randomUUID(), confirm: true }) })).status, 200);
  assert.equal((await fetch(url + "/definitions", { method: "POST", headers, body: JSON.stringify(f.definitionInput) })).status, 403);
  assert.equal((await fetch(url + "/unknown", { headers })).status, 404);
});
test("Services: action buttons reflect assignment, workflow and student ownership", () => {
  const student = { id: "s", role: "STUDENT" }, staff = { id: "a", role: "STAFF" }, r = { requestedBy: "s", status: "DRAFT", assignedTo: null };
  assert.deepEqual(serviceActions(r, student), ["edit", "submit", "cancel"]);
  assert.deepEqual(serviceActions(r, staff), []);
  assert.deepEqual(serviceActions({ ...r, status: "IN_PROGRESS", assignedTo: "b" }, staff), []);
  assert.deepEqual(serviceActions({ ...r, status: "READY", assignedTo: "a" }, staff), ["deliver"]);
});

test("Services: draft content is absent from administrative audit and other students cannot mutate requests", async () => {
  const f = await studentServiceFixture(), d = await f.create(), details = { ...f.body().details, purpose: "Bản nháp riêng chưa gửi" };
  const edited = await f.change(d, "edit", f.student, { studentVersion: 1, serviceVersion: f.definition.version, details });
  assert.ok(!JSON.stringify(await f.store.list("events")).includes("Bản nháp riêng chưa gửi"));
  await assert.rejects(f.change(edited, "submit", f.student2), denied(404));
  await assert.rejects(f.change(edited, "cancel", f.student2), denied(404));
  assert.equal((await f.detail(d.id)).status, "DRAFT");
});

test("Services: client-supplied action/identity fields cannot disguise a different operation as a retry", async () => {
  const f = await studentServiceFixture(), r = await f.submit(), same = { requestId: randomUUID(), action: "same", actorId: "forged" };
  await f.change(r, "take", f.staff, same);
  await assert.rejects(f.change(r, "reject", f.staff, same), denied(409));
  assert.equal((await f.detail(r.id)).status, "IN_PROGRESS");
});

test("Services: linked finance reads confirmed partial receipts, never counts a pending transfer", async () => {
  const f = await studentServiceFixture(), r = await f.change(await f.submit(), "take"), bill = await f.bill(f.profiles[0].id, 20000);
  const linked = await f.change(r, "link-charge", f.staff, { chargeId: bill.id });
  const receipt = (await createReceipt(f.store, { requestId: randomUUID(), chargeId: bill.id, amount: 5000, method: "TRANSFER", reference: "DV-" + randomUUID() }, f.student)).row;
  assert.equal((await f.detail(r.id)).finance.paid, 0);
  await decideReceipt(f.store, receipt.id, { requestId: randomUUID(), confirm: true, version: 1, chargeVersion: bill.version }, f.staff, "confirm");
  const detail = await f.detail(r.id);
  assert.equal(detail.finance.paid, 5000); assert.equal(detail.finance.remaining, 15000);
  assert.equal(detail.payload.details.estimatedAmount, 20000); assert.equal(detail.version, linked.version);
  assert.equal((await f.store.list("charges")).length, 1);
});
test("Services: finance linkage rejects another student, mismatched fees and a bill already linked to another dossier", async () => {
  const f = await studentServiceFixture(), r = await f.change(await f.submit(), "take"), foreign = await f.bill(f.profiles[1].id, 20000), wrong = await f.bill(f.profiles[0].id, 10000), bill = await f.bill(f.profiles[0].id, 20000);
  for (const charge of [foreign, wrong]) await assert.rejects(f.change(r, "link-charge", f.staff, { chargeId: charge.id }), denied(409));
  const linked = await f.change(r, "link-charge", f.staff, { chargeId: bill.id });
  await f.change(linked, "reject");
  const next = await f.change(await f.submit(), "take");
  await assert.rejects(f.change(next, "link-charge", f.staff, { chargeId: bill.id }), /đã được liên kết/);
});
test("Services: only manager corrects an existing finance link; ledger entries survive unlinking", async () => {
  const f = await studentServiceFixture(), r = await f.change(await f.submit(), "take"), bill = await f.bill(f.profiles[0].id, 20000), linked = await f.change(r, "link-charge", f.staff, { chargeId: bill.id });
  await assert.rejects(f.change(linked, "unlink-charge", f.staff), denied(403));
  const unlinked = await f.change(linked, "unlink-charge", f.manager);
  assert.equal((await f.detail(unlinked.id)).finance, null);
  assert.equal((await f.store.list("charges"))[0].id, bill.id);
  assert.ok((await f.detail(unlinked.id)).history.some((h) => h.action === "unlink-charge"));
});
