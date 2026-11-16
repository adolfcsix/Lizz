import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import {
  saveSubject,
  saveSection,
  registerSection,
} from "../../backend/local/modules/academic/academic.service.js";
import {
  saveTerm,
  savePeriod,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import {
  examOverview,
  saveRoom,
  saveExam,
  reviewExam,
  publishExam,
  cancelExam,
  examRoster,
} from "../../backend/local/modules/exams/exam.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { toolsFor } from "../../backend/local/modules/ai/ai.tools.js";
async function fixture() {
  const store = new MemoryStore();
  const account = async (role, name) => {
    const a = {
      id: randomUUID(),
      role,
      username: name,
      email: name + "@example.test",
      fullName: name,
      active: true,
      version: 1,
    };
    await store.insert("accounts", a);
    return a;
  };
  const manager = await account("MANAGER", "manager"),
    staff = await account("STAFF", "staff"),
    teacher = await account("LECTURER", "teacher"),
    teacher2 = await account("LECTURER", "teacher2"),
    student = await account("STUDENT", "student"),
    student2 = await account("STUDENT", "student2");
  for (const a of [student, student2])
    await store.insert("students", {
      id: randomUUID(),
      accountId: a.id,
      code: a.username,
      fullName: a.fullName,
      classId: randomUUID(),
      version: 1,
    });
  const term = await saveTerm(
    store,
    { code: "2099.1", name: "Học kỳ", maxCredits: 30, passScore: 5 },
    manager,
  );
  await savePeriod(
    store,
    {
      termId: term.id,
      title: "Đợt",
      opensAt: Date.now() - 10000,
      closesAt: Date.now() + 1000000,
      withdrawUntil: Date.now() + 2000000,
      status: "OPEN",
    },
    manager,
  );
  const sections = [];
  for (let i = 0; i < 3; i++) {
    const subject = await saveSubject(
      store,
      { code: "MON" + i, name: "Môn " + i, credits: 3 },
      manager,
    );
    sections.push(
      await saveSection(
        store,
        {
          code: "LOP" + i,
          subjectId: subject.id,
          lecturerId: teacher.id,
          term: term.code,
          capacity: 10,
          startDate: "2099-01-01",
          endDate: "2099-06-30",
          weekday: i + 1,
          startTime: "08:00",
          endTime: "10:00",
          status: "OPEN",
        },
        manager,
      ),
    );
  }
  const room = await saveRoom(
      store,
      { code: "A101", name: "Phòng A101", capacity: 10, active: true },
      staff,
    ),
    room2 = await saveRoom(
      store,
      { code: "A102", name: "Phòng A102", capacity: 10, active: true },
      manager,
    );
  const draft = (index = 0, more = {}) => ({
    sectionId: sections[index].id,
    roomId: room.id,
    invigilatorId: teacher.id,
    examDate: "2099-07-01",
    startTime: "08:00",
    endTime: "10:00",
    ...more,
  });
  const register = (who, index = 0) =>
    registerSection(
      store,
      { sectionId: sections[index].id, requestId: randomUUID() },
      who,
    );
  const publish = async (e) => {
    const r = await reviewExam(store, e.id, manager);
    return publishExam(
      store,
      e.id,
      { version: e.version, reviewHash: r.reviewHash, confirm: true },
      manager,
    );
  };
  return {
    store,
    manager,
    staff,
    teacher,
    teacher2,
    student,
    student2,
    room,
    room2,
    sections,
    draft,
    register,
    publish,
  };
}
test("Phòng/lịch thi: kiểm tra giá trị, quan hệ, quyền và bản ghi cũ", async () => {
  const f = await fixture();
  await assert.rejects(
    saveRoom(
      f.store,
      { code: "a101", name: "Trùng", capacity: 10, active: true },
      f.manager,
    ),
    { status: 409 },
  );
  for (const capacity of [0, 1001, 1.5])
    await assert.rejects(
      saveRoom(
        f.store,
        { code: "X", name: "X", capacity, active: true },
        f.manager,
      ),
    );
  await assert.rejects(
    saveRoom(f.store, { ...f.room, version: 0 }, f.manager, f.room.id),
    { status: 409 },
  );
  await assert.rejects(saveExam(f.store, f.draft(), f.student), {
    status: 403,
  });
  for (const change of [
    { examDate: "2099-02-30" },
    { examDate: "2098-01-01" },
    { startTime: "25:00" },
    { endTime: "07:00" },
    { sectionId: randomUUID() },
    { roomId: randomUUID() },
    { invigilatorId: f.student.id },
  ])
    await assert.rejects(saveExam(f.store, f.draft(0, change), f.manager));
  await assert.rejects(saveExam(f.store, null, f.manager, randomUUID()), {
    status: 400,
  });
  const e = await saveExam(f.store, f.draft(), f.manager);
  await assert.rejects(saveExam(f.store, f.draft(), f.staff), { status: 409 });
  await assert.rejects(
    saveExam(f.store, { ...f.draft(), version: 0 }, f.staff, e.id),
    { status: 409 },
  );
});
test("Công bố, thí sinh và hủy lịch: bốn vai trò được giới hạn đúng", async () => {
  const f = await fixture();
  await f.register(f.student);
  const e = await saveExam(f.store, f.draft(), f.staff);
  for (const a of [f.student, f.student2, f.teacher])
    assert.equal((await examOverview(f.store, a)).rows.length, 0);
  await assert.rejects(
    publishExam(
      f.store,
      e.id,
      { version: 1, reviewHash: "a".repeat(64), confirm: false },
      f.manager,
    ),
  );
  const published = await f.publish(e);
  assert.equal((await examOverview(f.store, f.student)).rows.length, 1);
  assert.equal((await examOverview(f.store, f.student2)).rows.length, 0);
  assert.equal((await examOverview(f.store, f.teacher2)).rows.length, 0);
  assert.equal((await examOverview(f.store, f.teacher)).rows.length, 1);
  const own = await examOverview(f.store, f.student);
  assert.deepEqual(own.rooms, []);
  assert.deepEqual(own.teachers, []);
  assert.equal("reviewHash" in own.rows[0], false);
  await assert.rejects(examRoster(f.store, e.id, f.student), { status: 403 });
  assert.equal(
    (await examRoster(f.store, e.id, f.teacher)).rows[0].code,
    "student",
  );
  await assert.rejects(examRoster(f.store, e.id, f.teacher2), { status: 404 });
  await assert.rejects(
    saveExam(
      f.store,
      { ...f.draft(), version: published.version },
      f.manager,
      e.id,
    ),
    { status: 409 },
  );
  await cancelExam(
    f.store,
    e.id,
    { version: published.version, confirm: true, reason: "Đổi phòng" },
    f.staff,
  );
  assert.equal(
    (await examOverview(f.store, f.student)).rows[0].status,
    "CANCELLED",
  );
  assert.equal((await f.store.list("exams")).length, 1);
  await saveExam(f.store, f.draft(), f.manager);
});
for (const kind of ["room", "teacher", "student"])
  test("Công bố chặn trùng " + kind, async () => {
    const f = await fixture();
    if (kind === "student") {
      await f.register(f.student, 0);
      await f.register(f.student, 1);
    }
    const first = await saveExam(f.store, f.draft(), f.manager);
    await f.publish(first);
    const second = await saveExam(
      f.store,
      f.draft(1, {
        roomId: kind === "room" ? f.room.id : f.room2.id,
        invigilatorId: kind === "student" ? f.teacher2.id : f.teacher.id,
      }),
      f.manager,
    );
    await assert.rejects(reviewExam(f.store, second.id, f.manager), {
      status: 409,
    });
    const adjacent = await saveExam(
      f.store,
      {
        ...f.draft(1, {
          roomId: f.room.id,
          startTime: "10:00",
          endTime: "12:00",
        }),
        version: second.version,
      },
      f.manager,
      second.id,
    );
    await f.publish(adjacent);
  });
test("Xác nhận cũ bị chặn khi roster/phòng đổi; công bố gửi lại không lặp audit", async () => {
  const f = await fixture();
  const e = await saveExam(f.store, f.draft(), f.manager);
  const review = await reviewExam(f.store, e.id, f.manager);
  await f.register(f.student);
  await assert.rejects(
    publishExam(
      f.store,
      e.id,
      { confirm: true, version: 1, reviewHash: review.reviewHash },
      f.manager,
    ),
    { status: 409 },
  );
  const current = await reviewExam(f.store, e.id, f.manager);
  await saveRoom(f.store, { ...f.room, name: "Tên mới" }, f.manager, f.room.id);
  await assert.rejects(
    publishExam(
      f.store,
      e.id,
      { confirm: true, version: 1, reviewHash: current.reviewHash },
      f.manager,
    ),
    { status: 409 },
  );
  const last = await reviewExam(f.store, e.id, f.manager),
    input = { confirm: true, version: 1, reviewHash: last.reviewHash };
  await publishExam(f.store, e.id, input, f.manager);
  await publishExam(f.store, e.id, input, f.manager);
  assert.equal(
    (await f.store.list("events")).filter((r) => r.action === "EXAM_PUBLISHED")
      .length,
    1,
  );
});
test("Sức chứa phòng và đăng ký sau công bố dùng chung kiểm tra", async () => {
  const f = await fixture();
  await f.register(f.student);
  await saveRoom(f.store, { ...f.room, capacity: 1 }, f.manager, f.room.id);
  const e = await saveExam(f.store, f.draft(), f.manager);
  await f.publish(e);
  await assert.rejects(f.register(f.student2), /Phòng thi/);
  const room = (await f.store.list("rooms")).find((r) => r.id === f.room.id);
  await assert.rejects(
    saveRoom(f.store, { ...room, active: false }, f.manager, room.id),
    { status: 409 },
  );
  await saveRoom(f.store, { ...room, capacity: 2 }, f.manager, room.id);
  await f.register(f.student2);
  assert.equal((await examRoster(f.store, e.id, f.manager)).rows.length, 2);
});
test("Đăng ký thêm lớp bị chặn nếu trùng lịch thi đã công bố", async () => {
  const f = await fixture();
  await f.register(f.student, 0);
  const a = await saveExam(f.store, f.draft(), f.manager),
    b = await saveExam(
      f.store,
      f.draft(1, { roomId: f.room2.id, invigilatorId: f.teacher2.id }),
      f.manager,
    );
  await f.publish(a);
  await f.publish(b);
  await assert.rejects(f.register(f.student, 1), /trùng lịch thi/);
  assert.equal((await f.store.list("enrollments")).length, 1);
});
test("Hai yêu cầu công bố tranh cùng phòng chỉ một giao dịch thành công", async () => {
  const f = await fixture();
  const a = await saveExam(f.store, f.draft(), f.manager),
    b = await saveExam(
      f.store,
      f.draft(1, { invigilatorId: f.teacher2.id }),
      f.staff,
    );
  const ra = await reviewExam(f.store, a.id, f.manager),
    rb = await reviewExam(f.store, b.id, f.staff);
  const results = await Promise.allSettled([
    publishExam(
      f.store,
      a.id,
      { confirm: true, version: 1, reviewHash: ra.reviewHash },
      f.manager,
    ),
    publishExam(
      f.store,
      b.id,
      { confirm: true, version: 1, reviewHash: rb.reviewHash },
      f.staff,
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (await f.store.list("exams")).filter((r) => r.status === "PUBLISHED")
      .length,
    1,
  );
});
test("Lỗi ghi audit rollback công bố; mất quyền/phiên không được ghi", async () => {
  const f = await fixture(),
    e = await saveExam(f.store, f.draft(), f.manager),
    review = await reviewExam(f.store, e.id, f.manager);
  const insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("Audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(
    publishExam(
      f.store,
      e.id,
      { confirm: true, version: 1, reviewHash: review.reviewHash },
      f.manager,
    ),
  );
  assert.equal((await f.store.list("exams"))[0].status, "DRAFT");
  await assert.rejects(
    saveExam(f.store, f.draft(1), { ...f.staff, version: 0 }),
    { status: 401 },
  );
});
test("LizzChat tra lịch thi dùng cùng giới hạn quyền và có nguồn dữ liệu", async () => {
  const f = await fixture();
  await f.register(f.student);
  const e = await saveExam(f.store, f.draft(), f.manager);
  await f.publish(e);
  const ai = new AiService(f.store, { ready: false }),
    sources = [];
  assert.ok(toolsFor(f.student).some((t) => t.name === "lookup_exam_schedule"));
  const rows = await ai.runTool(
    "lookup_exam_schedule",
    {},
    f.student,
    [],
    sources,
    randomUUID(),
  );
  assert.equal(rows.rows.length, 1);
  assert.equal(sources[0].name, "Lịch thi trong quyền của bạn");
  const other = await ai.runTool(
    "lookup_exam_schedule",
    { query: "LOP0" },
    f.student2,
    [],
    [],
    randomUUID(),
  );
  assert.equal(other.total, 0);
  await assert.rejects(
    ai.runTool(
      "lookup_exam_schedule",
      { actorId: f.student.id },
      f.student2,
      [],
      [],
      randomUUID(),
    ),
  );
});
test("HTTP lịch thi: xác thực, Origin, quyền ghi, review và hủy có lý do", async (t) => {
  const f = await fixture(),
    origin = "http://localhost:3000",
    tokens = new Map();
  for (const a of [f.manager, f.student]) {
    const token =
      randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
    tokens.set(a.id, token);
    await f.store.insert("sessions", {
      tokenHash: tokenHash(token),
      accountId: a.id,
      accountVersion: 1,
      expiresAt: Date.now() + 100000,
    });
  }
  const server = createApp({
    store: f.store,
    config: { origin },
    mode: "demo",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1/exams";
  const headers = (a) => ({
    Cookie: "lizz_session=" + tokens.get(a.id),
    Origin: origin,
    "Content-Type": "application/json",
  });
  assert.equal((await fetch(base)).status, 401);
  assert.equal(
    (
      await fetch(base, {
        method: "POST",
        headers: headers(f.student),
        body: JSON.stringify(f.draft()),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base, {
        method: "POST",
        headers: { ...headers(f.manager), Origin: "https://bad.test" },
        body: JSON.stringify(f.draft()),
      })
    ).status,
    403,
  );
  const created = await fetch(base, {
    method: "POST",
    headers: headers(f.manager),
    body: JSON.stringify(f.draft()),
  });
  assert.equal(created.status, 201);
  const { row } = await created.json();
  assert.equal(
    (
      await fetch(base + "/" + row.id + "/students", {
        headers: headers(f.student),
      })
    ).status,
    403,
  );
  const review = await (
    await fetch(base + "/" + row.id + "/review", {
      headers: headers(f.manager),
    })
  ).json();
  assert.equal(
    (
      await fetch(base + "/" + row.id + "/publish", {
        method: "POST",
        headers: headers(f.manager),
        body: JSON.stringify({
          confirm: true,
          version: 1,
          reviewHash: review.reviewHash,
        }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(base + "/" + row.id + "/cancel", {
        method: "POST",
        headers: headers(f.manager),
        body: JSON.stringify({ confirm: true, version: 2, reason: "" }),
      })
    ).status,
    400,
  );
});
test("MySQL lịch thi: tên cột khai báo và giá trị được bind, không nội suy", async () => {
  let sql, params;
  const store = new MysqlStore({
    execute: async (s, p) => {
      sql = s;
      params = p;
      return [{ affectedRows: 1 }];
    },
  });
  const row = {
    id: randomUUID(),
    sectionId: randomUUID(),
    roomId: randomUUID(),
    invigilatorId: randomUUID(),
    examDate: "2099-07-01",
    startTime: "08:00",
    endTime: "10:00",
    status: "DRAFT",
    version: 1,
    publishedBy: null,
    publishedAt: null,
    reviewHash: null,
    cancelledBy: null,
    cancelReason: null,
  };
  await store.insert("exams", row);
  assert.match(sql, /INSERT INTO exam_schedules/);
  assert.match(sql, /invigilator_id/);
  assert.equal(sql.includes(row.id), false);
  assert.ok(params.includes(row.examDate));
  await store.update(
    "exams",
    row.id,
    { cancelReason: "x' OR 1=1", status: "CANCELLED" },
    1,
  );
  assert.equal(sql.includes("OR 1=1"), false);
  assert.ok(params.includes("x' OR 1=1"));
});
const tuesdayInFebruary = () => {
  const day = new Date("2099-02-01T00:00:00Z");
  while (day.getUTCDay() !== 2) day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
};
test("Lịch thi kiểm tra cả giờ giảng dạy và giờ học cố định của thí sinh", async () => {
  const f = await fixture();
  let e = await saveExam(
    f.store,
    f.draft(0, { examDate: tuesdayInFebruary() }),
    f.manager,
  );
  await assert.rejects(reviewExam(f.store, e.id, f.manager), /giảng dạy/);
  await f.register(f.student, 0);
  await f.register(f.student, 1);
  e = await saveExam(
    f.store,
    {
      ...f.draft(0, {
        examDate: tuesdayInFebruary(),
        invigilatorId: f.teacher2.id,
      }),
      version: e.version,
    },
    f.manager,
    e.id,
  );
  await assert.rejects(
    reviewExam(f.store, e.id, f.manager),
    /lịch học của sinh viên/,
  );
});
test("Sau công bố: không đổi lịch giảng dạy hoặc đăng ký lớp gây xung đột thi", async () => {
  const f = await fixture();
  await f.register(f.student);
  const e = await saveExam(
    f.store,
    f.draft(0, { examDate: tuesdayInFebruary(), invigilatorId: f.teacher2.id }),
    f.manager,
  );
  await f.publish(e);
  await assert.rejects(
    f.register(f.student, 1),
    /Lịch học của lớp trùng với lịch thi/,
  );
  const section = f.sections[2];
  await assert.rejects(
    saveSection(
      f.store,
      { ...section, lecturerId: f.teacher2.id, weekday: 2 },
      f.manager,
      section.id,
    ),
    /lịch coi thi/,
  );
  assert.equal(
    (await f.store.list("sections")).find((r) => r.id === section.id).version,
    section.version,
  );
});
