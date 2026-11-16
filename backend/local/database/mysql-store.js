import { AppError, databaseError } from "../core/errors.js";

// Tên bảng/cột chỉ đến từ danh sách cố định, không nội suy tên do client gửi.
const tables = {
  serviceDefinitions: "student_service_definitions",
  serviceRequests: "student_service_requests",
  creditRecognitions: "credit_recognition_requests",
  examReports: "exam_reports",
  examSeatings: "exam_seating_plans",
  standingPolicies: "academic_standing_policies",
  statusRequests: "student_status_requests",
  curriculumTransfers: "curriculum_transfer_requests",
  studyPolicies: "study_attempt_policies",
  notifications: "notifications",
  curriculumBatches: "curriculum_assignment_batches",
  studentPhotos: "student_photo_changes",
  profileRequests: "profile_change_requests",
  curricula: "curriculum_versions",
  curriculumAssignments: "student_curricula",
  timetablePlans: "timetable_plans",
  gradeReviewPeriods: "grade_review_periods",
  gradeReviews: "grade_review_requests",
  gradeRevisions: "grade_revisions",
  staffScopes: "staff_access_scopes",
  gradeSchemes: "grade_schemes",
  gpaPolicies: "gpa_policies",
  charges: "student_charges",
  receipts: "payment_receipts",
  adjustments: "charge_adjustments",
  attendancePolicies: "attendance_policies",
  attendanceSessions: "attendance_sessions",
  attendanceMarks: "attendance_marks",
  rooms: "exam_rooms",
  exams: "exam_schedules",
  terms: "academic_terms",
  periods: "registration_periods",
  requirements: "subject_requirements",
  grades: "grade_records",
  tasks: "work_items",
  approvals: "approval_requests",
  subjects: "subjects",
  sections: "course_sections",
  enrollments: "enrollments",
  academicRequests: "academic_requests",
  accounts: "accounts",
  sessions: "sessions",
  cohorts: "cohorts",
  faculties: "faculties",
  majors: "majors",
  classes: "classes",
  students: "student_profiles",
  batches: "import_batches",
  events: "audit_events",
  conversations: "ai_conversations",
  proposals: "ai_proposals",
};
const columns = {
  serviceId: "service_id",
  reviewedBy: "reviewed_by",
  allowRetake: "allow_retake",
  allowImprovement: "allow_improvement",
  maxAttempts: "max_attempts",
  maxImprovementScore: "max_improvement_score",
  studyMode: "study_mode",
  studySnapshot: "study_snapshot_json",
  eventId: "event_id",
  recipientRole: "recipient_role",
  readAt: "read_at",
  photoId: "photo_id",
  priorPhotoId: "prior_photo_id",
  photoContent: "photo_content",
  width: "width",
  height: "height",
  byteLength: "byte_length",
  contactDetails: "contact_details_json",
  baseProfileVersion: "base_profile_version",
  beforeContact: "before_contact_json",
  proposedContact: "proposed_contact_json",
  curriculumId: "curriculum_id",
  edition: "edition",
  groups: "groups_json",
  registrationPeriodId: "registration_period_id",
  registrationPeriodVersion: "registration_period_version",
  withdrawalDeadline: "withdrawal_deadline",
  meetings: "meetings_json",
  exceptions: "exceptions_json",
  updatedBy: "updated_by",
  updatedAt: "updated_at",
  lessonKey: "lesson_key",
  lessonStartTime: "lesson_start_time",
  lessonEndTime: "lesson_end_time",
  lessonRoomId: "lesson_room_id",
  gradeId: "grade_id",
  requestKind: "request_kind",
  baseGradeVersion: "base_grade_version",
  baseGrade: "base_grade_json",
  proposal: "proposal_json",
  proposedBy: "proposed_by",
  approvedBy: "approved_by",
  approvalHash: "approval_hash",
  reviewHistory: "review_history_json",
  createdAt: "created_at",
  reviewId: "review_id",
  beforeGrade: "before_grade_json",
  afterGrade: "after_grade_json",
  appliedBy: "applied_by",
  appliedAt: "applied_at",
  scopeType: "scope_type",
  affiliationFacultyId: "affiliation_faculty_id",
  affiliationCohortId: "affiliation_cohort_id",
  staffScopeToken: "staff_scope_token",
  components: "components_json",
  bands: "bands_json",
  repeatRule: "repeat_rule",
  componentScores: "component_scores_json",
  schemeVersion: "scheme_version",
  resultSnapshot: "result_snapshot_json",
  reportedAt: "reported_at",
  amount: "amount",
  issuedBy: "issued_by",
  issuedAt: "issued_at",
  chargeId: "charge_id",
  method: "method",
  reference: "reference",
  createdBy: "created_by",
  confirmedBy: "confirmed_by",
  confirmedAt: "confirmed_at",
  reason: "reason",
  delta: "delta",
  expectedSessions: "expected_sessions",
  minAttendancePercent: "min_attendance_percent",
  latePresent: "late_present",
  excusedPresent: "excused_present",
  requireFinanceClearance: "require_finance_clearance",
  enforceForExams: "enforce_for_exams",
  examId: "exam_id",
  kind: "kind",
  sessionDate: "session_date",
  roster: "roster_json",
  closedBy: "closed_by",
  closedAt: "closed_at",
  sessionId: "session_id",
  roomId: "room_id",
  examDate: "exam_date",
  invigilatorId: "invigilator_id",
  reviewHash: "review_hash",
  cancelledBy: "cancelled_by",
  cancelReason: "cancel_reason",
  maxCredits: "max_credits",
  passScore: "pass_score",
  termId: "term_id",
  opensAt: "opens_at",
  closesAt: "closes_at",
  withdrawUntil: "withdraw_until",
  requiredSubjectId: "required_subject_id",
  enrollmentId: "enrollment_id",
  enrollmentVersion: "enrollment_version",
  score: "score",
  enteredBy: "entered_by",
  publishedBy: "published_by",
  publishedAt: "published_at",
  title: "title",
  assignedTo: "assigned_to",
  assignedBy: "assigned_by",
  dueDate: "due_date",
  priority: "priority",
  notes: "notes",
  requestedBy: "requested_by",
  workId: "work_id",
  decidedBy: "decided_by",
  decisionReason: "decision_reason",
  credits: "credits",
  subjectId: "subject_id",
  lecturerId: "lecturer_id",
  term: "term",
  startDate: "start_date",
  endDate: "end_date",
  weekday: "weekday",
  startTime: "start_time",
  endTime: "end_time",
  studentId: "student_id",
  sectionId: "section_id",
  id: "id",
  username: "username",
  email: "email",
  fullName: "full_name",
  role: "role",
  passwordHash: "password_hash",
  mustChangePassword: "must_change_password",
  active: "active",
  version: "version",
  tokenHash: "token_hash",
  accountVersion: "account_version",
  accountId: "account_id",
  expiresAt: "expires_at",
  code: "code",
  name: "name",
  startYear: "start_year",
  facultyId: "faculty_id",
  majorId: "major_id",
  cohortId: "cohort_id",
  capacity: "capacity",
  classId: "class_id",
  actorId: "actor_id",
  requestHash: "request_hash",
  result: "result_json",
  action: "action",
  entityId: "entity_id",
  detail: "detail_json",
  conversationId: "conversation_id",
  messages: "messages_json",
  history: "history_json",
  payload: "payload_json",
  preview: "preview_json",
  contextHash: "context_hash",
  status: "status",
};
const reverse = Object.fromEntries(
  Object.entries(columns).map(([key, value]) => [value, key]),
);
const jsonColumns = new Set([
  "studySnapshot",
  "contactDetails",
  "beforeContact",
  "proposedContact",
  "groups",
  "meetings",
  "exceptions",
  "baseGrade",
  "proposal",
  "reviewHistory",
  "beforeGrade",
  "afterGrade",
  "components",
  "bands",
  "componentScores",
  "resultSnapshot",
  "roster",
  "result",
  "detail",
  "messages",
  "history",
  "payload",
  "preview",
]);

