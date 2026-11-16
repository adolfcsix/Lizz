import test from "node:test";
import { myCoursePlan } from "../../backend/local/modules/academic/course-plan.service.js";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  saveSubject,
  saveSection,
  registerSection,
  checkRegistration,
} from "../../backend/local/modules/academic/academic.service.js";
import {
  saveRequirement,
  checkStudyRules,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import {
  saveCurriculum,
  publishCurriculum,
  assignCurriculum,
  curriculumProgress,
} from "../../backend/local/modules/curriculum/curriculum.service.js";
import {
  previewRecognition,
  submitRecognition,
  changeRecognition,
  recognitionOverview,
} from "../../backend/local/modules/curriculum/recognition.service.js";
import {
  applicableRecognitions,
  recognitionContext,
} from "../../backend/local/modules/curriculum/recognition.rules.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import { fingerprint } from "../../backend/local/modules/ai/ai.actions.js";
import { notificationOverview } from "../../backend/local/modules/notifications/notification.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (n) => (e) => e.status === n;
async function fixture() {
  const f = await serviceFixture(),
    id = randomUUID;
  const faculty = { id: id(), name: "Khoa CNTT", version: 1 },
    cohort = { id: id(), name: "Khóa 70", version: 1 },
    major = { id: id(), facultyId: faculty.id, name: "CNTT", version: 1 },
    cl = {
      id: f.profiles[0].classId,
      majorId: major.id,
      cohortId: cohort.id,
      version: 1,
    };
  for (const [k, r] of [
    ["faculties", faculty],
    ["cohorts", cohort],
    ["majors", major],
    ["classes", cl],
  ])
    await f.store.insert(k, r);
  await f.store.insert("staffScopes", {
    id: id(),
    accountId: f.staff.id,
    scopeType: "ALL",
    facultyId: null,
    cohortId: null,
    active: true,
    version: 1,
  });
  const subjects = await f.store.list("subjects"),
    subject = subjects[0];
  const target = await saveSubject(
    f.store,
    { code: "WEB", name: "Lập trình web", credits: 3 },
    f.manager,
  );
  const p = await saveCurriculum(
    f.store,
    {
      code: "CNTT",
      name: "Công nghệ thông tin",
      edition: 1,
      majorId: major.id,
      cohortId: cohort.id,
      groups: [
        {
          code: "BB",
          name: "Bắt buộc",
          kind: "REQUIRED",
          subjects: [
            { subjectId: subject.id, semester: 1 },
            { subjectId: target.id, semester: 2 },
          ],
        },
      ],
    },
    f.manager,
  );
  const program = await publishCurriculum(
    f.store,
    p.id,
    { version: p.version, confirm: true },
    f.manager,
  );
  await assignCurriculum(
    f.store,
    {
      curriculumId: p.id,
      version: program.version,
      studentId: f.profiles[0].id,
      studentVersion: 1,
      reason: "Áp dụng chương trình",
      confirm: true,
      requestId: id(),
    },
    f.manager,
  );
  const input = {
    studentId: f.profiles[0].id,
    subjectId: subject.id,
    institution: "Cơ sở đào tạo trước",
    sourceCourse: "Cơ sở dữ liệu đã học",
    sourceCredits: 3,
    evidenceReference: "Bảng điểm và văn bản CN-001",
    reason: "Đối chiếu nội dung và tín chỉ",
    effectiveDate: "2020-01-01",
    satisfiesPrerequisite: true,
  };
  const propose = async (actor = f.staff, changes = {}) => {
    const body = { ...input, ...changes };
    const preview = await previewRecognition(f.store, body, actor);
    return submitRecognition(
      f.store,
      {
        ...body,
        sourceHash: preview.sourceHash,
        requestId: id(),
        confirm: true,
      },
      actor,
    );
  };
  const act = (row, action, actor = f.manager, more = {}) =>
    changeRecognition(
      f.store,
      row.id,
      action,
      {
        version: row.version,
        confirm: true,
        reason: "Xử lý theo văn bản CN-001",
        ...more,
      },
      actor,
    );
  const apply = async (changes = {}) => {
    const r = await propose(f.staff, changes),
      a = await act(r, "approve");
    return act(a, "apply", f.staff);
  };
  const section = () =>
    saveSection(
      f.store,
      {
        code: "WEB2099",
        subjectId: target.id,
        lecturerId: f.teacher.id,
        term: f.term.code,
        capacity: 40,
        startDate: "2099-01-01",
        endDate: "2099-06-30",
        weekday: 3,
        startTime: "13:00",
        endTime: "15:00",
        status: "OPEN",
        facultyId: faculty.id,
        cohortId: cohort.id,
      },
      f.manager,
    );
  return {
    ...f,
    faculty,
    cohort,
    major,
    cl,
    subject,
    target,
    program,
    input,
    propose,
    act,
    apply,
    newSection: section,
  };
}
test("Recognition: preview does not write or count credits; applied recognition counts once without grades", async () => {
  const f = await fixture(),
    before = await curriculumProgress(f.store, f.student, f.profiles[0].id),
    preview = await previewRecognition(f.store, f.input, f.staff);
  assert.equal(preview.subject.credits, 3);
  assert.equal((await f.store.list("creditRecognitions")).length, 0);
  const r = await f.propose();
  assert.equal(
    (await curriculumProgress(f.store, f.student, f.profiles[0].id))
      .earnedCredits,
    before.earnedCredits,
  );
  const a = await f.act(r, "approve");
  assert.equal(
    (await curriculumProgress(f.store, f.student, f.profiles[0].id))
      .earnedCredits,
    0,
  );
  await f.act(a, "apply", f.staff);
  const result = await curriculumProgress(f.store, f.student, f.profiles[0].id);
  assert.equal(result.earnedCredits, 3);
  assert.equal(result.groups[0].subjects[0].status, "RECOGNIZED");
  assert.equal(result.groups[0].subjects[0].score, null);
  assert.equal(f.store.data.grades.length, 0);
  assert.equal(f.store.data.enrollments.length, 0);
});
test("Recognition: validation, evidence, source credits, effective date and explicit prerequisite choice", async () => {
  const f = await fixture();
  for (const bad of [
    { institution: "" },
    { sourceCourse: "" },
    { evidenceReference: "" },
    { reason: "" },
    { sourceCredits: 2 },
    { sourceCredits: 1.5 },
    { effectiveDate: "2099-01-01" },
    { effectiveDate: "2026-02-30" },
    { satisfiesPrerequisite: "true" },
  ])
    await assert.rejects(
      previewRecognition(f.store, { ...f.input, ...bad }, f.staff),
    );
  assert.equal(f.store.data.creditRecognitions.length, 0);
});
test("Recognition: target must belong to assigned program and student audience must match", async () => {
  const f = await fixture(),
    outside = await saveSubject(
      f.store,
      { code: "OUT", name: "Ngoài chương trình", credits: 3 },
      f.manager,
    );
  await assert.rejects(
    previewRecognition(f.store, { ...f.input, subjectId: outside.id }, f.staff),
    status(409),
  );
  f.store.data.classes[0].majorId = randomUUID();
  await assert.rejects(
    previewRecognition(f.store, f.input, f.staff),
    status(409),
  );
});
test("Recognition: students/lecturers cannot propose; manager cannot approve own request or apply pending", async () => {
  const f = await fixture();
  for (const actor of [f.student, f.teacher])
    await assert.rejects(
      previewRecognition(f.store, f.input, actor),
      status(403),
    );
  const r = await f.propose(f.manager);
  await assert.rejects(f.act(r, "approve"), status(403));
  await assert.rejects(f.act(r, "apply"), status(403));
  await assert.rejects(f.act(r, "approve", f.staff), status(403));
});
test("Recognition: old student/program/assignment source blocks submit, approve and apply", async () => {
  const f = await fixture(),
    p = await previewRecognition(f.store, f.input, f.staff);
  f.store.data.students[0].version++;
  await assert.rejects(
    submitRecognition(
      f.store,
      {
        ...f.input,
        sourceHash: p.sourceHash,
        requestId: randomUUID(),
        confirm: true,
      },
      f.staff,
    ),
    status(409),
  );
  const r = await f.propose();
  f.store.data.curriculumAssignments[0].version++;
  await assert.rejects(f.act(r, "approve"), status(409));
  const g = await fixture(),
    q = await g.propose(),
    a = await g.act(q, "approve");
  g.store.data.students[0].version++;
  await assert.rejects(g.act(a, "apply", g.staff), status(409));
});
test("Recognition: cannot silently withdraw a student from the target course", async () => {
  const f = await fixture();
  await f.enroll();
  f.store.data.sections[0].endDate = "2099-12-31";
  const before = structuredClone(f.store.data.enrollments);
  await assert.rejects(f.propose(), status(409));
  assert.deepEqual(f.store.data.enrollments, before);
});
test("Recognition: retry and concurrent submissions do not create duplicate active requests", async () => {
  const f = await fixture(),
    p = await previewRecognition(f.store, f.input, f.staff),
    body = {
      ...f.input,
      sourceHash: p.sourceHash,
      requestId: randomUUID(),
      confirm: true,
    };
  const one = await submitRecognition(f.store, body, f.staff);
  assert.equal((await submitRecognition(f.store, body, f.staff)).id, one.id);
  await assert.rejects(
    submitRecognition(f.store, { ...body, reason: "Khác căn cứ" }, f.staff),
    status(409),
  );
  await assert.rejects(f.propose(), status(409));
  const g = await fixture(),
    preview = await previewRecognition(g.store, g.input, g.staff),
    calls = await Promise.allSettled(
      [1, 2].map(() =>
        submitRecognition(
          g.store,
          {
            ...g.input,
            sourceHash: preview.sourceHash,
            requestId: randomUUID(),
            confirm: true,
          },
          g.staff,
        ),
      ),
    );
  assert.equal(calls.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(g.store.data.creditRecognitions.length, 1);
});
test("Recognition: only applied decisions with explicit permission and timely application satisfy prerequisites", async () => {
  const f = await fixture();
  await saveRequirement(
    f.store,
    { subjectId: f.target.id, requiredSubjectId: f.subject.id, active: true },
    f.manager,
  );
  const section = await f.newSection();
  await assert.rejects(
    checkStudyRules(f.store, f.profiles[0], section, []),
    status(409),
  );
  await f.apply();
  const result = await checkStudyRules(f.store, f.profiles[0], section, []);
  assert.equal(result.recognizedPrerequisites.length, 1);
  const g = await fixture();
  await saveRequirement(
    g.store,
    { subjectId: g.target.id, requiredSubjectId: g.subject.id, active: true },
    g.manager,
  );
  const s = await g.newSection();
  await g.apply({ satisfiesPrerequisite: false });
  await assert.rejects(
    checkStudyRules(g.store, g.profiles[0], s, []),
    status(409),
  );
  const h = await fixture();
  await h.apply();
  const old = { ...(await h.newSection()), startDate: "2020-06-01" };
  await saveRequirement(
    h.store,
    { subjectId: h.target.id, requiredSubjectId: h.subject.id, active: true },
    h.manager,
  );
  await assert.rejects(
    checkStudyRules(h.store, h.profiles[0], old, []),
    status(409),
  );
});
test("Recognition: registration and AI fingerprint see recognition changes", async () => {
  const f = await fixture(),
    before = await fingerprint(f.store);
  await f.apply();
  assert.notEqual(await fingerprint(f.store), before);
  await assert.rejects(
    checkStudyRules(f.store, f.profiles[0], f.section, []),
    /đã được công nhận/,
  );
});
test("Recognition: revocation preserves grades/enrollments and stops credit/prerequisite use", async () => {
  const f = await fixture(),
    r = await f.apply(),
    grades = structuredClone(f.store.data.grades),
    enrollments = structuredClone(f.store.data.enrollments);
  await f.act(r, "revoke");
  assert.equal(
    (await curriculumProgress(f.store, f.student, f.profiles[0].id))
      .earnedCredits,
    0,
  );
  assert.deepEqual(f.store.data.grades, grades);
  assert.deepEqual(f.store.data.enrollments, enrollments);
  assert.equal(f.store.data.creditRecognitions[0].history.length, 4);
});
test("Recognition: cannot revoke while a current dependent registration exists", async () => {
  const f = await fixture();
  await saveRequirement(
    f.store,
    { subjectId: f.target.id, requiredSubjectId: f.subject.id, active: true },
    f.manager,
  );
  const r = await f.apply(),
    section = await f.newSection();
  await registerSection(
    f.store,
    { sectionId: section.id, requestId: randomUUID() },
    f.student,
  );
  await assert.rejects(f.act(r, "revoke"), status(409));
  assert.equal(f.store.data.creditRecognitions[0].status, "APPLIED");
});
test("Recognition: source-compatible published program versions carry credits, incompatible programs do not", async () => {
  const f = await fixture();
  await f.apply();
  const data = await recognitionContext(f.store);
  assert.equal(applicableRecognitions(data, f.profiles[0].id).length, 1);
  data.curricula[0].id = randomUUID();
  data.curricula[0].edition = 2;
  data.curriculumAssignments[0].curriculumId = data.curricula[0].id;
  assert.equal(applicableRecognitions(data, f.profiles[0].id).length, 1);
  data.curricula[0].groups[0].subjects[0].credits = 4;
  assert.equal(applicableRecognitions(data, f.profiles[0].id).length, 0);
});
test("Recognition: malformed applied records are not treated as verified credits", async () => {
  const f = await fixture();
  await f.apply();
  const data = await recognitionContext(f.store);
  data.creditRecognitions[0].result = null;
  assert.equal(applicableRecognitions(data, f.profiles[0].id).length, 0);
});
test("Recognition: student sees only own applied/revoked decisions; actor version and scopes are enforced", async () => {
  const f = await fixture(),
    pending = await f.propose();
  assert.equal((await recognitionOverview(f.store, f.student)).rows.length, 0);
  const a = await f.act(pending, "approve");
  await f.act(a, "apply", f.staff);
  assert.equal((await recognitionOverview(f.store, f.student)).rows.length, 1);
  const ownResult = (await recognitionOverview(f.store, f.student)).rows[0]
    .result;
  assert.equal(ownResult.appliedBy, undefined);
  assert.equal(ownResult.gpaIncluded, false);
  assert.equal((await recognitionOverview(f.store, f.student2)).rows.length, 0);
  assert.equal(
    (await recognitionOverview(f.store, f.student)).rows[0].payload,
    undefined,
  );
  f.store.data.staffScopes = [];
  const scoped = staffStore(f.store, f.staff);
  assert.equal((await recognitionOverview(scoped, f.staff)).rows.length, 0);
  const g = await fixture(),
    r = await g.propose();
  g.store.data.accounts = g.store.data.accounts.map((a) =>
    a.id === g.manager.id ? { ...a, version: 2 } : a,
  );
  await assert.rejects(g.act(r, "approve"), status(401));
});
test("Recognition: scoped officer can prepare and apply but cannot approve or work outside faculty", async () => {
  const f = await fixture();
  f.store.data.staffScopes = [];
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "FACULTY_COHORT",
    facultyId: f.faculty.id,
    cohortId: f.cohort.id,
    active: true,
    version: 1,
  });
  const scoped = staffStore(f.store, f.staff),
    preview = await previewRecognition(scoped, f.input, f.staff);
  const r = await submitRecognition(
    scoped,
    {
      ...f.input,
      sourceHash: preview.sourceHash,
      requestId: randomUUID(),
      confirm: true,
    },
    f.staff,
  );
  const a = await f.act(r, "approve");
  await changeRecognition(
    staffStore(f.store, f.staff),
    a.id,
    "apply",
    { version: a.version, reason: "Áp dụng trong phạm vi", confirm: true },
    f.staff,
  );
  assert.equal(
    (await recognitionOverview(staffStore(f.store, f.staff), f.staff)).rows[0]
      .status,
    "APPLIED",
  );
  f.store.data.students[0].classId = randomUUID();
  assert.equal(
    (await recognitionOverview(staffStore(f.store, f.staff), f.staff)).rows
      .length,
    0,
  );
});
test("Recognition: audit/notification failure rolls back record and credit effect", async () => {
  const f = await fixture(),
    r = await f.propose(),
    a = await f.act(r, "approve"),
    before = structuredClone(f.store.data),
    insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "notifications") throw Error("notification unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(f.act(a, "apply", f.staff), /notification/);
  assert.deepEqual(f.store.data, before);
});
test("Recognition: notices and AI lookups respect source, role and ownership", async () => {
  const f = await fixture();
  await f.apply();
  const notices = await notificationOverview(f.store, f.student);
  assert.ok(notices.rows.some((n) => n.kind === "CREDIT_RECOGNITION"));
  const ai = new AiService(f.store, {}),
    sources = [];
  const result = await ai.runTool(
    "lookup_credit_recognitions",
    {},
    f.student,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].gpaIncluded, false);
  await assert.rejects(
    ai.runTool(
      "lookup_credit_recognitions",
      { studentCode: f.profiles[0].code },
      f.teacher,
      [],
      [],
      randomUUID(),
    ),
    status(403),
  );
});
test("Recognition: SQL table and JSON history mapping bind parameters", async () => {
  const calls = [],
    store = new MysqlStore({
      execute: async (sql, values) => {
        calls.push({ sql, values });
        return [{ affectedRows: 1 }];
      },
      query: async () => [
        [
          {
            id: "r",
            payload_json: '{"subject":{"credits":3}}',
            history_json: "[]",
            version: 1,
          },
        ],
      ],
    });
  await store.insert("creditRecognitions", {
    id: "r",
    studentId: "s",
    subjectId: "m",
    requestedBy: "a",
    requestHash: "h",
    status: "PENDING",
    payload: { credits: 3 },
    history: [],
    createdAt: 1,
    updatedAt: 1,
    version: 1,
  });
  assert.match(calls[0].sql, /credit_recognition_requests/);
  await store.update(
    "creditRecognitions",
    "r",
    { status: "APPLIED", history: [{ action: "APPLY" }] },
    1,
  );
  assert.ok(calls[1].values.includes(JSON.stringify([{ action: "APPLY" }])));
  assert.equal((await store.list("creditRecognitions"))[0].history.length, 0);
});
test("Recognition HTTP: roles, Origin, preview-submit-approve-apply and own progress", async (t) => {
  const f = await fixture(),
    config = { origin: "http://localhost:3000" },
    server = createApp({ store: f.store, config, mode: "demo" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/v1/curricula/recognitions";
  const headersFor = (actor) => {
    const token = randomBytes(32).toString("hex");
    f.store.data.sessions.push({
      tokenHash: tokenHash(token),
      accountId: actor.id,
      accountVersion: actor.version,
      expiresAt: Date.now() + 60000,
    });
    return {
      Cookie: "lizz_session=" + token,
      Origin: config.origin,
      "Content-Type": "application/json",
    };
  };
  const staff = headersFor(f.staff),
    student = headersFor(f.student),
    manager = headersFor(f.manager);
  const post = (path, body, headers) =>
    fetch(base + path, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal((await post("/preview", f.input, student)).status, 403);
  assert.equal(
    (
      await post("/preview", f.input, {
        ...staff,
        Origin: "https://foreign.test",
      })
    ).status,
    403,
  );
  const preview = await (await post("/preview", f.input, staff)).json();
  const submitted = await post(
    "",
    {
      ...f.input,
      sourceHash: preview.sourceHash,
      requestId: randomUUID(),
      confirm: true,
    },
    staff,
  );
  assert.equal(submitted.status, 201);
  const r = await submitted.json();
  const approved = await post(
    "/" + r.id + "/approve",
    { version: r.version, confirm: true, reason: "Đủ căn cứ xét duyệt" },
    manager,
  );
  assert.equal(approved.status, 200);
  const a = await approved.json();
  assert.equal(
    (
      await post(
        "/" + r.id + "/apply",
        {
          version: a.version,
          confirm: true,
          reason: "Áp dụng quyết định đã duyệt",
        },
        staff,
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await fetch(base, { headers: student })).json()).rows.length,
    1,
  );
});

test("Recognition: rejection/cancellation preserve history and permit a fresh proposal", async () => {
  const f = await fixture(),
    r = await f.propose();
  await f.act(r, "reject");
  const next = await f.propose();
  await f.act(next, "cancel", f.staff);
  assert.equal(f.store.data.creditRecognitions.length, 2);
  assert.equal(f.store.data.creditRecognitions[0].status, "REJECTED");
  assert.equal(f.store.data.creditRecognitions[1].status, "CANCELLED");
});
test("Recognition: a published passing grade and recognized credit are never counted twice", async () => {
  const f = await fixture(),
    enrollment = {
      id: randomUUID(),
      studentId: f.profiles[0].id,
      sectionId: f.section.id,
      status: "ACTIVE",
      version: 1,
    };
  await f.store.insert("enrollments", enrollment);
  const grade = {
    id: randomUUID(),
    enrollmentId: enrollment.id,
    enrollmentVersion: 1,
    score: 8,
    passScore: 5,
    status: "PUBLISHED",
    version: 1,
    resultSnapshot: { subjectId: f.subject.id, credits: 3 },
  };
  await f.store.insert("grades", grade);
  await f.apply();
  const progress = await curriculumProgress(
    f.store,
    f.student,
    f.profiles[0].id,
  );
  assert.equal(progress.earnedCredits, 3);
  assert.equal(progress.groups[0].subjects[0].status, "PASSED");
  assert.deepEqual(f.store.data.grades[0], grade);
});
test("Recognition: registration keeps the recognition ID/version in its study basis", async () => {
  const f = await fixture();
  await saveRequirement(
    f.store,
    { subjectId: f.target.id, requiredSubjectId: f.subject.id, active: true },
    f.manager,
  );
  const r = await f.apply(),
    section = await f.newSection();
  await registerSection(
    f.store,
    { sectionId: section.id, requestId: randomUUID() },
    f.student,
  );
  const enrollment = f.store.data.enrollments[0];
  assert.equal(enrollment.studySnapshot.recognizedPrerequisites[0].id, r.id);
  assert.equal(
    enrollment.studySnapshot.recognizedPrerequisites[0].version,
    r.version,
  );
  f.store.data.requirements = [];
  await assert.rejects(f.act(r, "revoke"), status(409));
});
test("Recognition: stale action version and unconfirmed actions cannot change applied status", async () => {
  const f = await fixture(),
    r = await f.propose(),
    a = await f.act(r, "approve");
  await assert.rejects(
    f.act({ ...a, version: 1 }, "apply", f.staff),
    status(409),
  );
  await assert.rejects(
    f.act(a, "apply", f.staff, { confirm: false }),
    status(400),
  );
  assert.equal(f.store.data.creditRecognitions[0].status, "APPROVED");
});

test("Recognition: personal course plan follows applied and revoked decisions without inventing grades", async () => {
  const f = await fixture();
  const decision = await f.apply();
  const plan = await myCoursePlan(f.store, f.student);
  const course = plan.courses.find((s) => s.subjectId === f.subject.id);
  assert.equal(course.status, "RECOGNIZED");
  assert.equal(course.needsStudy, false);
  assert.equal((await f.store.list("grades")).length, 0);
  await f.act(decision, "revoke");
  const revoked = await myCoursePlan(f.store, f.student);
  assert.equal(revoked.courses.find((s) => s.subjectId === f.subject.id).status, "NOT_TAKEN");
});
