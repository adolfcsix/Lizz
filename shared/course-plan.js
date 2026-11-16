import { foldText } from "./local-validation.js";

export const COURSE_PROGRESS = {
  PASSED: "Đã đạt",
  RECOGNIZED: "Đã công nhận",
  IN_PROGRESS: "Đang học",
  NOT_TAKEN: "Chưa học",
  NOT_PASSED: "Chưa đạt",
  CREDIT_SHORTFALL: "Chưa đủ tín chỉ",
  UNVERIFIED: "Cần đối chiếu",
};

// Tự chọn đã đủ nhóm không trở thành danh sách môn bắt buộc còn thiếu.
export function flattenCoursePlan(progress) {
  return (progress.groups || []).flatMap((group) =>
    group.subjects.map((s) => ({
      ...s,
      groupCode: group.code,
      groupName: group.name,
      kind: group.kind,
      groupRemainingCredits: group.remainingCredits,
      needsStudy:
        ["NOT_TAKEN", "NOT_PASSED", "CREDIT_SHORTFALL"].includes(s.status) &&
        (group.kind === "REQUIRED" || group.remainingCredits > 0),
    })),
  );
}

export function filterCoursePlan(rows, filters = {}) {
  const q = foldText(filters.q || "");
  return rows.filter((r) =>
    (!q || foldText(`${r.subjectCode} ${r.subjectName}`).includes(q)) &&
    (!filters.group || r.groupCode === filters.group) &&
    (!filters.semester || String(r.semester) === String(filters.semester)) &&
    (!filters.progress ||
      (filters.progress === "NEEDS_STUDY" ? r.needsStudy : r.status === filters.progress)),
  );
}

export function filterPlannedSections(sections, plan, filters = {}) {
  const q = foldText(filters.q || ""),
    planned = new Set(filterCoursePlan(plan?.courses || [], {
      group: filters.group, semester: filters.semester, progress: filters.progress,
    }).map((r) => r.subjectId));
  return sections.filter((s) =>
    (!q || foldText(`${s.code} ${s.subjectCode} ${s.subjectName} ${s.lecturerName}`).includes(q)) &&
    (!filters.term || s.term === filters.term) &&
    (!filters.onlyMine || s.registration?.status === "ACTIVE") &&
    (!filters.available || (s.status === "OPEN" && s.available > 0 && s.registration?.status !== "ACTIVE")) &&
    (!filters.subjectId || s.subjectId === filters.subjectId) &&
    (!(filters.curriculum || filters.group || filters.semester || filters.progress) || planned.has(s.subjectId)),
  );
}
