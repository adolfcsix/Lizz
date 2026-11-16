import { randomUUID } from "node:crypto";
import { transferFixture } from "./curriculum-transfer-fixture.js";
import {
  gradeRoster,
  saveGradeDrafts,
  transitionGrades,
} from "../../backend/local/modules/grades/grade.service.js";
import { saveGpaPolicy } from "../../backend/local/modules/grades/grade-settings.service.js";
import {
  saveStandingPolicy,
  standingOverview,
} from "../../backend/local/modules/grades/standing.service.js";
export async function standingFixture() {
  const f = await transferFixture();
  await f.enroll();
  await saveGpaPolicy(
    f.store,
    {
      termId: f.term.id,
      version: 0,
      repeatRule: "HIGHEST",
      bands: [
        { minScore: 0, letter: "F", points: 0 },
        { minScore: 5, letter: "C", points: 2 },
        { minScore: 7, letter: "B", points: 3 },
        { minScore: 8.5, letter: "A", points: 4 },
      ],
    },
    f.manager,
  );
  let roster = await gradeRoster(f.store, f.section.id, f.teacher);
  await saveGradeDrafts(
    f.store,
    f.section.id,
    {
      schemeVersion: null,
      rows: roster.rows.map((r) => ({
        enrollmentId: r.enrollmentId,
        enrollmentVersion: r.enrollmentVersion,
        version: 0,
        score: 8,
      })),
    },
    f.teacher,
  );
  for (const [action, actor] of [
    ["SUBMIT", f.teacher],
    ["PUBLISH", f.manager],
  ]) {
    roster = await gradeRoster(f.store, f.section.id, actor);
    await transitionGrades(
      f.store,
      f.section.id,
      {
        requestId: randomUUID(),
        sectionVersion: roster.section.version,
        termVersion: roster.term.version,
        schemeVersion: null,
        gpaPolicyVersion: roster.gpaPolicy.version,
        reviewHash: roster.reviewHash,
        rows: roster.rows.map((r) => ({
          id: r.grade.id,
          version: r.grade.version,
        })),
      },
      actor,
      action,
    );
  }
  f.policyInput = (patch = {}) => ({
    termId: f.term.id,
    version: 0,
    confirm: true,
    reason: "Quy chế học vụ của học kỳ",
    payload: {
      gpa4Below: 2,
      failedCreditsAtLeast: 3,
      bands: [
        { minGpa4: 0, label: "Cần củng cố" },
        { minGpa4: 2, label: "Đạt yêu cầu" },
        { minGpa4: 3, label: "Tốt" },
      ],
    },
    ...patch,
  });
  f.policy = (patch = {}, actor = f.manager) =>
    saveStandingPolicy(f.store, f.policyInput(patch), actor);
  f.overview = (actor = f.manager, query = {}) =>
    standingOverview(f.store, actor, { termId: f.term.id, ...query });
  return f;
}