function toModel(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const name = reverse[key] || key;
      return [
        name,
        [
          "allowRetake",
          "allowImprovement",
          "active",
          "mustChangePassword",
          "latePresent",
          "excusedPresent",
          "requireFinanceClearance",
          "enforceForExams",
        ].includes(name)
          ? Boolean(value)
          : jsonColumns.has(name) && typeof value === "string"
            ? JSON.parse(value)
            : value,
      ];
    }),
  );
}

export class MysqlStore {
  constructor(connection, isTransaction = false) {
    this.connection = connection;
    this.isTransaction = isTransaction;
  }

  async list(kind, lock = false) {
    if (!tables[kind]) throw Error("Bảng chưa được khai báo.");
    const [rows] = await this.connection.query(
      `SELECT * FROM ${tables[kind]} ORDER BY ${kind === "sessions" ? "token_hash" : "id"}${lock ? " FOR UPDATE" : ""}`,
    );
    return rows.map(toModel);
  }

  async insert(kind, record) {
    const fields = Object.keys(record);
    if (!tables[kind] || fields.some((key) => !columns[key]))
      throw Error("Cột chưa được khai báo.");
    const names = fields.map((key) => columns[key]);
    const values = fields.map((key) =>
      jsonColumns.has(key) ? JSON.stringify(record[key]) : record[key],
    );
    await this.connection.execute(
      `INSERT INTO ${tables[kind]} (${names.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
      values,
    );
    return record;
  }

  async update(kind, id, changes, version) {
    const keys = Object.keys(changes);
    if (
      ![
        "serviceDefinitions",
        "serviceRequests",
        "creditRecognitions",
        "standingPolicies",
        "statusRequests",
        "curriculumTransfers",
        "curriculumAssignments",
        "studyPolicies",
        "notifications",
        "profileRequests",
        "curricula",
        "timetablePlans",
        "gradeReviewPeriods",
        "gradeReviews",
        "staffScopes",
        "gradeSchemes",
        "gpaPolicies",
        "charges",
        "receipts",
        "attendancePolicies",
        "attendanceSessions",
        "attendanceMarks",
        "rooms",
        "exams",
        "terms",
        "periods",
        "requirements",
        "grades",
        "tasks",
        "approvals",
        "subjects",
        "sections",
        "enrollments",
        "accounts",
        "conversations",
        "proposals",
        "students",
        "cohorts",
        "faculties",
        "majors",
        "classes",
      ].includes(kind) ||
      keys.some((key) => !columns[key])
    )
      throw Error("Cập nhật không được khai báo.");
    const [result] = await this.connection.execute(
      `UPDATE ${tables[kind]} SET ${keys.map((key) => columns[key] + "=?").join(",")}, version=version+1 WHERE id=? AND version=?`,
      [
        ...keys.map((key) =>
          jsonColumns.has(key) ? JSON.stringify(changes[key]) : changes[key],
        ),
        id,
        version,
      ],
    );
    if (result.affectedRows !== 1)
      throw new AppError(409, "Bản ghi đã thay đổi. Tải lại trước khi sửa.");
  }

  async removeSession(hash) {
    await this.connection.execute("DELETE FROM sessions WHERE token_hash=?", [
      hash,
    ]);
  }

  async transaction(work) {
    if (this.isTransaction) return work(this);
    const connection = await this.connection.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(new MysqlStore(connection, true));
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw databaseError(error);
    } finally {
      connection.release();
    }
  }
}
