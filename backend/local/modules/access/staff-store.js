import { requireValue } from "../../core/errors.js";
import { foldText } from "../../../../shared/local-validation.js";
import { tokenHash } from "../../core/password.js";
// Chỉ service kiểm tra xung đột được đọc kho đầy đủ; không dùng để tạo response.
export const integrityStore = (store) =>
  store.staffScoped ? store.source : store;
export function staffStore(store, actor) {
  return actor?.role === "STAFF" && !store.staffScoped
    ? new StaffStore(store, actor)
    : store;
}
export function publicAuditEvent(row) {
  const { staffScopeToken, ...detail } = row.detail || {};
  return { ...row, detail };
}
export class StaffStore {
  constructor(source, actor) {
    this.source = source;
    this.actor = actor;
    this.staffScoped = true;
    this.cached = null;
  }
  async access() {
    if (this.cached) return this.cached;
    this.cached = (async () => {
      const [accounts, grants] = await Promise.all([
        this.source.list("accounts"),
        this.source.list("staffScopes"),
      ]);
      const current = accounts.find((a) => a.id === this.actor.id);
      requireValue(
        current?.active &&
          current.role === "STAFF" &&
          current.version === this.actor.version,
        "Phiên hoặc phạm vi đã thay đổi. Đăng nhập lại.",
        401,
      );
      const scopes = grants.filter(
          (g) => g.accountId === current.id && g.active,
        ),
        all = scopes.some((g) => g.scopeType === "ALL");
      const token = tokenHash(
        JSON.stringify({
          accountId: current.id,
          version: current.version,
          scopes: scopes
            .map((s) => [s.id, s.version])
            .sort((a, b) => a[0].localeCompare(b[0])),
        }),
      );
      if (all) return { all, token, scopes };
      const keys = [
        "majors",
        "classes",
        "students",
        "sections",
        "enrollments",
        "charges",
        "receipts",
        "exams",
        "attendanceSessions",
        "conversations",
      ];
      const rows = await Promise.all(keys.map((k) => this.source.list(k))),
        d = Object.fromEntries(keys.map((k, i) => [k, rows[i]]));
      const belongs = (facultyId, cohortId) =>
        scopes.some(
          (s) =>
            s.facultyId === facultyId &&
            (!s.cohortId || s.cohortId === cohortId),
        );
      const faculty = (id) => scopes.some((s) => s.facultyId === id);
      const classAllowed = (r) =>
        belongs(
          d.majors.find((m) => m.id === r.majorId)?.facultyId,
          r.cohortId,
        );
      const classes = new Set(d.classes.filter(classAllowed).map((r) => r.id));
      const students = new Set(
        d.students.filter((r) => classes.has(r.classId)).map((r) => r.id),
      );
      // Không trả một nửa roster: lớp liên khoa/khóa ngoài phạm vi do Quản lý hoặc nhân viên toàn trường xử lý.
      const sections = new Set(
        d.sections
          .filter(
            (r) =>
              belongs(r.facultyId, r.cohortId) &&
              d.enrollments
                .filter((e) => e.sectionId === r.id)
                .every((e) => students.has(e.studentId)),
          )
          .map((r) => r.id),
      );
      const enrollments = new Set(
        d.enrollments
          .filter((r) => sections.has(r.sectionId) && students.has(r.studentId))
          .map((r) => r.id),
      );
      const charges = new Set(
        d.charges.filter((r) => students.has(r.studentId)).map((r) => r.id),
      );
      const exams = new Set(
        d.exams.filter((r) => sections.has(r.sectionId)).map((r) => r.id),
      );
      const sessions = new Set(
        d.attendanceSessions
          .filter((r) => sections.has(r.sectionId))
          .map((r) => r.id),
      );
      const linked = new Map(d.students.map((r) => [r.accountId, r]));
      const accountAllowed = (r) =>
        r.id === current.id ||
        (r.role === "STUDENT"
          ? linked.has(r.id)
            ? students.has(linked.get(r.id).id)
            : belongs(r.affiliationFacultyId, r.affiliationCohortId)
          : r.role === "LECTURER" &&
            (faculty(r.affiliationFacultyId) ||
              d.sections.some(
                (s) => sections.has(s.id) && s.lecturerId === r.id,
              ) ||
              d.exams.some(
                (e) => sections.has(e.sectionId) && e.invigilatorId === r.id,
              )));
      return {
        all: false,
        token,
        scopes,
        d,
        accounts,
        belongs,
        faculty,
        classes,
        students,
        sections,
        enrollments,
        charges,
        exams,
        sessions,
        accountAllowed,
        classAllowed,
      };
    })();
    return this.cached;
  }
  async list(kind, lock = false) {
    const rows = await this.source.list(kind, lock),
      a = await this.access();
    if (a.all) return rows;
    const allowed = (r) => {
      switch (kind) {
        case "curricula":
          return a.belongs(
            a.d.majors.find((m) => m.id === r.majorId)?.facultyId,
            r.cohortId,
          );
        case "curriculumTransfers":
          return r.requestedBy === this.actor.id && a.students.has(r.studentId);
        case "creditRecognitions":
          return a.students.has(r.studentId);
        case "statusRequests":
        case "serviceRequests":
        case "studentPhotos":
        case "profileRequests":
        case "curriculumAssignments":
          return a.students.has(r.studentId);
        case "staffScopes":
          return r.accountId === this.actor.id;
        case "accounts":
          return a.accountAllowed(r);
        case "faculties":
          return a.faculty(r.id);
        case "cohorts":
          return a.scopes.some((s) => !s.cohortId || s.cohortId === r.id);
        case "majors":
          return a.faculty(r.facultyId);
        case "classes":
          return a.classes.has(r.id);
        case "students":
          return a.students.has(r.id);
        case "sections":
          return a.sections.has(r.id);
        case "enrollments":
          return a.enrollments.has(r.id);
        case "grades":
          return a.enrollments.has(r.enrollmentId);
        case "gradeReviews":
        case "gradeRevisions":
          return a.students.has(r.studentId);
        case "gradeReviewPeriods":
          return true;
        case "charges":
          return a.charges.has(r.id);
        case "receipts":
        case "adjustments":
          return a.charges.has(r.chargeId);
        case "examReports":
          return (
            a.exams.has(r.examId) &&
            r.payload.snapshot.rows.every((row) =>
              a.students.has(row.studentId),
            )
          );
        case "examSeatings":
          return (
            a.exams.has(r.examId) &&
            r.payload.rows.every((row) => a.students.has(row.studentId))
          );
        case "exams":
          return a.exams.has(r.id);
        case "timetablePlans":
        case "gradeSchemes":
        case "attendancePolicies":
          return a.sections.has(r.sectionId);
        case "attendanceSessions":
          return a.sessions.has(r.id);
        case "attendanceMarks":
          return a.sessions.has(r.sessionId) && a.students.has(r.studentId);
        case "tasks":
          return r.assignedTo === this.actor.id;
        case "approvals":
          return (
            r.requestedBy === this.actor.id &&
            a.students.has(r.payload?.studentId) &&
            a.classes.has(r.payload?.classId)
          );
        case "conversations":
        case "proposals":
          return (
            r.actorId === this.actor.id &&
            r.accountVersion === this.actor.version
          );
        case "batches":
        case "curriculumBatches":
        case "academicRequests":
          return r.actorId === this.actor.id && r.staffScopeToken === a.token;
        case "events":
          return (
            r.actorId === this.actor.id && r.detail?.staffScopeToken === a.token
          );
        case "periods":
          return a.scopes.some(
            (s) =>
              (!r.facultyId || r.facultyId === s.facultyId) &&
              (!r.cohortId || !s.cohortId || r.cohortId === s.cohortId),
          );
        case "subjects":
        case "serviceDefinitions":
        case "terms":
        case "standingPolicies":
        case "studyPolicies":
        case "requirements":
        case "rooms":
        case "gpaPolicies":
          return true; // Danh mục chung chỉ đọc.
        default:
          return false;
      }
    };
    return rows
      .filter(allowed)
      .map((r) => (kind === "events" ? publicAuditEvent(r) : r));
  }

