import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { validScore, weightedScore, convertScore } from "./grade.rules.js";
const roles = ["MANAGER", "STAFF", "LECTURER", "STUDENT"];
const pending = ["REQUESTED", "PROPOSED", "APPROVED"];
const reason = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 2000;
const canonical = (v) => JSON.stringify(sort(v));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
async function data(store) {
  const keys = [
    "accounts",
    "students",
    "sections",
    "enrollments",
    "grades",
    "terms",
    "gradeReviewPeriods",
    "gradeReviews",
    "gradeRevisions",
    "subjects",
  ];
  const values = await Promise.all(
    keys.map((k) => integrityStore(store).list(k)),
  );
  return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
}
function context(d, gradeId) {
  const grade = d.grades.find((g) => g.id === gradeId),
    enrollment = d.enrollments.find((e) => e.id === grade?.enrollmentId),
    student = d.students.find((s) => s.id === enrollment?.studentId),
    section = d.sections.find((s) => s.id === enrollment?.sectionId);
  requireValue(
    grade && enrollment && student && section,
    "Không tìm thấy kết quả học tập.",
    404,
  );
  return { grade, enrollment, student, section };
}
async function permitted(store, c, actor) {
  if (actor.role === "MANAGER") return true;
  if (actor.role === "LECTURER") return c.section.lecturerId === actor.id;
  if (actor.role === "STUDENT") return c.student.accountId === actor.id;
  const access = await store.access();
  return access.all || access.students.has(c.student.id);
}
function periodFor(d, c) {
  const term = d.terms.find(
    (t) =>
      t.code.toLowerCase() ===
      (c.grade.resultSnapshot?.term || c.section.term).toLowerCase(),
  );
  return d.gradeReviewPeriods.find((p) => p.termId === term?.id) || null;
}
function windowOpen(period) {
  const now = Date.now();
  return Boolean(
    period?.active && period.opensAt <= now && now < period.closesAt,
  );
}
function history(actor, from, to, note, extra = {}) {
  return {
    actorId: actor.id,
    actorName: actor.fullName || actor.username || actor.role,
    role: actor.role,
    at: Date.now(),
    from,
    to,
    note,
    ...extra,
  };
}
function proposalCorrect(r) {
  try {
    const p = r.proposal,
      base = r.baseGrade,
      scheme = base.resultSnapshot?.scheme;
    if (!p || !validScore(p.score) || (base.schemeVersion && !scheme))
      return false;
    if (
      scheme
        ? weightedScore(scheme, p.componentScores) !== p.score
        : p.componentScores !== null
    )
      return false;
    const expected = base.resultSnapshot
      ? {
          ...base.resultSnapshot,
          ...convertScore(p.score, base.resultSnapshot.gpaPolicy),
        }
      : null;
    return canonical(expected) === canonical(p.resultSnapshot);
  } catch {
    return false;
  }
}
function validProposal(d, c, r) {
  const teacher = d.accounts.find((a) => a.id === r.proposedBy);
  return Boolean(
    r.proposal &&
      proposalCorrect(r) &&
      teacher?.active &&
      teacher.role === "LECTURER" &&
      teacher.version === r.proposal.accountVersion &&
      c.section.lecturerId === teacher.id,
  );
}
function reviewHash(d, c, r) {
  const { approvalAccountVersion, ...proposal } = r.proposal || {};
  return tokenHash(
    canonical({
      grade: c.grade,
      studentId: c.student.id,
      sectionId: c.section.id,
      lecturerId: c.section.lecturerId,
      proposal,
      proposedBy: r.proposedBy,
      teacher: d.accounts
        .filter((a) => a.id === r.proposedBy)
        .map(({ id, role, active, version }) => ({
          id,
          role,
          active,
          version,
        })),
    }),
  );
}
function unchanged(c, r) {
  requireValue(
    c.grade.status === "PUBLISHED" &&
      c.grade.version === r.baseGradeVersion &&
      canonical(c.grade) === canonical(r.baseGrade) &&
      c.student.id === r.studentId &&
      c.section.id === r.sectionId,
    "Điểm hoặc hồ sơ đã thay đổi. Không áp dụng trên bản cũ; cần lập yêu cầu mới.",
    409,
  );
}
function publicCase(r) {
  const { approvalHash, ...safe } = r;
  return safe;
}
function decorate(d, r) {
  const c = context(d, r.gradeId),
    subject = d.subjects.find((s) => s.id === c.section.subjectId);
  return {
    ...publicCase(r),
    reference: "PK-" + r.id.slice(0, 8).toUpperCase(),
    studentCode: c.student.code,
    studentName: c.student.fullName,
    sectionCode: c.section.code,
    term: c.grade.resultSnapshot?.term || c.section.term,
    subjectName: c.grade.resultSnapshot?.subjectName || subject?.name || "",
    currentScore: c.grade.score,
  };
}
export async function gradeReviewOverview(store, actor) {
  authorize(actor, roles);
  store = staffStore(store, actor);
  const d = await data(store),
    eligible = [],
    rows = [];
  for (const grade of d.grades) {
    const c = context(d, grade.id);
    if (grade.status !== "PUBLISHED" || !(await permitted(store, c, actor)))
      continue;
    const open = d.gradeReviews.some(
        (r) => r.gradeId === grade.id && pending.includes(r.status),
      ),
      period = periodFor(d, c);
    eligible.push({
      id: grade.id,
      gradeVersion: grade.version,
      score: grade.score,
      studentCode: c.student.code,
      studentName: c.student.fullName,
      sectionCode: c.section.code,
      term: c.section.term,
      subjectName:
        grade.resultSnapshot?.subjectName ||
        d.subjects.find((s) => s.id === c.section.subjectId)?.name ||
        "",
      canRequest: !open && (actor.role !== "STUDENT" || windowOpen(period)),
      requestBlockReason: open
        ? "Đang có yêu cầu xử lý cho kết quả này."
        : actor.role === "STUDENT" && !windowOpen(period)
          ? "Chưa có đợt phúc khảo đang mở cho học kỳ này."
          : "",
    });
  }
  for (const r of d.gradeReviews) {
    const c = context(d, r.gradeId);
    if (await permitted(store, c, actor)) rows.push(decorate(d, r));
  }
  const managePeriods =
    actor.role === "MANAGER" ||
    (actor.role === "STAFF" && (await store.access()).all);
  return {
    rows: rows.sort(
      (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
    ),
    eligible,
    periods: d.gradeReviewPeriods,
    terms: d.terms.map(({ id, code, name }) => ({ id, code, name })),
    managePeriods,
    serverTime: Date.now(),
  };
}
export async function gradeReviewDetail(store, id, actor) {
  authorize(actor, roles);
  store = staffStore(store, actor);
  const d = await data(store),
    r = d.gradeReviews.find((r) => r.id === id);
  requireValue(r, "Không tìm thấy yêu cầu trong quyền của bạn.", 404);
  const c = context(d, r.gradeId);
  requireValue(
    await permitted(store, c, actor),
    "Không tìm thấy yêu cầu trong quyền của bạn.",
    404,
  );
  const current =
      c.grade.status === "PUBLISHED" &&
      c.grade.version === r.baseGradeVersion &&
      canonical(c.grade) === canonical(r.baseGrade),
    proposalValid = current && validProposal(d, c, r),
    hash = r.proposal ? reviewHash(d, c, r) : null,
    approver = d.accounts.find((a) => a.id === r.approvedBy);
  return {
    request: decorate(d, r),
    grade: c.grade,
    reviewHash: hash,
    proposalValid,
    current,
    actions: {
      propose:
        actor.role === "LECTURER" &&
        c.section.lecturerId === actor.id &&
        r.status === "REQUESTED" &&
        current,
      approve:
        actor.role === "MANAGER" &&
        actor.id !== r.requestedBy &&
        actor.id !== r.proposedBy &&
        r.status === "PROPOSED" &&
        proposalValid,
      apply:
        actor.role === "MANAGER" &&
        r.status === "APPROVED" &&
        proposalValid &&
        approver?.active &&
        approver.role === "MANAGER" &&
        approver.version === r.proposal.approvalAccountVersion &&
        r.approvalHash === hash,
      reject: actor.role === "MANAGER" && pending.includes(r.status),
      return:
        actor.role === "MANAGER" && ["PROPOSED", "APPROVED"].includes(r.status),
      cancel: r.requestedBy === actor.id && r.status === "REQUESTED",
    },
    revisions: d.gradeRevisions
      .filter((v) => v.gradeId === r.gradeId)
      .map((v) => ({
        id: v.id,
        reviewId: v.reviewId,
        beforeScore: v.beforeGrade.score,
        afterScore: v.afterGrade.score,
        appliedAt: v.appliedAt,
        reason: v.reason,
      })),
  };
}
async function command(store, actor, allowed, input, action, work) {
  authorize(actor, allowed);
  store = staffStore(store, actor);
  requireValue(
    input &&
      typeof input === "object" &&
      /^[a-f0-9-]{36}$/.test(input.requestId || "") &&
      input.confirm === true,
    "Cần xác nhận và mã yêu cầu hợp lệ.",
  );
  const digest = tokenHash(canonical({ action, input }));
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, allowed);
    await lockAcademic(tx);
    const old = (await tx.list("academicRequests", true)).find(
      (r) => r.id === input.requestId,
    );
    if (old) {
      requireValue(
        old.actorId === actor.id && old.requestHash === digest,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { ...old.result, replayed: true };
    }
    const result = await work(tx);
    await tx.insert("academicRequests", {
      id: input.requestId,
      actorId: actor.id,
      requestHash: digest,
      result,
    });
    return result;
  });
}
export async function saveGradeReviewPeriod(store, input, actor) {
  return command(
    store,
    actor,
    ["MANAGER", "STAFF"],
    input,
    "GRADE_REVIEW_PERIOD",
    async (tx) => {
      const d = await data(tx);
      requireValue(
        d.terms.some((t) => t.id === input.termId),
        "Chọn học kỳ đã thiết lập.",
      );
      requireValue(
        Number.isSafeInteger(input.opensAt) &&
          Number.isSafeInteger(input.closesAt) &&
          input.opensAt < input.closesAt &&
          typeof input.active === "boolean",
        "Nhập giờ mở/đóng và trạng thái hợp lệ.",
      );
      const old = d.gradeReviewPeriods.find((p) => p.termId === input.termId);
      requireValue(
        (old?.version || 0) === input.version,
        "Đợt phúc khảo đã thay đổi. Tải lại trước khi sửa.",
        409,
      );
      const row = {
        id: old?.id || randomUUID(),
        termId: input.termId,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        active: input.active,
        version: (old?.version || 0) + 1,
      };
      if (old)
        await tx.update(
          "gradeReviewPeriods",
          old.id,
          { opensAt: row.opensAt, closesAt: row.closesAt, active: row.active },
          old.version,
        );
      else await tx.insert("gradeReviewPeriods", row);
      await audit(tx, actor, "GRADE_REVIEW_PERIOD_SAVED", row.id, {
        before: old || null,
        after: row,
      });
      return { row };
    },
  );
}
export async function createGradeReview(store, input, actor) {
  return command(
    store,
    actor,
    roles,
    input,
    "GRADE_REVIEW_CREATE",
    async (tx) => {
      const d = await data(tx),
        c = context(d, input.gradeId);
      requireValue(
        await permitted(tx, c, actor),
        "Không tìm thấy kết quả trong quyền của bạn.",
        404,
      );
      requireValue(
        c.grade.status === "PUBLISHED" &&
          c.grade.version === input.gradeVersion,
        "Chỉ lập yêu cầu cho điểm công bố mới nhất.",
        409,
      );
      requireValue(
        reason(input.reason),
        "Nhập lý do yêu cầu, tối đa 2.000 ký tự.",
      );
      if (actor.role === "STUDENT")
        requireValue(
          windowOpen(periodFor(d, c)),
          "Ngoài đợt phúc khảo đang mở. Liên hệ bộ phận đào tạo để được hướng dẫn.",
          409,
        );
      requireValue(
        !d.gradeReviews.some(
          (r) => r.gradeId === c.grade.id && pending.includes(r.status),
        ),
        "Kết quả này đang có một yêu cầu xử lý.",
        409,
      );
      const row = {
        id: randomUUID(),
        gradeId: c.grade.id,
        studentId: c.student.id,
        sectionId: c.section.id,
        requestedBy: actor.id,
        requestKind: actor.role === "STUDENT" ? "APPEAL" : "CORRECTION",
        status: "REQUESTED",
        reason: input.reason.trim(),
        baseGradeVersion: c.grade.version,
        baseGrade: c.grade,
        proposal: null,
        proposedBy: null,
        approvedBy: null,
        approvalHash: null,
        reviewHistory: [history(actor, null, "REQUESTED", input.reason.trim())],
        createdAt: Date.now(),
        version: 1,
      };
      await tx.insert("gradeReviews", row);
      await audit(tx, actor, "GRADE_REVIEW_REQUESTED", row.id, {
        gradeId: row.gradeId,
        studentId: row.studentId,
        reason: row.reason,
        kind: row.requestKind,
      });
      return { row: publicCase(row) };
    },
  );
}
export async function proposeGradeReview(store, id, input, actor) {
  return command(
    store,
    actor,
    ["LECTURER"],
    input,
    "GRADE_REVIEW_PROPOSE:" + id,
    async (tx) => {
      const d = await data(tx),
        r = d.gradeReviews.find((r) => r.id === id);
      requireValue(r, "Không tìm thấy yêu cầu.", 404);
      const c = context(d, r.gradeId);
      requireValue(
        c.section.lecturerId === actor.id,
        "Lớp không thuộc phân công hiện tại.",
        403,
      );
      requireValue(
        r.status === "REQUESTED" && r.version === input.version,
        "Yêu cầu đã thay đổi. Tải lại trước khi đề xuất.",
        409,
      );
      unchanged(c, r);
      requireValue(reason(input.reason), "Nhập căn cứ và kết quả rà soát.");
      const scheme = r.baseGrade.resultSnapshot?.scheme;
      requireValue(
        !r.baseGrade.schemeVersion || scheme,
        "Điểm cũ thiếu bản chốt trọng số. Không tự lấy cấu hình mới để sửa điểm.",
        409,
      );
      const score = scheme
        ? weightedScore(scheme, input.componentScores)
        : input.score;
      requireValue(validScore(score), "Điểm phải từ 0–10, tối đa hai số lẻ.");
      requireValue(
        scheme || !input.componentScores,
        "Kết quả này nhập tổng kết trực tiếp, không có cấu hình thành phần.",
      );
      const resultSnapshot = r.baseGrade.resultSnapshot
        ? {
            ...r.baseGrade.resultSnapshot,
            ...convertScore(score, r.baseGrade.resultSnapshot.gpaPolicy),
          }
        : null;
      const proposal = {
        score,
        componentScores: scheme
          ? Object.fromEntries(
              scheme.components.map((s) => [
                s.code,
                input.componentScores[s.code],
              ]),
            )
          : null,
        resultSnapshot,
        reason: input.reason.trim(),
        accountVersion: actor.version,
      };
      const changes = {
        status: "PROPOSED",
        proposal,
        proposedBy: actor.id,
        approvedBy: null,
        approvalHash: null,
        reviewHistory: [
          ...r.reviewHistory,
          history(actor, r.status, "PROPOSED", proposal.reason, { score }),
        ],
      };
      await tx.update("gradeReviews", id, changes, r.version);
      await audit(tx, actor, "GRADE_REVIEW_PROPOSED", id, {
        beforeScore: c.grade.score,
        afterScore: score,
        reason: proposal.reason,
      });
      return { row: publicCase({ ...r, ...changes, version: r.version + 1 }) };
    },
  );
}
export async function decideGradeReview(store, id, input, actor, action) {
  const allowed = action === "cancel" ? roles : ["MANAGER"];
  return command(
    store,
    actor,
    allowed,
    input,
    "GRADE_REVIEW_" + action + ":" + id,
    async (tx) => {
      requireValue(
        ["approve", "reject", "return", "cancel", "apply"].includes(action),
        "Thao tác không hợp lệ.",
      );
      const d = await data(tx),
        r = d.gradeReviews.find((r) => r.id === id);
      requireValue(r, "Không tìm thấy yêu cầu.", 404);
      const c = context(d, r.gradeId);
      requireValue(
        await permitted(tx, c, actor),
        "Không tìm thấy yêu cầu trong quyền của bạn.",
        404,
      );
      requireValue(
        r.version === input.version,
        "Yêu cầu đã thay đổi. Tải lại trước khi xử lý.",
        409,
      );
      let changes;
      if (action === "cancel") {
        requireValue(
          r.requestedBy === actor.id && r.status === "REQUESTED",
          "Chỉ người gửi được rút yêu cầu chưa có đề xuất.",
          403,
        );
        requireValue(reason(input.reason), "Nhập lý do rút yêu cầu.");
        changes = { status: "CANCELLED" };
      }
      if (action === "reject") {
        requireValue(pending.includes(r.status), "Yêu cầu đã kết thúc.", 409);
        requireValue(reason(input.reason), "Nhập lý do không chấp nhận.");
        changes = { status: "REJECTED" };
      }
      if (action === "return") {
        requireValue(
          ["PROPOSED", "APPROVED"].includes(r.status),
          "Chỉ trả lại đề xuất đang chờ hoặc đã duyệt chưa áp dụng.",
          409,
        );
        requireValue(
          reason(input.reason),
          "Nhập nội dung cần giảng viên rà soát lại.",
        );
        changes = { status: "REQUESTED", approvedBy: null, approvalHash: null };
      }
      if (action === "approve" || action === "apply") {
        unchanged(c, r);
        requireValue(
          validProposal(d, c, r),
          "Phân công hoặc phiên quyền của người đề xuất đã thay đổi. Trả lại để rà soát và gửi lại.",
          409,
        );
        const hash = reviewHash(d, c, r);
        requireValue(
          input.reviewHash === hash,
          "Bản đối chiếu đã thay đổi. Tải lại trước khi xác nhận.",
          409,
        );
        if (action === "approve") {
          requireValue(
            r.status === "PROPOSED",
            "Yêu cầu không còn chờ duyệt.",
            409,
          );
          requireValue(
            actor.id !== r.requestedBy && actor.id !== r.proposedBy,
            "Không tự duyệt yêu cầu do chính mình khởi tạo hoặc đề xuất.",
            403,
          );
          // Không đưa người duyệt vào nội dung được hash; hash giữ nguyên cho bước áp dụng.
          changes = {
            status: "APPROVED",
            approvedBy: actor.id,
            approvalHash: hash,
            proposal: { ...r.proposal, approvalAccountVersion: actor.version },
          };
        } else {
          const approver = d.accounts.find((a) => a.id === r.approvedBy);
          requireValue(
            r.status === "APPROVED" &&
              r.approvalHash === hash &&
              approver?.active &&
              approver.role === "MANAGER" &&
              approver.version === r.proposal.approvalAccountVersion,
            "Phê duyệt không còn hiệu lực. Trả lại để xét lại.",
            409,
          );
          const { score, componentScores, resultSnapshot } = r.proposal,
            changed =
              score !== c.grade.score ||
              canonical(componentScores) !==
                canonical(c.grade.componentScores || null) ||
              canonical(resultSnapshot) !==
                canonical(c.grade.resultSnapshot || null);
          const after = {
            ...c.grade,
            ...(changed
              ? {
                  score,
                  componentScores,
                  resultSnapshot,
                  version: c.grade.version + 1,
                }
              : {}),
          };
          if (changed)
            await tx.update(
              "grades",
              c.grade.id,
              { score, componentScores, resultSnapshot },
              c.grade.version,
            );
          await tx.insert("gradeRevisions", {
            id: randomUUID(),
            reviewId: r.id,
            gradeId: c.grade.id,
            studentId: c.student.id,
            beforeGrade: c.grade,
            afterGrade: after,
            appliedBy: actor.id,
            appliedAt: Date.now(),
            reason: r.proposal.reason,
          });
          changes = { status: "APPLIED" };
        }
      }
      const note =
        input.reason?.trim() ||
        (action === "approve"
          ? "Duyệt kết quả rà soát, chưa thay đổi điểm."
          : "Áp dụng kết quả đã được duyệt.");
      changes.reviewHistory = [
        ...r.reviewHistory,
        history(actor, r.status, changes.status, note),
      ];
      await tx.update("gradeReviews", id, changes, r.version);
      await audit(tx, actor, "GRADE_REVIEW_" + action.toUpperCase(), id, {
        gradeId: c.grade.id,
        beforeScore: c.grade.score,
        afterScore: action === "apply" ? r.proposal.score : c.grade.score,
        reason: note,
      });
      return { row: publicCase({ ...r, ...changes, version: r.version + 1 }) };
    },
  );
}
