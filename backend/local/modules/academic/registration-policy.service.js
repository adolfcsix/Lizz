import {
  applicableRecognitions,
  recognitionContext,
  vietnamDate,
} from "../curriculum/recognition.rules.js";
import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { foldText } from "../../../../shared/local-validation.js";
import { freshActor, audit, lockAcademic } from "./academic.common.js";
const managers = ["MANAGER", "STAFF"];
const code = (v) => typeof v === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(v);
const text = (v, max) => typeof v === "string" && v.trim() && v.length <= max;
const same = (a, b) => foldText(a) === foldText(b);
export const passedGrade = (g) =>
  g?.status === "PUBLISHED" &&
  Number.isFinite(g.score) &&
  Number.isFinite(g.passScore) &&
  g.passScore > 0 &&
  g.score >= g.passScore;
export const audiencesOverlap = (a, b) =>
  (!a.facultyId || !b.facultyId || a.facultyId === b.facultyId) &&
  (!a.cohortId || !b.cohortId || a.cohortId === b.cohortId);
export const audienceMatches = (p, home) =>
  (!p.facultyId || p.facultyId === home?.facultyId) &&
  (!p.cohortId || p.cohortId === home?.cohortId);
export async function studentAudience(store, student) {
  const group = (await store.list("classes")).find(
    (c) => c.id === student?.classId,
  );
  const major = (await store.list("majors")).find(
    (m) => m.id === group?.majorId,
  );
  return {
    facultyId: major?.facultyId || null,
    cohortId: group?.cohortId || null,
  };
}
export async function policyOverview(store, actor) {
  authorize(actor, [...managers, "LECTURER", "STUDENT"]);
  const student =
    actor.role === "STUDENT"
      ? (await store.list("students")).find((s) => s.accountId === actor.id)
      : null;
  const home = student ? await studentAudience(store, student) : null;
  const faculties = await store.list("faculties"),
    cohorts = await store.list("cohorts");
  return {
    faculties,
    cohorts,
    terms: await store.list("terms"),
    studyPolicies: (await store.list("studyPolicies")).map(
      ({
        id,
        termId,
        allowRetake,
        allowImprovement,
        maxAttempts,
        maxImprovementScore,
        version,
      }) => ({
        id,
        termId,
        allowRetake,
        allowImprovement,
        maxAttempts,
        maxImprovementScore,
        version,
      }),
    ),
    periods: (await store.list("periods"))
      .filter((p) => actor.role !== "STUDENT" || audienceMatches(p, home))
      .map((p) => ({
        ...p,
        audienceLabel:
          (faculties.find((f) => f.id === p.facultyId)?.name || "Tất cả khoa") +
          " · " +
          (cohorts.find((c) => c.id === p.cohortId)?.name || "Tất cả khóa"),
      })),
    requirements: await store.list("requirements"),
    subjects: await store.list("subjects"),
    serverTime: Date.now(),
  };
}
export async function saveTerm(store, input, actor, id = null) {
  requireValue(
    code(input.code) && text(input.name, 160),
    "Nhập mã và tên học kỳ hợp lệ.",
  );
  requireValue(
    Number.isInteger(input.maxCredits) &&
      input.maxCredits >= 1 &&
      input.maxCredits <= 60,
    "Hạn mức tín chỉ từ 1 đến 60.",
  );
  requireValue(
    Number.isFinite(input.passScore) &&
      input.passScore > 0 &&
      input.passScore <= 10 &&
      Math.abs(input.passScore * 100 - Math.round(input.passScore * 100)) <
        0.000001,
    "Ngưỡng đạt cần lớn hơn 0, tối đa 10 và tối đa hai số lẻ.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const terms = await tx.list("terms"),
      old = terms.find((r) => r.id === id);
    if (id) requireValue(old, "Không tìm thấy học kỳ.", 404);
    requireValue(
      !terms.some((r) => r.id !== id && same(r.code, input.code)),
      "Mã học kỳ đã tồn tại.",
      409,
    );
    if (old) {
      requireValue(
        input.code === old.code,
        "Mã học kỳ được giữ nguyên để bảo toàn liên kết lớp.",
      );
      if (input.passScore !== old.passScore) {
        const sectionIds = new Set(
          (await tx.list("sections"))
            .filter((s) => same(s.term, old.code))
            .map((s) => s.id),
        );
        const enrollmentIds = new Set(
          (await tx.list("enrollments"))
            .filter((e) => sectionIds.has(e.sectionId))
            .map((e) => e.id),
        );
        requireValue(
          !(await tx.list("grades")).some(
            (g) =>
              enrollmentIds.has(g.enrollmentId) && g.status === "PUBLISHED",
          ),
          "Học kỳ đã công bố điểm. Không thay ngưỡng đạt hồi tố.",
          409,
        );
      }
    }
    const fields = {
      code: input.code.trim(),
      name: input.name.trim(),
      maxCredits: input.maxCredits,
      passScore: input.passScore,
    };
    const row = {
      id: id || randomUUID(),
      ...fields,
      version: (old?.version || 0) + 1,
    };
    if (old) await tx.update("terms", id, fields, input.version);
    else await tx.insert("terms", row);
    await audit(tx, actor, old ? "TERM_UPDATED" : "TERM_CREATED", row.id, {
      before: old || null,
      after: row,
    });
    return row;
  });
}
export async function savePeriod(store, input, actor, id = null) {
  requireValue(
    text(input.title, 180) && ["OPEN", "CLOSED"].includes(input.status),
    "Nhập tên đợt và trạng thái hợp lệ.",
  );
  requireValue(
    [input.opensAt, input.closesAt, input.withdrawUntil].every(
      (n) => Number.isSafeInteger(n) && n > 0 && n < 253402300800000,
    ) &&
      input.opensAt < input.closesAt &&
      input.closesAt <= input.withdrawUntil,
    "Mốc thời gian không hợp lệ: mở < đóng đăng ký ≤ hạn rút.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    requireValue(
      (await tx.list("terms")).some((t) => t.id === input.termId),
      "Chọn học kỳ đã cấu hình.",
    );
    const rows = await tx.list("periods"),
      old = rows.find((r) => r.id === id);
    if (id) requireValue(old, "Không tìm thấy đợt đăng ký.", 404);
    requireValue(
      !old || old.termId === input.termId,
      "Không chuyển đợt sang học kỳ khác.",
    );
    const audience = {
      facultyId:
        input.facultyId === undefined
          ? old?.facultyId || null
          : input.facultyId || null,
      cohortId:
        input.cohortId === undefined
          ? old?.cohortId || null
          : input.cohortId || null,
    };
    requireValue(
      !audience.facultyId ||
        (await tx.list("faculties")).some((f) => f.id === audience.facultyId),
      "Chọn khoa hợp lệ.",
    );
    requireValue(
      !audience.cohortId ||
        (await tx.list("cohorts")).some((c) => c.id === audience.cohortId),
      "Chọn khóa hợp lệ.",
    );
    if (
      (old && (old.facultyId || null) !== audience.facultyId) ||
      (old && (old.cohortId || null) !== audience.cohortId)
    ) {
      const registrations = await tx.list("enrollments"),
        terms = await tx.list("terms"),
        sections = await tx.list("sections");
      requireValue(
        !registrations.some((e) => e.registrationPeriodId === id),
        "Đợt đã có đăng ký. Giữ đối tượng cũ và mở đợt mới nếu cần thay phạm vi.",
        409,
      );
      const termCode = terms.find((t) => t.id === old.termId)?.code;
      requireValue(
        !registrations.some(
          (e) =>
            !e.registrationPeriodId &&
            sections.some(
              (s) => s.id === e.sectionId && same(s.term, termCode),
            ),
        ),
        "Học kỳ có đăng ký cũ chưa xác minh đợt. Giữ phạm vi cũ và mở đợt mới.",
        409,
      );
    }
    requireValue(
      !rows.some(
        (p) =>
          p.id !== id &&
          audiencesOverlap(p, audience) &&
          p.termId === input.termId &&
          p.status === "OPEN" &&
          input.status === "OPEN" &&
          p.opensAt < input.closesAt &&
          input.opensAt < p.closesAt,
      ),
      "Hai đợt cùng học kỳ có đối tượng giao nhau không được chồng thời gian đăng ký.",
      409,
    );
    const fields = {
      ...audience,
      termId: input.termId,
      title: input.title.trim(),
      opensAt: input.opensAt,
      closesAt: input.closesAt,
      withdrawUntil: input.withdrawUntil,
      status: input.status,
    };
    const row = {
      id: id || randomUUID(),
      ...fields,
      version: (old?.version || 0) + 1,
    };
    if (old) await tx.update("periods", id, fields, input.version);
    else await tx.insert("periods", row);
    await audit(tx, actor, old ? "PERIOD_UPDATED" : "PERIOD_CREATED", row.id, {
      before: old || null,
      after: row,
    });
    return row;
  });
}
export async function saveRequirement(store, input, actor, id = null) {
  requireValue(
    typeof input.active === "boolean",
    "Trạng thái điều kiện phải là bật hoặc tắt.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const subjects = await tx.list("subjects"),
      rows = await tx.list("requirements"),
      old = rows.find((r) => r.id === id);
    if (id) requireValue(old, "Không tìm thấy điều kiện.", 404);
    requireValue(
      input.subjectId !== input.requiredSubjectId &&
        [input.subjectId, input.requiredSubjectId].every((v) =>
          subjects.some((s) => s.id === v),
        ),
      "Chọn hai môn học khác nhau đã tồn tại.",
    );
    requireValue(
      !old ||
        (old.subjectId === input.subjectId &&
          old.requiredSubjectId === input.requiredSubjectId),
      "Không thay cặp môn đã lưu; tắt điều kiện và thêm cặp mới.",
    );
    requireValue(
      !rows.some(
        (r) =>
          r.id !== id &&
          r.subjectId === input.subjectId &&
          r.requiredSubjectId === input.requiredSubjectId,
      ),
      "Điều kiện đã tồn tại. Chỉnh sửa để bật/tắt.",
      409,
    );
    const fields = {
      subjectId: input.subjectId,
      requiredSubjectId: input.requiredSubjectId,
      active: input.active,
    };
    const graph = [...rows.filter((r) => r.id !== id), fields].filter(
        (r) => r.active,
      ),
      seen = new Set();
    const reaches = (from, target) => {
      if (from === target) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return graph
        .filter((r) => r.subjectId === from)
        .some((r) => reaches(r.requiredSubjectId, target));
    };
    requireValue(
      !input.active || !reaches(input.requiredSubjectId, input.subjectId),
      "Điều kiện tạo vòng lặp tiên quyết.",
      409,
    );
    const row = {
      id: id || randomUUID(),
      ...fields,
      version: (old?.version || 0) + 1,
    };
    if (old) await tx.update("requirements", id, fields, input.version);
    else await tx.insert("requirements", row);
    await audit(
      tx,
      actor,
      old ? "REQUIREMENT_UPDATED" : "REQUIREMENT_CREATED",
      row.id,
      { before: old || null, after: row },
    );
    return row;
  });
}
export async function requireWindow(
  store,
  termCode,
  action,
  now = Date.now(),
  student = null,
  binding = null,
) {
  const term = (await store.list("terms")).find((t) => same(t.code, termCode));
  requireValue(
    term,
    "Học kỳ chưa có quy định đăng ký. Liên hệ Nhân viên để cấu hình.",
    409,
  );
  const home = student ? await studentAudience(store, student) : null;
  const bound = action === "WITHDRAW" && binding?.registrationPeriodId;
  const periods = (await store.list("periods")).filter(
    (p) =>
      p.termId === term.id &&
      p.status === "OPEN" &&
      p.opensAt <= now &&
      (bound ? p.id === bound : audienceMatches(p, home)) &&
      now <
        (action === "WITHDRAW"
          ? Math.min(
              p.withdrawUntil,
              binding?.withdrawalDeadline ?? p.withdrawUntil,
            )
          : p.closesAt),
  );
  // Đăng ký có một đợt áp dụng; dữ liệu cũ rút học dùng hạn gần nhất trong các đợt phù hợp.
  periods.sort(
    (a, b) =>
      (action === "WITHDRAW"
        ? a.withdrawUntil - b.withdrawUntil
        : a.opensAt - b.opensAt) || a.id.localeCompare(b.id),
  );
  requireValue(
    periods.length,
    action === "WITHDRAW"
      ? "Không trong thời gian được rút học phần của đợt áp dụng."
      : "Chưa đến thời gian đăng ký, đợt đã đóng hoặc không thuộc khoa/khóa được mở.",
    409,
  );
  const period = { ...periods[0] };
  if (action === "WITHDRAW" && binding?.withdrawalDeadline)
    period.withdrawUntil = Math.min(
      period.withdrawUntil,
      binding.withdrawalDeadline,
    );
  return { term, period };
}
export async function checkStudyRules(store, student, section, ownSections) {
  const { term, period } = await requireWindow(
      store,
      section.term,
      "REGISTER",
      Date.now(),
      student,
    ),
    subjects = await store.list("subjects");
  const credits = (id) => {
    const s = subjects.find((s) => s.id === id);
    requireValue(
      s && Number.isInteger(s.credits) && s.credits > 0,
      "Dữ liệu tín chỉ chưa hợp lệ. Liên hệ Nhân viên.",
      409,
    );
    return s.credits;
  };
  const currentCredits = ownSections
      .filter((s) => same(s.term, section.term))
      .reduce((n, s) => n + credits(s.subjectId), 0),
    nextCredits = currentCredits + credits(section.subjectId);
  requireValue(
    nextCredits <= term.maxCredits,
    `Vượt hạn mức tín chỉ: ${currentCredits} + ${credits(section.subjectId)} > ${term.maxCredits}.`,
    409,
  );
  const requirements = (await store.list("requirements")).filter(
      (r) => r.active && r.subjectId === section.subjectId,
    ),
    enrollments = (await store.list("enrollments")).filter(
      (e) => e.studentId === student.id && e.status === "ACTIVE",
    ),
    sections = await store.list("sections"),
    grades = await store.list("grades");
  const recognized = applicableRecognitions(
    await recognitionContext(store),
    student.id,
  );
  requireValue(
    !recognized.some(
      (r) =>
        r.subjectId === section.subjectId &&
        r.payload.subject.credits >= credits(section.subjectId),
    ),
    "Học phần đã được công nhận tín chỉ. Liên hệ cán bộ nếu cần xem xét lại quyết định trước khi đăng ký.",
    409,
  );
  const recognizedPrerequisites = recognized.filter(
    (r) =>
      r.payload.satisfiesPrerequisite &&
      r.payload.effectiveDate < section.startDate &&
      vietnamDate(r.result.appliedAt) < section.startDate &&
      r.payload.subject.credits >= credits(r.subjectId),
  );
  const missing = requirements.filter(
    (r) =>
      !recognizedPrerequisites.some(
        (c) => c.subjectId === r.requiredSubjectId,
      ) &&
      !enrollments.some((e) => {
        const prior = sections.find((s) => s.id === e.sectionId);
        return (
          prior?.subjectId === r.requiredSubjectId &&
          prior.endDate < section.startDate &&
          passedGrade(
            grades.find(
              (g) =>
                g.enrollmentId === e.id && g.enrollmentVersion === e.version,
            ),
          )
        );
      }),
  );
  requireValue(
    !missing.length,
    "Chưa đủ điều kiện tiên quyết: " +
      missing
        .map(
          (r) =>
            subjects.find((s) => s.id === r.requiredSubjectId)?.code ||
            "môn chưa xác định",
        )
        .join(", ") +
      ". Cần điểm đạt đã công bố và lớp tiên quyết kết thúc trước lớp muốn đăng ký.",
    409,
  );
  return {
    currentCredits,
    nextCredits,
    maxCredits: term.maxCredits,
    periodId: period.id,
    periodTitle: period.title,
    periodVersion: period.version,
    withdrawalDeadline: period.withdrawUntil,
    recognizedPrerequisites: recognizedPrerequisites
      .filter((c) =>
        requirements.some((r) => r.requiredSubjectId === c.subjectId),
      )
      .map((c) => ({ id: c.id, version: c.version, subjectId: c.subjectId })),
    requirements: requirements.map(
      (r) => subjects.find((s) => s.id === r.requiredSubjectId)?.code,
    ),
  };
}
