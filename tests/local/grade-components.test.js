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
  gradeSettings,
} from "../../backend/local/modules/grades/grade-settings.service.js";
import {
  cleanComponents,
  weightedScore,
  cleanBands,
  transcriptSummaries,
} from "../../backend/local/modules/grades/grade.rules.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const components = [
  { code: "QT", name: "Quá trình", weight: 30 },
  { code: "THI", name: "Cuối kỳ", weight: 70 },
];
const bands = [
  { minScore: 0, letter: "F", points: 0 },
  { minScore: 5, letter: "C", points: 2 },
  { minScore: 7, letter: "B", points: 3 },
  { minScore: 8.5, letter: "A", points: 4 },
];
const scheme = (f, changes = {}) =>
  saveGradeScheme(
    f.store,
    f.section.id,
    { components, sectionVersion: 1, version: 0, ...changes },
    f.staff,
  );
const policy = (f, changes = {}) =>
  saveGpaPolicy(
    f.store,
    { termId: f.term.id, bands, repeatRule: "HIGHEST", version: 0, ...changes },
    f.manager,
  );
async function draft(f, values = { QT: 7.35, THI: 8.15 }, changes = {}) {
  const d = await gradeRoster(f.store, f.section.id, f.teacher);
  return saveGradeDrafts(
    f.store,
    f.section.id,
    {
      schemeVersion: d.scheme?.version || null,
      rows: d.rows.map((r) => ({
        enrollmentId: r.enrollmentId,
        enrollmentVersion: r.enrollmentVersion,
        version: r.grade?.version || 0,
        ...(d.scheme ? { componentScores: values } : { score: 8 }),
        ...changes,
      })),
    },
    f.teacher,
  );
}
async function transitionInput(f, actor = f.manager) {
  const d = await gradeRoster(f.store, f.section.id, actor);
  return {
    requestId: randomUUID(),
    sectionVersion: d.section.version,
    termVersion: d.term?.version,
    schemeVersion: d.scheme?.version || null,
    gpaPolicyVersion: d.gpaPolicy?.version || null,
    reviewHash: d.reviewHash,
    rows: d.rows.map((r) => ({ id: r.grade.id, version: r.grade.version })),
  };
}
async function move(f, action) {
  return transitionGrades(
    f.store,
    f.section.id,
    await transitionInput(f, action === "SUBMIT" ? f.teacher : f.manager),
    action === "SUBMIT" ? f.teacher : f.manager,
    action,
  );
}
async function published() {
  const f = await serviceFixture();
  await f.enroll();
  await scheme(f);
  await policy(f);
  await draft(f);
  await move(f, "SUBMIT");
  await move(f, "PUBLISH");
  return f;
}
test("Thành phần: trọng số 100%, mã không trùng, số điểm và làm tròn tính tại server", () => {
  assert.deepEqual(cleanComponents(components), components);
  assert.equal(weightedScore({ components }, { QT: 7.35, THI: 8.15 }), 7.91);
  for (const rows of [
    [],
    [{ ...components[0], weight: 90 }],
    components.map((c) => ({ ...c, code: "X" })),
    [
      { ...components[0], weight: 30.5 },
      { ...components[1], weight: 69.5 },
    ],
  ])
    assert.throws(() => cleanComponents(rows));
  for (const scores of [
    { QT: 8 },
    { QT: 8, THI: 7, EXTRA: 9 },
    { QT: null, THI: 8 },
    { QT: 10.01, THI: 7 },
    { QT: 7.111, THI: 8 },
  ])
    assert.throws(() => weightedScore({ components }, scores));
});
test("Quy đổi: ngưỡng phải phủ 0–10, không trùng và điểm hệ 4 tăng theo ngưỡng", () => {
  assert.equal(cleanBands([...bands].reverse())[0].minScore, 0);
  for (const b of [
    [bands[1], bands[2]],
    [bands[0], bands[0]],
    [bands[0], { minScore: 5, letter: "B", points: 5 }],
    [
      { minScore: 0, letter: "F", points: 3 },
      { minScore: 5, letter: "A", points: 2 },
    ],
  ])
    assert.throws(() => cleanBands(b));
});
test("Cấu hình: chỉ cán bộ/quản lý, version cũ bị chặn và khóa khi lớp có điểm", async () => {
  const f = await serviceFixture();
  await f.enroll();
  for (const actor of [f.teacher, f.student])
    await assert.rejects(
      saveGradeScheme(f.store, f.section.id, { components }, actor),
      { status: 403 },
    );
  await scheme(f);
  await assert.rejects(scheme(f), { status: 409 });
  await draft(f);
  await assert.rejects(scheme(f, { version: 1 }), /Lớp đã có điểm/);
  await assert.rejects(gradeSettings(f.store, f.student), { status: 403 });
});
test("Nhập điểm thành phần: bỏ qua điểm tổng kết giả, batch thiếu/sai không ghi một phần", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await f.enroll(f.student2);
  await scheme(f);
  await draft(f, undefined, { score: 10 });
  assert.ok((await f.store.list("grades")).every((g) => g.score === 7.91));
  const d = await gradeRoster(f.store, f.section.id, f.teacher),
    before = await f.store.list("grades");
  const rows = d.rows.map((r, i) => ({
    enrollmentId: r.enrollmentId,
    enrollmentVersion: r.enrollmentVersion,
    version: r.grade.version,
    componentScores: i ? { QT: 8 } : { QT: 9, THI: 9 },
  }));
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.section.id,
      { schemeVersion: 1, rows },
      f.teacher,
    ),
  );
  assert.deepEqual(await f.store.list("grades"), before);
});
test("Nhập điểm: cấu hình cũ, giảng viên khác và đăng ký đổi đều bị chặn", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await scheme(f);
  const d = await gradeRoster(f.store, f.section.id, f.teacher),
    r = d.rows[0];
  const input = {
    schemeVersion: null,
    rows: [
      {
        enrollmentId: r.enrollmentId,
        enrollmentVersion: r.enrollmentVersion,
        version: 0,
        score: 10,
        componentScores: { QT: 8, THI: 9 },
      },
    ],
  };
  await assert.rejects(
    saveGradeDrafts(f.store, f.section.id, input, f.teacher),
    { status: 409 },
  );
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.section.id,
      { ...input, schemeVersion: 1 },
      f.teacher2,
    ),
    { status: 404 },
  );
  await f.store.update(
    "enrollments",
    r.enrollmentId,
    { status: "WITHDRAWN" },
    1,
  );
  await assert.rejects(
    saveGradeDrafts(
      f.store,
      f.section.id,
      { ...input, schemeVersion: 1 },
      f.teacher,
    ),
    { status: 409 },
  );
});
test("Công bố: điểm nháp/gửi không lộ, snapshot trọng số/tín chỉ/quy đổi và GPA theo quyền", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await scheme(f);
  await policy(f);
  await draft(f);
  assert.equal((await gradeOverview(f.store, f.student)).rows.length, 0);
  await move(f, "SUBMIT");
  assert.equal((await gradeOverview(f.store, f.student)).summaries.length, 0);
  await move(f, "PUBLISH");
  const own = await gradeOverview(f.store, f.student),
    r = own.rows[0];
  assert.equal(r.score, 7.91);
  assert.equal(r.resultSnapshot.credits, 3);
  assert.equal(r.resultSnapshot.letter, "B");
  assert.equal(r.resultSnapshot.points, 3);
  assert.equal(r.componentScores.QT, 7.35);
  assert.equal(own.summaries[0].cumulative.gpa4, 3);
  assert.equal(own.summaries[0].cumulative.creditsEarned, 3);
  assert.equal((await gradeOverview(f.store, f.student2)).summaries.length, 0);
  assert.equal((await gradeOverview(f.store, f.teacher)).summaries.length, 0);
});
test("Công bố: quy đổi hoặc tín chỉ đổi sau khi xem phải tải lại, retry không ghi hai lần", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await scheme(f);
  await policy(f);
  await draft(f);
  await move(f, "SUBMIT");
  const input = await transitionInput(f);
  await policy(f, { version: 1, repeatRule: "LATEST" });
  await assert.rejects(
    transitionGrades(f.store, f.section.id, input, f.manager, "PUBLISH"),
    { status: 409 },
  );
  const input2 = await transitionInput(f);
  const subject = (await f.store.list("subjects"))[0];
  await f.store.update("subjects", subject.id, { credits: 4 }, subject.version);
  await assert.rejects(
    transitionGrades(f.store, f.section.id, input2, f.manager, "PUBLISH"),
    /Dữ liệu tính điểm/,
  );
  const current = await transitionInput(f);
  await transitionGrades(f.store, f.section.id, current, f.manager, "PUBLISH");
  assert.equal(
    (
      await transitionGrades(
        f.store,
        f.section.id,
        current,
        f.manager,
        "PUBLISH",
      )
    ).replayed,
    true,
  );
  assert.equal(
    (await gradeOverview(f.store, f.student)).rows[0].resultSnapshot.credits,
    4,
  );
});
test("Sau công bố: tín chỉ/tên môn đổi không làm GPA cũ đổi; quy định đã dùng khóa sửa", async () => {
  const f = await published(),
    before = await gradeOverview(f.store, f.student),
    sub = (await f.store.list("subjects"))[0];
  await f.store.update(
    "subjects",
    sub.id,
    { credits: 10, name: "Tên mới" },
    sub.version,
  );
  assert.equal(
    (await gradeSettings(f.store, f.manager)).policies[0].locked,
    true,
  );
  const after = await gradeOverview(f.store, f.student);
  assert.deepEqual(after.summaries, before.summaries);
  assert.equal(after.rows[0].subjectName, before.rows[0].subjectName);
  await assert.rejects(policy(f, { version: 1 }), /không sửa hồi tố/);
});
test("Tương thích: tổng kết trực tiếp vẫn chạy, thiếu quy đổi hoặc snapshot cũ không tự tạo GPA", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await draft(f);
  await move(f, "SUBMIT");
  await move(f, "PUBLISH");
  let d = await gradeOverview(f.store, f.student);
  assert.equal(d.rows[0].score, 8);
  assert.equal(d.summaries[0].cumulative.status, "NOT_VERIFIED");
  assert.equal(d.summaries[0].cumulative.gpa4, null);
  const g = (await f.store.list("grades"))[0];
  await f.store.update("grades", g.id, { resultSnapshot: null }, g.version);
  d = await gradeOverview(f.store, f.student);
  assert.equal(d.summaries[0].cumulative.gpa10, null);
});
function result(id, subjectId, score, points, credits = 3, extra = {}) {
  return {
    id,
    studentId: "student",
    studentCode: "SV1",
    studentName: "An",
    term: "2026.1",
    status: "PUBLISHED",
    score,
    passScore: 5,
    publishedAt: 1,
    resultSnapshot: {
      subjectId,
      credits,
      endDate: "2026-01-01",
      points,
      gpaPolicy: { repeatRule: "HIGHEST" },
      ...extra,
    },
  };
}
test("GPA: bình quân theo tín chỉ, học lại cao nhất/sau cùng và không cộng tín chỉ trùng môn", () => {
  const a = result("a", "s1", 8, 3, 3),
    b = result("b", "s2", 6, 2, 2),
    repeat = result("c", "s1", 4, 0, 3, { endDate: "2026-02-01" });
  let s = transcriptSummaries([a, b, repeat])[0].cumulative;
  assert.equal(s.gpa10, 7.2);
  assert.equal(s.gpa4, 2.6);
  assert.equal(s.creditsAttempted, 5);
  assert.equal(s.creditsEarned, 5);
  for (const r of [a, b, repeat])
    r.resultSnapshot.gpaPolicy.repeatRule = "LATEST";
  s = transcriptSummaries([a, b, repeat])[0].cumulative;
  assert.equal(s.gpa10, 4.8);
  assert.equal(s.gpa4, 0.8);
  assert.equal(s.creditsEarned, 2);
  repeat.term = "2026.2";
  repeat.resultSnapshot.gpaPolicy.repeatRule = "HIGHEST";
  assert.equal(
    transcriptSummaries([a, repeat])[0].cumulative.status,
    "NOT_VERIFIED",
  );
});
test("GPA: không tính điểm chưa công bố hoặc chưa biết tín chỉ/quy đổi; lần học xét ngày kết thúc", () => {
  const a = result("a", "s1", 9, 4),
    b = result("b", "s1", 5, 2, 3, { endDate: "2026-02-01" });
  a.publishedAt = 100;
  b.publishedAt = 1;
  for (const r of [a, b]) r.resultSnapshot.gpaPolicy.repeatRule = "LATEST";
  assert.equal(transcriptSummaries([a, b])[0].cumulative.gpa10, 5);
  const draft = { ...result("c", "s2", 0, 0), status: "DRAFT" };
  assert.equal(transcriptSummaries([a, draft])[0].cumulative.count, 1);
  a.resultSnapshot.credits = null;
  assert.equal(transcriptSummaries([a])[0].cumulative.gpa4, null);
});
test("Audit lỗi rollback cấu hình và công bố điểm; mất quyền hiện hành không ghi", async () => {
  const f = await serviceFixture();
  const insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit failed");
    return insert.call(this, kind, row);
  };
  await assert.rejects(scheme(f), /audit failed/);
  assert.equal((await f.store.list("gradeSchemes")).length, 0);
  f.store.insert = insert;
  await f.enroll();
  await scheme(f);
  await policy(f);
  await draft(f);
  await move(f, "SUBMIT");
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit failed");
    return insert.call(this, kind, row);
  };
  await assert.rejects(move(f, "PUBLISH"), /audit failed/);
  assert.equal((await f.store.list("grades"))[0].status, "SUBMITTED");
  f.store.insert = insert;
  await f.store.update("accounts", f.staff.id, { active: false }, 1);
  await assert.rejects(scheme(f, { version: 1 }), { status: 401 });
});
test("LizzChat GPA: lọc quyền trước tìm; giảng viên không có công cụ tổng hợp toàn sinh viên", async () => {
  const f = await published(),
    ai = new AiService(f.store, { ready: false });
  const own = await ai.runTool(
    "lookup_academic_summary",
    {},
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.equal(own.summaries[0].cumulative.gpa4, 3);
  assert.ok(own.source);
  assert.equal(
    (
      await ai.runTool(
        "lookup_academic_summary",
        { query: f.profiles[0].code },
        f.student2,
        [],
        [],
        randomUUID(),
      )
    ).summaries.length,
    0,
  );
  await assert.rejects(
    ai.runTool("lookup_academic_summary", {}, f.teacher, [], [], randomUUID()),
    { status: 403 },
  );
});
test("HTTP cấu hình điểm/GPA: cần phiên, chặn sai Origin và Sinh viên không đọc/ghi cấu hình", async (t) => {
  const f = await serviceFixture(),
    origin = "http://localhost:3000",
    token = "b".repeat(64);
  await f.store.insert("sessions", {
    tokenHash: tokenHash(token),
    accountId: f.student.id,
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
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1/grades",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal((await fetch(base + "/settings")).status, 401);
  assert.equal((await fetch(base + "/settings", { headers })).status, 403);
  assert.equal(
    (
      await fetch(base + "/gpa-policies", {
        method: "POST",
        headers,
        body: JSON.stringify({ bands }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/sections/" + f.section.id + "/scheme", {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: "{}",
      })
    ).status,
    403,
  );
});
test("MySQL mapping điểm thành phần/GPA: JSON được bind, nullable legacy được giữ", async () => {
  let sql, params;
  const store = new MysqlStore({
    execute: async (s, p) => {
      sql = s;
      params = p;
      return [{ affectedRows: 1 }];
    },
    query: async () => [
      [
        {
          component_scores_json: '{"QT":8}',
          result_snapshot_json: null,
          scheme_version: 1,
        },
      ],
    ],
  });
  await store.insert("gradeSchemes", {
    id: "x",
    sectionId: "s",
    components: [{ code: "QT", name: "x' OR 1=1", weight: 100 }],
    version: 1,
  });
  assert.match(sql, /INSERT INTO grade_schemes/);
  assert.equal(sql.includes("OR 1=1"), false);
  assert.ok(params.some((p) => p.includes("OR 1=1")));
  await store.update("gpaPolicies", "p", { bands, repeatRule: "LATEST" }, 1);
  assert.match(sql, /bands_json=\?/);
  assert.ok(params.includes("LATEST"));
  const [r] = await store.list("grades");
  assert.deepEqual(r.componentScores, { QT: 8 });
  assert.equal(r.resultSnapshot, null);
});
