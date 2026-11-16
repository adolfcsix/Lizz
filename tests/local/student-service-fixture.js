import { randomUUID } from "node:crypto";
import { serviceFixture } from "./student-services-fixture.js";
import { saveServiceDefinition, changeServiceDefinition, createServiceRequest, changeServiceRequest, studentServicesOverview } from "../../backend/local/modules/students/student-services.service.js";
export async function studentServiceFixture() {
  const f = await serviceFixture(), facultyId = randomUUID(), cohortId = randomUUID(), majorId = randomUUID();
  await f.store.insert("faculties", { id: facultyId, name: "Khoa CNTT", version: 1 });
  await f.store.insert("cohorts", { id: cohortId, name: "Khóa 2020", version: 1 });
  await f.store.insert("majors", { id: majorId, name: "CNTT", facultyId, version: 1 });
  for (const s of f.profiles) await f.store.insert("classes", { id: s.classId, majorId, cohortId, version: 1 });
  const staff2 = { ...f.staff, id: randomUUID(), username: "staff2", email: "staff2@example.test", fullName: "Cán bộ thứ hai" };
  await f.store.insert("accounts", staff2);
  const scopeId = randomUUID();
  for (const a of [f.staff, staff2]) await f.store.insert("staffScopes", { id: a.id === f.staff.id ? scopeId : randomUUID(), accountId: a.id, scopeType: "ALL", facultyId: null, cohortId: null, active: true, version: 1 });
  const definitionInput = { code: "XNSV", name: "Giấy xác nhận sinh viên", edition: 1, confirm: true,
    payload: { unitPrice: 10000, maxQuantity: 5, deliveryMethods: ["COUNTER", "EMAIL"], instructions: "Nhập mục đích sử dụng, chuẩn bị giấy tờ theo hướng dẫn.", requiredDocuments: "Thẻ sinh viên" } };
  const draft = await saveServiceDefinition(f.store, definitionInput, f.staff);
  const pub = await changeServiceDefinition(f.store, draft.id, "publish", { version: draft.version, confirm: true, reason: "Ban hành thủ tục minh họa để kiểm thử" }, f.manager);
  const definition = { ...draft, ...pub };
  const body = () => ({ requestId: randomUUID(), confirm: true, serviceId: definition.id, serviceVersion: definition.version,
    studentVersion: f.profiles[0].version, details: { quantity: 2, deliveryMethod: "COUNTER", purpose: "Bổ sung hồ sơ cá nhân", documentsNote: "Mang thẻ sinh viên khi nhận" } });
  const create = (input = body(), actor = f.student) => createServiceRequest(f.store, input, actor);
  const change = (row, action, actor = ["edit", "submit", "cancel"].includes(action) ? f.student : f.staff, extra = {}) => changeServiceRequest(f.store, row.id, action, { requestId: randomUUID(), confirm: true, version: row.version, reason: "Xử lý theo hồ sơ", ...extra }, actor);
  const submit = async () => change(await create(), "submit");
  const detail = async (id, actor = f.student) => (await studentServicesOverview(f.store, actor)).rows.find((r) => r.id === id);
  return { ...f, staff2, facultyId, cohortId, majorId, scopeId, definitionInput, definition, body, create, change, submit, detail };
}
