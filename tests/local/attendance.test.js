import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { serviceFixture, request } from "./student-services-fixture.js";
import {
  attendanceOverview,
  sessionDetail,
  sectionEligibility,
  saveAttendancePolicy,
  createSession,
  saveAttendance,
  changeSession,
} from "../../backend/local/modules/attendance/attendance.service.js";
import {
  saveRoom,
  saveExam,
  reviewExam,
  publishExam,
  cancelExam,
} from "../../backend/local/modules/exams/exam.service.js";
import {
  createReceipt,
  receiptDetail,
  decideReceipt,
  adjustCharge,
  financeOverview,
} from "../../backend/local/modules/finance/finance.service.js";
import { saveSection } from "../../backend/local/modules/academic/academic.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
const policy = (f, changes = {}) => ({
  sectionId: f.section.id,
  expectedSessions: 1,
  minAttendancePercent: 80,
  latePresent: false,
  excusedPresent: false,
  requireFinanceClearance: false,
  enforceForExams: true,
  version: 0,
  ...changes,
});
async function session(f, day = "2020-01-06") {
  return createSession(
    f.store,
    { kind: "CLASS", sectionId: f.section.id, sessionDate: day },
    f.teacher,
  );
}
async function record(f, s, statuses = {}) {
  const d = await sessionDetail(f.store, s.id, f.teacher);
  return saveAttendance(
    f.store,
    s.id,
    {
      version: d.session.version,
      rows: d.rows.map((r) => ({
        studentId: r.studentId,
        status: statuses[r.studentId] || "PRESENT",
        reason: "",
        version: r.markVersion,
      })),
    },
    f.teacher,
  );
}
async function close(f, s, actor = f.teacher) {
  const d = await sessionDetail(f.store, s.id, actor);
  return changeSession(
    f.store,
    s.id,
    { version: d.session.version, confirm: true },
    actor,
    "close",
  );
}
async function exam(f) {
  const room = await saveRoom(
    f.store,
    { code: "A101", name: "Phòng A", capacity: 40, active: true },
    f.manager,
  );
  return saveExam(
    f.store,
    {
      sectionId: f.section.id,
      roomId: room.id,
      invigilatorId: f.teacher2.id,
      examDate: "2020-04-01",
      startTime: "08:00",
      endTime: "10:00",
    },
    f.staff,
  );
}
async function publish(f, e) {
  const r = await reviewExam(f.store, e.id, f.manager);
  return publishExam(
    f.store,
    e.id,
    { version: e.version, reviewHash: r.reviewHash, confirm: true },
    f.manager,
  );
}
test("Điểm danh: Sinh viên không ghi, Giảng viên chỉ lớp phân công và nháp không lộ", async () => {
  const f = await serviceFixture();
  await f.enroll();
  const s = await session(f);
  await assert.rejects(
    createSession(
      f.store,
      { kind: "CLASS", sectionId: f.section.id, sessionDate: "2020-01-13" },
      f.student,
    ),
    { status: 403 },
  );
  await assert.rejects(saveAttendancePolicy(f.store, policy(f), f.teacher), {
    status: 403,
  });
  await assert.rejects(sessionDetail(f.store, s.id, f.teacher2), {
    status: 404,
  });
  await assert.rejects(sessionDetail(f.store, s.id, f.student), {
    status: 404,
  });
  assert.equal(
    (await attendanceOverview(f.store, f.student)).sessions.length,
    0,
  );
  await record(f, s);
  await close(f, s);
  const own = await sessionDetail(f.store, s.id, f.student);
  assert.equal(own.rows.length, 1);
  assert.equal(own.rows[0].studentId, f.profiles[0].id);
  assert.equal(own.canEdit, false);
  await assert.rejects(sessionDetail(f.store, s.id, f.student2), {
    status: 404,
  });
});
test("Không mặc định vắng/đủ điều kiện; thiếu cấu hình hoặc thiếu buổi là chưa xác minh", async () => {
  const f = await serviceFixture();
  await f.enroll();
  const s = await session(f);
  let d = await sectionEligibility(f.store, f.section.id, f.student);
  assert.equal(d.rows[0].status, "NOT_VERIFIED");
  assert.equal(d.rows[0].ABSENT, 0);
  await assert.rejects(close(f, s), { status: 409 });
  await saveAttendancePolicy(
    f.store,
    policy(f, { expectedSessions: 2 }),
    f.staff,
  );
  await record(f, s);
  await close(f, s);
  d = await sectionEligibility(f.store, f.section.id, f.student);
  assert.equal(d.rows[0].status, "NOT_VERIFIED");
  assert.equal(d.rows[0].PRESENT, 1);
  assert.equal(d.rows[0].ABSENT, 0);
});
test("Ngày học hợp lệ, không trùng buổi và không ghi điểm danh trong tương lai", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await assert.rejects(session(f, "2020-02-30"));
  await assert.rejects(session(f, "2020-01-07"));
  await session(f);
  await assert.rejects(session(f), { status: 409 });
  const future = await saveSection(
    f.store,
    {
      ...f.section,
      code: "FUTURE",
      startDate: "2099-01-05",
      endDate: "2099-06-30",
    },
    f.manager,
  );
  await f.store.insert("enrollments", {
    id: randomUUID(),
    studentId: f.profiles[0].id,
    sectionId: future.id,
    status: "ACTIVE",
    version: 1,
  });
  let day = new Date("2099-01-05T00:00:00Z");
  while (day.getUTCDay() !== 1) day.setUTCDate(day.getUTCDate() + 1);
  const s = await createSession(
    f.store,
    {
      kind: "CLASS",
      sectionId: future.id,
      sessionDate: day.toISOString().slice(0, 10),
    },
    f.teacher,
  );
  await assert.rejects(record(f, s), /Chưa đến giờ/);
});
test("Batch điểm danh lỗi giữa chừng rollback toàn bộ, không ghi đè version cũ", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await f.enroll(f.student2);
  const s = await session(f),
    d = await sessionDetail(f.store, s.id, f.teacher);
  await assert.rejects(
    saveAttendance(
      f.store,
      s.id,
      {
        version: s.version,
        rows: d.rows.map((r, i) => ({
          studentId: r.studentId,
          status: i ? "INVALID" : "PRESENT",
          reason: "",
          version: 0,
        })),
      },
      f.teacher,
    ),
  );
  assert.equal((await f.store.list("attendanceMarks")).length, 0);
  assert.equal(
    (await sessionDetail(f.store, s.id, f.teacher)).session.version,
    1,
  );
  await record(f, s);
  await assert.rejects(
    saveAttendance(
      f.store,
      s.id,
      {
        version: 1,
        rows: [{ studentId: f.profiles[0].id, status: "ABSENT", version: 1 }],
      },
      f.teacher,
    ),
    { status: 409 },
  );
});
test("Đổi đăng ký phải đồng bộ; điểm danh của lần đăng ký cũ không đủ điều kiện mới", async () => {
  const f = await serviceFixture();
  await f.enroll();
  const s = await session(f);
  await record(f, s);
  await f.enroll(f.student2);
  assert.equal(
    (await sessionDetail(f.store, s.id, f.teacher)).rosterChanged,
    true,
  );
  await assert.rejects(record(f, s), /Đồng bộ/);
  const current = (await sessionDetail(f.store, s.id, f.teacher)).session;
  await changeSession(
    f.store,
    s.id,
    { version: current.version, confirm: true },
    f.teacher,
    "sync",
  );
  await record(f, s);
  await close(f, s);
  await saveAttendancePolicy(f.store, policy(f), f.staff);
  assert.equal(
    (await sectionEligibility(f.store, f.section.id, f.student)).rows[0].status,
    "ELIGIBLE",
  );
  const e = (await f.store.list("enrollments")).find(
    (e) => e.studentId === f.profiles[0].id,
  );
  await f.store.update("enrollments", e.id, { status: "ACTIVE" }, e.version);
  const rows = (await sectionEligibility(f.store, f.section.id, f.student))
    .rows;
  assert.equal(rows[0].status, "NOT_VERIFIED");
  assert.equal(rows[0].recorded, 0);
});
test("Tỷ lệ tham dự dùng cấu hình đi muộn/có phép, không tự lấy ngưỡng trường khác", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await saveAttendancePolicy(
    f.store,
    policy(f, { expectedSessions: 2 }),
    f.staff,
  );
  const a = await session(f),
    b = await session(f, "2020-01-13");
  await record(f, a);
  await close(f, a);
  await record(f, b, { [f.profiles[0].id]: "LATE" });
  await close(f, b);
  let r = (await sectionEligibility(f.store, f.section.id, f.student)).rows[0];
  assert.equal(r.status, "INELIGIBLE");
  assert.equal(r.LATE, 1);
  assert.equal(r.percentage, 50);
  await saveAttendancePolicy(
    f.store,
    policy(f, { expectedSessions: 2, latePresent: true, version: 1 }),
    f.manager,
  );
  r = (await sectionEligibility(f.store, f.section.id, f.student)).rows[0];
  assert.equal(r.status, "ELIGIBLE");
  assert.equal(r.percentage, 100);
});
test("Công nợ: chưa có khoản thu không tự xác minh; PENDING không đủ, thu/miễn giảm mới đổi kết quả", async () => {
  const f = await serviceFixture();
  await f.enroll();
  const s = await session(f);
  await record(f, s);
  await close(f, s);
  await saveAttendancePolicy(
    f.store,
    policy(f, { requireFinanceClearance: true }),
    f.staff,
  );
  let r = (await sectionEligibility(f.store, f.section.id, f.student)).rows[0];
  assert.equal(r.status, "NOT_VERIFIED");
  const charge = await f.bill();
  r = (await sectionEligibility(f.store, f.section.id, f.student)).rows[0];
  assert.equal(r.status, "INELIGIBLE");
  const { row: receipt } = await createReceipt(
    f.store,
    request({
      chargeId: charge.id,
      amount: charge.amount,
      method: "TRANSFER",
      reference: "BANK-ATT-01",
    }),
    f.student,
  );
  assert.equal(
    (await sectionEligibility(f.store, f.section.id, f.student)).rows[0].status,
    "INELIGIBLE",
  );
  let detail = await receiptDetail(f.store, receipt.id, f.staff);
  await decideReceipt(
    f.store,
    receipt.id,
    request({
      version: detail.receipt.version,
      chargeVersion: detail.charge.version,
      confirm: true,
    }),
    f.staff,
    "confirm",
  );
  assert.equal(
    (await sectionEligibility(f.store, f.section.id, f.student)).rows[0].status,
    "ELIGIBLE",
  );
  detail = await receiptDetail(f.store, receipt.id, f.manager);
  await decideReceipt(
    f.store,
    receipt.id,
    request({
      version: detail.receipt.version,
      chargeVersion: detail.charge.version,
      confirm: true,
      reason: "Đối chiếu lại chứng từ",
    }),
    f.manager,
    "reverse",
  );
  assert.equal(
    (await sectionEligibility(f.store, f.section.id, f.student)).rows[0].status,
    "INELIGIBLE",
  );
  const c = (await financeOverview(f.store, f.manager)).charges[0];
  await adjustCharge(
    f.store,
    c.id,
    request({
      delta: -c.amount,
      version: c.version,
      reason: "Miễn toàn phần theo quyết định",
      confirm: true,
    }),
    f.manager,
  );
  assert.equal(
    (await sectionEligibility(f.store, f.section.id, f.student)).rows[0].status,
    "ELIGIBLE",
  );
});
test("Lịch thi bật điều kiện chặn chưa xác minh, bắt buộc kiểm tra lại snapshot và khóa sửa buổi chốt", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await saveAttendancePolicy(f.store, policy(f), f.staff);
  const e = await exam(f);
  await assert.rejects(reviewExam(f.store, e.id, f.staff), { status: 409 });
  const s = await session(f);
  await record(f, s);
  await close(f, s);
  const review = await reviewExam(f.store, e.id, f.manager);
  const closed = (await sessionDetail(f.store, s.id, f.teacher)).session;
  await assert.rejects(
    changeSession(
      f.store,
      s.id,
      { version: closed.version, confirm: true, reason: "" },
      f.teacher,
      "reopen",
    ),
  );
  await changeSession(
    f.store,
    s.id,
    { version: closed.version, confirm: true, reason: "Sửa ghi nhận" },
    f.teacher,
    "reopen",
  );
  await record(f, s);
  await close(f, s);
  await assert.rejects(
    publishExam(
      f.store,
      e.id,
      { version: 1, reviewHash: review.reviewHash, confirm: true },
      f.manager,
    ),
    { status: 409 },
  );
  await publish(f, e);
  const current = (await sessionDetail(f.store, s.id, f.teacher)).session;
  await assert.rejects(
    changeSession(
      f.store,
      s.id,
      { version: current.version, confirm: true, reason: "Sửa tiếp" },
      f.teacher,
      "reopen",
    ),
    { status: 409 },
  );
  await assert.rejects(
    saveAttendancePolicy(f.store, policy(f, { version: 1 }), f.staff),
    { status: 409 },
  );
});
test("Điểm danh thi chỉ người coi thi được ghi; lịch hủy dừng sửa và tài chính đổi phải kiểm tra lại", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await saveAttendancePolicy(f.store, policy(f), f.staff);
  const s = await session(f);
  await record(f, s);
  await close(f, s);
  const e = await exam(f),
    pub = await publish(f, e);
  await assert.rejects(
    createSession(f.store, { kind: "EXAM", examId: e.id }, f.teacher),
    { status: 403 },
  );
  const examSession = await createSession(
    f.store,
    { kind: "EXAM", examId: e.id },
    f.teacher2,
  );
  const d = await sessionDetail(f.store, examSession.id, f.teacher2);
  await saveAttendance(
    f.store,
    examSession.id,
    {
      version: d.session.version,
      rows: d.rows.map((r) => ({
        studentId: r.studentId,
        status: "PRESENT",
        reason: "",
        version: 0,
      })),
    },
    f.teacher2,
  );
  await close(f, examSession, f.teacher2);
  await cancelExam(
    f.store,
    e.id,
    { version: pub.version, confirm: true, reason: "Đổi lịch" },
    f.manager,
  );
  const closed = (await sessionDetail(f.store, examSession.id, f.teacher2))
    .session;
  await assert.rejects(
    changeSession(
      f.store,
      examSession.id,
      { version: closed.version, confirm: true, reason: "Sửa" },
      f.manager,
      "reopen",
    ),
    { status: 409 },
  );
});
test("Lỗi audit rollback mark/session; phiên giả không được chỉnh", async () => {
  const f = await serviceFixture();
  await f.enroll();
  const s = await session(f);
  const insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit failure");
    return insert.call(this, kind, row);
  };
  await assert.rejects(record(f, s));
  assert.equal((await f.store.list("attendanceMarks")).length, 0);
  assert.equal(
    (await sessionDetail(f.store, s.id, f.teacher)).session.version,
    1,
  );
  f.store.insert = insert;
  await assert.rejects(
    createSession(
      f.store,
      { kind: "CLASS", sectionId: f.section.id, sessionDate: "2020-01-13" },
      { ...f.teacher, version: 0 },
    ),
    { status: 401 },
  );
});
test("LizzChat điều kiện dự thi chỉ trả người/lớp trong quyền và giữ trạng thái chưa xác minh", async () => {
  const f = await serviceFixture();
  await f.enroll();
  await f.enroll(f.student2);
  const ai = new AiService(f.store, { ready: false }),
    sources = [];
  const result = await ai.runTool(
    "lookup_exam_eligibility",
    { sectionCode: f.section.code },
    f.student,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].studentId, f.profiles[0].id);
  assert.equal(result.rows[0].status, "NOT_VERIFIED");
  assert.equal(result.source, "Điểm danh đã chốt và điều kiện dự thi");
  const outside = await ai.runTool(
    "lookup_exam_eligibility",
    { sectionCode: f.section.code },
    f.teacher2,
    [],
    [],
    randomUUID(),
  );
  assert.equal(outside.options.length, 0);
  await assert.rejects(
    ai.runTool(
      "lookup_exam_eligibility",
      { sectionCode: f.section.code, studentId: f.profiles[1].id },
      f.student,
      [],
      [],
      randomUUID(),
    ),
  );
});
test("HTTP điểm danh: xác thực, Origin, quyền và không lộ buổi nháp", async (t) => {
  const f = await serviceFixture();
  await f.enroll();
  const s = await session(f),
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
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base =
      "http://127.0.0.1:" + server.address().port + "/api/v1/attendance",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal((await fetch(base)).status, 401);
  assert.equal(
    (await fetch(base + "/policies", { method: "POST", headers, body: "{}" }))
      .status,
    403,
  );
  assert.equal(
    (await fetch(base + "/sessions/" + s.id, { headers })).status,
    404,
  );
  assert.equal(
    (
      await fetch(base + "/sessions", {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: "{}",
      })
    ).status,
    403,
  );
  const own = await (
    await fetch(base + "/sections/" + f.section.id + "/eligibility", {
      headers,
    })
  ).json();
  assert.equal(own.rows.length, 1);
});
test("MySQL điểm danh: roster JSON, boolean và bind tham số giữ đúng kiểu", async () => {
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
          id: "p",
          late_present: 0,
          excused_present: 1,
          require_finance_clearance: 0,
          enforce_for_exams: 1,
          roster_json: '[{"studentId":"s"}]',
        },
      ],
    ],
  });
  await store.insert("attendanceSessions", {
    id: randomUUID(),
    sectionId: randomUUID(),
    examId: null,
    kind: "CLASS",
    sessionDate: "2020-01-06",
    status: "OPEN",
    roster: [{ studentId: "s", enrollmentId: "e", enrollmentVersion: 1 }],
    closedBy: null,
    closedAt: null,
    version: 1,
  });
  assert.match(sql, /attendance_sessions/);
  assert.match(sql, /roster_json/);
  assert.ok(params.some((v) => typeof v === "string" && v.startsWith("[{")));
  const rows = await store.list("attendancePolicies");
  assert.equal(rows[0].latePresent, false);
  assert.equal(rows[0].excusedPresent, true);
  assert.equal(rows[0].enforceForExams, true);
  assert.equal(rows[0].roster[0].studentId, "s");
});
test("Tài chính đổi sau ghi điểm danh thi phải được kiểm tra lại khi chốt", async () => {
  const f = await serviceFixture();
  await f.enroll();
  const charge = await f.bill();
  await adjustCharge(
    f.store,
    charge.id,
    request({
      version: charge.version,
      delta: -charge.amount,
      reason: "Miễn theo quyết định",
      confirm: true,
    }),
    f.manager,
  );
  await saveAttendancePolicy(
    f.store,
    policy(f, { requireFinanceClearance: true }),
    f.staff,
  );
  const s = await session(f);
  await record(f, s);
  await close(f, s);
  const e = await exam(f);
  await publish(f, e);
  const es = await createSession(
      f.store,
      { kind: "EXAM", examId: e.id },
      f.teacher2,
    ),
    d = await sessionDetail(f.store, es.id, f.teacher2);
  await saveAttendance(
    f.store,
    es.id,
    {
      version: d.session.version,
      rows: d.rows.map((r) => ({
        studentId: r.studentId,
        status: "PRESENT",
        reason: "",
        version: 0,
      })),
    },
    f.teacher2,
  );
  const c = (await financeOverview(f.store, f.manager)).charges[0];
  await adjustCharge(
    f.store,
    c.id,
    request({
      version: c.version,
      delta: 100000,
      reason: "Điều chỉnh lại quyết định",
      confirm: true,
    }),
    f.manager,
  );
  await assert.rejects(
    close(f, es, f.teacher2),
    /Điều kiện dự thi đã thay đổi/,
  );
  assert.equal(
    (await sessionDetail(f.store, es.id, f.teacher2)).session.status,
    "OPEN",
  );
});
