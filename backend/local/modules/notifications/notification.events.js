import { randomUUID } from "node:crypto";
import { integrityStore } from "../access/staff-store.js";

// Chỉ gọi bên trong transaction nghiệp vụ; nội dung nhạy cảm không sao vào hộp tin.
export async function publishNotices(scoped, actor, event) {
  const supported =
    /^(STUDENT_SERVICE_|CREDIT_RECOGNITION_|STUDY_STATUS_|PROFILE_CHANGE_|PROGRAM_CHANGE_|TASK_|APPROVAL_|GRADES_(SUBMITTED|RETURNED|PUBLISHED)$|EXAM_(PUBLISHED|CANCELLED)$|CURRICULUM_ASSIGNED$|TIMETABLE_)/;
  if (!supported.test(event.action)) return;
  const tx = integrityStore(scoped),
    action = event.action,
    id = event.entityId;
  const accounts = (await tx.list("accounts")).filter((a) => a.active),
    ids = new Set();
  const add = (id) => {
    if (id && id !== actor.id) ids.add(id);
  };
  const managers = () =>
    accounts.filter((a) => a.role === "MANAGER").forEach((a) => add(a.id));
  const row = async (table, id) =>
    (await tx.list(table)).find((r) => r.id === id);
  let kind;
  const payloads = new Map();
  if (action.startsWith("STUDENT_SERVICE_")) {
    if (action === "STUDENT_SERVICE_DRAFT") return;
    kind = "STUDENT_SERVICE";
    const request = await row("serviceRequests", id);
    if (!request) return;
    add(request.requestedBy); add(request.assignedTo);
    if (action === "STUDENT_SERVICE_SUBMITTED") {
      managers();
      const student = await row("students", request.studentId),
        group = await row("classes", student?.classId), major = await row("majors", group?.majorId), scopes = await tx.list("staffScopes");
      for (const a of accounts.filter((a) => a.role === "STAFF"))
        if (scopes.some((s) => s.accountId === a.id && s.active && (s.scopeType === "ALL" ||
          (s.facultyId === major?.facultyId && (!s.cohortId || s.cohortId === group?.cohortId))))) add(a.id);
    }
  } else if (action.startsWith("CREDIT_RECOGNITION_")) {
    kind = "CREDIT_RECOGNITION";
    const request = await row("creditRecognitions", id);
    if (!request) return;
    add(request.requestedBy);
    if (action === "CREDIT_RECOGNITION_PENDING") managers();
    if (
      ["CREDIT_RECOGNITION_APPLIED", "CREDIT_RECOGNITION_REVOKED"].includes(
        action,
      )
    )
      add((await row("students", request.studentId))?.accountId);
  } else if (action.startsWith("STUDY_STATUS_")) {
    kind = "STUDY_STATUS";
    const request = await row("statusRequests", id);
    if (!request) return;
    add(request.requestedBy);
    add(request.reviewedBy);
    add((await row("students", request.studentId))?.accountId);
    if (["STUDY_STATUS_SUBMITTED", "STUDY_STATUS_REVIEWED"].includes(action))
      managers();
  } else if (action.startsWith("PROGRAM_CHANGE_")) {
    kind = "PROGRAM_CHANGE";
    const request = await row("curriculumTransfers", id);
    if (!request) return;
    if (action === "PROGRAM_CHANGE_SUBMITTED") managers();
    add(request.requestedBy);
    if (action === "PROGRAM_CHANGE_APPLIED")
      add((await row("students", request.studentId))?.accountId);
  } else if (action.startsWith("PROFILE_CHANGE_")) {
    kind = "PROFILE";
    const request = await row("profileRequests", id);
    if (!request) return;
    if (
      ["PROFILE_CHANGE_REQUESTED", "PROFILE_CHANGE_RESUBMIT"].includes(action)
    ) {
      managers();
      const student = await row("students", request.studentId),
        group = await row("classes", student?.classId),
        major = await row("majors", group?.majorId),
        scopes = await tx.list("staffScopes");
      for (const a of accounts.filter((a) => a.role === "STAFF"))
        if (
          scopes.some(
            (s) =>
              s.accountId === a.id &&
              s.active &&
              (s.scopeType === "ALL" ||
                (s.facultyId === major?.facultyId &&
                  (!s.cohortId || s.cohortId === group?.cohortId))),
          )
        )
          add(a.id);
    } else {
      add(request.requestedBy);
      add(request.assignedTo);
      if (
        ["PROFILE_CHANGE_RECOMMEND", "PROFILE_CHANGE_CANCEL"].includes(action)
      )
        managers();
    }
  } else if (action.startsWith("TASK_")) {
    kind = "TASK";
    const task = await row("tasks", id);
    if (!task) return;
    add(task.assignedTo);
    add(task.assignedBy);
  } else if (action.startsWith("APPROVAL_")) {
    kind = "APPROVAL";
    const request = await row("approvals", id);
    if (!request) return;
    add(request.requestedBy);
    if (action === "APPROVAL_SUBMITTED") managers();
  } else if (action === "CURRICULUM_ASSIGNED") {
    kind = "CURRICULUM";
    const assignment = await row("curriculumAssignments", id);
    if (!assignment) return;
    add((await row("students", assignment.studentId))?.accountId);
  } else {
    let sectionId;
    if (action.startsWith("GRADES_")) {
      kind = "GRADES";
      sectionId = id;
    } else if (action.startsWith("EXAM_")) {
      kind = "EXAM";
      const exam = await row("exams", id);
      if (!exam) return;
      sectionId = exam.sectionId;
      add(exam.invigilatorId);
    } else {
      kind = "TIMETABLE";
      sectionId = id;
    }
    const section = await row("sections", sectionId);
    if (!section) return;
    add(section.lecturerId);
    if (action === "GRADES_SUBMITTED") managers();
    if (
      action === "GRADES_PUBLISHED" ||
      kind === "EXAM" ||
      kind === "TIMETABLE"
    ) {
      const students = await tx.list("students"),
        enrollments = await tx.list("enrollments");
      const grades =
        action === "GRADES_PUBLISHED" ? await tx.list("grades") : [];
      for (const enrollment of enrollments.filter(
        (e) => e.sectionId === section.id && e.status === "ACTIVE",
      )) {
        const accountId = students.find(
          (s) => s.id === enrollment.studentId,
        )?.accountId;
        if (action === "GRADES_PUBLISHED") {
          const grade = grades.find(
            (g) =>
              g.enrollmentId === enrollment.id &&
              g.enrollmentVersion === enrollment.version &&
              g.status === "PUBLISHED" &&
              event.detail?.rows?.some((r) => r.id === g.id),
          );
          if (!grade) continue;
          payloads.set(accountId, {
            gradeId: grade.id,
            enrollmentId: enrollment.id,
            enrollmentVersion: enrollment.version,
          });
        }
        add(accountId);
      }
    }
  }
  if (!kind) return;
  for (const recipient of accounts.filter((a) => ids.has(a.id)))
    await tx.insert("notifications", {
      id: randomUUID(),
      eventId: event.id,
      accountId: recipient.id,
      recipientRole: recipient.role,
      kind,
      entityId: id,
      action,
      payload: payloads.get(recipient.id) || null,
      createdAt: Date.now(),
      readAt: null,
      version: 1,
    });
}
