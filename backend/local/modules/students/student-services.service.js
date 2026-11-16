import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { tokenHash } from "../../core/password.js";
import { freshActor, audit } from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { chargeTotals } from "../finance/finance.rules.js";
import { foldText } from "../../../../shared/local-validation.js";
import { DELIVERY_METHODS, serviceActions } from "../../../../shared/student-services.js";

const roles = ["MANAGER", "STAFF", "STUDENT"], editors = ["MANAGER", "STAFF"];
const uuid = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
function text(v, max, required = false) {
  requireValue(typeof v === "string" && v.length <= max && (!required || v.trim()) &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v), "Nội dung còn thiếu hoặc vượt độ dài cho phép.");
  return v.trim();
}
async function locked(source, actor, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    for (const kind of ["classes", "students", "serviceDefinitions", "serviceRequests"])
      await tx.list(kind, true);
    return work(tx);
  });
}
async function canEdit(tx, actor) {
  return actor.role === "MANAGER" || (actor.role === "STAFF" && (await tx.access()).all);
}
function definitionPayload(input) {
  const p = input.payload;
  requireValue(p && typeof p === "object" && !Array.isArray(p), "Nhập thông tin thủ tục.");
  requireValue(Number.isSafeInteger(p.unitPrice) && p.unitPrice >= 0 && p.unitPrice <= 100000000 &&
    Number.isSafeInteger(p.maxQuantity) && p.maxQuantity >= 1 && p.maxQuantity <= 100,
    "Đơn giá từ 0 đến 100.000.000 đồng; số lượng tối đa từ 1 đến 100.");
  requireValue(Array.isArray(p.deliveryMethods) && p.deliveryMethods.length > 0 &&
    p.deliveryMethods.length <= 2 && new Set(p.deliveryMethods).size === p.deliveryMethods.length &&
    p.deliveryMethods.every((m) => Object.hasOwn(DELIVERY_METHODS, m)), "Chọn hình thức nhận kết quả hợp lệ.");
  requireValue(p.unitPrice * p.maxQuantity <= 2000000000, "Tổng phí tối đa mỗi hồ sơ không vượt 2.000.000.000 đồng.");
  return { instructions: text(p.instructions, 2000, true), requiredDocuments: text(p.requiredDocuments, 1000),
    unitPrice: p.unitPrice, maxQuantity: p.maxQuantity, deliveryMethods: [...p.deliveryMethods] };
}
export async function saveServiceDefinition(source, input, actor, id = null) {
  authorize(actor, editors);
  requireValue(typeof input.code === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(input.code), "Nhập mã thủ tục hợp lệ.");
  const name = text(input.name, 180, true), payload = definitionPayload(input);
  requireValue(Number.isInteger(input.edition) && input.edition >= 1 && input.edition <= 999 && input.confirm === true,
    "Nhập phiên bản từ 1 đến 999 và xác nhận lưu.");
  return locked(source, actor, async (tx) => {
    requireValue(await canEdit(tx, actor), "Danh mục chung cần Quản lý hoặc Nhân viên toàn trường.", 403);
    const rows = await tx.list("serviceDefinitions"), old = rows.find((r) => r.id === id);
    if (id) requireValue(old, "Không tìm thấy thủ tục.", 404);
    requireValue(!old || (old.status === "DRAFT" && old.version === input.version), "Bản nháp đã thay đổi hoặc đã công bố. Tạo phiên bản mới nếu cần sửa.", 409);
    requireValue(!rows.some((r) => r.id !== id && foldText(r.code) === foldText(input.code) && r.edition === input.edition), "Mã và phiên bản đã tồn tại.", 409);
    const changes = { code: input.code.toUpperCase(), name, edition: input.edition, payload, updatedBy: actor.id, updatedAt: Date.now() };
    const row = { id: id || randomUUID(), ...changes, status: "DRAFT", version: (old?.version || 0) + 1 };
    if (old) await tx.update("serviceDefinitions", id, changes, old.version);
    else await tx.insert("serviceDefinitions", row);
    await audit(tx, actor, "SERVICE_DEFINITION_SAVED", row.id, { before: old || null, after: row });
    return row;
  });
}
export async function changeServiceDefinition(source, id, action, input, actor) {
  authorize(actor, ["MANAGER"]);
  requireValue(input.confirm === true, "Cần xác nhận thay đổi thủ tục.");
  const reason = text(input.reason, 1000, true);
  return locked(source, actor, async (tx) => {
    const rows = await tx.list("serviceDefinitions"), row = rows.find((r) => r.id === id);
    requireValue(row, "Không tìm thấy thủ tục.", 404);
    requireValue(row.version === input.version, "Thủ tục đã thay đổi. Tải lại trước khi tiếp tục.", 409);
    requireValue((action === "publish" && row.status === "DRAFT") || (action === "close" && row.status === "PUBLISHED"), "Trạng thái thủ tục không cho phép thao tác này.", 409);
    if (action === "publish") {
      definitionPayload(row);
      requireValue(!rows.some((r) => r.id !== id && foldText(r.code) === foldText(row.code) && r.status === "PUBLISHED"), "Đóng phiên bản đang nhận hồ sơ trước khi công bố bản mới.", 409);
    }
    const changes = { status: action === "publish" ? "PUBLISHED" : "CLOSED", updatedBy: actor.id, updatedAt: Date.now() };
    await tx.update("serviceDefinitions", id, changes, row.version);
    await audit(tx, actor, "SERVICE_DEFINITION_" + action.toUpperCase(), id, { before: row, after: { ...row, ...changes }, reason });
    return { id, status: changes.status, version: row.version + 1 };
  });
}
function details(input, service, requireComplete = false) {
  const p = input.details;
  requireValue(p && typeof p === "object" && !Array.isArray(p), "Nhập thông tin yêu cầu.");
  requireValue(Number.isSafeInteger(p.quantity) && p.quantity >= 1 && p.quantity <= service.payload.maxQuantity,
    "Số lượng vượt giới hạn của thủ tục.");
  requireValue(service.payload.deliveryMethods.includes(p.deliveryMethod), "Hình thức nhận không thuộc thủ tục đã chọn.");
  return { quantity: p.quantity, deliveryMethod: p.deliveryMethod,
    purpose: text(p.purpose, 1000, requireComplete),
    documentsNote: text(p.documentsNote, 1000, requireComplete && Boolean(service.payload.requiredDocuments)),
    estimatedAmount: p.quantity * service.payload.unitPrice };
}
function studentSnapshot(student, accounts) {
  return { id: student.id, code: student.code, fullName: student.fullName, classId: student.classId,
    version: student.version, email: accounts.find((a) => a.id === student.accountId)?.email || "" };
}
function publicRequest(row, actor, students, accounts) {
  const student = students.find((s) => s.id === row.studentId);
  return { id: row.id, studentId: row.studentId, serviceId: row.serviceId, requestedBy: row.requestedBy,
    assignedTo: row.assignedTo, chargeId: row.chargeId || null, assignedName: accounts.find((a) => a.id === row.assignedTo)?.fullName || "",
    studentCode: student?.code || "", studentName: student?.fullName || "", status: row.status,
    payload: row.payload, result: row.result, createdAt: row.createdAt, updatedAt: row.updatedAt, version: row.version,
    history: row.history.map(({ requestId, hash, ...event }) => event), actions: serviceActions(row, actor) };
}
export async function studentServicesOverview(source, actor, query = {}) {
  return locked(source, actor, async (tx) => {
    const students = (await tx.list("students")).filter((s) => actor.role !== "STUDENT" || s.accountId === actor.id),
      accounts = await tx.list("accounts"), ids = new Set(students.map((s) => s.id)),
      own = students.find((s) => s.accountId === actor.id),
      charges = await tx.list("charges"), receipts = await tx.list("receipts"), adjustments = await tx.list("adjustments");
    const rows = (await tx.list("serviceRequests"))
      .filter((r) => ids.has(r.studentId) && (actor.role === "STUDENT" ? r.requestedBy === actor.id : r.status !== "DRAFT"))
      .map((r) => publicRequest(r, actor, students, accounts))
      .map((r) => {
        if (!r.chargeId) return { ...r, finance: null };
        const c = charges.find((c) => c.id === r.chargeId && c.studentId === r.studentId && c.issuedAt);
        if (!c) return { ...r, finance: { status: "NEEDS_REVIEW" } };
        try { return { ...r, finance: { chargeId: c.id, code: c.code, title: c.title, status: c.status, ...chargeTotals(c, receipts, adjustments) } }; }
        catch (error) { if (error.status !== 409) throw error; return { ...r, finance: { status: "NEEDS_REVIEW" } }; }
      })
      .filter((r) => (!query.status || r.status === query.status) &&
        foldText(`${r.id} ${r.studentCode} ${r.studentName} ${r.payload.service.code} ${r.payload.service.name}`).includes(foldText(query.q || "")))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return { rows, definitions: (await tx.list("serviceDefinitions")).filter((d) => actor.role !== "STUDENT" || d.status === "PUBLISHED"),
      ownProfile: own ? { id: own.id, code: own.code, fullName: own.fullName, version: own.version } : null,
      canEditDefinitions: await canEdit(tx, actor), canPublish: actor.role === "MANAGER",
      processors: actor.role === "MANAGER" ? accounts.filter((a) => a.active && editors.includes(a.role)).map((a) => ({ id: a.id, name: a.fullName })) : [],
      charges: editors.includes(actor.role) ? charges.filter((c) => c.status === "ISSUED" && c.issuedAt).map(({ id, code, title, studentId, amount }) => ({ id, code, title, studentId, amount })) : [],
      asOf: Date.now() };
  });
}
export async function createServiceRequest(source, input, actor) {
  authorize(actor, ["STUDENT"]);
  requireValue(uuid(input.requestId) && input.confirm === true, "Cần xác nhận và mã yêu cầu hợp lệ.");
  return locked(source, actor, async (tx) => {
    const student = (await tx.list("students")).find((s) => s.accountId === actor.id);
    requireValue(student, "Tài khoản chưa liên kết hồ sơ sinh viên.", 409);
    const rows = await tx.list("serviceRequests"), hash = tokenHash(JSON.stringify({ actor: actor.id, serviceId: input.serviceId, serviceVersion: input.serviceVersion, studentVersion: input.studentVersion, details: input.details })),
      retry = rows.find((r) => r.id === input.requestId);
    if (retry) {
      requireValue(retry.requestedBy === actor.id && retry.requestHash === hash, "Mã yêu cầu đã dùng cho nội dung khác.", 409);
      return { id: retry.id, status: retry.status, version: retry.version, replayed: true };
    }
    const service = (await tx.list("serviceDefinitions")).find((d) => d.id === input.serviceId);
    requireValue(service?.status === "PUBLISHED" && service.version === input.serviceVersion && student.version === input.studentVersion,
      "Thủ tục hoặc hồ sơ đã thay đổi. Tải lại trước khi lập yêu cầu.", 409);
    const at = Date.now(), row = { id: input.requestId, studentId: student.id, serviceId: service.id,
      requestedBy: actor.id, assignedTo: null, chargeId: null, requestHash: hash, status: "DRAFT",
      payload: { service: structuredClone(service), student: studentSnapshot(student, await tx.list("accounts")), details: details(input, service) },
      result: null, history: [{ action: "create", actorId: actor.id, actorName: actor.fullName, at, from: null, to: "DRAFT", reason: "Lưu bản nháp" }],
      createdAt: at, updatedAt: at, version: 1 };
    await tx.insert("serviceRequests", row);
    await audit(tx, actor, "STUDENT_SERVICE_DRAFT", row.id, { studentId: row.studentId, status: "DRAFT" });
    return { id: row.id, status: row.status, version: row.version };
  });
}
export async function changeServiceRequest(source, id, action, input, actor) {
  authorize(actor, roles);
  requireValue(uuid(input.requestId) && input.confirm === true, "Cần xác nhận và mã thao tác hợp lệ.");
  return locked(source, actor, async (tx) => {
    const students = (await tx.list("students")).filter((s) => actor.role !== "STUDENT" || s.accountId === actor.id),
      rows = await tx.list("serviceRequests"), row = rows.find((r) => r.id === id && students.some((s) => s.id === r.studentId));
    requireValue(row && (actor.role !== "STUDENT" || row.requestedBy === actor.id) && (actor.role === "STUDENT" || row.status !== "DRAFT"), "Không tìm thấy hồ sơ trong quyền.", 404);
    const hash = tokenHash(JSON.stringify({ ...input, actorId: actor.id, action })), retry = row.history.find((h) => h.requestId === input.requestId);
    if (retry) {
      requireValue(retry.actorId === actor.id && retry.hash === hash, "Mã thao tác đã dùng cho nội dung khác.", 409);
      return { id, status: retry.to, version: retry.resultVersion, replayed: true };
    }
    requireValue(row.version === input.version, "Hồ sơ đã thay đổi. Tải lại trước khi xử lý.", 409);
    const reassign = action === "reassign" && actor.role === "MANAGER" && ["SUBMITTED", "IN_PROGRESS", "NEEDS_INFO", "READY"].includes(row.status);
    requireValue(reassign || serviceActions(row, actor).includes(action), "Bạn không được thực hiện thao tác này trên trạng thái hiện tại.", 403);
    requireValue(!["take", "reject"].includes(action) || !row.assignedTo || row.assignedTo === actor.id || actor.role === "MANAGER", "Hồ sơ đã có người phụ trách.", 403);
    const student = students.find((s) => s.id === row.studentId), at = Date.now(),
      changes = { updatedAt: at }, payload = structuredClone(row.payload);
    const reason = text(input.reason || "", 1000, !["edit", "submit", "take"].includes(action));
    if (action === "edit") {
      requireValue(input.studentVersion === student.version, "Hồ sơ sinh viên đã thay đổi. Tải lại trước khi bổ sung.", 409);
      let service = payload.service;
      if (row.status === "DRAFT") {
        service = (await tx.list("serviceDefinitions")).find((d) => d.id === row.serviceId);
        requireValue(service?.status === "PUBLISHED" && service.version === input.serviceVersion, "Thủ tục đã thay đổi hoặc đóng nhận hồ sơ.", 409);
      }
      payload.service = structuredClone(service);
      payload.student = studentSnapshot(student, await tx.list("accounts"));
      payload.details = details(input, service);
      changes.payload = payload;
    } else if (action === "submit") {
      requireValue(payload.student.version === student.version, "Hồ sơ sinh viên đã đổi. Mở bổ sung và lưu lại trước khi gửi.", 409);
      if (row.status === "DRAFT") {
        const live = (await tx.list("serviceDefinitions")).find((d) => d.id === row.serviceId);
        requireValue(live?.status === "PUBLISHED" && live.version === payload.service.version, "Thủ tục đã thay đổi hoặc đóng nhận hồ sơ. Đối chiếu lại bản nháp.", 409);
      }
      details({ details: payload.details }, payload.service, true);
      requireValue(!rows.some((r) => r.id !== id && r.studentId === student.id && foldText(r.payload.service.code) === foldText(payload.service.code) && ["SUBMITTED", "IN_PROGRESS", "NEEDS_INFO", "READY"].includes(r.status)), "Bạn đã có hồ sơ thủ tục này đang được xử lý.", 409);
      changes.status = "SUBMITTED";
    } else if (action === "take") {
      changes.status = "IN_PROGRESS"; changes.assignedTo = actor.id;
    } else if (action === "reassign") {
      const account = (await tx.list("accounts")).find((a) => a.id === input.assignedTo && a.active && editors.includes(a.role));
      requireValue(account, "Chọn cán bộ đang hoạt động.");
      requireValue((await staffStore(tx.staffScoped ? tx.source : tx, account).list("students")).some((s) => s.id === student.id), "Cán bộ không có phạm vi xử lý sinh viên này.", 403);
      changes.assignedTo = account.id;
    } else if (action === "link-charge") {
      const charge = (await tx.list("charges", true)).find((c) => c.id === input.chargeId);
      requireValue(charge && charge.studentId === row.studentId && charge.status === "ISSUED" && charge.issuedAt &&
        charge.amount === row.payload.details.estimatedAmount && charge.amount > 0,
        "Khoản thu phải đã phát hành cho đúng sinh viên và đúng mức phí gốc của hồ sơ.", 409);
      requireValue(!(await integrityStore(tx).list("serviceRequests")).some((r) => r.id !== id && r.chargeId === charge.id), "Khoản thu đã được liên kết với một hồ sơ thủ tục khác.", 409);
      changes.chargeId = charge.id;
    } else if (action === "unlink-charge") {
      requireValue(actor.role === "MANAGER" && row.chargeId, "Chỉ Quản lý được sửa liên kết đã ghi nhận.", 403);
      changes.chargeId = null;
    } else if (action === "request-info") changes.status = "NEEDS_INFO";
    else if (action === "ready") {
      changes.status = "READY";
      changes.result = { reference: text(input.reference, 200, true), message: text(input.message, 2000, true), readyAt: at, readyBy: actor.id };
    } else if (action === "deliver") {
      requireValue(row.result?.reference && row.result?.message, "Chưa có kết quả để trả.", 409);
      changes.status = "DELIVERED";
      changes.result = { ...row.result, deliveredAt: at, deliveredBy: actor.id, deliveryReference: text(input.reference, 200, true) };
    } else if (action === "reject") changes.status = "REJECTED";
    else if (action === "cancel") changes.status = "CANCELLED";
    const after = { ...row, ...changes, version: row.version + 1 };
    changes.history = [...row.history, { requestId: input.requestId, hash, action, actorId: actor.id, actorName: actor.fullName,
      at, from: row.status, to: after.status, reason, resultVersion: after.version,
      ...(action === "reassign" ? { assignedTo: changes.assignedTo } : {}) }];
    await tx.update("serviceRequests", id, changes, row.version);
    await audit(tx, actor, "STUDENT_SERVICE_" + (action === "edit" ? "DRAFT" : action === "reassign" ? "REASSIGNED" : ["link-charge", "unlink-charge"].includes(action) ? "FINANCE_LINKED" : after.status), id,
      action === "edit" && row.status === "DRAFT" ? { studentId: row.studentId, status: "DRAFT", version: after.version }
        : { before: { status: row.status, assignedTo: row.assignedTo, chargeId: row.chargeId, payload: row.payload, result: row.result },
            after: { status: after.status, assignedTo: after.assignedTo, chargeId: after.chargeId, payload: after.payload, result: after.result }, reason });
    return { id, status: after.status, version: after.version };
  });
}
