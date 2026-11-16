import { studentStatusController } from "./modules/students/student-status.controller.js";
import { studentServicesController } from "./modules/students/student-services.controller.js";
import { profileRequestController } from "./modules/students/profile-request.controller.js";
import { notificationController } from "./modules/notifications/notification.controller.js";
import { curriculumController } from "./modules/curriculum/curriculum.controller.js";
import { timetableController } from "./modules/academic/timetable.controller.js";
import { gradeReviewController } from "./modules/grades/grade-review.controller.js";
import { staffStore, publicAuditEvent } from "./modules/access/staff-store.js";
import { attendanceController } from "./modules/attendance/attendance.controller.js";
import { financeController } from "./modules/finance/finance.controller.js";
import { examController } from "./modules/exams/exam.controller.js";
import { gradeController } from "./modules/grades/grade.controller.js";
import { workflowController } from "./modules/workflows/workflow.controller.js";
import { academicController } from "./modules/academic/academic.controller.js";
import { aiController } from "./modules/ai/ai.controller.js";
import { authController } from "./modules/auth/auth.controller.js";
import { accountController } from "./modules/accounts/account.controller.js";
import { catalogController } from "./modules/catalog/catalog.controller.js";
import { studentController } from "./modules/students/student.controller.js";
import { json } from "./core/http.js";
import { requireValue } from "./core/errors.js";
import { authorize } from "./middlewares/authorize.js";

// Đọc file này để biết URL nào được controller nào xử lý.
export async function routeApi(context) {
  requireValue(
    !context.actor?.mustChangePassword ||
      [
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/api/v1/auth/password",
        "/api/v1/auth/logout",
        "/api/v1/health",
      ].includes(context.url.pathname),
    "Bạn cần đổi mật khẩu được cấp trước khi sử dụng hệ thống.",
    403,
  );
  context = { ...context, store: staffStore(context.store, context.actor) };
  const { url, request, response, store, actor, mode } = context;
  if (url.pathname === "/api/v1/student-services" || url.pathname.startsWith("/api/v1/student-services/"))
    return studentServicesController(context);
  if (
    url.pathname === "/api/v1/notifications" ||
    url.pathname.startsWith("/api/v1/notifications/")
  )
    return notificationController(context);
  if (url.pathname === "/api/v1/access/me" && request.method === "GET") {
    authorize(actor, ["MANAGER", "STAFF", "LECTURER", "STUDENT"]);
    if (actor.role !== "STAFF")
      return json(response, {
        allSchools: actor.role === "MANAGER",
        canManageShared: actor.role === "MANAGER",
        scopes: [],
      });
    const access = await store.access(),
      faculties = await store.list("faculties"),
      cohorts = await store.list("cohorts");
    return json(response, {
      allSchools: access.all,
      canManageShared: access.all,
      canManageMajors: access.all || access.scopes.some((s) => !s.cohortId),
      scopes: access.scopes.map((s) => ({
        scopeType: s.scopeType,
        facultyId: s.facultyId,
        cohortId: s.cohortId,
        facultyName: faculties.find((f) => f.id === s.facultyId)?.name || "",
        cohortName: cohorts.find((c) => c.id === s.cohortId)?.name || "",
      })),
    });
  }
  if (
    url.pathname === "/api/v1/student-status" ||
    url.pathname.startsWith("/api/v1/student-status/")
  )
    return studentStatusController(context);
  if (
    url.pathname === "/api/v1/profile-requests" ||
    url.pathname.startsWith("/api/v1/profile-requests/")
  )
    return profileRequestController(context);
  if (
    url.pathname === "/api/v1/curricula" ||
    url.pathname.startsWith("/api/v1/curricula/")
  )
    return curriculumController(context);
  if (
    url.pathname === "/api/v1/timetable" ||
    url.pathname.startsWith("/api/v1/timetable/")
  )
    return timetableController(context);
  if (
    url.pathname === "/api/v1/grade-reviews" ||
    url.pathname.startsWith("/api/v1/grade-reviews/")
  )
    return gradeReviewController(context);
  if (
    url.pathname === "/api/v1/finance" ||
    url.pathname.startsWith("/api/v1/finance/")
  )
    return financeController(context);
  if (
    url.pathname === "/api/v1/attendance" ||
    url.pathname.startsWith("/api/v1/attendance/")
  )
    return attendanceController(context);
  if (
    url.pathname === "/api/v1/exams" ||
    url.pathname.startsWith("/api/v1/exams/")
  )
    return examController(context);
  if (
    url.pathname === "/api/v1/grades" ||
    url.pathname.startsWith("/api/v1/grades/")
  )
    return gradeController(context);
  if (
    url.pathname === "/api/v1/workflows" ||
    url.pathname.startsWith("/api/v1/workflows/")
  )
    return workflowController(context);
  if (
    url.pathname === "/api/v1/academics" ||
    url.pathname.startsWith("/api/v1/academics/")
  )
    return academicController(context);
  if (url.pathname.startsWith("/api/v1/ai/")) return aiController(context);
  if (url.pathname.startsWith("/api/v1/auth/")) return authController(context);
  if (url.pathname.startsWith("/api/v1/accounts"))
    return accountController(context);
  if (url.pathname.startsWith("/api/v1/catalog"))
    return catalogController(context);
  if (url.pathname.startsWith("/api/v1/students"))
    return studentController(context);
  if (url.pathname === "/api/v1/audit" && request.method === "GET") {
    authorize(actor, ["MANAGER", "STAFF"]);
    const rows = await store.list("events");
    return json(response, {
      rows: rows.slice(-100).reverse().map(publicAuditEvent),
    });
  }
  if (url.pathname === "/api/v1/health" && request.method === "GET") {
    return json(response, {
      mode,
      database: mode === "demo" ? "memory-demo" : "mysql",
      scope:
        "accounts-catalog-students-academics-policies-grades-exams-workflows-lizzchat",
    });
  }
  json(response, { error: "Không tìm thấy API." }, 404);
}
