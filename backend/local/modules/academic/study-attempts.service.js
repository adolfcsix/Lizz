import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import { freshActor, lockAcademic, audit } from "./academic.common.js";
import { staffStore } from "../access/staff-store.js";
import { validScore } from "../grades/grade.rules.js";
const roles = ["MANAGER", "STAFF", "LECTURER", "STUDENT"];
const editors = ["MANAGER", "STAFF"];
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const validResult = (g, e) =>
  g?.status === "PUBLISHED" &&
  g.enrollmentVersion === e.version &&
  validScore(g.score) &&
  validScore(g.passScore) &&
  g.passScore > 0;
const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
async function canManage(store, actor) {
  return (
    actor.role === "MANAGER" ||
    (actor.role === "STAFF" && (await store.access()).all)
  );
}
export async function studyPolicyOverview(source, actor) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    return {
      rows: await tx.list("studyPolicies"),
      terms: await tx.list("terms"),
      canManage: await canManage(tx, actor),
    };
  });
}
export async function saveStudyPolicy(source, input, actor, id = null) {
  authorize(actor, editors);
  requireValue(
    input.confirm === true &&
      typeof input.reason === "string" &&
      input.reason.trim() &&
      input.reason.length <= 1000,
    "Cần căn cứ và xác nhận thay đổi quy chế.",
  );
  requireValue(
    typeof input.allowRetake === "boolean" &&
      typeof input.allowImprovement === "boolean" &&
      Number.isSafeInteger(input.maxAttempts) &&
      input.maxAttempts >= 1 &&
      input.maxAttempts <= 20 &&
      validScore(input.maxImprovementScore),
    "Nhập quy chế hợp lệ: tối đa 1–20 lượt và ngưỡng điểm cải thiện từ 0–10.",
  );
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, editors);
    await lockAcademic(tx);
    requireValue(
      await canManage(tx, actor),
      "Quy chế chung cần Quản lý hoặc Nhân viên toàn trường.",
      403,
    );
    const all = await tx.list("studyPolicies"),
      prior = all.find((p) => p.id === id);
    requireValue(!id || prior, "Không tìm thấy quy chế.", 404);
    requireValue(
      !prior || prior.version === input.version,
      "Quy chế đã thay đổi. Tải lại trước khi sửa.",
      409,
    );
    requireValue(
      (await tx.list("terms")).some((t) => t.id === input.termId) &&
        (!prior || prior.termId === input.termId),
      "Chọn học kỳ đã có; không chuyển quy chế sang học kỳ khác.",
    );
    requireValue(
      !all.some((p) => p.id !== id && p.termId === input.termId),
      "Học kỳ đã có quy chế. Mở bản hiện có để chỉnh sửa.",
      409,
    );
    const fields = {
      termId: input.termId,
      allowRetake: input.allowRetake,
      allowImprovement: input.allowImprovement,
      maxAttempts: input.maxAttempts,
      maxImprovementScore: input.maxImprovementScore,
      reason: input.reason.trim(),
      updatedAt: Date.now(),
      updatedBy: actor.id,
    };
    const row = {
      id: prior?.id || randomUUID(),
      ...fields,
      version: (prior?.version || 0) + 1,
    };
    if (prior) await tx.update("studyPolicies", id, fields, prior.version);
    else await tx.insert("studyPolicies", row);
    await audit(tx, actor, "STUDY_POLICY_SAVED", row.id, {
      before: prior || null,
      after: row,
    });
    return row;
  });
}

