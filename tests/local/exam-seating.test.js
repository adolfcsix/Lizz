import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import {
  reviewSeating,
  confirmSeating,
} from "../../backend/local/modules/exams/seating.service.js";
import {
  examOverview,
  examRoster,
} from "../../backend/local/modules/exams/exam.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const status = (n) => (e) => e.status === n;
const input = {
  prefix: "A-",
  startNumber: 101,
  reason: "Lập danh sách phòng thi chính thức",
};
function fixture() {
  const store = new MemoryStore(),
    uid = () => randomUUID();
  const account = (role) => ({
    id: uid(),
    username: role + uid().slice(0, 8),
    role,
    fullName: role,
    active: true,
    version: 1,
  });
  const manager = account("MANAGER"),
    staff = account("STAFF"),
    teacher = account("LECTURER"),
    otherTeacher = account("LECTURER"),
    students = [account("STUDENT"), account("STUDENT")];
  store.data.accounts = [manager, staff, teacher, otherTeacher, ...students];
  const faculty = { id: uid() },
    foreignFaculty = { id: uid() },
    cohort = { id: uid() };
  store.data.faculties = [faculty, foreignFaculty];
  store.data.cohorts = [cohort];
  const major = { id: uid(), facultyId: faculty.id },
    foreignMajor = { id: uid(), facultyId: foreignFaculty.id };
  store.data.majors = [major, foreignMajor];
  const cl = { id: uid(), majorId: major.id, cohortId: cohort.id },
    foreignClass = { id: uid(), majorId: foreignMajor.id, cohortId: cohort.id };
  store.data.classes = [cl, foreignClass];
  store.data.students = students.map((s, i) => ({
    id: uid(),
    accountId: s.id,
    code: i ? "SV002" : "SV010",
    fullName: i ? "Nguyễn Bình" : "Trần Anh",
    classId: cl.id,
    version: 1,
  }));
  const section = {
    id: uid(),
    code: "CSDL01",
    subjectId: uid(),
    facultyId: faculty.id,
    cohortId: cohort.id,
    lecturerId: teacher.id,
    term: "2099.1",
    version: 1,
  };
  store.data.sections = [section];
  store.data.subjects = [{ id: section.subjectId, name: "Cơ sở dữ liệu" }];
  const room = {
    id: uid(),
    code: "A101",
    name: "Phòng A101",
    capacity: 40,
    active: true,
    version: 1,
  };
  store.data.rooms = [room];
  const exam = {
    id: uid(),
    sectionId: section.id,
    roomId: room.id,
    invigilatorId: teacher.id,
    examDate: "2099-07-01",
    startTime: "08:00",
    endTime: "10:00",
    status: "PUBLISHED",
    publishedAt: 1,
    version: 2,
  };
  store.data.exams = [exam];
  store.data.enrollments = store.data.students.map((s) => ({
    id: uid(),
    studentId: s.id,
    sectionId: section.id,
    status: "ACTIVE",
    version: 1,
  }));
  store.data.staffScopes = [
    {
      id: uid(),
      accountId: staff.id,
      facultyId: faculty.id,
      cohortId: cohort.id,
      scopeType: "FACULTY_COHORT",
      active: true,
      version: 1,
    },
  ];
  const confirm = async (actor = manager, changes = {}) => {
    const review = await reviewSeating(
      store,
      exam.id,
      { ...input, ...changes },
      actor,
    );
    return confirmSeating(
      store,
      exam.id,
      {
        ...input,
        ...changes,
        version: review.version,
        reviewHash: review.reviewHash,
        confirm: true,
      },
      actor,
    );
  };
  return {
    store,
    manager,
    staff,
    teacher,
    otherTeacher,
    students,
    exam,
    room,
    section,
    foreignClass,
    confirm,
  };
}
test("Seating: preview has deterministic MSSV order, unique SBD/seat and does not write", async () => {
  const f = fixture(),
    review = await reviewSeating(f.store, f.exam.id, input, f.manager);
  assert.deepEqual(
    review.rows.map((r) => [r.code, r.candidateNumber, r.seatNumber]),
    [
      ["SV002", "A-101", 1],
      ["SV010", "A-102", 2],
    ],
  );
  assert.equal(review.version, 0);
  assert.equal(f.store.data.examSeatings.length, 0);
  assert.equal(f.store.data.events.length, 0);
});
test("Seating: requires explicit preview/confirmation and validates settings", async () => {
  const f = fixture();
  for (const bad of [
    { prefix: "<script>" },
    { startNumber: 0 },
    { startNumber: 1.5 },
    { startNumber: 999001 },
    { reason: "x" },
  ])
    await assert.rejects(
      reviewSeating(f.store, f.exam.id, { ...input, ...bad }, f.manager),
      status(400),
    );
  const r = await reviewSeating(f.store, f.exam.id, input, f.manager);
  await assert.rejects(
    confirmSeating(
      f.store,
      f.exam.id,
      { ...input, version: 0, reviewHash: r.reviewHash, confirm: false },
      f.manager,
    ),
    status(400),
  );
  assert.equal(f.store.data.examSeatings.length, 0);
});
test("Seating: only published, future exams with complete nonempty roster fit the room", async () => {
  for (const change of [
    (f) => (f.store.data.exams[0].status = "DRAFT"),
    (f) => (f.store.data.exams[0].examDate = "2000-01-01"),
    (f) => (f.store.data.rooms[0].capacity = 1),
    (f) => (f.store.data.rooms[0].active = false),
    (f) => f.store.data.students.pop(),
    (f) => (f.store.data.enrollments = []),
    (f) =>
      f.store.data.enrollments.push({
        ...f.store.data.enrollments[0],
        id: randomUUID(),
      }),
  ]) {
    const f = fixture();
    change(f);
    await assert.rejects(
      reviewSeating(f.store, f.exam.id, input, f.manager),
      status(409),
    );
  }
});
test("Seating: teacher/student denied writes and unassigned teacher cannot read roster", async () => {
  const f = fixture();
  for (const actor of [f.teacher, ...f.students])
    await assert.rejects(
      reviewSeating(f.store, f.exam.id, input, actor),
      status(403),
    );
  await assert.rejects(
    examRoster(f.store, f.exam.id, f.otherTeacher),
    status(404),
  );
  await assert.rejects(
    examRoster(f.store, f.exam.id, f.students[0]),
    status(403),
  );
});
test("Seating: confirmation produces immutable revision; exact retry does not duplicate", async () => {
  const f = fixture(),
    r = await reviewSeating(f.store, f.exam.id, input, f.manager),
    body = {
      ...input,
      version: r.version,
      reviewHash: r.reviewHash,
      confirm: true,
    };
  const first = await confirmSeating(f.store, f.exam.id, body, f.manager);
  assert.deepEqual(
    await confirmSeating(f.store, f.exam.id, body, f.manager),
    first,
  );
  assert.equal(f.store.data.examSeatings.length, 1);
  assert.equal(f.store.data.events.length, 1);
  assert.equal(
    (await examRoster(f.store, f.exam.id, f.teacher)).rows[0].seatNumber,
    1,
  );
});
test("Seating: concurrent distinct confirmations produce one revision and conflict", async () => {
  const f = fixture(),
    a = await reviewSeating(f.store, f.exam.id, input, f.manager),
    b = await reviewSeating(
      f.store,
      f.exam.id,
      { ...input, startNumber: 201 },
      f.manager,
    );
  const result = await Promise.allSettled([
    confirmSeating(
      f.store,
      f.exam.id,
      { ...input, version: 0, reviewHash: a.reviewHash, confirm: true },
      f.manager,
    ),
    confirmSeating(
      f.store,
      f.exam.id,
      {
        ...input,
        startNumber: 201,
        version: 0,
        reviewHash: b.reviewHash,
        confirm: true,
      },
      f.manager,
    ),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(result.find((r) => r.status === "rejected").reason.status, 409);
  assert.equal(f.store.data.examSeatings.length, 1);
});
test("Seating: changed enrollment, profile, room, exam or settings invalidates preview", async () => {
  for (const mutate of [
    (f) => f.store.data.enrollments[0].version++,
    (f) => (f.store.data.students[0].fullName = "Đã cập nhật"),
    (f) => f.store.data.rooms[0].version++,
    (f) => f.store.data.exams[0].version++,
  ]) {
    const f = fixture(),
      r = await reviewSeating(f.store, f.exam.id, input, f.manager);
    mutate(f);
    await assert.rejects(
      confirmSeating(
        f.store,
        f.exam.id,
        { ...input, version: 0, reviewHash: r.reviewHash, confirm: true },
        f.manager,
      ),
      status(409),
    );
    assert.equal(f.store.data.examSeatings.length, 0);
  }
  const f = fixture(),
    r = await reviewSeating(f.store, f.exam.id, input, f.manager);
  await assert.rejects(
    confirmSeating(
      f.store,
      f.exam.id,
      {
        ...input,
        prefix: "B-",
        version: 0,
        reviewHash: r.reviewHash,
        confirm: true,
      },
      f.manager,
    ),
    status(409),
  );
});
test("Seating: stale plans hide all old seats until a new revision; old snapshot retained", async () => {
  const f = fixture();
  await f.confirm();
  const before = structuredClone(f.store.data.examSeatings[0]);
  f.store.data.enrollments[0].version++;
  const stale = await examRoster(f.store, f.exam.id, f.manager);
  assert.equal(stale.seatingStatus, "STALE");
  assert.ok(stale.rows.every((r) => r.seatNumber === null));
  const student = (await examOverview(f.store, f.students[0])).rows[0];
  assert.equal(student.mySeat, null);
  assert.equal(student.seatingStatus, "STALE");
  await f.confirm(f.manager, { startNumber: 201 });
  assert.equal(f.store.data.examSeatings.length, 2);
  assert.deepEqual(f.store.data.examSeatings[0], before);
  assert.equal(
    (await examRoster(f.store, f.exam.id, f.manager)).seatingVersion,
    2,
  );
});
test("Seating: student receives own seat only; cancellation hides current assignment", async () => {
  const f = fixture();
  await f.confirm();
  const result = await examOverview(f.store, f.students[0]);
  assert.deepEqual(result.rows[0].mySeat, {
    candidateNumber: "A-102",
    seatNumber: 2,
  });
  assert.ok(!JSON.stringify(result).includes("Nguyễn Bình"));
  assert.equal(result.rows[0].payload, undefined);
  f.store.data.exams[0].status = "CANCELLED";
  assert.equal(
    (await examOverview(f.store, f.students[0])).rows[0].mySeat,
    null,
  );
});
test("Seating: audit failure rolls back revision and source remains unchanged", async () => {
  const f = fixture(),
    before = structuredClone(f.store.data),
    insert = f.store.insert;
  f.store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(f.confirm(), /audit/);
  assert.deepEqual(f.store.data, before);
});
test("Seating: stale actor and scope changes block confirmation; scope isolates saved revisions", async () => {
  const f = fixture(),
    scoped = staffStore(f.store, f.staff),
    review = await reviewSeating(scoped, f.exam.id, input, f.staff);
  await confirmSeating(
    scoped,
    f.exam.id,
    { ...input, version: 0, reviewHash: review.reviewHash, confirm: true },
    f.staff,
  );
  assert.equal(
    (await staffStore(f.store, f.staff).list("examSeatings")).length,
    1,
  );
  f.store.data.students[0].classId = f.foreignClass.id;
  const restricted = staffStore(f.store, f.staff);
  assert.equal((await restricted.list("examSeatings")).length, 0);
  await assert.rejects(
    reviewSeating(restricted, f.exam.id, input, f.staff),
    status(404),
  );
  const fresh = fixture(),
    r = await reviewSeating(fresh.store, fresh.exam.id, input, fresh.manager);
  fresh.store.data.accounts[0] = { ...fresh.manager, version: 2 };
  await assert.rejects(
    confirmSeating(
      fresh.store,
      fresh.exam.id,
      { ...input, version: 0, reviewHash: r.reviewHash, confirm: true },
      fresh.manager,
    ),
    status(401),
  );
});
test("Seating: LizzChat schedule lookup includes only students own seat", async () => {
  const f = fixture();
  await f.confirm();
  const ai = new AiService(f.store, {}),
    sources = [];
  const result = await ai.runTool(
    "lookup_exam_schedule",
    {},
    f.students[0],
    [],
    sources,
    randomUUID(),
  );
  assert.equal(result.rows[0].mySeat.candidateNumber, "A-102");
  assert.ok(!JSON.stringify(result).includes("SV002"));
});
test("Seating: SQL adapter binds JSON and maps immutable plan table", async () => {
  const calls = [],
    store = new MysqlStore({
      execute: async (sql, values) => {
        calls.push({ sql, values });
        return [{ affectedRows: 1 }];
      },
      query: async () => [
        [{ id: "p", exam_id: "e", payload_json: '{"rows":[]}', version: 1 }],
      ],
    });
  const row = {
    id: "p",
    examId: "e",
    payload: { rows: [{ fullName: "Tên Việt" }] },
    version: 1,
    createdBy: "m",
    createdAt: 123,
  };
  await store.insert("examSeatings", row);
  assert.match(calls[0].sql, /INSERT INTO exam_seating_plans/);
  assert.ok(calls[0].values.includes(JSON.stringify(row.payload)));
  assert.deepEqual((await store.list("examSeatings"))[0].payload, { rows: [] });
});
test("Seating HTTP: scoped endpoints, Origin, preview/confirm and own seat are enforced", async (t) => {
  const f = fixture(),
    config = { origin: "http://localhost:3000" },
    server = createApp({ store: f.store, config, mode: "demo" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base =
    "http://127.0.0.1:" + server.address().port + "/api/v1/exams/" + f.exam.id;
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
  const manager = headersFor(f.manager),
    student = headersFor(f.students[0]);
  const post = (action, body, headers) =>
    fetch(base + "/seating/" + action, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await post("review", input, {
        Origin: config.origin,
        "Content-Type": "application/json",
      })
    ).status,
    401,
  );
  assert.equal((await post("review", input, student)).status, 403);
  assert.equal(
    (
      await post("review", input, {
        ...manager,
        Origin: "https://foreign.test",
      })
    ).status,
    403,
  );
  const preview = await post("review", input, manager);
  assert.equal(preview.status, 200);
  const r = await preview.json();
  assert.equal(
    (
      await post(
        "confirm",
        {
          ...input,
          version: r.version,
          reviewHash: r.reviewHash,
          confirm: true,
        },
        manager,
      )
    ).status,
    200,
  );
  assert.equal(
    (await fetch(base + "/students", { headers: student })).status,
    403,
  );
});