  async guard(kind, row) {
    const a = await this.access();
    if (a.all) return;
    let ok = false;
    switch (kind) {
      case "curricula":
        ok = a.belongs(
          a.d.majors.find((m) => m.id === row.majorId)?.facultyId,
          row.cohortId,
        );
        break;
      case "curriculumTransfers":
        ok = row.requestedBy === this.actor.id && a.students.has(row.studentId);
        break;
      case "statusRequests":
      case "serviceRequests":
      case "studentPhotos":
      case "profileRequests":
      case "curriculumAssignments":
        ok = a.students.has(row.studentId);
        break;
      case "majors":
        ok = a.scopes.some((s) => s.facultyId === row.facultyId && !s.cohortId);
        break;
      case "classes":
        ok = a.classAllowed(row);
        break;
      case "students": {
        const account = a.accounts.find((r) => r.id === row.accountId),
          target = a.d.classes.find((r) => r.id === row.classId),
          faculty = a.d.majors.find((m) => m.id === target?.majorId)?.facultyId;
        const existing = a.d.students.find(
          (r) => r.accountId === row.accountId,
        );
        ok =
          a.classes.has(row.classId) &&
          a.accountAllowed(account || {}) &&
          (!existing
            ? account?.affiliationFacultyId === faculty &&
              (!account.affiliationCohortId ||
                account.affiliationCohortId === target?.cohortId)
            : existing.id === row.id);
        break;
      }
      case "sections":
        ok =
          a.belongs(row.facultyId, row.cohortId) &&
          a.d.enrollments
            .filter((e) => e.sectionId === row.id)
            .every((e) => a.students.has(e.studentId));
        break;
      case "creditRecognitions":
        ok = a.students.has(row.studentId);
        break;
      case "gradeReviews":
        ok = a.students.has(row.studentId);
        break;
      case "charges":
        ok = a.students.has(row.studentId);
        break;
      case "receipts":
      case "adjustments":
        ok = a.charges.has(row.chargeId);
        break;
      case "examReports":
        ok =
          a.exams.has(row.examId) &&
          row.payload.snapshot.rows.every((r) => a.students.has(r.studentId));
        break;
      case "examSeatings":
        ok =
          a.exams.has(row.examId) &&
          row.payload.rows.every((r) => a.students.has(r.studentId));
        break;
      case "exams":
      case "timetablePlans":
      case "gradeSchemes":
      case "attendancePolicies":
        ok = a.sections.has(row.sectionId);
        break;
      case "attendanceSessions":
        ok =
          a.sections.has(row.sectionId) &&
          (!row.examId || a.exams.has(row.examId)) &&
          row.roster.every((r) => a.students.has(r.studentId));
        break;
      case "attendanceMarks":
        ok =
          a.sessions.has(row.sessionId) &&
          a.students.has(row.studentId) &&
          a.enrollments.has(row.enrollmentId);
        break;
      case "tasks":
        ok = row.assignedTo === this.actor.id;
        break;
      case "approvals":
        ok =
          row.requestedBy === this.actor.id &&
          a.students.has(row.payload?.studentId) &&
          a.classes.has(row.payload?.classId);
        break;
      case "conversations":
      case "proposals":
        ok =
          row.actorId === this.actor.id &&
          row.accountVersion === this.actor.version;
        break;
      case "batches":
      case "curriculumBatches":
      case "academicRequests":
      case "events":
        ok = row.actorId === this.actor.id;
        break;
    }
    requireValue(
      ok,
      "Thao tác nằm ngoài phạm vi được giao hoặc thuộc danh mục dùng chung. Liên hệ Quản lý để xử lý.",
      403,
    );
  }
  async unique(kind, row, exceptId = null) {
    const a = await this.access();
    if (!a.all && ["students", "classes", "majors"].includes(kind)) {
      const existing = await this.source.list(kind);
      requireValue(
        !existing.some(
          (r) =>
            r.id !== exceptId &&
            (foldText(r.code) === foldText(row.code) ||
              (kind === "students" && r.accountId === row.accountId)),
        ),
        "Mã hoặc tài khoản liên kết đã được sử dụng.",
        409,
      );
    }
  }
  async insert(kind, record) {
    await this.guard(kind, record);
    const a = await this.access();
    let row = record;
    if (!a.all && ["batches", "academicRequests"].includes(kind))
      row = { ...record, staffScopeToken: a.token };
    if (!a.all && kind === "events")
      row = {
        ...record,
        detail: { ...record.detail, staffScopeToken: a.token },
      };
    await this.unique(kind, record);
    const result = await this.source.insert(kind, row);
    this.cached = null;
    return result;
  }
  async update(kind, id, changes, version) {
    const old = (await this.list(kind)).find((r) => r.id === id);
    requireValue(old, "Không tìm thấy bản ghi trong phạm vi được giao.", 404);
    await this.guard(kind, { ...old, ...changes });
    await this.unique(kind, { ...old, ...changes }, id);
    const r = await this.source.update(kind, id, changes, version);
    this.cached = null;
    return r;
  }
  async transaction(work) {
    return this.source.transaction((tx) =>
      work(new StaffStore(tx, this.actor)),
    );
  }
}
