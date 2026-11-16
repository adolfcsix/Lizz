export const vietnamDate = (at = Date.now()) =>
  new Date(at + 7 * 3600000).toISOString().slice(0, 10);
export function applicableRecognitions(data, studentId, asOf = vietnamDate()) {
  const student = data.students.find((s) => s.id === studentId),
    cl = data.classes.find((c) => c.id === student?.classId),
    assignment = data.curriculumAssignments.find(
      (a) => a.studentId === studentId,
    ),
    program = data.curricula.find((p) => p.id === assignment?.curriculumId);
  if (
    !program ||
    program.status !== "PUBLISHED" ||
    cl?.majorId !== program.majorId ||
    cl?.cohortId !== program.cohortId
  )
    return [];
  const items = program.groups.flatMap((g) => g.subjects);
  return data.creditRecognitions.filter(
    (r) =>
      r.studentId === studentId &&
      r.status === "APPLIED" &&
      Number.isFinite(r.result?.appliedAt) &&
      r.result.appliedAt > 0 &&
      r.result.gpaIncluded === false &&
      Number.isInteger(r.result.credits) &&
      Number.isInteger(r.payload?.subject?.credits) &&
      r.result.credits >= r.payload.subject.credits &&
      typeof r.payload?.effectiveDate === "string" &&
      r.payload?.program &&
      r.payload.effectiveDate <= asOf &&
      r.payload.program.code === program.code &&
      r.payload.program.majorId === program.majorId &&
      r.payload.program.cohortId === program.cohortId &&
      items.some(
        (item) =>
          item.subjectId === r.subjectId &&
          item.credits <= r.payload.subject.credits,
      ),
  );
}
export async function recognitionContext(store) {
  const kinds = [
    "creditRecognitions",
    "students",
    "classes",
    "curriculumAssignments",
    "curricula",
  ];
  return Object.fromEntries(
    await Promise.all(kinds.map(async (k) => [k, await store.list(k)])),
  );
}
