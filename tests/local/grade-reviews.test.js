import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  gradeRoster,
  gradeOverview,
  saveGradeDrafts,
  transitionGrades,
} from "../../backend/local/modules/grades/grade.service.js";
import {
  saveGradeScheme,
  saveGpaPolicy,
} from "../../backend/local/modules/grades/grade-settings.service.js";
import {
  gradeReviewOverview,
  gradeReviewDetail,
  saveGradeReviewPeriod,
  createGradeReview,
  proposeGradeReview,
  decideGradeReview,
} from "../../backend/local/modules/grades/grade-review.service.js";
import { checkStudyRules } from "../../backend/local/modules/academic/registration-policy.service.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { toolsFor } from "../../backend/local/modules/ai/ai.tools.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const cmd = (v) => ({ requestId: randomUUID(), confirm: true, ...v });
const components = [
  { code: "QT", name: "Quá trình", weight: 30 },
  { code: "THI", name: "Thi", weight: 70 },
];
async function fixture(weighted = false) {
  const f = await serviceFixture();
  await f.enroll();
  if (weighted) {
    await saveGradeScheme(
      f.store,
      f.section.id,
      { components, sectionVersion: 1, version: 0 },
      f.manager,
    );
    await saveGpaPolicy(
      f.store,
      {
        termId: f.term.id,
        version: 0,
        repeatRule: "HIGHEST",
        bands: [
          { minScore: 0, letter: "F", points: 0 },
          { minScore: 5, letter: "C", points: 2 },
          { minScore: 8, letter: "A", points: 4 },
        ],
      },
      f.manager,
    );
  }
  let d = await gradeRoster(f.store, f.section.id, f.teacher),
    r = d.rows[0];
  await saveGradeDrafts(
    f.store,
    f.section.id,
    {
      schemeVersion: d.scheme?.version || null,
      rows: [
        {
          enrollmentId: r.enrollmentId,
          enrollmentVersion: r.enrollmentVersion,
          version: 0,
          ...(weighted ? { componentScores: { QT: 8, THI: 8 } } : { score: 8 }),
        },
      ],
    },
    f.teacher,
  );
  for (const [action, actor] of [
    ["SUBMIT", f.teacher],
    ["PUBLISH", f.manager],
  ]) {
    d = await gradeRoster(f.store, f.section.id, actor);
    await transitionGrades(
      f.store,
      f.section.id,
      cmd({
        sectionVersion: d.section.version,
        termVersion: d.term.version,
        schemeVersion: d.scheme?.version || null,
        gpaPolicyVersion: d.gpaPolicy?.version || null,
        reviewHash: d.reviewHash,
        rows: d.rows.map((r) => ({ id: r.grade.id, version: r.grade.version })),
      }),
      actor,
      action,
    );
  }
  f.grade = (await f.store.list("grades"))[0];
  return f;
}
const period = (f, extra = {}) =>
  saveGradeReviewPeriod(
    f.store,
    cmd({
      termId: f.term.id,
      opensAt: Date.now() - 10000,
      closesAt: Date.now() + 100000,
      active: true,
      version: 0,
      ...extra,
    }),
    f.manager,
  );
const create = async (f, actor = f.student, more = {}) =>
  (
    await createGradeReview(
      f.store,
      cmd({
        gradeId: f.grade.id,
        gradeVersion: f.grade.version,
        reason: "Đề nghị kiểm tra bài thi",
        ...more,
      }),
      actor,
    )
  ).row;
const propose = async (f, r, more = {}) =>
  (
    await proposeGradeReview(
      f.store,
      r.id,
      cmd({
        version: r.version,
        score: 9,
        reason: "Đối chiếu bài làm và bảng chấm",
        ...more,
      }),
      f.teacher,
    )
  ).row;
