import { examOverview } from "../../backend/local/modules/exams/exam.service.js";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import {
  examReportDetail,
  mutateExamReport,
} from "../../backend/local/modules/exams/report.service.js";
import { reportDocument } from "../../frontend/app/features/exam-report.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { toolsFor } from "../../backend/local/modules/ai/ai.tools.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (n) => (e) => e.status === n;
function fixture() {
  const store = new MemoryStore(),
    uid = () => randomUUID(),
    row = (kind, value) => {
      const r = { id: uid(), version: 1, ...value };
      store.data[kind].push(r);
      return r;
    };
  const account = (role) =>
    row("accounts", { role, username: uid(), fullName: role, active: true });
  const manager = account("MANAGER"),
    staff = account("STAFF"),
    teacher = account("LECTURER"),
    other = account("LECTURER"),
    student = account("STUDENT");
  const faculty = row("faculties", {}),
    cohort = row("cohorts", {}),
    major = row("majors", { facultyId: faculty.id }),
    cl = row("classes", { majorId: major.id, cohortId: cohort.id }),
    foreign = row("classes", { majorId: uid(), cohortId: cohort.id });
  row("staffScopes", {
    accountId: staff.id,
    facultyId: faculty.id,
    cohortId: cohort.id,
    scopeType: "FACULTY_COHORT",
    active: true,
  });
  const subject = row("subjects", { name: "Cơ sở dữ liệu" }),
    section = row("sections", {
      code: "CSDL01",
      subjectId: subject.id,
      lecturerId: other.id,
      facultyId: faculty.id,
      cohortId: cohort.id,
      term: "2020.1",
    }),
    room = row("rooms", {
      code: "A101",
      name: "Giảng đường A",
      capacity: 40,
      active: true,
    });
  const exam = row("exams", {
    sectionId: section.id,
    roomId: room.id,
    invigilatorId: teacher.id,
    examDate: "2020-07-01",
    startTime: "08:00",
    endTime: "09:30",
    status: "PUBLISHED",
    publishedAt: 1,
  });
  const students = Array.from({ length: 3 }, (_, i) =>
    row("students", {
      accountId: i ? uid() : student.id,
      code: "SV00" + (i + 1),
      fullName: ["Nguyễn An", "Trần Bình", "Lê Hà"][i],
      classId: cl.id,
    }),
  );
  const enrollments = students.map((s) =>
    row("enrollments", {
      studentId: s.id,
      sectionId: section.id,
      status: "ACTIVE",
    }),
  );
  const session = row("attendanceSessions", {
    examId: exam.id,
    sectionId: section.id,
    kind: "EXAM",
    sessionDate: exam.examDate,
    status: "CLOSED",
    roster: enrollments.map((e) => ({
      studentId: e.studentId,
      enrollmentId: e.id,
      enrollmentVersion: 1,
    })),
  });
  enrollments.forEach((e, i) =>
    row("attendanceMarks", {
      sessionId: session.id,
      studentId: e.studentId,
      enrollmentId: e.id,
      enrollmentVersion: 1,
      status: ["PRESENT", "LATE", "ABSENT"][i],
    }),
  );
  async function body(actor = teacher, extra = {}) {
    const d = await examReportDetail(store, exam.id, actor);
    return {
      version: d.report?.version || 0,
      sourceHash: d.live.sourceHash,
      requestId: uid(),
      ...extra,
    };
  }
  async function action(action, actor = teacher, extra = {}) {
    return mutateExamReport(
      store,
      exam.id,
      action,
      await body(actor, { confirm: true, ...extra }),
      actor,
    );
  }
  const save = (extra = {}) =>
    action("save", teacher, {
      papers: 2,
      notes: "Bàn giao đủ bài thi.",
      ...extra,
    });
  return {
    store,
    manager,
    staff,
    teacher,
    other,
    student,
    exam,
    section,
    room,
    session,
    foreign,
    body,
    action,
    save,
  };
}
test("Report: live totals use closed attendance with enrollment versions, not guessed absences", async () => {
  const f = fixture(),
    d = await examReportDetail(f.store, f.exam.id, f.teacher);
  assert.equal(d.live.total, 3);
  assert.equal(d.live.attended, 2);
  assert.equal(d.live.absent, 1);
  assert.equal(d.live.issues.length, 0);
  assert.equal(d.report, null);
  f.store.data.attendanceMarks[2].enrollmentVersion = 2;
  const changed = await examReportDetail(f.store, f.exam.id, f.teacher);
  assert.equal(changed.live.counts.NOT_RECORDED, 1);
  assert.equal(changed.live.absent, 0);
  assert.ok(changed.live.issues.length);
});
test("Report: only assigned invigilator authors; students and class teacher cannot read", async () => {
  const f = fixture();
  await assert.rejects(
    examReportDetail(f.store, f.exam.id, f.student),
    status(403),
  );
  await assert.rejects(
    examReportDetail(f.store, f.exam.id, f.other),
    status(404),
  );
  for (const actor of [f.manager, f.staff, f.other])
    await assert.rejects(
      mutateExamReport(
        f.store,
        f.exam.id,
        "save",
        await f.body(f.teacher, { papers: 2, notes: "" }),
        actor,
      ),
      actor === f.other ? status(404) : status(403),
    );
});
test("Report: save-submit-confirm creates immutable versions without changing attendance or grades", async () => {
  const f = fixture(),
    attendance = structuredClone(f.store.data.attendanceMarks);
  await f.save();
  await f.action("submit");
  await f.action("confirm", f.manager);
  const d = await examReportDetail(f.store, f.exam.id, f.teacher);
  assert.equal(d.report.status, "CONFIRMED");
  assert.equal(d.history.length, 3);
  assert.equal(d.canDraft, false);
  assert.equal(d.sourceCurrent, true);
  assert.deepEqual(f.store.data.attendanceMarks, attendance);
  assert.equal(f.store.data.grades.length, 0);
  assert.equal(f.store.data.examReports[0].status, "DRAFT");
});
test("Report: request retries return original result even after later actions; altered reuse denied", async () => {
  const f = fixture(),
    input = await f.body(f.teacher, { papers: 2, notes: "Đủ bài thi." }),
    first = await mutateExamReport(
      f.store,
      f.exam.id,
      "save",
      input,
      f.teacher,
    );
  await f.action("submit");
  assert.deepEqual(
    await mutateExamReport(f.store, f.exam.id, "save", input, f.teacher),
    first,
  );
  assert.equal(f.store.data.examReports.length, 2);
  await assert.rejects(
    mutateExamReport(
      f.store,
      f.exam.id,
      "save",
      { ...input, papers: 1 },
      f.teacher,
    ),
    status(409),
  );
});
test("Report: invalid counts, notes and missing confirmation are rejected", async () => {
  const f = fixture();
  for (const papers of [-1, 1.5, 1001])
    await assert.rejects(f.save({ papers }), status(400));
  await assert.rejects(f.save({ notes: "x".repeat(4001) }), status(400));
  await f.save();
  await assert.rejects(
    f.action("submit", f.teacher, { confirm: false }),
    status(400),
  );
});
test("Report: future, draft and cancelled exams cannot record completed outcomes", async () => {
  for (const change of [
    (f) => (f.store.data.exams[0].examDate = "2099-07-01"),
    (f) => (f.store.data.exams[0].status = "DRAFT"),
    (f) => (f.store.data.exams[0].status = "CANCELLED"),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(f.save(), status(409));
    assert.equal(f.store.data.examReports.length, 0);
  }
});
test("Report: submission requires closed, complete, matching exam attendance", async () => {
  for (const change of [
    (f) => (f.store.data.attendanceSessions[0].status = "OPEN"),
    (f) => f.store.data.attendanceMarks.pop(),
    (f) => f.store.data.enrollments[0].version++,
    (f) => (f.store.data.attendanceSessions[0].sessionDate = "2020-07-02"),
    (f) =>
      f.store.data.attendanceSessions.push({ ...f.session, id: randomUUID() }),
  ]) {
    const f = fixture();
    change(f);
    await f.save();
    await assert.rejects(f.action("submit"), status(409));
    assert.equal(f.store.data.examReports.length, 1);
  }
});
test("Report: excess papers blocked and missing papers require explanation", async () => {
  const f = fixture();
  await f.save({ papers: 3 });
  await assert.rejects(f.action("submit"), status(409));
  await f.save({ papers: 1, notes: "" });
  await assert.rejects(f.action("submit"), /Ghi rõ/);
  await f.save({ papers: 1, notes: "Một thí sinh không nộp bài." });
  await f.action("submit");
  assert.equal(f.store.data.examReports.at(-1).status, "SUBMITTED");
});
test("Report: a changed source blocks draft save, submit and confirmation", async () => {
  const f = fixture(),
    input = await f.body(f.teacher, { papers: 2, notes: "" });
  f.store.data.rooms[0].version++;
  await assert.rejects(
    mutateExamReport(f.store, f.exam.id, "save", input, f.teacher),
    status(409),
  );
  await f.save();
  f.store.data.attendanceMarks[0].version++;
  await assert.rejects(f.action("submit"), status(409));
  await f.save();
  await f.action("submit");
  f.store.data.students[0].version++;
  await assert.rejects(f.action("confirm", f.manager), status(409));
  const d = await examReportDetail(f.store, f.exam.id, f.manager);
  assert.equal(d.sourceCurrent, false);
  assert.equal(d.report.status, "SUBMITTED");
});
test("Report: return and reopen require reasons; author can correct and resubmit", async () => {
  const f = fixture();
  await f.save();
  await f.action("submit");
  await assert.rejects(
    f.action("return", f.staff, { reason: "" }),
    status(400),
  );
  await f.action("return", f.manager, { reason: "Bổ sung ghi nhận bàn giao." });
  await f.save({ notes: "Bàn giao đủ hai bài thi." });
  await f.action("submit");
  await f.action("confirm", f.manager);
  const old = structuredClone(f.store.data.examReports.at(-1));
  await f.action("reopen", f.manager, {
    reason: "Kiểm tra lại nội dung ghi chú.",
  });
  await f.save();
  assert.equal(f.store.data.examReports.at(-1).status, "DRAFT");
  assert.deepEqual(
    f.store.data.examReports.find((r) => r.id === old.id),
    old,
  );
});
test("Report: reviewers cannot approve their own earlier work after a role change", async () => {
  const f = fixture();
  await f.save();
  await f.action("submit");
  f.store.data.accounts = f.store.data.accounts.map((a) =>
    a.id === f.teacher.id ? { ...a, role: "MANAGER", version: 2 } : a,
  );
  const promoted = { ...f.teacher, role: "MANAGER", version: 2 };
  await assert.rejects(f.action("confirm", promoted), status(403));
});
test("Report: scoped staff confirm same snapshot without needing private teacher accounts", async () => {
  const f = fixture();
  await f.save();
  await f.action("submit");
  const scoped = staffStore(f.store, f.staff),
    d = await examReportDetail(scoped, f.exam.id, f.staff);
  assert.equal(d.sourceCurrent, true);
  const snapshot = structuredClone(
    f.store.data.examReports.at(-1).payload.snapshot,
  );
  await mutateExamReport(
    scoped,
    f.exam.id,
    "confirm",
    {
      version: d.report.version,
      sourceHash: d.live.sourceHash,
      requestId: randomUUID(),
      confirm: true,
    },
    f.staff,
  );
  assert.deepEqual(f.store.data.examReports.at(-1).payload.snapshot, snapshot);
  f.store.data.students[0].classId = f.foreign.id;
  assert.equal(
    (await staffStore(f.store, f.staff).list("examReports")).length,
    0,
  );
  await assert.rejects(
    examReportDetail(staffStore(f.store, f.staff), f.exam.id, f.staff),
    status(404),
  );
});
test("Report: stale actors and concurrent edits cannot append conflicting revisions", async () => {
  const f = fixture(),
    a = await f.body(f.teacher, { papers: 2, notes: "Đủ bài thi." }),
    b = await f.body(f.teacher, { papers: 1, notes: "Thiếu một bài thi." });
  const results = await Promise.allSettled([
    mutateExamReport(f.store, f.exam.id, "save", a, f.teacher),
    mutateExamReport(f.store, f.exam.id, "save", b, f.teacher),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
  const g = fixture(),
    input = await g.body(g.teacher, { papers: 2, notes: "" });
  g.store.data.accounts = g.store.data.accounts.map((row) =>
    row.id === g.teacher.id ? { ...row, version: 2 } : row,
  );
  await assert.rejects(
    mutateExamReport(g.store, g.exam.id, "save", input, g.teacher),
    status(401),
  );
});
test("Report: audit failure rolls back the entire new revision", async () => {
  const f = fixture(),
    before = structuredClone(f.store.data),
    insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(f.save(), /audit/);
  assert.deepEqual(f.store.data, before);
});
test("Report: historical revision reads are read-only and request internals are private", async () => {
  const f = fixture();
  await f.save();
  await f.action("submit");
  const old = await examReportDetail(f.store, f.exam.id, f.teacher, {
    revision: 1,
  });
  assert.equal(old.isLatest, false);
  assert.equal(old.canDraft, false);
  assert.equal(old.canSubmit, false);
  assert.equal(old.report.payload.requestId, undefined);
  assert.equal(old.report.payload.requestHash, undefined);
  await assert.rejects(
    examReportDetail(f.store, f.exam.id, f.teacher, { revision: 99 }),
    status(404),
  );
});
test("Report: print markup escapes names/notes, preserves status and marks source drift", async () => {
  const f = fixture();
  await f.save({ notes: "<script>alert(1)</script>" });
  const d = await examReportDetail(f.store, f.exam.id, f.teacher);
  d.sourceCurrent = false;
  const html = reportDocument(d);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Nguồn hiện tại đã thay đổi"));
  assert.ok(html.includes("Bản nháp"));
  assert.ok(html.includes("Vắng"));
});
test("Report: AI can read totals in role, never expose the tool to students or unassigned teachers", async () => {
  const f = fixture();
  await f.save();
  await f.action("submit");
  const ai = new AiService(f.store, {}),
    sources = [];
  assert.ok(toolsFor(f.manager).some((t) => t.name === "lookup_exam_report"));
  assert.ok(!toolsFor(f.student).some((t) => t.name === "lookup_exam_report"));
  const r = await ai.runTool(
    "lookup_exam_report",
    { examId: f.exam.id },
    f.manager,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(r.papers, 2);
  assert.equal(r.rows, undefined);
  assert.equal(r.sourceCurrent, true);
  await assert.rejects(
    ai.runTool(
      "lookup_exam_report",
      { examId: f.exam.id },
      f.student,
      [],
      [],
      randomUUID(),
    ),
    status(403),
  );
  await assert.rejects(
    ai.runTool(
      "lookup_exam_report",
      { examId: f.exam.id },
      f.other,
      [],
      [],
      randomUUID(),
    ),
    status(404),
  );
});
test("Report: MySQL adapter binds immutable JSON records and decodes table columns", async () => {
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
            exam_id: "e",
            payload_json: '{"papers":2}',
            status: "DRAFT",
            version: 1,
          },
        ],
      ],
    });
  const row = {
    id: "r",
    examId: "e",
    payload: { papers: 2 },
    status: "DRAFT",
    version: 1,
    createdBy: "t",
    createdAt: 123,
  };
  await store.insert("examReports", row);
  assert.match(calls[0].sql, /INSERT INTO exam_reports/);
  assert.ok(calls[0].values.includes(JSON.stringify(row.payload)));
  assert.equal((await store.list("examReports"))[0].payload.papers, 2);
});
test("Report HTTP: roles, Origin, save-submit-confirm and historical access", async (t) => {
  const f = fixture(),
    config = { origin: "http://localhost:3000" },
    server = createApp({ store: f.store, config, mode: "demo" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base =
    "http://127.0.0.1:" +
    server.address().port +
    "/api/v1/exams/" +
    f.exam.id +
    "/report";
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
  const teacher = headersFor(f.teacher),
    student = headersFor(f.student),
    manager = headersFor(f.manager);
  assert.equal((await fetch(base)).status, 401);
  assert.equal((await fetch(base, { headers: student })).status, 403);
  const read = await fetch(base, { headers: teacher });
  assert.equal(read.status, 200);
  const d = await read.json();
  const input = {
    version: 0,
    sourceHash: d.live.sourceHash,
    requestId: randomUUID(),
    papers: 2,
    notes: "Đủ bài thi.",
  };
  assert.equal(
    (
      await fetch(base + "/save", {
        method: "POST",
        headers: { ...teacher, Origin: "https://foreign.test" },
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/save", {
        method: "POST",
        headers: teacher,
        body: JSON.stringify(input),
      })
    ).status,
    200,
  );
  await f.action("submit");
  const detail = await (await fetch(base, { headers: manager })).json();
  assert.equal(
    (
      await fetch(base + "/confirm", {
        method: "POST",
        headers: manager,
        body: JSON.stringify({
          version: detail.report.version,
          sourceHash: detail.live.sourceHash,
          requestId: randomUUID(),
          confirm: true,
        }),
      })
    ).status,
    200,
  );
  assert.equal(
    (await (await fetch(base + "?revision=1", { headers: teacher })).json())
      .report.status,
    "DRAFT",
  );
});

test("Report: list status connects reviewer workflow without exposing reports to students", async () => {
  const f = fixture();
  await f.save();
  await f.action("submit");
  assert.equal(
    (await examOverview(f.store, f.manager)).rows[0].reportStatus,
    "SUBMITTED",
  );
  assert.equal(
    (await examOverview(f.store, f.teacher)).rows[0].reportStatus,
    "SUBMITTED",
  );
  assert.equal(
    (await examOverview(f.store, f.student)).rows[0].reportStatus,
    undefined,
  );
  assert.equal(
    (await examOverview(f.store, f.other)).rows[0].reportStatus,
    undefined,
  );
});
