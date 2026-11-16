import { foldText } from "../../../../shared/local-validation.js";
import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import { freshActor, audit } from "../academic/academic.common.js";
import {
  financeManagers as managers,
  money,
  chargeTotals,
  financialStanding,
} from "./finance.rules.js";
const readers = [...managers, "STUDENT"];
const date = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v + "T00:00:00Z")) &&
  new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v;
const reason = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
const code = (prefix) =>
  prefix + "-" + randomUUID().replaceAll("-", "").toUpperCase();
async function load(store) {
  const [charges, receipts, adjustments, students, terms] = await Promise.all(
    ["charges", "receipts", "adjustments", "students", "terms"].map((k) =>
      store.list(k),
    ),
  );
  return { charges, receipts, adjustments, students, terms };
}
async function command(store, actor, roles, input, action, work) {
  authorize(actor, roles);
  requireValue(
    input &&
      typeof input === "object" &&
      /^[a-f0-9-]{36}$/.test(input.requestId || ""),
    "Thiếu mã yêu cầu. Tải lại biểu mẫu rồi thử lại.",
  );
  const hash = tokenHash(JSON.stringify({ action, input }));
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    const prior = (await tx.list("academicRequests", true)).find(
      (r) => r.id === input.requestId,
    );
    if (prior) {
      requireValue(
        prior.actorId === actor.id && prior.requestHash === hash,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { ...prior.result, replayed: true };
    }
    const result = await work(tx);
    await tx.insert("academicRequests", {
      id: input.requestId,
      actorId: actor.id,
      requestHash: hash,
      result,
    });
    return result;
  });
}
function ownCharge(d, id, actor) {
  const row = d.charges.find((r) => r.id === id);
  const own = d.students.find((s) => s.accountId === actor.id);
  requireValue(
    row &&
      (actor.role !== "STUDENT" || (row.studentId === own?.id && row.issuedAt)),
    "Không tìm thấy khoản thu trong quyền của bạn.",
    404,
  );
  return row;
}
function decorate(d, row) {
  const student = d.students.find((s) => s.id === row.studentId);
  return {
    ...row,
    studentCode: student?.code || "",
    studentName: student?.fullName || "",
    ...chargeTotals(row, d.receipts, d.adjustments),
  };
}
export async function financeOverview(store, actor) {
  authorize(actor, readers);
  const d = await load(store),
    own = d.students.find((s) => s.accountId === actor.id),
    manage = managers.includes(actor.role);
  const charges = d.charges
    .filter((r) => manage || (r.studentId === own?.id && r.issuedAt))
    .map((r) => decorate(d, r));
  const ids = new Set(charges.map((r) => r.id));
  const receipts = d.receipts
    .filter((r) => ids.has(r.chargeId))
    .map((r) => {
      const c = charges.find((c) => c.id === r.chargeId);
      return {
        id: r.id,
        code: r.code,
        chargeId: r.chargeId,
        chargeCode: c.code,
        studentName: c.studentName,
        amount: r.amount,
        method: r.method,
        reference: r.reference,
        status: r.status,
        version: r.version,
        confirmedAt: r.confirmedAt,
        reportedAt: r.reportedAt,
        reason: r.reason,
      };
    });
  return {
    charges,
    receipts,
    adjustments: d.adjustments
      .filter((r) => ids.has(r.chargeId))
      .map(({ id, chargeId, delta, reason }) => ({
        id,
        chargeId,
        delta,
        reason,
      })),
    students: manage
      ? d.students.map(({ id, code, fullName }) => ({
          id,
          name: code + " · " + fullName,
        }))
      : [],
    terms: manage
      ? d.terms.map(({ id, code, name }) => ({
          id,
          name: code + " · " + name,
          code,
        }))
      : [],
  };
}
export async function saveCharge(store, input, actor, id = null) {
  return command(
    store,
    actor,
    managers,
    input,
    "FINANCE_CHARGE_SAVE:" + id,
    async (tx) => {
      const d = await load(tx);
      requireValue(
        d.students.some((s) => s.id === input.studentId),
        "Chọn hồ sơ sinh viên.",
      );
      requireValue(
        d.terms.some((t) => t.code === input.term),
        "Chọn học kỳ đã thiết lập.",
      );
      requireValue(
        typeof input.title === "string" &&
          input.title.trim() &&
          input.title.length <= 180 &&
          money(input.amount) &&
          date(input.dueDate),
        "Nhập tên khoản thu, số tiền nguyên VND và hạn nộp hợp lệ.",
      );
      const prior = d.charges.find((r) => r.id === id);
      if (id)
        requireValue(
          prior && prior.status === "DRAFT" && prior.version === input.version,
          "Chỉ sửa được bản nháp mới nhất.",
          409,
        );
      const clean = {
        studentId: input.studentId,
        term: input.term,
        title: input.title.trim(),
        amount: input.amount,
        dueDate: input.dueDate,
      };
      const row = {
        id: id || randomUUID(),
        ...clean,
        code: prior?.code || code("HP"),
        status: "DRAFT",
        issuedBy: null,
        issuedAt: null,
        reason: null,
        version: prior ? prior.version + 1 : 1,
      };
      if (prior) await tx.update("charges", id, clean, input.version);
      else await tx.insert("charges", row);
      await audit(
        tx,
        actor,
        prior ? "CHARGE_UPDATED" : "CHARGE_CREATED",
        row.id,
        { before: prior || null, after: row },
      );
      return { row };
    },
  );
}
export async function changeCharge(store, id, input, actor, action) {
  return command(
    store,
    actor,
    managers,
    input,
    "FINANCE_CHARGE_" + action + ":" + id,
    async (tx) => {
      const d = await load(tx),
        row = ownCharge(d, id, actor);
      requireValue(
        row.version === input.version && input.confirm === true,
        "Khoản thu đã thay đổi hoặc chưa được xác nhận.",
        409,
      );
      let changes;
      if (action === "issue") {
        requireValue(
          row.status === "DRAFT",
          "Chỉ phát hành khoản thu đang nháp.",
          409,
        );
        changes = {
          status: "ISSUED",
          issuedBy: actor.id,
          issuedAt: Date.now(),
        };
      } else {
        requireValue(
          action === "cancel" &&
            row.status !== "CANCELLED" &&
            reason(input.reason),
          "Nhập lý do hủy khoản thu.",
        );
        const balance = chargeTotals(row, d.receipts, d.adjustments);
        requireValue(
          balance.paid === 0 &&
            !d.receipts.some(
              (r) => r.chargeId === id && r.status === "PENDING",
            ),
          "Cần xử lý các phiếu thu hoặc thông tin chờ xác minh trước khi hủy.",
          409,
        );
        changes = { status: "CANCELLED", reason: input.reason.trim() };
      }
      await tx.update("charges", id, changes, input.version);
      const after = { ...row, ...changes, version: row.version + 1 };
      await audit(
        tx,
        actor,
        action === "issue" ? "CHARGE_ISSUED" : "CHARGE_CANCELLED",
        id,
        { before: row, after },
      );
      return { row: after };
    },
  );
}
export async function adjustCharge(store, id, input, actor) {
  return command(
    store,
    actor,
    ["MANAGER"],
    input,
    "FINANCE_ADJUST:" + id,
    async (tx) => {
      const d = await load(tx),
        charge = ownCharge(d, id, actor);
      requireValue(
        charge.status === "ISSUED" &&
          charge.version === input.version &&
          input.confirm === true,
        "Khoản thu đã thay đổi. Kiểm tra lại trước khi điều chỉnh.",
        409,
      );
      requireValue(
        Number.isSafeInteger(input.delta) &&
          input.delta !== 0 &&
          Math.abs(input.delta) <= 2000000000 &&
          reason(input.reason),
        "Nhập số tiền điều chỉnh khác 0 và lý do.",
      );
      const current = chargeTotals(charge, d.receipts, d.adjustments);
      requireValue(
        current.total + input.delta >= current.paid &&
          current.total + input.delta <= 2000000000,
        "Không giảm khoản thu dưới số đã xác nhận hoặc vượt giới hạn.",
        409,
      );
      const row = {
        id: randomUUID(),
        chargeId: id,
        delta: input.delta,
        reason: input.reason.trim(),
        actorId: actor.id,
      };
      await tx.insert("adjustments", row);
      await tx.update("charges", id, { status: charge.status }, charge.version);
      await audit(tx, actor, "CHARGE_ADJUSTED", id, {
        adjustment: row,
        before: current,
        after: {
          total: current.total + input.delta,
          paid: current.paid,
          remaining: current.remaining + input.delta,
        },
      });
      return { row };
    },
  );
}
export async function createReceipt(store, input, actor) {
  return command(
    store,
    actor,
    readers,
    input,
    "FINANCE_RECEIPT_CREATE",
    async (tx) => {
      const d = await load(tx),
        charge = ownCharge(d, input.chargeId, actor);
      requireValue(
        charge.status === "ISSUED",
        "Khoản thu chưa phát hành hoặc đã hủy.",
        409,
      );
      requireValue(
        money(input.amount) && ["CASH", "TRANSFER"].includes(input.method),
        "Nhập số tiền và hình thức hợp lệ.",
      );
      requireValue(
        actor.role !== "STUDENT" || input.method === "TRANSFER",
        "Sinh viên chỉ gửi thông tin chuyển khoản.",
        403,
      );
      const reference =
        input.method === "TRANSFER"
          ? typeof input.reference === "string"
            ? input.reference.trim().toUpperCase()
            : ""
          : null;
      requireValue(
        input.method === "CASH" || (reference && reference.length <= 100),
        "Nhập mã giao dịch chuyển khoản, tối đa 100 ký tự.",
      );
      requireValue(
        !reference ||
          !d.receipts.some(
            (r) =>
              r.method === "TRANSFER" &&
              foldText(r.reference) === foldText(reference),
          ),
        "Mã giao dịch đã được ghi nhận. Kiểm tra phiếu cũ trước khi gửi lại.",
        409,
      );
      requireValue(
        input.amount <=
          chargeTotals(charge, d.receipts, d.adjustments).remaining,
        "Số tiền vượt số còn phải nộp.",
        409,
      );
      const row = {
        id: randomUUID(),
        code: code("PT"),
        chargeId: charge.id,
        amount: input.amount,
        method: input.method,
        reference,
        status: "PENDING",
        createdBy: actor.id,
        reportedAt: Date.now(),
        confirmedBy: null,
        confirmedAt: null,
        reason: null,
        version: 1,
      };
      await tx.insert("receipts", row);
      await audit(tx, actor, "RECEIPT_REPORTED", row.id, { after: row });
      return { row };
    },
  );
}
export async function receiptDetail(store, id, actor) {
  authorize(actor, readers);
  const d = await load(store),
    receipt = d.receipts.find((r) => r.id === id);
  requireValue(receipt, "Không tìm thấy phiếu thu.", 404);
  const charge = ownCharge(d, receipt.chargeId, actor);
  return {
    receipt,
    charge: decorate(d, charge),
    adjustments: d.adjustments.filter((r) => r.chargeId === charge.id),
  };
}
export async function decideReceipt(store, id, input, actor, action) {
  const roles = ["reverse", "reopen"].includes(action) ? ["MANAGER"] : managers;
  return command(
    store,
    actor,
    roles,
    input,
    "FINANCE_RECEIPT_" + action + ":" + id,
    async (tx) => {
      const d = await load(tx),
        row = d.receipts.find((r) => r.id === id);
      requireValue(row, "Không tìm thấy phiếu thu.", 404);
      const charge = ownCharge(d, row.chargeId, actor);
      requireValue(
        row.version === input.version &&
          charge.version === input.chargeVersion &&
          input.confirm === true,
        "Phiếu thu hoặc khoản thu đã thay đổi. Tải lại để đối chiếu.",
        409,
      );
      requireValue(
        charge.status === "ISSUED",
        "Khoản thu không còn hiệu lực.",
        409,
      );
      let changes;
      if (action === "confirm") {
        requireValue(
          row.status === "PENDING",
          "Phiếu không ở trạng thái chờ xác minh.",
          409,
        );
        requireValue(
          row.amount <=
            chargeTotals(charge, d.receipts, d.adjustments).remaining,
          "Số còn phải nộp đã thay đổi. Không thể xác nhận vượt khoản thu.",
          409,
        );
        changes = {
          status: "CONFIRMED",
          confirmedBy: actor.id,
          confirmedAt: Date.now(),
          reason: null,
        };
      } else {
        requireValue(reason(input.reason), "Nhập lý do xử lý phiếu thu.");
        const states = {
          reject: ["PENDING", "REJECTED"],
          reverse: ["CONFIRMED", "REVERSED"],
          reopen: [["REJECTED", "REVERSED"], "PENDING"],
        };
        const pair = states[action];
        requireValue(
          pair &&
            (Array.isArray(pair[0])
              ? pair[0].includes(row.status)
              : row.status === pair[0]),
          "Trạng thái phiếu không cho phép thao tác này.",
          409,
        );
        changes = { status: pair[1], reason: input.reason.trim() };
      }
      await tx.update("receipts", id, changes, row.version);
      if (["confirm", "reverse"].includes(action))
        await tx.update(
          "charges",
          charge.id,
          { status: charge.status },
          charge.version,
        );
      const after = { ...row, ...changes, version: row.version + 1 };
      await audit(tx, actor, "RECEIPT_" + action.toUpperCase(), id, {
        before: row,
        after,
      });
      return { row: after };
    },
  );
}
