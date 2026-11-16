// So sánh theo ID học phần và mã nhóm; thay thứ tự hiển thị không đổi yêu cầu học.
const groupValue = (g) => ({
  code: g.code,
  name: g.name,
  kind: g.kind,
  minCredits: g.minCredits,
});
const groupFields = ["name", "kind", "minCredits"];
const subjectFields = [
  "subjectCode",
  "subjectName",
  "credits",
  "semester",
  "groupCode",
  "groupName",
  "kind",
];
export const CURRICULUM_DIFF_LABELS = {
  name: "Tên nhóm",
  kind: "Loại nhóm",
  minCredits: "Tín chỉ tối thiểu",
  subjectCode: "Mã học phần",
  subjectName: "Tên học phần",
  credits: "Tín chỉ",
  semester: "Học kỳ dự kiến",
  groupCode: "Nhóm học phần",
  groupName: "Tên nhóm",
};
function compareMaps(before, after, fields, key) {
  return [...new Set([...before.keys(), ...after.keys()])].map((id) => {
    const a = before.get(id) || null,
      b = after.get(id) || null;
    const changed = a && b ? fields.filter((f) => a[f] !== b[f]) : [];
    return {
      [key]: id,
      change: !a
        ? "ADDED"
        : !b
          ? "REMOVED"
          : changed.length
            ? "CHANGED"
            : "UNCHANGED",
      before: a,
      after: b,
      fields: changed,
    };
  });
}
export function compareCurriculumContents(before, after) {
  const groups = (p) => new Map(p.groups.map((g) => [g.code, groupValue(g)]));
  const subjects = (p) =>
    new Map(
      p.groups.flatMap((g) =>
        g.subjects.map((s) => [
          s.subjectId,
          { ...s, groupCode: g.code, groupName: g.name, kind: g.kind },
        ]),
      ),
    );
  const allSubjects = compareMaps(
    subjects(before),
    subjects(after),
    subjectFields,
    "subjectId",
  );
  const sum = (p) => p.groups.reduce((n, g) => n + g.minCredits, 0);
  return {
    title:
      before.name === after.name
        ? null
        : { before: before.name, after: after.name },
    minimumCredits: {
      before: sum(before),
      after: sum(after),
      delta: sum(after) - sum(before),
    },
    groups: compareMaps(
      groups(before),
      groups(after),
      groupFields,
      "code",
    ).filter((g) => g.change !== "UNCHANGED"),
    subjects: allSubjects.filter((s) => s.change !== "UNCHANGED"),
    counts: Object.fromEntries(
      ["ADDED", "REMOVED", "CHANGED", "UNCHANGED"].map((key) => [
        key,
        allSubjects.filter((s) => s.change === key).length,
      ]),
    ),
  };
}
