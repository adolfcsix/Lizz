import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { publishNotices } from "../notifications/notification.events.js";
export async function freshActor(tx, actor, roles) {
  authorize(actor, roles);
  const current = (await tx.list("accounts", true)).find(
    (r) => r.id === actor.id,
  );
  requireValue(
    current?.active &&
      current.version === actor.version &&
      current.role === actor.role,
    "Phiên hoặc quyền đã thay đổi. Đăng nhập lại.",
    401,
  );
}
export async function audit(tx, actor, action, entityId, detail) {
  const event = {
    id: randomUUID(),
    actorId: actor.id,
    action,
    entityId,
    detail,
  };
  await tx.insert("events", event);
  await publishNotices(tx, actor, event);
}
// Cùng thứ tự khóa cho quy chế, đăng ký và điểm; chưa tối ưu cho quy mô production.
export async function lockAcademic(tx) {
  for (const kind of [
    "subjects",
    "terms",
    "studyPolicies",
    "statusRequests",
    "periods",
    "requirements",
    "sections",
    "timetablePlans",
    "enrollments",
    "grades",
    "curricula",
    "curriculumAssignments",
    "creditRecognitions",
  ])
    await tx.list(kind, true);
}
