import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { freshActor } from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { foldText } from "../../../../shared/local-validation.js";
import {
  NOTICE_TITLES,
  NOTICE_ROUTES,
} from "../../../../shared/notification-labels.js";
const roles = ["MANAGER", "STAFF", "LECTURER", "STUDENT"];
async function visibleRows(tx, actor) {
  const all = (await integrityStore(tx).list("notifications")).filter(
    (n) => n.accountId === actor.id && n.recipientRole === actor.role,
  );
  const students = await tx.list("students"),
    enrollments = await tx.list("enrollments"),
    sections = await tx.list("sections");
  const profiles = await tx.list("profileRequests"),
    tasks = await tx.list("tasks"),
    approvals = await tx.list("approvals"),
    exams = await tx.list("exams"),
    plans = await tx.list("timetablePlans"),
    grades = await tx.list("grades"),
    assignments = await tx.list("curriculumAssignments"),
    transfers = await tx.list("curriculumTransfers"),
    statuses = await tx.list("statusRequests"),
    recognitions = await tx.list("creditRecognitions"),
    serviceRequests = await tx.list("serviceRequests");
  const ownStudent = students.find((s) => s.accountId === actor.id);
  const ownsSection = (id) =>
    actor.role === "MANAGER" ||
    (actor.role === "STAFF" && sections.some((s) => s.id === id)) ||
    (actor.role === "LECTURER" &&
      sections.some((s) => s.id === id && s.lecturerId === actor.id)) ||
    (actor.role === "STUDENT" &&
      enrollments.some(
        (e) =>
          e.sectionId === id &&
          e.studentId === ownStudent?.id &&
          e.status === "ACTIVE",
      ));
  return all
    .filter((n) => {
      switch (n.kind) {
        case "STUDENT_SERVICE":
          return serviceRequests.some((r) => r.id === n.entityId && r.status !== "DRAFT" &&
            students.some((s) => s.id === r.studentId) &&
            (["MANAGER", "STAFF"].includes(actor.role) || (actor.role === "STUDENT" && r.studentId === ownStudent?.id && r.requestedBy === actor.id)));
        case "CREDIT_RECOGNITION":
          return recognitions.some(
            (r) =>
              r.id === n.entityId &&
              students.some((s) => s.id === r.studentId) &&
              (actor.role === "MANAGER" ||
                actor.role === "STAFF" ||
                (actor.role === "STUDENT" &&
                  ["APPLIED", "REVOKED"].includes(r.status) &&
                  r.studentId === ownStudent?.id)),
          );
        case "STUDY_STATUS":
          return statuses.some(
            (r) =>
              r.id === n.entityId &&
              students.some((s) => s.id === r.studentId) &&
              (actor.role === "MANAGER" ||
                actor.role === "STAFF" ||
                (actor.role === "STUDENT" && r.studentId === ownStudent?.id)),
          );
        case "PROGRAM_CHANGE":
          return transfers.some(
            (r) =>
              r.id === n.entityId &&
              students.some((s) => s.id === r.studentId) &&
              (actor.role === "MANAGER" ||
                (actor.role === "STAFF" && r.requestedBy === actor.id) ||
                (actor.role === "STUDENT" &&
                  r.status === "APPLIED" &&
                  r.studentId === ownStudent?.id)),
          );
        case "PROFILE":
          return profiles.some(
            (r) =>
              r.id === n.entityId &&
              (actor.role === "MANAGER" ||
                actor.role === "STAFF" ||
                (actor.role === "STUDENT" && r.studentId === ownStudent?.id)),
          );
        case "TASK":
          return tasks.some(
            (r) =>
              r.id === n.entityId &&
              (actor.role === "MANAGER" ||
                (actor.role === "STAFF" && r.assignedTo === actor.id)),
          );
        case "APPROVAL":
          return approvals.some(
            (r) =>
              r.id === n.entityId &&
              (actor.role === "MANAGER" ||
                (actor.role === "STAFF" && r.requestedBy === actor.id)),
          );
        case "CURRICULUM":
          return assignments.some(
            (r) =>
              r.id === n.entityId &&
              actor.role === "STUDENT" &&
              r.studentId === ownStudent?.id,
          );
        case "GRADES":
          return (
            ownsSection(n.entityId) &&
            (actor.role !== "STUDENT" ||
              (n.action === "GRADES_PUBLISHED" &&
                enrollments.some(
                  (e) =>
                    e.id === n.payload?.enrollmentId &&
                    e.studentId === ownStudent?.id &&
                    e.status === "ACTIVE" &&
                    e.version === n.payload.enrollmentVersion,
                ) &&
                grades.some(
                  (g) =>
                    g.id === n.payload?.gradeId &&
                    g.status === "PUBLISHED" &&
                    g.enrollmentVersion === n.payload.enrollmentVersion,
                )))
          );
        case "EXAM": {
          const exam = exams.find((e) => e.id === n.entityId);
          return Boolean(
            exam &&
            (ownsSection(exam.sectionId) ||
              (actor.role === "LECTURER" && exam.invigilatorId === actor.id)),
          );
        }
        case "TIMETABLE":
          return plans.some(
            (p) => p.sectionId === n.entityId && ownsSection(p.sectionId),
          );
        default:
          return false;
      }
    })
    .map((n) => {
      const task =
        n.kind === "TASK" ? tasks.find((t) => t.id === n.entityId) : null;
      const profile =
        n.kind === "STUDENT_SERVICE"
          ? serviceRequests.find((r) => r.id === n.entityId)
          : n.kind === "PROFILE"
          ? profiles.find((r) => r.id === n.entityId)
          : n.kind === "CREDIT_RECOGNITION"
            ? recognitions.find((r) => r.id === n.entityId)
            : null;
      const student = profile
        ? students.find((s) => s.id === profile.studentId)
        : null;
      const exam =
        n.kind === "EXAM" ? exams.find((e) => e.id === n.entityId) : null;
      const section = sections.find(
        (s) => s.id === (exam?.sectionId || n.entityId),
      );
      const context =
        task?.title ||
        (student ? `${student.code} · ${student.fullName}` : "") ||
        (n.kind === "APPROVAL"
          ? approvals.find((a) => a.id === n.entityId)?.title
          : "") ||
        section?.code ||
        (n.kind === "CURRICULUM" ? ownStudent?.code : "") ||
        "";
      const day = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      return {
        id: n.id,
        kind: n.kind,
        title: NOTICE_TITLES[n.action] || "Thời khóa biểu có cập nhật",
        route: NOTICE_ROUTES[n.kind],
        createdAt: n.createdAt,
        readAt: n.readAt,
        version: n.version,
        taskTitle: task?.title || "",
        context,
        dueDate: task?.dueDate || null,
        overdue: Boolean(
          task &&
          !["COMPLETED", "CANCELLED"].includes(task.status) &&
          task.dueDate < day,
        ),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
async function locked(source, actor, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    return work(tx);
  });
}
export async function notificationOverview(
  source,
  actor,
  query = new URLSearchParams(),
) {
  return locked(source, actor, async (tx) => {
    const rows = await visibleRows(tx, actor),
      q = foldText(query.get("q") || "");
    const filtered = rows.filter(
      (r) =>
        (!query.get("kind") || query.get("kind") === r.kind) &&
        (query.get("status") !== "unread" || r.readAt === null) &&
        foldText(r.title + " " + r.context).includes(q),
    );
    const page = Math.max(1, parseInt(query.get("page"), 10) || 1),
      pages = Math.max(1, Math.ceil(filtered.length / 20)),
      current = Math.min(page, pages);
    return {
      rows: filtered.slice((current - 1) * 20, current * 20),
      unreadCount: rows.filter((r) => r.readAt === null).length,
      total: filtered.length,
      page: current,
      pageSize: 20,
    };
  });
}
export async function markNotifications(source, actor, input) {
  authorize(actor, roles);
  requireValue(
    typeof input.read === "boolean" &&
      Array.isArray(input.rows) &&
      input.rows.length > 0 &&
      input.rows.length <= 100 &&
      new Set(input.rows.map((r) => r?.id)).size === input.rows.length &&
      input.rows.every(
        (r) =>
          typeof r?.id === "string" &&
          Number.isSafeInteger(r.version) &&
          r.version > 0,
      ),
    "Chọn thông báo và trạng thái hợp lệ.",
  );
  return locked(source, actor, async (tx) => {
    const visible = await visibleRows(tx, actor),
      raw = integrityStore(tx);
    let count = 0;
    for (const item of input.rows) {
      const row = visible.find((r) => r.id === item.id);
      requireValue(row, "Không tìm thấy thông báo trong quyền.", 404);
      if ((row.readAt !== null) === input.read) continue;
      requireValue(
        row.version === item.version,
        "Trạng thái đã thay đổi. Tải lại thông báo.",
        409,
      );
      await raw.update(
        "notifications",
        row.id,
        { readAt: input.read ? Date.now() : null },
        row.version,
      );
      count++;
    }
    return { count };
  });
}
