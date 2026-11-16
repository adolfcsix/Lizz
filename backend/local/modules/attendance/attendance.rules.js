import { foldText } from "../../../../shared/local-validation.js";
import { tokenHash } from "../../core/password.js";
import { requireValue } from "../../core/errors.js";
import { financialStanding } from "../finance/finance.rules.js";
export const attendanceStatuses = ["PRESENT", "LATE", "EXCUSED", "ABSENT"];
export async function eligibilitySnapshot(store, sectionId) {
  const keys = [
    "attendancePolicies",
    "attendanceSessions",
    "attendanceMarks",
    "sections",
    "enrollments",
    "students",
    "charges",
    "receipts",
    "adjustments",
  ];
  const arrays = await Promise.all(keys.map((k) => store.list(k))),
    d = Object.fromEntries(keys.map((k, i) => [k, arrays[i]]));
  const section = d.sections.find((s) => s.id === sectionId);
  requireValue(section, "Không tìm thấy lớp học phần.", 404);
  const policy = d.attendancePolicies.find((p) => p.sectionId === sectionId),
    sessions = d.attendanceSessions.filter(
      (s) =>
        s.sectionId === sectionId &&
        s.kind === "CLASS" &&
        s.status === "CLOSED",
    );
  const enrollments = d.enrollments.filter(
    (e) => e.sectionId === sectionId && e.status === "ACTIVE",
  );
  const rows = enrollments.map((e) => {
    const student = d.students.find((s) => s.id === e.studentId);
    let attended = 0,
      recorded = 0;
    const counts = { PRESENT: 0, LATE: 0, EXCUSED: 0, ABSENT: 0 };
    for (const s of sessions) {
      const roster = s.roster.find(
        (r) =>
          r.studentId === e.studentId &&
          r.enrollmentId === e.id &&
          r.enrollmentVersion === e.version,
      );
      const mark = d.attendanceMarks.find(
        (m) =>
          m.sessionId === s.id &&
          m.studentId === e.studentId &&
          m.enrollmentId === e.id &&
          m.enrollmentVersion === e.version,
      );
      if (roster && mark && attendanceStatuses.includes(mark.status)) {
        recorded++;
        counts[mark.status]++;
        if (
          mark.status === "PRESENT" ||
          (mark.status === "LATE" && policy?.latePresent) ||
          (mark.status === "EXCUSED" && policy?.excusedPresent)
        )
          attended++;
      }
    }
    const finance = financialStanding(d, e.studentId, section.term);
    let status = "NOT_VERIFIED",
      reason = "Chưa thiết lập điều kiện dự thi.";
    if (policy) {
      if (
        sessions.length < policy.expectedSessions ||
        recorded !== sessions.length
      )
        reason = "Chưa đủ buổi đã chốt hoặc còn thiếu điểm danh hợp lệ.";
      else if (attended * 100 < sessions.length * policy.minAttendancePercent) {
        status = "INELIGIBLE";
        reason = "Chưa đạt tỷ lệ tham dự theo quy định của lớp.";
      } else if (
        policy.requireFinanceClearance &&
        finance.status === "UNPAID"
      ) {
        status = "INELIGIBLE";
        reason = "Nghĩa vụ tài chính chưa hoàn tất.";
      } else if (policy.requireFinanceClearance && finance.status !== "CLEAR")
        reason = "Nghĩa vụ tài chính chưa được xác minh.";
      else {
        status = "ELIGIBLE";
        reason = "Đạt các điều kiện đã thiết lập cho lớp.";
      }
    }
    return {
      studentId: e.studentId,
      code: student?.code || "",
      fullName: student?.fullName || "",
      ...counts,
      attended,
      recorded,
      sessions: sessions.length,
      percentage:
        sessions.length && recorded === sessions.length
          ? Math.floor((attended * 10000) / sessions.length) / 100
          : null,
      status,
      reason,
      financeStatus: policy?.requireFinanceClearance
        ? finance.status
        : "NOT_REQUIRED",
    };
  });
  const relevantStudents = new Set(enrollments.map((e) => e.studentId)),
    chargeIds = new Set(
      d.charges
        .filter(
          (c) =>
            relevantStudents.has(c.studentId) &&
            foldText(c.term) === foldText(section.term),
        )
        .map((c) => c.id),
    );
  const fingerprint = tokenHash(
    JSON.stringify({
      policy: policy || null,
      sectionVersion: section.version,
      enrollments: [...enrollments].sort((a, b) => a.id.localeCompare(b.id)),
      sessions: [...sessions].sort((a, b) => a.id.localeCompare(b.id)),
      marks: d.attendanceMarks
        .filter((m) => sessions.some((s) => s.id === m.sessionId))
        .sort((a, b) => a.id.localeCompare(b.id)),
      finance: policy?.requireFinanceClearance
        ? {
            charges: d.charges.filter((c) => chargeIds.has(c.id)),
            receipts: d.receipts.filter((r) => chargeIds.has(r.chargeId)),
            adjustments: d.adjustments.filter((r) => chargeIds.has(r.chargeId)),
          }
        : null,
    }),
  );
  return {
    section,
    policy: policy || null,
    enforced: Boolean(policy?.enforceForExams),
    rows,
    fingerprint,
  };
}
export async function assertExamEligibility(store, sectionId) {
  const result = await eligibilitySnapshot(store, sectionId);
  if (result.enforced)
    requireValue(
      result.rows.length > 0 &&
        result.rows.every((r) => r.status === "ELIGIBLE"),
      "Còn sinh viên chưa đủ hoặc chưa xác minh điều kiện dự thi. Kiểm tra danh sách trước khi công bố.",
      409,
    );
  return result;
}
export async function assertStudentExamEligibility(
  store,
  sectionId,
  studentId,
) {
  const data = await eligibilitySnapshot(store, sectionId);
  if (data.enforced)
    requireValue(
      data.rows.some(
        (r) => r.studentId === studentId && r.status === "ELIGIBLE",
      ),
      "Lớp đã áp dụng điều kiện dự thi. Vui lòng liên hệ cán bộ trước khi bổ sung đăng ký.",
      409,
    );
}
