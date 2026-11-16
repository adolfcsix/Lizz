import { authorize } from "../../middlewares/authorize.js";
import { curriculumProgress } from "../curriculum/curriculum.service.js";
import { flattenCoursePlan } from "../../../../shared/course-plan.js";

// Không nhận studentId từ client: kế hoạch đăng ký luôn của chính tài khoản.
export async function myCoursePlan(store, actor) {
  authorize(actor, ["STUDENT"]);
  const student = (await store.list("students")).find((s) => s.accountId === actor.id);
  if (!student)
    return { status: "PROFILE_MISSING", courses: [], note: "Tài khoản chưa liên kết hồ sơ sinh viên." };
  let progress;
  try {
    progress = await curriculumProgress(store, actor, student.id);
  } catch (error) {
    if (error.status !== 409) throw error;
    return { status: "NEEDS_REVIEW", courses: [], note: error.message };
  }
  return {
    status: progress.status,
    curriculum: progress.curriculum || null,
    requiredCredits: progress.requiredCredits ?? null,
    earnedCredits: progress.earnedCredits ?? null,
    remainingCredits: progress.remainingCredits ?? null,
    courses: flattenCoursePlan(progress),
    note: progress.note,
    asOf: Date.now(),
  };
}
