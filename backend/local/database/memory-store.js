import { AppError } from "../core/errors.js";

// Chỉ phục vụ kiểm thử và npm run demo. Không dùng làm dữ liệu thật.
export class MemoryStore {
  constructor() {
    this.data = Object.fromEntries(
      [
        "serviceDefinitions",
        "serviceRequests",
        "creditRecognitions",
        "examReports",
        "examSeatings",
        "standingPolicies",
        "statusRequests",
        "curriculumTransfers",
        "studyPolicies",
        "notifications",
        "curriculumBatches",
        "studentPhotos",
        "profileRequests",
        "curricula",
        "curriculumAssignments",
        "timetablePlans",
        "gradeReviewPeriods",
        "gradeReviews",
        "gradeRevisions",
        "staffScopes",
        "gradeSchemes",
        "gpaPolicies",
        "charges",
        "receipts",
        "adjustments",
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
        "academicRequests",
        "accounts",
        "sessions",
        "cohorts",
        "faculties",
        "majors",
        "classes",
        "students",
        "batches",
        "events",
        "conversations",
        "proposals",
      ].map((key) => [key, []]),
    );
    this.queue = Promise.resolve();
  }

  async list(kind) {
    return structuredClone(this.data[kind]);
  }
  async insert(kind, record) {
    this.data[kind].push(structuredClone(record));
    return record;
  }
  async update(kind, id, changes, version) {
    const record = this.data[kind].find((row) => row.id === id);
    if (!record || record.version !== version)
      throw new AppError(409, "Bản ghi đã thay đổi. Tải lại trước khi sửa.");
    Object.assign(record, structuredClone(changes), { version: version + 1 });
  }
  async removeSession(hash) {
    this.data.sessions = this.data.sessions.filter(
      (row) => row.tokenHash !== hash,
    );
  }
  async transaction(work) {
    if (this.isTransaction) return work(this);
    const run = this.queue.then(async () => {
      const tx = Object.create(this);
      tx.isTransaction = true;
      tx.data = structuredClone(this.data);
      const result = await work(tx);
      this.data = tx.data;
      return result;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
