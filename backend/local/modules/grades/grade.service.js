import { integrityStore } from "../access/staff-store.js";
import {
  validScore,
  weightedScore,
  convertScore,
  transcriptSummaries,
} from "./grade.rules.js";
import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { tokenHash } from "../../core/password.js";
import { foldText } from "../../../../shared/local-validation.js";
import {
  freshActor,
  audit,
  lockAcademic,
} from "../academic/academic.common.js";
import { passedGrade } from "../academic/registration-policy.service.js";
const readers = ["MANAGER", "STAFF", "LECTURER"];
async function assignedSection(store, id, actor) {
  const row = (await store.list("sections")).find(
    (s) =>
      s.id === id && (actor.role !== "LECTURER" || s.lecturerId === actor.id),
  );
  requireValue(row, "Không tìm thấy lớp trong phân công của bạn.", 404);
  return row;
}
export async function gradeRoster(store, id, actor) {
  authorize(actor, readers);
  const section = await assignedSection(store, id, actor);
  const allEnrollments = await store.list("enrollments");
  const enrollments = allEnrollments.filter(
      (e) => e.sectionId === id && e.status === "ACTIVE",
    ),
    students = await store.list("students"),
    grades = await store.list("grades");
  const term = (await store.list("terms")).find(
    (t) => foldText(t.code) === foldText(section.term),
  );
  const scheme =
    (await store.list("gradeSchemes")).find((s) => s.sectionId === id) || null;
  const gpaPolicy =
    (await store.list("gpaPolicies")).find((p) => p.termId === term?.id) ||
    null;
  const sectionEnrollmentIds = new Set(
    allEnrollments.filter((e) => e.sectionId === id).map((e) => e.id),
  );
  const schemeLocked = grades.some((g) =>
    sectionEnrollmentIds.has(g.enrollmentId),
  );
  const subject = (await store.list("subjects")).find(
    (s) => s.id === section.subjectId,
  );
  const reviewHash = tokenHash(
    JSON.stringify({
      section,
      term: term || null,
      subject: subject || null,
      scheme,
      gpaPolicy,
      enrollments: enrollments
        .map((e) => ({ id: e.id, version: e.version }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      grades: grades
        .filter((g) => enrollments.some((e) => e.id === g.enrollmentId))
        .sort((a, b) => a.id.localeCompare(b.id)),
    }),
  );
  return {
    section,
    subject: subject || null,
    reviewHash,
    schemeLocked,
    scheme,
    gpaPolicy,
    term: term || null,
    rows: enrollments
      .map((e) => ({
        enrollmentId: e.id,
        enrollmentVersion: e.version,
        studentId: e.studentId,
        code: students.find((s) => s.id === e.studentId)?.code || "",
        fullName: students.find((s) => s.id === e.studentId)?.fullName || "",
        grade: grades.find((g) => g.enrollmentId === e.id) || null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code, "vi")),
  };
}
export async function gradeOverview(store, actor) {
  authorize(actor, [...readers, "STUDENT"]);
  const sections = await store.list("sections"),
    enrollments = await store.list("enrollments"),
    students = await store.list("students"),
    subjects = await store.list("subjects"),
    own = students.find((s) => s.accountId === actor.id);
  const allowed = sections.filter((s) =>
    actor.role === "LECTURER"
      ? s.lecturerId === actor.id
      : actor.role === "STUDENT"
        ? enrollments.some(
            (e) => e.sectionId === s.id && e.studentId === own?.id,
          )
        : true,
  );
  // Hồ sơ thuộc khoa được xem đủ điểm công bố của chính sinh viên, kể cả học ở khoa khác.
  // Không dùng danh sách lớp bị giới hạn để tính một GPA thiếu học phần mà vẫn báo đủ căn cứ.
  const limited =
    actor.role === "STAFF" && store.staffScoped && !(await store.access()).all;
  const resultStore = limited ? integrityStore(store) : store;
  const resultEnrollments = limited
    ? await resultStore.list("enrollments")
    : enrollments;
  const resultSections = limited ? await resultStore.list("sections") : allowed;
  const revisions = (await resultStore.list("gradeRevisions")).filter(
    (r) => r.beforeGrade.version !== r.afterGrade.version,
  );
  const rows = (await resultStore.list("grades")).flatMap((g) => {
    const e = resultEnrollments.find((e) => e.id === g.enrollmentId),
      s = resultSections.find((s) => s.id === e?.sectionId),
      student = students.find((p) => p.id === e?.studentId);
    if (
      !s ||
      !student ||
      (limited &&
        !allowed.some((section) => section.id === s.id) &&
        g.status !== "PUBLISHED") ||
      (actor.role === "STUDENT" &&
        (g.status !== "PUBLISHED" || student.accountId !== actor.id))
    )
      return [];
    return [
      {
        ...g,
        revisionCount: revisions.filter((r) => r.gradeId === g.id).length,
        lastRevisedAt:
          Math.max(
            0,
            ...revisions
              .filter((r) => r.gradeId === g.id)
              .map((r) => r.appliedAt),
          ) || null,
        studentId: student.id,
        studentCode: student.code,
        studentName: student.fullName,
        sectionId: s.id,
        sectionCode: s.code,
        term: g.resultSnapshot?.term || s.term,
        subjectId: g.resultSnapshot?.subjectId || s.subjectId,
        subjectName:
          g.resultSnapshot?.subjectName ||
          subjects.find((m) => m.id === s.subjectId)?.name ||
          "",
        subjectCode:
          g.resultSnapshot?.subjectCode ||
          subjects.find((m) => m.id === s.subjectId)?.code ||
          "",
        passed: g.status === "PUBLISHED" ? passedGrade(g) : null,
      },
    ];
  });
  return {
    summaries: actor.role === "LECTURER" ? [] : transcriptSummaries(rows),
    sections:
      actor.role === "STUDENT"
        ? []
        : allowed.map((s) => ({
            ...s,
            subjectName: subjects.find((m) => m.id === s.subjectId)?.name || "",
          })),
    rows,
  };
}
export async function saveGradeDrafts(store, sectionId, input, actor) {
  requireValue(
    Array.isArray(input.rows) &&
      input.rows.length > 0 &&
      input.rows.length <= 1000,
    "Nhập từ 1 đến 1.000 dòng điểm.",
  );
  requireValue(
    new Set(input.rows.map((r) => r.enrollmentId)).size === input.rows.length,
    "Danh sách có dòng đăng ký trùng.",
  );
  for (const r of input.rows)
    requireValue(
      Number.isInteger(r.enrollmentVersion) &&
        r.enrollmentVersion > 0 &&
        Number.isInteger(r.version) &&
        r.version >= 0,
      "Điểm cần từ 0–10, tối đa hai số lẻ; phiên bản không hợp lệ.",
    );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, ["LECTURER"]);
    await lockAcademic(tx);
    await assignedSection(tx, sectionId, actor);
    const scheme =
      (await tx.list("gradeSchemes", true)).find(
        (s) => s.sectionId === sectionId,
      ) || null;
    requireValue(
      (scheme?.version || null) === (input.schemeVersion ?? null),
      "Cấu hình điểm đã thay đổi. Tải lại trước khi lưu.",
      409,
    );
    const enrollments = (await tx.list("enrollments")).filter(
        (e) => e.sectionId === sectionId && e.status === "ACTIVE",
      ),
      grades = await tx.list("grades"),
      changed = [];
    for (const r of input.rows) {
      const enrollment = enrollments.find((e) => e.id === r.enrollmentId);
      requireValue(enrollment, "Sinh viên không còn đăng ký trong lớp.", 409);
      requireValue(
        enrollment.version === r.enrollmentVersion,
        "Đăng ký đã thay đổi. Tải lại danh sách trước khi nhập điểm.",
        409,
      );
      const old = grades.find((g) => g.enrollmentId === r.enrollmentId);
      requireValue(
        !old || old.status === "DRAFT",
        "Điểm đã gửi hoặc công bố. Không sửa trực tiếp.",
        409,
      );
      requireValue(
        (old?.version || 0) === r.version,
        "Điểm đã thay đổi. Tải lại trước khi lưu.",
        409,
      );
      const score = scheme ? weightedScore(scheme, r.componentScores) : r.score;
      requireValue(validScore(score), "Điểm cần từ 0–10, tối đa hai số lẻ.");
      requireValue(
        scheme || !r.componentScores,
        "Lớp chưa thiết lập điểm thành phần.",
        409,
      );
      const fields = {
          score,
          componentScores: scheme
            ? Object.fromEntries(
                scheme.components.map((c) => [
                  c.code,
                  r.componentScores[c.code],
                ]),
              )
            : null,
          schemeVersion: scheme?.version || null,
          enteredBy: actor.id,
          enrollmentVersion: r.enrollmentVersion,
        },
        row = {
          id: old?.id || randomUUID(),
          enrollmentId: r.enrollmentId,
          ...fields,
          status: "DRAFT",
          publishedBy: null,
          publishedAt: null,
          passScore: null,
          version: (old?.version || 0) + 1,
        };
      if (old) await tx.update("grades", old.id, fields, old.version);
      else await tx.insert("grades", row);
      changed.push({ before: old || null, after: row });
    }
    await audit(tx, actor, "GRADES_SAVED", sectionId, { rows: changed });
    return { count: changed.length };
  });
}
export async function transitionGrades(store, sectionId, input, actor, action) {
  requireValue(
    ["SUBMIT", "PUBLISH", "RETURN"].includes(action),
    "Thao tác điểm không hợp lệ.",
  );
  requireValue(
    Number.isInteger(input.sectionVersion) && input.sectionVersion > 0,
    "Thiếu phiên bản lớp đã xem.",
  );
  requireValue(
    typeof input.requestId === "string" &&
      /^[a-f0-9-]{36}$/.test(input.requestId),
    "Thiếu mã chống gửi lặp.",
  );
  requireValue(
    Array.isArray(input.rows) &&
      input.rows.length > 0 &&
      input.rows.length <= 1000 &&
      new Set(input.rows.map((r) => r.id)).size === input.rows.length &&
      input.rows.every(
        (r) => typeof r.id === "string" && Number.isInteger(r.version),
      ),
    "Danh sách phiên bản điểm không hợp lệ.",
  );
  if (action === "RETURN")
    requireValue(
      typeof input.reason === "string" &&
        input.reason.trim() &&
        input.reason.length <= 1000,
      "Nhập lý do trả lại bảng điểm.",
    );
  const digest = tokenHash(
    JSON.stringify({
      sectionId,
      sectionVersion: input.sectionVersion,
      termVersion: input.termVersion ?? null,
      schemeVersion: input.schemeVersion ?? null,
      gpaPolicyVersion: input.gpaPolicyVersion ?? null,
      reviewHash: input.reviewHash ?? null,
      action,
      rows: [...input.rows].sort((a, b) => a.id.localeCompare(b.id)),
      reason: input.reason || "",
    }),
  );
  return store.transaction(async (tx) => {
    await freshActor(
      tx,
      actor,
      action === "SUBMIT" ? ["LECTURER"] : ["MANAGER"],
    );
    await lockAcademic(tx);
    await assignedSection(tx, sectionId, actor);
    const prior = (await tx.list("academicRequests", true)).find(
      (r) => r.id === input.requestId,
    );
    if (prior) {
      requireValue(
        prior.actorId === actor.id && prior.requestHash === digest,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { ...prior.result, replayed: true };
    }
    const { rows, term, section, scheme, gpaPolicy, reviewHash } =
      await gradeRoster(tx, sectionId, actor);
    requireValue(
      (scheme?.version || null) === (input.schemeVersion ?? null),
      "Cấu hình điểm đã thay đổi. Tải lại bảng điểm.",
      409,
    );
    requireValue(
      section.version === input.sectionVersion,
      "Thông tin lớp đã thay đổi. Tải lại để đối chiếu bảng điểm.",
      409,
    );
    requireValue(
      rows.length > 0 &&
        rows.length === input.rows.length &&
        rows.every(
          (r) =>
            r.grade &&
            r.grade.enrollmentVersion === r.enrollmentVersion &&
            (r.grade.schemeVersion || null) === (scheme?.version || null) &&
            (!scheme ||
              weightedScore(scheme, r.grade.componentScores) ===
                r.grade.score) &&
            input.rows.some(
              (v) => v.id === r.grade.id && v.version === r.grade.version,
            ),
        ),
      "Danh sách hoặc điểm đã thay đổi, hoặc còn thiếu điểm. Tải lại và đối chiếu toàn bảng.",
      409,
    );
    const from = action === "SUBMIT" ? "DRAFT" : "SUBMITTED",
      to =
        action === "SUBMIT"
          ? "SUBMITTED"
          : action === "PUBLISH"
            ? "PUBLISHED"
            : "DRAFT";
    requireValue(
      rows.every((r) => r.grade.status === from),
      "Bảng điểm không còn ở trạng thái được phép.",
      409,
    );
    if (action === "PUBLISH" && (scheme || gpaPolicy || input.reviewHash))
      requireValue(
        input.reviewHash === reviewHash,
        "Dữ liệu tính điểm/tín chỉ đã thay đổi sau khi xem. Tải lại bảng điểm trước khi công bố.",
        409,
      );
    if (action === "PUBLISH")
      requireValue(
        term &&
          term.version === input.termVersion &&
          Number.isFinite(term.passScore) &&
          term.passScore > 0,
        "Chưa cấu hình hoặc quy định học kỳ đã thay đổi. Tải lại để đối chiếu ngưỡng đạt.",
        409,
      );
    if (action === "PUBLISH")
      requireValue(
        (gpaPolicy?.version || null) === (input.gpaPolicyVersion ?? null),
        "Quy định quy đổi GPA đã thay đổi. Tải lại trước khi công bố.",
        409,
      );
    const subject = (await tx.list("subjects")).find(
      (s) => s.id === section.subjectId,
    );
    if (action === "PUBLISH")
      requireValue(
        subject && Number.isInteger(subject.credits) && subject.credits > 0,
        "Chưa xác minh được số tín chỉ của môn học.",
        409,
      );
    const at = Date.now();
    for (const row of rows) {
      const changes = { status: to };
      if (action === "PUBLISH")
        Object.assign(changes, {
          publishedBy: actor.id,
          publishedAt: at,
          passScore: term.passScore,
          resultSnapshot: {
            subjectId: subject.id,
            subjectCode: subject.code,
            subjectName: subject.name,
            credits: subject.credits,
            term: section.term,
            endDate: section.endDate,
            scheme: scheme
              ? {
                  id: scheme.id,
                  version: scheme.version,
                  components: scheme.components,
                }
              : null,
            gpaPolicy: gpaPolicy
              ? {
                  id: gpaPolicy.id,
                  version: gpaPolicy.version,
                  bands: gpaPolicy.bands,
                  repeatRule: gpaPolicy.repeatRule,
                }
              : null,
            ...convertScore(row.grade.score, gpaPolicy),
          },
        });
      await tx.update("grades", row.grade.id, changes, row.grade.version);
    }
    const result = { sectionId, count: rows.length, status: to };
    await audit(
      tx,
      actor,
      {
        SUBMIT: "GRADES_SUBMITTED",
        PUBLISH: "GRADES_PUBLISHED",
        RETURN: "GRADES_RETURNED",
      }[action],
      sectionId,
      {
        rows: rows.map((r) => ({
          id: r.grade.id,
          version: r.grade.version,
          score: r.grade.score,
        })),
        passScore: action === "PUBLISH" ? term.passScore : null,
        reason: input.reason || "",
      },
    );
    await tx.insert("academicRequests", {
      id: input.requestId,
      actorId: actor.id,
      requestHash: digest,
      result,
    });
    return { ...result, replayed: false };
  });
}
