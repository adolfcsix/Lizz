import { tokenHash } from "../../core/password.js";
export function seatingSource(data, exam) {
  const room = data.rooms.find((row) => row.id === exam.roomId);
  const enrollments = data.enrollments
    .filter(
      (row) => row.sectionId === exam.sectionId && row.status === "ACTIVE",
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const rows = enrollments
    .map((enrollment) => {
      const student = data.students.find(
        (row) => row.id === enrollment.studentId,
      );
      return {
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        enrollmentVersion: enrollment.version,
        studentVersion: student?.version || 0,
        code: student?.code || "",
        fullName: student?.fullName || "",
      };
    })
    .sort(
      (a, b) =>
        a.code.localeCompare(b.code, "vi", { numeric: true }) ||
        a.studentId.localeCompare(b.studentId),
    );
  return {
    room,
    rows,
    sourceHash: tokenHash(JSON.stringify({ exam, room, rows })),
  };
}
export function latestSeating(plans, examId) {
  return (
    plans
      .filter((row) => row.examId === examId)
      .sort((a, b) => b.version - a.version)[0] || null
  );
}
export function seatingState(data, exam) {
  const plan = latestSeating(data.examSeatings || [], exam.id);
  if (exam.status === "CANCELLED")
    return { status: "CANCELLED", version: plan?.version || 0, plan: null };
  if (!plan) return { status: "NOT_ASSIGNED", version: 0, plan: null };
  if (
    exam.status !== "PUBLISHED" ||
    plan.payload.sourceHash !== seatingSource(data, exam).sourceHash
  )
    return { status: "STALE", version: plan.version, plan: null };
  return { status: "CURRENT", version: plan.version, plan };
}
