import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { foldText } from "../../../../shared/local-validation.js";
import { validScore, transcriptSummaries } from "./grade.rules.js";
const roles = ["MANAGER", "STAFF", "STUDENT"];
async function locked(source, actor, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    await lockAcademic(tx);
    await tx.list("standingPolicies", true);
    return work(tx);
  });
}
async function canManage(tx, actor) {
  return (
    actor.role === "MANAGER" ||
    (actor.role === "STAFF" && (await tx.access()).all)
  );
}
function cleanPolicy(input) {
  const r = input.payload;
  requireValue(
    r && typeof r === "object" && !Array.isArray(r),
    "Nhập các tiêu chí đối chiếu.",
  );
  requireValue(
    (r.gpa4Below === null || validScore(r.gpa4Below, 4)) &&
      (r.failedCreditsAtLeast === null ||
        (Number.isSafeInteger(r.failedCreditsAtLeast) &&
          r.failedCreditsAtLeast >= 1 &&
          r.failedCreditsAtLeast <= 200)) &&
      (r.gpa4Below !== null || r.failedCreditsAtLeast !== null),
    "Chọn ít nhất một tiêu chí: GPA dưới ngưỡng 0–4 hoặc tín chỉ chưa đạt từ 1–200.",
  );
  requireValue(
    Array.isArray(r.bands) &&
      r.bands.length >= 2 &&
      r.bands.length <= 10 &&
      r.bands.every(
        (b) =>
          b &&
          validScore(b.minGpa4, 4) &&
          typeof b.label === "string" &&
          b.label.trim() &&
          b.label.length <= 60,
      ),
    "Nhập 2–10 mức xếp loại có ngưỡng GPA 0–4 và tên tối đa 60 ký tự.",
  );
  const bands = r.bands
    .map((b) => ({ minGpa4: b.minGpa4, label: b.label.trim() }))
    .sort((a, b) => a.minGpa4 - b.minGpa4);
  requireValue(
    bands[0].minGpa4 === 0 &&
      new Set(bands.map((b) => b.minGpa4)).size === bands.length &&
      new Set(bands.map((b) => foldText(b.label))).size === bands.length,
    "Xếp loại phải bắt đầu từ 0, không trùng ngưỡng hoặc tên.",
  );
  requireValue(
    input.confirm === true &&
      typeof input.reason === "string" &&
      input.reason.trim() &&
      input.reason.length <= 1000,
    "Cần căn cứ quy chế và xác nhận lưu.",
  );
  return {
    gpa4Below: r.gpa4Below,
    failedCreditsAtLeast: r.failedCreditsAtLeast,
    bands,
  };
}
export async function standingSettings(source, actor) {
  return locked(source, actor, async (tx) => ({
    terms: await tx.list("terms"),
    policies: await tx.list("standingPolicies"),
    canManage: await canManage(tx, actor),
  }));
}
export async function saveStandingPolicy(source, input, actor) {
  authorize(actor, ["MANAGER", "STAFF"]);
  const payload = cleanPolicy(input);
  return locked(source, actor, async (tx) => {
    requireValue(
      await canManage(tx, actor),
      "Quy chế chung cần Quản lý hoặc Nhân viên toàn trường.",
      403,
    );
    requireValue(
      (await tx.list("terms")).some((t) => t.id === input.termId),
      "Chọn học kỳ đã có.",
      404,
    );
    const old = (await tx.list("standingPolicies")).find(
      (p) => p.termId === input.termId,
    );
    requireValue(
      input.version === (old?.version || 0),
      "Quy chế đã thay đổi. Tải lại trước khi lưu.",
      409,
    );
    const row = {
      id: old?.id || randomUUID(),
      termId: input.termId,
      payload,
      reason: input.reason.trim(),
      updatedBy: actor.id,
      updatedAt: Date.now(),
      version: (old?.version || 0) + 1,
    };
    if (old) {
      const { id, version, ...changes } = row;
      await tx.update("standingPolicies", id, changes, old.version);
    } else await tx.insert("standingPolicies", row);
    await audit(tx, actor, "STANDING_POLICY_SAVED", row.id, {
      before: old || null,
      after: row,
    });
    return row;
  });
}
const validDate = (s) =>
  typeof s === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  Number.isFinite(Date.parse(s)) &&
  new Date(s).toISOString().slice(0, 10) === s;