async function decide(f, r, action, actor = f.manager, more = {}) {
  const d = await gradeReviewDetail(f.store, r.id, actor);
  return (
    await decideGradeReview(
      f.store,
      r.id,
      cmd({
        version: d.request.version,
        reviewHash: d.reviewHash,
        reason: "Đã đối chiếu hồ sơ",
        ...more,
      }),
      actor,
      action,
    )
  ).row;
}
test("Phúc khảo: cần đợt mở, điểm công bố đúng sinh viên và version mới nhất", async () => {
  const f = await fixture();
  await assert.rejects(create(f), /Ngoài đợt/);
  await period(f);
  const r = await create(f);
  assert.equal(r.requestKind, "APPEAL");
  assert.equal(r.status, "REQUESTED");
  assert.equal((await gradeReviewOverview(f.store, f.student2)).rows.length, 0);
  await assert.rejects(gradeReviewDetail(f.store, r.id, f.student2), {
    status: 404,
  });
  await assert.rejects(gradeReviewDetail(f.store, r.id, f.teacher2), {
    status: 404,
  });
  assert.equal(
    (await gradeReviewOverview(f.store, f.student)).eligible[0].canRequest,
    false,
  );
});
test("Đợt phúc khảo: biên mở bao gồm, đóng không bao gồm; đóng đợt không xóa hồ sơ", async (t) => {
  const original = Date.now,
    now = original();
  Date.now = () => now;
  t.after(() => (Date.now = original));
  const f = await fixture();
  await period(f, { opensAt: now, closesAt: now + 1 });
  const r = await create(f);
  Date.now = () => now + 1;
  assert.equal(
    (await gradeReviewOverview(f.store, f.student)).periods.length,
    1,
  );
  await decide(f, r, "cancel", f.student);
  await assert.rejects(create(f), /Ngoài đợt/);
  const correction = await create(f, f.teacher);
  assert.equal(correction.requestKind, "CORRECTION");
  assert.equal((await gradeReviewOverview(f.store, f.student)).rows.length, 2);
});
test("Yêu cầu sai, nháp và kết quả người khác bị chặn; không đoán thời hạn mặc định", async () => {
  const f = await fixture();
  await period(f);
  for (const patch of [{ reason: "" }, { gradeVersion: 1 }, { confirm: false }])
    await assert.rejects(create(f, f.student, patch));
  await assert.rejects(create(f, f.student2), { status: 404 });
  await f.store.update(
    "grades",
    f.grade.id,
    { status: "DRAFT" },
    f.grade.version,
  );
  await assert.rejects(create(f), /điểm công bố/);
  assert.equal((await f.store.list("gradeReviews")).length, 0);
});
test("Một kết quả chỉ có một hồ sơ đang xử lý; gửi lặp không nhân đôi", async () => {
  const f = await fixture();
  await period(f);
  const input = cmd({
      gradeId: f.grade.id,
      gradeVersion: f.grade.version,
      reason: "Rà soát",
    }),
    result = await createGradeReview(f.store, input, f.student);
  assert.equal(
    (await createGradeReview(f.store, input, f.student)).replayed,
    true,
  );
  await assert.rejects(create(f), /đang có một yêu cầu/);
  await decide(f, result.row, "cancel", f.student);
  const settled = await Promise.allSettled([create(f), create(f)]);
  assert.equal(settled.filter((r) => r.status === "fulfilled").length, 1);
});
test("Rà soát: chỉ Giảng viên được phân công đề xuất; Sinh viên/Nhân viên không tự sửa", async () => {
  const f = await fixture();
  const r = await create(f, f.teacher);
  for (const actor of [f.manager, f.staff, f.student])
    await assert.rejects(
      proposeGradeReview(
        f.store,
        r.id,
        cmd({ version: 1, score: 9, reason: "X" }),
        actor,
      ),
      { status: 403 },
    );
  await assert.rejects(
    proposeGradeReview(
      f.store,
      r.id,
      cmd({ version: 1, score: 9, reason: "X" }),
      f.teacher2,
    ),
    { status: 403 },
  );
  for (const score of [-1, 10.01, 8.111, null])
    await assert.rejects(propose(f, r, { score }));
  await assert.rejects(propose(f, r, { reason: "" }));
  assert.equal((await f.store.list("grades"))[0].score, 8);
});
test("Đề xuất thành phần tính theo trọng số/điểm quy đổi đã chốt, không dùng cấu hình thay thế", async () => {
  const f = await fixture(true),
    r = await create(f, f.teacher),
    scheme = (await f.store.list("gradeSchemes"))[0];
  await f.store.update(
    "gradeSchemes",
    scheme.id,
    {
      components: [
        { code: "QT", name: "QT", weight: 90 },
        { code: "THI", name: "Thi", weight: 10 },
      ],
    },
    1,
  );
  const p = await propose(f, r, {
    score: 10,
    componentScores: { QT: 6, THI: 4 },
  });
  assert.equal(p.proposal.score, 4.6);
  assert.equal(p.proposal.resultSnapshot.letter, "F");
  assert.equal(p.proposal.resultSnapshot.credits, 3);
  assert.equal((await f.store.list("grades"))[0].score, 8);
});
test("Phê duyệt tách áp dụng; GPA đổi sau áp dụng và giữ thời điểm công bố/điểm trước", async () => {
  const f = await fixture(true),
    before = (await gradeOverview(f.store, f.student)).summaries[0].cumulative;
  let r = await create(f, f.teacher);
  r = await propose(f, r, { componentScores: { QT: 6, THI: 4 } });
  r = await decide(f, r, "approve");
  assert.equal((await f.store.list("grades"))[0].score, 8);
  assert.equal((await f.store.list("gradeRevisions")).length, 0);
  const d = await gradeReviewDetail(f.store, r.id, f.manager);
  assert.equal(d.actions.apply, true);
  const input = cmd({ version: r.version, reviewHash: d.reviewHash });
  await decideGradeReview(f.store, r.id, input, f.manager, "apply");
  assert.equal(
    (await decideGradeReview(f.store, r.id, input, f.manager, "apply"))
      .replayed,
    true,
  );
  const grade = (await f.store.list("grades"))[0],
    revisions = await f.store.list("gradeRevisions");
  assert.equal(grade.score, 4.6);
  assert.equal(grade.passScore, f.grade.passScore);
  assert.equal(grade.publishedAt, f.grade.publishedAt);
  assert.equal(grade.version, f.grade.version + 1);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].beforeGrade.score, 8);
  assert.equal(revisions[0].afterGrade.score, 4.6);
  const after = await gradeOverview(f.store, f.student);
  assert.equal(before.gpa4, 4);
  assert.equal(after.summaries[0].cumulative.gpa4, 0);
  assert.equal(after.rows[0].revisionCount, 1);
  assert.ok(after.rows[0].lastRevisedAt);
});
test("Giữ nguyên điểm vẫn có kết luận/lịch sử, không tăng version điểm hoặc ghi hai lần", async () => {
  const f = await fixture();
  let r = await create(f, f.teacher);
  r = await propose(f, r, { score: 8 });
  r = await decide(f, r, "approve");
  await decide(f, r, "apply");
  assert.equal((await f.store.list("grades"))[0].version, f.grade.version);
  assert.equal((await f.store.list("gradeRevisions")).length, 1);
  assert.equal(
    (await gradeReviewDetail(f.store, r.id, f.student)).request.status,
    "APPLIED",
  );
});
test("Người khởi tạo không tự duyệt; trả lại yêu cầu có lý do và giữ lịch sử đề xuất", async () => {
  const f = await fixture();
  let r = await create(f, f.manager);
  r = await propose(f, r);
  await assert.rejects(decide(f, r, "approve"), { status: 403 });
  const m2 = { ...f.manager, id: randomUUID(), username: "m2" };
  await f.store.insert("accounts", m2);
  r = await decide(f, r, "return", m2);
  assert.equal(r.status, "REQUESTED");
  assert.ok(r.reviewHistory.some((h) => h.to === "PROPOSED"));
  r = await propose(f, r, { score: 7 });
  r = await decide(f, r, "approve", m2);
  assert.equal(r.status, "APPROVED");
});
test("Rút/từ chối/trả lại có trạng thái, lý do và quyền rõ ràng", async () => {
  const f = await fixture();
  await period(f);
  let r = await create(f);
  await assert.rejects(decide(f, r, "cancel", f.student2), { status: 404 });
  await assert.rejects(decide(f, r, "cancel", f.student, { reason: "" }));
  r = await propose(f, r);
  await assert.rejects(decide(f, r, "cancel", f.student), { status: 403 });
  await assert.rejects(decide(f, r, "reject", f.manager, { reason: "" }));
  r = await decide(f, r, "reject");
  assert.equal(r.status, "REJECTED");
  await assert.rejects(decide(f, r, "approve"), { status: 409 });
});
test("Điểm đổi sau duyệt chặn áp dụng bản cũ, giữ nguyên lịch sử gốc", async () => {
  const f = await fixture();
  let r = await create(f, f.teacher);
  r = await propose(f, r);
  r = await decide(f, r, "approve");
  await f.store.update("grades", f.grade.id, { score: 7 }, f.grade.version);
  await assert.rejects(decide(f, r, "apply"), /Điểm hoặc hồ sơ đã thay đổi/);
  assert.equal((await f.store.list("gradeRevisions")).length, 0);
  assert.equal((await f.store.list("gradeReviews"))[0].status, "APPROVED");
});
test("Đổi phân công hoặc phiên quyền người đề xuất làm phê duyệt mất căn cứ", async () => {
  const f = await fixture();
  let r = await create(f, f.teacher);
  r = await propose(f, r);
  await f.store.update(
    "sections",
    f.section.id,
    { lecturerId: f.teacher2.id },
    1,
  );
  await assert.rejects(decide(f, r, "approve"), /Phân công/);
  r = await decide(f, r, "return");
  const proposal = await proposeGradeReview(
    f.store,
    r.id,
    cmd({ version: r.version, score: 7, reason: "Giảng viên mới đối chiếu" }),
    f.teacher2,
  );
  assert.equal(proposal.row.proposedBy, f.teacher2.id);
});
test("Người duyệt mất hiệu lực phiên quyền: không áp dụng bằng quyết định cũ", async () => {
  const f = await fixture();
  let r = await create(f, f.teacher);
  r = await propose(f, r);
  r = await decide(f, r, "approve");
  const m2 = { ...f.manager, id: randomUUID(), username: "m2" };
  await f.store.insert("accounts", m2);
  await f.store.update("accounts", f.manager.id, { active: false }, 1);
  await assert.rejects(
    decide(f, r, "apply", m2),
    /Phê duyệt không còn hiệu lực/,
  );
  assert.equal((await f.store.list("grades"))[0].score, 8);
});
test("Lỗi audit rollback cả điểm, bản sửa và hồ sơ; không báo đã sửa khi chưa commit", async () => {
  const f = await fixture();
  let r = await create(f, f.teacher);
  r = await propose(f, r);
  r = await decide(f, r, "approve");
  const original = f.store.insert;
  f.store.insert = async function (k, v) {
    if (k === "events") throw Error("audit failed");
    return original.call(this, k, v);
  };
  await assert.rejects(decide(f, r, "apply"), /audit failed/);
  assert.equal((await f.store.list("grades"))[0].score, 8);
  assert.equal((await f.store.list("gradeRevisions")).length, 0);
  assert.equal((await f.store.list("gradeReviews"))[0].status, "APPROVED");
});
test("Điểm cũ thiếu snapshot không tự sinh GPA; thiếu trọng số cũ thì chặn đề xuất thành phần", async () => {
  const f = await fixture();
  await f.store.update(
    "grades",
    f.grade.id,
    { resultSnapshot: null },
    f.grade.version,
  );
  f.grade = (await f.store.list("grades"))[0];
  let r = await create(f, f.teacher);
  r = await propose(f, r, { score: 7 });
  r = await decide(f, r, "approve");
  await decide(f, r, "apply");
  assert.equal(
    (await gradeOverview(f.store, f.student)).summaries[0].cumulative.gpa4,
    null,
  );
  const g = (await f.store.list("grades"))[0];
  await f.store.update(
    "grades",
    g.id,
    { schemeVersion: 1, resultSnapshot: null },
    g.version,
  );
  f.grade = (await f.store.list("grades"))[0];
  const next = await create(f, f.teacher);
  await assert.rejects(
    propose(f, next, { componentScores: { QT: 7, THI: 8 } }),
    /thiếu bản chốt trọng số/,
  );
});
test("Tiên quyết dùng điểm mới cho lần kiểm tra tiếp theo, không xóa đăng ký đã có", async () => {
  const f = await fixture();
  const subject = {
    id: randomUUID(),
    code: "NEXT",
    name: "Môn sau",
    credits: 3,
    version: 1,
  };
  await f.store.insert("subjects", subject);
  await f.store.insert("requirements", {
    id: randomUUID(),
    subjectId: subject.id,
    requiredSubjectId: f.section.subjectId,
    active: true,
    version: 1,
  });
  const section = {
    ...f.section,
    id: randomUUID(),
    subjectId: subject.id,
    startDate: "2020-04-06",
    endDate: "2020-05-30",
  };
  await checkStudyRules(f.store, f.profiles[0], section, []);
  let r = await create(f, f.teacher);
  r = await propose(f, r, { score: 4 });
  r = await decide(f, r, "approve");
  await decide(f, r, "apply");
  await assert.rejects(
    checkStudyRules(f.store, f.profiles[0], section, []),
    /Chưa đủ điều kiện tiên quyết/,
  );
  assert.equal((await f.store.list("enrollments"))[0].status, "ACTIVE");
});
test("Phạm vi Nhân viên áp dụng cho hồ sơ/lịch sử phúc khảo; không sửa đợt chung", async () => {
  const f = await fixture();
  const faculty = { id: randomUUID(), code: "F", name: "F", version: 1 },
    cohort = {
      id: randomUUID(),
      code: "K",
      name: "K",
      startYear: 2020,
      version: 1,
    },
    major = {
      id: randomUUID(),
      facultyId: faculty.id,
      code: "M",
      name: "M",
      version: 1,
    },
    cl = {
      id: randomUUID(),
      majorId: major.id,
      cohortId: cohort.id,
      code: "C",
      name: "C",
      capacity: 40,
      version: 1,
    };
  for (const [k, row] of [
    ["faculties", faculty],
    ["cohorts", cohort],
    ["majors", major],
    ["classes", cl],
  ])
    await f.store.insert(k, row);
  await f.store.update("students", f.profiles[0].id, { classId: cl.id }, 1);
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "FACULTY",
    facultyId: faculty.id,
    cohortId: cohort.id,
    active: true,
    version: 1,
  });
  const r = await create(f, f.staff);
  assert.equal((await gradeReviewOverview(f.store, f.staff)).rows.length, 1);
  assert.equal(
    (
      await gradeReviewOverview(f.store, {
        ...f.staff,
        id: f.teacher2.id,
        role: "LECTURER",
      })
    ).rows.length,
    0,
  );
  await assert.rejects(
    saveGradeReviewPeriod(
      f.store,
      cmd({
        termId: f.term.id,
        opensAt: 1,
        closesAt: 2,
        active: true,
        version: 0,
      }),
      f.staff,
    ),
    { status: 403 },
  );
  await assert.rejects(gradeReviewDetail(f.store, r.id, f.student2), {
    status: 404,
  });
  assert.equal(
    (await staffStore(f.store, f.staff).list("gradeReviews")).length,
    1,
  );
});
test("LizzChat chỉ tra cứu hồ sơ theo quyền, ghi rõ duyệt chưa phải áp dụng", async () => {
  const f = await fixture();
  let r = await create(f, f.teacher);
  r = await propose(f, r);
  await decide(f, r, "approve");
  const ai = new AiService(f.store, { ready: false });
  const own = await ai.runTool(
    "lookup_grade_reviews",
    {},
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.equal(own.rows[0].status, "APPROVED");
  assert.equal(own.rows[0].currentScore, 8);
  assert.equal(
    (
      await ai.runTool(
        "lookup_grade_reviews",
        {},
        f.student2,
        [],
        [],
        randomUUID(),
      )
    ).total,
    0,
  );
  assert.ok(own.source);
  assert.ok(
    !toolsFor(f.student).some((t) =>
      /apply.*grade|approve.*grade/.test(t.name),
    ),
  );
});
test("HTTP phúc khảo chặn khách, sai Origin, tự duyệt và đọc hồ sơ người khác", async (t) => {
  const f = await fixture();
  await period(f);
  const r = await create(f),
    origin = "http://localhost:3000",
    tokens = ["a".repeat(64), "b".repeat(64)];
  for (const [i, a] of [f.student, f.student2].entries())
    await f.store.insert("sessions", {
      tokenHash: tokenHash(tokens[i]),
      accountId: a.id,
      accountVersion: 1,
      expiresAt: Date.now() + 100000,
    });
  const server = createApp({
    store: f.store,
    config: { origin },
    mode: "demo",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((r) => server.close(r)));
  const base =
      "http://127.0.0.1:" + server.address().port + "/api/v1/grade-reviews",
    headers = {
      Cookie: "lizz_session=" + tokens[0],
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal((await fetch(base)).status, 401);
  assert.equal(
    (
      await fetch(base + "/requests/" + r.id, {
        headers: { ...headers, Cookie: "lizz_session=" + tokens[1] },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + "/requests/" + r.id + "/approve", {
        method: "POST",
        headers,
        body: JSON.stringify(cmd({ version: 1 })),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/requests", {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("SQL mapping lưu JSON trước–sau và khóa lịch sử sửa, không nội suy nội dung", async () => {
  let sql, params;
  const s = new MysqlStore({
    execute: async (a, b) => {
      sql = a;
      params = b;
      return [{ affectedRows: 1 }];
    },
    query: async () => [
      [
        {
          base_grade_json: '{"score":8}',
          proposal_json: null,
          review_history_json: "[]",
        },
      ],
    ],
  });
  await s.insert("gradeReviews", {
    id: randomUUID(),
    gradeId: "g",
    studentId: "s",
    sectionId: "c",
    requestedBy: "a",
    requestKind: "APPEAL",
    status: "REQUESTED",
    reason: "x' OR 1=1",
    baseGradeVersion: 3,
    baseGrade: { score: 8 },
    proposal: null,
    proposedBy: null,
    approvedBy: null,
    approvalHash: null,
    reviewHistory: [],
    createdAt: 1,
    version: 1,
  });
  assert.match(sql, /INSERT INTO grade_review_requests/);
  assert.ok(!sql.includes("OR 1=1"));
  assert.ok(params.includes("x' OR 1=1"));
  assert.deepEqual((await s.list("gradeReviews"))[0].baseGrade, { score: 8 });
  await assert.rejects(s.update("gradeRevisions", "x", { reason: "sửa" }, 1));
});

test("Đối chiếu lại cấu trúc đề xuất và điểm gốc, không duyệt dữ liệu sửa ngoài luồng", async () => {
  const f = await fixture(true);
  let r = await create(f, f.teacher);
  r = await propose(f, r, { componentScores: { QT: 8, THI: 8 } });
  await f.store.update(
    "gradeReviews",
    r.id,
    { proposal: { ...r.proposal, score: 10 } },
    r.version,
  );
  r = (await f.store.list("gradeReviews"))[0];
  await assert.rejects(decide(f, r, "approve"), /Phân công hoặc phiên quyền/);
  assert.equal((await f.store.list("grades"))[0].score, 8);
});
