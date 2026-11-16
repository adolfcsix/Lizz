import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { transferFixture } from "./curriculum-transfer-fixture.js";
import { serviceFixture } from "./student-services-fixture.js";
import { myCoursePlan } from "../../backend/local/modules/academic/course-plan.service.js";
import { flattenCoursePlan, filterCoursePlan, filterPlannedSections } from "../../shared/course-plan.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";

test("Course plan: reads assigned edition, never picks the newest publication", async () => {
  const f = await transferFixture(), p = await myCoursePlan(f.store, f.student);
  assert.equal(p.status, "VERIFIED");
  assert.equal(p.curriculum.id, f.before.id);
  assert.equal(p.courses[0].semester, 1);
  assert.equal(p.courses[0].needsStudy, true);
  assert.equal(p.remainingCredits, 3);
  assert.ok(!("assignment" in p));
});
test("Course plan: missing profile and missing assignment are distinct, without choosing a default program", async () => {
  const f = await serviceFixture();
  assert.equal((await myCoursePlan(f.store, f.student)).status, "UNASSIGNED");
  const unlinked = { ...f.student, id: randomUUID() };
  assert.equal((await myCoursePlan(f.store, unlinked)).status, "PROFILE_MISSING");
});
test("Course plan: manager, staff and lecturers cannot use the personal endpoint", async () => {
  const f = await transferFixture();
  for (const a of [f.manager, f.staff, f.teacher])
    await assert.rejects(myCoursePlan(f.store, a), (e) => e.status === 403);
});
test("Course plan: another student's assignment is not returned", async () => {
  const f = await transferFixture(), r = await myCoursePlan(f.store, f.student2);
  assert.equal(r.status, "UNASSIGNED");
  assert.deepEqual(r.courses, []);
  assert.equal(r.curriculum, null);
});
test("Course plan: changed cohort flags uncertainty instead of verified credit totals", async () => {
  const f = await transferFixture();
  await f.store.update("classes", f.profiles[0].classId, { cohortId: randomUUID() }, 1);
  const r = await myCoursePlan(f.store, f.student);
  assert.equal(r.status, "NEEDS_REVIEW");
  assert.equal(r.remainingCredits, null);
  assert.match(r.note, /ngành\/khóa/);
});
test("Course plan: unavailable assigned publication does not break the registration page", async () => {
  const f = await transferFixture();
  await f.store.update("curricula", f.before.id, { status: "DRAFT" }, 2);
  const r = await myCoursePlan(f.store, f.student);
  assert.equal(r.status, "NEEDS_REVIEW");
  assert.deepEqual(r.courses, []);
});
test("Course plan: registering changes progress to in progress and removes the need-to-study flag", async () => {
  const f = await transferFixture();
  await f.enroll();
  const r = await myCoursePlan(f.store, f.student);
  assert.equal(r.courses[0].status, "IN_PROGRESS");
  assert.equal(r.courses[0].needsStudy, false);
});
test("Course plan: latest enrollment generation and published results are required to mark passed", async () => {
  const f = await transferFixture();
  await f.enroll();
  const e = (await f.store.list("enrollments"))[0];
  const grade = { id: randomUUID(), enrollmentId: e.id, enrollmentVersion: e.version, score: 8, passScore: 5, status: "DRAFT", version: 1, resultSnapshot: { subjectId: f.section.subjectId, credits: 3 } };
  await f.store.insert("grades", grade);
  assert.equal((await myCoursePlan(f.store, f.student)).courses[0].status, "IN_PROGRESS");
  await f.store.update("grades", grade.id, { status: "PUBLISHED" }, 1);
  assert.equal((await myCoursePlan(f.store, f.student)).courses[0].status, "PASSED");
  await f.store.update("enrollments", e.id, { status: "WITHDRAWN" }, e.version);
  assert.equal((await myCoursePlan(f.store, f.student)).courses[0].status, "NOT_TAKEN");
});