// Tính riêng học kỳ; so sánh bằng tổng điểm nguyên để không lệch ở biên làm tròn.
export function evaluateStanding({
  student,
  term,
  policy,
  enrollments,
  sections,
  grades,
  today,
}) {
  const own = enrollments.filter(
      (e) => e.studentId === student.id && e.status === "ACTIVE",
    ),
    relevant = own.filter((e) => {
      const s = sections.find((s) => s.id === e.sectionId);
      return !s || foldText(s.term) === foldText(term.code);
    }),
    issues = [],
    published = [];
  for (const e of relevant) {
    const s = sections.find((s) => s.id === e.sectionId),
      g = grades.find((g) => g.enrollmentId === e.id),
      snap = g?.resultSnapshot;
    const complete =
      s &&
      validDate(s.endDate) &&
      s.endDate <= today &&
      g?.status === "PUBLISHED" &&
      g.enrollmentVersion === e.version &&
      validScore(g.score) &&
      validScore(g.passScore) &&
      g.passScore > 0 &&
      snap &&
      snap.subjectId === s.subjectId &&
      foldText(snap.term || "") === foldText(term.code) &&
      validDate(snap.endDate) &&
      snap.endDate <= today &&
      Number.isSafeInteger(snap.credits) &&
      snap.credits > 0 &&
      snap.credits <= 10 &&
      validScore(snap.points, 4) &&
      ["HIGHEST", "LATEST"].includes(snap.gpaPolicy?.repeatRule);
    if (!complete) {
      issues.push({
        sectionCode: s?.code || "Lớp chưa xác định",
        reason:
          "Lớp chưa kết thúc hoặc chưa có điểm công bố đúng lượt đăng ký và đủ căn cứ GPA.",
      });
      continue;
    }
    published.push({
      ...g,
      studentId: student.id,
      studentCode: student.code,
      studentName: student.fullName,
      term: term.code,
    });
  }
  const base = {
    studentId: student.id,
    studentCode: student.code,
    studentName: student.fullName,
    classId: student.classId,
    term: term.code,
    policyId: policy?.id || null,
    policyVersion: policy?.version || null,
    enrollmentCount: relevant.length,
    classification: null,
    gpa4: null,
    rawGpa4: null,
    gpa10: null,
    creditsAttempted: null,
    creditsEarned: null,
    failedCredits: null,
    reasons: [],
    basis: [],
    issues,
  };
  if (!policy)
    return {
      ...base,
      status: "POLICY_MISSING",
      reasons: ["Học kỳ chưa cấu hình tiêu chí cảnh báo và xếp loại."],
    };
  if (!relevant.length)
    return {
      ...base,
      status: "NO_ENROLLMENT",
      reasons: ["Chưa có đăng ký đang hiệu lực trong học kỳ."],
    };
  if (issues.length)
    return {
      ...base,
      status: "NOT_VERIFIED",
      reasons: ["Chưa đủ kết quả hợp lệ của tất cả lượt đăng ký trong học kỳ."],
    };
  const summary = transcriptSummaries(published)[0]?.terms.find(
    (t) => t.term === term.code,
  );
  if (summary?.status !== "VERIFIED")
    return {
      ...base,
      status: "NOT_VERIFIED",
      reasons: [summary?.reason || "Chưa có căn cứ GPA thống nhất."],
    };
  const selected = published.filter((g) => summary.selectedIds.includes(g.id)),
    credits = summary.creditsAttempted,
    cents = selected.reduce(
      (n, g) =>
        n +
        Math.round(g.resultSnapshot.points * 100) * g.resultSnapshot.credits,
      0,
    ),
    rules = policy.payload,
    classification =
      [...rules.bands]
        .reverse()
        .find((b) => cents >= Math.round(b.minGpa4 * 100) * credits)?.label ||
      null,
    failed = summary.creditsAttempted - summary.creditsEarned,
    reasons = [];
  if (
    rules.gpa4Below !== null &&
    cents < Math.round(rules.gpa4Below * 100) * credits
  )
    reasons.push(
      "GPA học kỳ thấp hơn ngưỡng " + rules.gpa4Below + " của quy chế.",
    );
  if (
    rules.failedCreditsAtLeast !== null &&
    failed >= rules.failedCreditsAtLeast
  )
    reasons.push(
      "Tín chỉ chưa đạt từ " +
        rules.failedCreditsAtLeast +
        " trở lên theo quy chế.",
    );
  return {
    ...base,
    status: reasons.length ? "NEEDS_REVIEW" : "MEETS_RULES",
    classification,
    gpa4: summary.gpa4,
    rawGpa4: cents / (credits * 100),
    gpa10: summary.gpa10,
    creditsAttempted: credits,
    creditsEarned: summary.creditsEarned,
    failedCredits: failed,
    repeatRule: summary.repeatRule,
    reasons: reasons.length
      ? reasons
      : ["Đáp ứng các tiêu chí đã cấu hình cho học kỳ này."],
    basis: selected.map((g) => ({
      gradeId: g.id,
      gradeVersion: g.version,
      sectionCode:
        sections.find(
          (s) =>
            s.id ===
            enrollments.find((e) => e.id === g.enrollmentId)?.sectionId,
        )?.code || "",
      subjectCode: g.resultSnapshot.subjectCode,
      score: g.score,
      passScore: g.passScore,
      points: g.resultSnapshot.points,
      credits: g.resultSnapshot.credits,
    })),
  };
}
export async function standingOverview(source, actor, query = {}) {
  return locked(source, actor, async (tx) => {
    const term = (await tx.list("terms")).find((t) => t.id === query.termId);
    requireValue(term, "Chọn học kỳ cần đối chiếu.", 404);
    const students = (await tx.list("students")).filter(
        (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
      ),
      policy =
        (await tx.list("standingPolicies")).find((p) => p.termId === term.id) ||
        null,
      raw = integrityStore(tx),
      enrollments = await raw.list("enrollments"),
      sections = await raw.list("sections"),
      grades = await raw.list("grades"),
      asOf = Date.now(),
      today = new Date(asOf + 7 * 3600000).toISOString().slice(0, 10);
    let rows = students.map((student) =>
      evaluateStanding({
        student,
        term,
        policy,
        enrollments,
        sections,
        grades,
        today,
      }),
    );
    if (query.studentId)
      rows = rows.filter((r) => r.studentId === query.studentId);
    if (query.q)
      rows = rows.filter((r) =>
        foldText(r.studentCode + " " + r.studentName).includes(
          foldText(query.q),
        ),
      );
    if (query.status) rows = rows.filter((r) => r.status === query.status);
    return {
      term: { id: term.id, code: term.code },
      policy,
      rows,
      asOf,
      note: "Đối chiếu học kỳ theo điểm đã công bố và quy chế hiện tại; chưa phải quyết định cảnh báo hoặc xếp loại tốt nghiệp. Tiêu chí dùng GPA gốc trước làm tròn.",
    };
  });
}