// Cùng một phép đối chiếu cho UI, API ghi và đề xuất LizzChat.
export async function reviewStudyAttempt(store, student, target) {
  const terms = await store.list("terms"),
    term = terms.find((t) => same(t.code, target.term));
  const policy = (await store.list("studyPolicies")).find(
    (p) => p.termId === term?.id,
  );
  const own = (await store.list("enrollments")).filter(
    (e) =>
      e.studentId === student.id &&
      e.status === "ACTIVE" &&
      e.sectionId !== target.id,
  );
  const sections = await store.list("sections"),
    grades = await store.list("grades");
  const related = own
    .map((e) => ({ e, s: sections.find((s) => s.id === e.sectionId) }))
    .filter(({ s }) => !s || s.subjectId === target.subjectId)
    .map(({ e, s }) => ({
      e,
      s,
      g: grades.find((g) => g.enrollmentId === e.id),
    }));
  const complete = related.filter(
    ({ e, s, g }) =>
      s &&
      validDate(s.endDate) &&
      s.endDate < target.startDate &&
      validResult(g, e),
  );
  const uncertain = related.length !== complete.length;
  const passed = complete
    .filter(({ e, g }) => validResult(g, e) && g.score >= g.passScore)
    .sort((a, b) => b.g.score - a.g.score || a.g.id.localeCompare(b.g.id));
  const inferredMode = complete.length
    ? passed.length
      ? "IMPROVEMENT"
      : "RETAKE"
    : "FIRST";
  const reasons = [];
  if (policy) {
    if (!validDate(target.startDate))
      reasons.push(
        "Lớp mới chưa có ngày bắt đầu hợp lệ để đối chiếu lượt học.",
      );
    if (uncertain)
      reasons.push(
        "Còn lượt học chưa kết thúc, chưa công bố điểm hoặc thiếu căn cứ hợp lệ. Liên hệ cán bộ để đối chiếu.",
      );
    if (complete.length + 1 > policy.maxAttempts)
      reasons.push("Vượt số lượt học tối đa theo quy chế học kỳ.");
    if (inferredMode === "RETAKE" && !policy.allowRetake)
      reasons.push("Học kỳ chưa cho phép đăng ký học lại.");
    if (inferredMode === "IMPROVEMENT" && !policy.allowImprovement)
      reasons.push("Học kỳ chưa cho phép đăng ký cải thiện điểm.");
    if (
      inferredMode === "IMPROVEMENT" &&
      passed[0].g.score > policy.maxImprovementScore
    )
      reasons.push(
        "Điểm đạt tốt nhất đã vượt ngưỡng được đăng ký cải thiện của học kỳ.",
      );
  }
  const basis = complete
    .map(({ e, s, g }) => ({
      enrollmentId: e.id,
      enrollmentVersion: e.version,
      sectionId: s.id,
      sectionCode: s.code,
      term: s.term,
      endDate: s.endDate,
      gradeId: g.id,
      gradeVersion: g.version,
      score: g.score,
      passScore: g.passScore,
      passed: g.score >= g.passScore,
    }))
    .sort(
      (a, b) =>
        a.endDate.localeCompare(b.endDate) ||
        a.sectionId.localeCompare(b.sectionId),
    );
  const snapshot = {
    studentId: student.id,
    studentVersion: student.version,
    target: [target.id, target.version, target.subjectId, target.startDate],
    term: term ? [term.id, term.version] : null,
    policy: policy || null,
    sources: related
      .map(({ e, s, g }) => ({
        enrollment: [e.id, e.version, e.status],
        section: s ? [s.id, s.version, s.endDate] : null,
        grade: g
          ? [
              g.id,
              g.version,
              g.status,
              g.enrollmentVersion,
              g.score,
              g.passScore,
            ]
          : null,
      }))
      .sort((a, b) => a.enrollment[0].localeCompare(b.enrollment[0])),
  };
  return {
    mode: policy ? (uncertain ? "UNVERIFIED" : inferredMode) : "UNVERIFIED",
    inferredMode: uncertain ? "UNVERIFIED" : inferredMode,
    policyConfigured: Boolean(policy),
    policyId: policy?.id || null,
    policyVersion: policy?.version || null,
    policy: policy
      ? {
          allowRetake: policy.allowRetake,
          allowImprovement: policy.allowImprovement,
          maxAttempts: policy.maxAttempts,
          maxImprovementScore: policy.maxImprovementScore,
        }
      : null,
    allowed: !reasons.length,
    reasons,
    completedAttempts: complete.length,
    attemptNumber: policy && !uncertain ? complete.length + 1 : null,
    basis,
    reviewHash: tokenHash(JSON.stringify(snapshot)),
    note: policy
      ? "Phân loại từ kết quả đã công bố, đúng lượt đăng ký và kết thúc trước lớp mới. Điểm cũ được giữ; GPA áp dụng quy chế đã chốt riêng."
      : "Học kỳ chưa cấu hình quy chế học lại/cải thiện. Giữ luồng đăng ký hiện hành; loại lượt học chưa được xác minh.",
  };
}

export async function studyHistory(
  source,
  actor,
  studentId = null,
  subjectId = null,
) {
  authorize(actor, ["MANAGER", "STAFF", "STUDENT"]);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, ["MANAGER", "STAFF", "STUDENT"]);
    const student = (await tx.list("students")).find((s) =>
      actor.role === "STUDENT"
        ? s.accountId === actor.id && (!studentId || s.id === studentId)
        : s.id === studentId,
    );
    requireValue(student, "Không tìm thấy hồ sơ trong quyền.", 404);
    const sections = await tx.list("sections"),
      subjects = await tx.list("subjects"),
      grades = await tx.list("grades");
    const rows = (await tx.list("enrollments"))
      .filter((e) => e.studentId === student.id)
      .map((e) => {
        const s = sections.find((s) => s.id === e.sectionId),
          subject = subjects.find((r) => r.id === s?.subjectId),
          g = grades.find((g) => g.enrollmentId === e.id);
        const verified =
          Boolean(s) && e.status === "ACTIVE" && validResult(g, e);
        return {
          id: e.id,
          subjectId: s?.subjectId || null,
          subjectCode: subject?.code || "",
          subjectName: subject?.name || "Chưa xác định học phần",
          sectionCode: s?.code || "",
          term: s?.term || "",
          startDate: s?.startDate || "",
          status: e.status,
          mode: e.studyMode || "UNVERIFIED",
          enrollmentVersion: e.version,
          resultStatus: verified
            ? "PUBLISHED"
            : e.status === "WITHDRAWN"
              ? "WITHDRAWN"
              : "UNVERIFIED",
          score: verified ? g.score : null,
          passScore: verified ? g.passScore : null,
          passed: verified ? g.score >= g.passScore : null,
        };
      })
      .filter((r) => !subjectId || r.subjectId === subjectId)
      .sort(
        (a, b) =>
          a.startDate.localeCompare(b.startDate) ||
          a.sectionCode.localeCompare(b.sectionCode),
      );
    return {
      student: {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
      },
      rows,
      note: "Lịch sử hiện có trong quyền. Không công bố điểm nháp/gửi; loại lượt học cũ chưa có căn cứ được để chưa đối chiếu. Chưa phải kết luận GPA hoặc tốt nghiệp.",
    };
  });
}