const sample = () => flattenCoursePlan({ groups: [
  { code: "BB", name: "Bắt buộc", kind: "REQUIRED", remainingCredits: 3, subjects: [{ subjectId: "a", subjectCode: "CSDL", subjectName: "Cơ sở dữ liệu", credits: 3, semester: 1, status: "NOT_TAKEN" }] },
  { code: "TC", name: "Tự chọn", kind: "ELECTIVE", remainingCredits: 0, subjects: [{ subjectId: "b", subjectCode: "AI", subjectName: "Trí tuệ nhân tạo", credits: 3, semester: 2, status: "NOT_TAKEN" }, { subjectId: "c", subjectCode: "WEB", subjectName: "Lập trình web", credits: 3, semester: 2, status: "RECOGNIZED" }] },
] });
test("Course plan: fulfilled elective group and recognized subject are not mandatory missing courses", () => {
  const rows = sample();
  assert.equal(rows[1].needsStudy, false);
  assert.equal(rows[2].needsStudy, false);
  assert.deepEqual(filterCoursePlan(rows, { progress: "NEEDS_STUDY" }).map((r) => r.subjectId), ["a"]);
  assert.deepEqual(filterCoursePlan(rows, { progress: "RECOGNIZED" }).map((r) => r.subjectId), ["c"]);
});
test("Course plan: accent-insensitive search combines with group, semester and progress", () => {
  const rows = sample();
  assert.equal(filterCoursePlan(rows, { q: "co so du lieu", group: "BB", semester: "1", progress: "NEEDS_STUDY" }).length, 1);
  assert.equal(filterCoursePlan(rows, { q: "CSDL", semester: 2 }).length, 0);
  assert.equal(filterCoursePlan(rows, { group: "TC" }).length, 2);
});
const sections = () => [
  { id: "1", code: "CSDL01", subjectId: "a", subjectCode: "CSDL", subjectName: "Cơ sở dữ liệu", lecturerName: "Hoàng Nam", term: "T1", status: "OPEN", available: 2 },
  { id: "2", code: "CSDL02", subjectId: "a", subjectCode: "CSDL", term: "T1", status: "OPEN", available: 0 },
  { id: "3", code: "AI01", subjectId: "b", subjectCode: "AI", term: "T2", status: "CLOSED", available: 3, registration: { status: "ACTIVE" } },
  { id: "4", code: "OTHER", subjectId: "other", term: "T1", status: "OPEN", available: 3 },
];
test("Course plan: curriculum filter preserves lecturer search and does not restrict all-class mode", () => {
  const s = sections(), p = { courses: sample() };
  assert.equal(filterPlannedSections(s, p).length, 4);
  assert.equal(filterPlannedSections(s, p, { curriculum: true }).length, 3);
  assert.deepEqual(filterPlannedSections(s, p, { curriculum: true, q: "hoang nam" }).map((s) => s.id), ["1"]);
  assert.deepEqual(filterPlannedSections(s, p, { curriculum: true, q: "CSDL", semester: 1 }).map((s) => s.id), ["1", "2"]);
});
test("Course plan: availability, term, current registration and exact subject compose without matching similar codes", () => {
  const s = sections(), p = { courses: sample() };
  assert.deepEqual(filterPlannedSections(s, p, { available: true, term: "T1", subjectId: "a" }).map((s) => s.id), ["1"]);
  assert.deepEqual(filterPlannedSections(s, p, { onlyMine: true }).map((s) => s.id), ["3"]);
  assert.equal(filterPlannedSections(s, p, { onlyMine: true, available: true }).length, 0);
  assert.equal(filterPlannedSections(s, p, { group: "TC", progress: "NEEDS_STUDY" }).length, 0);
  assert.equal(filterPlannedSections(s, { courses: [] }, { curriculum: true }).length, 0);
});
test("Course plan HTTP: authentication, role, forced password and ignored foreign studentId", async (t) => {
  const f = await transferFixture(), origin = "http://localhost:4173";
  const server = createApp({ store: f.store, config: { origin }, mode: "demo" });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = "http://127.0.0.1:" + server.address().port + "/api/v1/academics/my-course-plan";
  assert.equal((await fetch(url)).status, 401);
  for (const [i, actor] of [f.student, f.student2, f.manager, f.staff, f.teacher].entries()) {
    const token = String(i + 1).repeat(64);
    await f.store.insert("sessions", { tokenHash: tokenHash(token), accountId: actor.id, accountVersion: 1, expiresAt: Date.now() + 60000 });
    const r = await fetch(url + "?studentId=" + f.profiles[1].id, { headers: { Cookie: "lizz_session=" + token } });
    assert.equal(r.status, actor.role === "STUDENT" ? 200 : 403);
    if (actor.id === f.student.id) assert.equal((await r.json()).curriculum.id, f.before.id);
    if (actor.id === f.student2.id) assert.deepEqual((await r.json()).courses, []);
  }
  await f.store.update("accounts", f.student.id, { mustChangePassword: true }, 1);
  // Phiên version cũ bị thu hồi; endpoint không được truy cập.
  assert.notEqual((await fetch(url, { headers: { Cookie: "lizz_session=" + "1".repeat(64) } })).status, 200);
});
