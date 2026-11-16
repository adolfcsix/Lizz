import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { serviceFixture, request } from "./student-services-fixture.js";
import {
  financeOverview,
  saveCharge,
  changeCharge,
  adjustCharge,
  createReceipt,
  receiptDetail,
  decideReceipt,
} from "../../backend/local/modules/finance/finance.service.js";
import { financialStanding } from "../../backend/local/modules/finance/finance.rules.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { toolsFor } from "../../backend/local/modules/ai/ai.tools.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
async function report(
  f,
  charge,
  amount,
  method = "TRANSFER",
  actor = f.student,
  reference = randomUUID(),
) {
  return (
    await createReceipt(
      f.store,
      request({ chargeId: charge.id, amount, method, reference }),
      actor,
    )
  ).row;
}
async function decide(
  f,
  receipt,
  action = "confirm",
  actor = f.staff,
  reason = "Đối chiếu lại",
) {
  const data = await receiptDetail(f.store, receipt.id, actor);
  return decideReceipt(
    f.store,
    receipt.id,
    request({
      version: data.receipt.version,
      chargeVersion: data.charge.version,
      confirm: true,
      reason,
    }),
    actor,
    action,
  );
}
test("Tài chính: không lộ khoản thu/phiếu của người khác; Lecturer bị chặn", async () => {
  const f = await serviceFixture(),
    charge = await f.bill();
  assert.equal((await financeOverview(f.store, f.student)).charges.length, 1);
  assert.equal((await financeOverview(f.store, f.student2)).charges.length, 0);
  const r = await report(f, charge, 100000);
  await assert.rejects(receiptDetail(f.store, r.id, f.student2), {
    status: 404,
  });
  await assert.rejects(financeOverview(f.store, f.teacher), { status: 403 });
  await assert.rejects(
    createReceipt(
      f.store,
      request({ chargeId: charge.id, amount: 1, method: "CASH" }),
      f.student,
    ),
    { status: 403 },
  );
  await assert.rejects(saveCharge(f.store, request({}), f.student), {
    status: 403,
  });
});
test("Khoản nháp ẩn; giá trị tiền/học kỳ/hạn nộp và phiên cũ bị chặn", async () => {
  const f = await serviceFixture();
  const base = {
    studentId: f.profiles[0].id,
    term: f.term.code,
    title: "Học phí",
    amount: 100000,
    dueDate: "2020-06-01",
  };
  for (const changes of [
    { amount: 0 },
    { amount: 1.2 },
    { amount: 2000000001 },
    { dueDate: "2020-02-30" },
    { term: "missing" },
  ])
    await assert.rejects(
      saveCharge(f.store, request({ ...base, ...changes }), f.staff),
    );
  const input = request(base);
  const a = await saveCharge(f.store, input, f.staff),
    b = await saveCharge(f.store, input, f.staff);
  assert.equal(a.row.id, b.row.id);
  assert.equal((await financeOverview(f.store, f.student)).charges.length, 0);
  await assert.rejects(
    changeCharge(
      f.store,
      a.row.id,
      request({ version: 0, confirm: true }),
      f.staff,
      "issue",
    ),
    { status: 409 },
  );
  await changeCharge(
    f.store,
    a.row.id,
    request({ version: 1, confirm: true }),
    f.staff,
    "issue",
  );
  await assert.rejects(
    saveCharge(f.store, request({ ...base, version: 2 }), f.staff, a.row.id),
    { status: 409 },
  );
});
test("PENDING không tính đã nộp; xác nhận từng phần và gửi lại không ghi trùng", async () => {
  const f = await serviceFixture(),
    charge = await f.bill(),
    input = request({
      chargeId: charge.id,
      amount: 400000,
      method: "TRANSFER",
      reference: "bank-01",
    });
  const a = await createReceipt(f.store, input, f.student),
    again = await createReceipt(f.store, input, f.student);
  assert.equal(a.row.id, again.row.id);
  assert.equal((await financeOverview(f.store, f.student)).charges[0].paid, 0);
  await assert.rejects(
    createReceipt(f.store, request({ ...input }), f.student),
    { status: 409 },
  );
  const detail = await receiptDetail(f.store, a.row.id, f.staff),
    confirm = request({
      version: 1,
      chargeVersion: detail.charge.version,
      confirm: true,
    });
  await decideReceipt(f.store, a.row.id, confirm, f.staff, "confirm");
  await decideReceipt(f.store, a.row.id, confirm, f.staff, "confirm");
  const current = (await financeOverview(f.store, f.student)).charges[0];
  assert.equal(current.paid, 400000);
  assert.equal(current.remaining, 600000);
  assert.equal(
    (await f.store.list("events")).filter((e) => e.action === "RECEIPT_CONFIRM")
      .length,
    1,
  );
  await assert.rejects(decide(f, a.row, "confirm", f.student), { status: 403 });
});
test("Hai phiếu tranh số còn phải nộp không xác nhận vượt khoản thu", async () => {
  const f = await serviceFixture(),
    charge = await f.bill();
  const a = await report(f, charge, 700000),
    b = await report(f, charge, 700000, "CASH", f.staff, null),
    da = await receiptDetail(f.store, a.id, f.staff),
    db = await receiptDetail(f.store, b.id, f.manager);
  const results = await Promise.allSettled([
    decideReceipt(
      f.store,
      a.id,
      request({ version: 1, chargeVersion: da.charge.version, confirm: true }),
      f.staff,
      "confirm",
    ),
    decideReceipt(
      f.store,
      b.id,
      request({ version: 1, chargeVersion: db.charge.version, confirm: true }),
      f.manager,
      "confirm",
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  const current = (await financeOverview(f.store, f.manager)).charges[0];
  assert.equal(current.paid, 700000);
  assert.equal(current.remaining, 300000);
});
test("Miễn giảm có audit; không giảm dưới số đã nộp và Staff không điều chỉnh", async () => {
  const f = await serviceFixture(),
    charge = await f.bill();
  const r = await report(f, charge, 200000);
  await decide(f, r);
  const current = (await financeOverview(f.store, f.manager)).charges[0];
  await assert.rejects(
    adjustCharge(
      f.store,
      charge.id,
      request({
        version: current.version,
        delta: -900000,
        reason: "Miễn",
        confirm: true,
      }),
      f.manager,
    ),
    { status: 409 },
  );
  await assert.rejects(
    adjustCharge(
      f.store,
      charge.id,
      request({
        version: current.version,
        delta: -800000,
        reason: "Miễn",
        confirm: true,
      }),
      f.staff,
    ),
    { status: 403 },
  );
  await adjustCharge(
    f.store,
    charge.id,
    request({
      version: current.version,
      delta: -800000,
      reason: "Miễn giảm theo quyết định",
      confirm: true,
    }),
    f.manager,
  );
  const c = (await financeOverview(f.store, f.student)).charges[0];
  assert.equal(c.total, 200000);
  assert.equal(c.remaining, 0);
  assert.equal((await f.store.list("adjustments")).length, 1);
});
test("Hủy xác nhận ghi thu giữ phiếu và phục hồi công nợ; mở lại không tính tiền hai lần", async () => {
  const f = await serviceFixture(),
    charge = await f.bill(),
    r = await report(f, charge, 1000000);
  await decide(f, r);
  await assert.rejects(decide(f, r, "reverse", f.staff), { status: 403 });
  await decide(f, r, "reverse", f.manager);
  let c = (await financeOverview(f.store, f.student)).charges[0];
  assert.equal(c.paid, 0);
  assert.equal(c.remaining, 1000000);
  await decide(f, r, "reopen", f.manager);
  await decide(f, r);
  c = (await financeOverview(f.store, f.student)).charges[0];
  assert.equal(c.paid, 1000000);
  assert.equal((await f.store.list("receipts")).length, 1);
  assert.ok(
    (await f.store.list("events")).some((e) => e.action === "RECEIPT_REVERSE"),
  );
});
test("Không hủy khoản thu có phiếu chờ hoặc thu đã xác nhận; lý do bắt buộc", async () => {
  const f = await serviceFixture(),
    charge = await f.bill(),
    r = await report(f, charge, 100000);
  await assert.rejects(
    changeCharge(
      f.store,
      charge.id,
      request({ version: charge.version, confirm: true, reason: "Sai khoản" }),
      f.staff,
      "cancel",
    ),
    { status: 409 },
  );
  await assert.rejects(decide(f, r, "reject", f.staff, ""));
  await decide(f, r, "reject");
  await changeCharge(
    f.store,
    charge.id,
    request({
      version: charge.version,
      confirm: true,
      reason: "Lập nhầm khoản thu",
    }),
    f.staff,
    "cancel",
  );
  assert.equal(
    (await financeOverview(f.store, f.student)).charges[0].status,
    "CANCELLED",
  );
  assert.equal((await f.store.list("charges")).length, 1);
});
test("Lỗi audit rollback cả xác nhận và số dư; request giả phiên và tái dùng nonce bị chặn", async () => {
  const f = await serviceFixture(),
    charge = await f.bill(),
    r = await report(f, charge, 100000);
  const insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit failed");
    return insert.call(this, kind, row);
  };
  await assert.rejects(decide(f, r));
  assert.equal((await financeOverview(f.store, f.student)).charges[0].paid, 0);
  assert.equal(
    (await receiptDetail(f.store, r.id, f.staff)).receipt.version,
    1,
  );
  f.store.insert = insert;
  await assert.rejects(
    createReceipt(
      f.store,
      request({ chargeId: charge.id, amount: 1, method: "CASH" }),
      { ...f.staff, version: 0 },
    ),
    { status: 401 },
  );
  const input = request({ chargeId: charge.id, amount: 1000, method: "CASH" });
  await createReceipt(f.store, input, f.staff);
  await assert.rejects(
    createReceipt(f.store, { ...input, amount: 2000 }, f.staff),
    { status: 409 },
  );
});
test("LizzChat tài chính không nhận chủ sở hữu do mô hình chỉ định; không có công cụ ghi tiền", async () => {
  const f = await serviceFixture();
  await f.bill();
  const ai = new AiService(f.store, { ready: false }),
    sources = [];
  const own = await ai.runTool(
    "lookup_finance",
    {},
    f.student,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(own.total, 1);
  assert.equal(
    (
      await ai.runTool(
        "lookup_finance",
        { query: "SV0" },
        f.student2,
        [],
        [],
        randomUUID(),
      )
    ).total,
    0,
  );
  await assert.rejects(
    ai.runTool("lookup_finance", {}, f.teacher, [], [], randomUUID()),
    { status: 403 },
  );
  await assert.rejects(
    ai.runTool(
      "lookup_finance",
      { studentId: f.profiles[0].id },
      f.student2,
      [],
      [],
      randomUUID(),
    ),
  );
  assert.equal(
    toolsFor(f.student).some((t) =>
      /confirm.*payment|confirm.*receipt|transfer_money/.test(t.name),
    ),
    false,
  );
});
test("HTTP tài chính chặn khách, sai Origin và quyền xác nhận giả", async (t) => {
  const f = await serviceFixture(),
    origin = "http://localhost:3000",
    token = "a".repeat(64);
  await f.store.insert("sessions", {
    tokenHash: tokenHash(token),
    accountId: f.student.id,
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
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1/finance";
  assert.equal((await fetch(base)).status, 401);
  const headers = {
    Cookie: "lizz_session=" + token,
    Origin: origin,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(base + "/charges", {
        method: "POST",
        headers,
        body: JSON.stringify(request({})),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/receipts", {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/receipts/" + randomUUID() + "/confirm", {
        method: "POST",
        headers,
        body: JSON.stringify(request({})),
      })
    ).status,
    403,
  );
});
test("MySQL khoản thu/phiếu và điều chỉnh dùng tên cột cố định, tiền nguyên và bind tham số", async () => {
  let sql, params;
  const store = new MysqlStore({
    execute: async (s, p) => {
      sql = s;
      params = p;
      return [{ affectedRows: 1 }];
    },
  });
  await store.insert("receipts", {
    id: randomUUID(),
    chargeId: randomUUID(),
    code: "PT-01",
    amount: 100000,
    method: "TRANSFER",
    reference: "ref' OR 1=1",
    reportedAt: Date.now(),
    createdBy: randomUUID(),
    status: "PENDING",
    confirmedBy: null,
    confirmedAt: null,
    reason: null,
    version: 1,
  });
  assert.match(sql, /INSERT INTO payment_receipts/);
  assert.match(sql, /reported_at/);
  assert.equal(sql.includes("OR 1=1"), false);
  assert.ok(params.includes("ref' OR 1=1"));
  await store.insert("adjustments", {
    id: randomUUID(),
    chargeId: randomUUID(),
    delta: -10000,
    reason: "Miễn giảm",
    actorId: randomUUID(),
  });
  assert.match(sql, /charge_adjustments/);
  assert.ok(params.includes(-10000));
});
