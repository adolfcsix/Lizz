import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { staffStore } from "../../backend/local/modules/access/staff-store.js";
import {
  accountAccess,
  saveAccountAccess,
} from "../../backend/local/modules/access/access.service.js";
import {
  saveSection,
  academicOverview,
} from "../../backend/local/modules/academic/academic.service.js";
import {
  saveCharge,
  financeOverview,
} from "../../backend/local/modules/finance/finance.service.js";
import {
  importStudents,
  suggestAccounts,
} from "../../backend/local/modules/students/student.service.js";
import { reviewExam } from "../../backend/local/modules/exams/exam.service.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const uid = () => randomUUID();
async function fixture() {
  const store = new MemoryStore(),
    row = async (kind, r) => {
      const v = { id: uid(), version: 1, ...r };
      await store.insert(kind, v);
      return v;
    };
  const account = async (role, name, extra = {}) =>
    row("accounts", {
      role,
      username: name,
      fullName: name,
      email: name + "@example.test",
      active: true,
      ...extra,
    });
  const manager = await account("MANAGER", "manager"),
    staff = await account("STAFF", "staff"),
    none = await account("STAFF", "none");
  const fa = await row("faculties", { code: "A", name: "Khoa A" }),
    fb = await row("faculties", { code: "B", name: "Khoa B" }),
    c1 = await row("cohorts", { code: "K1", name: "Khóa 1", startYear: 2025 }),
    c2 = await row("cohorts", { code: "K2", name: "Khóa 2", startYear: 2026 });
  const ma = await row("majors", {
      code: "MA",
      name: "Ngành A",
      facultyId: fa.id,
    }),
    mb = await row("majors", { code: "MB", name: "Ngành B", facultyId: fb.id });
  const ca = await row("classes", {
      code: "A1",
      name: "Lớp A1",
      majorId: ma.id,
      cohortId: c1.id,
      capacity: 40,
    }),
    ca2 = await row("classes", {
      code: "A2",
      name: "Lớp A2",
      majorId: ma.id,
      cohortId: c2.id,
      capacity: 40,
    }),
    cb = await row("classes", {
      code: "B1",
      name: "Lớp B1",
      majorId: mb.id,
      cohortId: c1.id,
      capacity: 40,
    });
  const teacher = await account("LECTURER", "teacher", {
      affiliationFacultyId: fa.id,
    }),
    teacher2 = await account("LECTURER", "teacher2", {
      affiliationFacultyId: fb.id,
    });
  const students = [];
  for (const [i, cl] of [ca, ca2, cb].entries()) {
    const a = await account("STUDENT", "student" + i);
    students.push(
      await row("students", {
        code: "SV" + i,
        fullName: a.fullName,
        accountId: a.id,
        classId: cl.id,
      }),
    );
  }
  const unlinked = await account("STUDENT", "mai", {
      affiliationFacultyId: fa.id,
      affiliationCohortId: c1.id,
    }),
    foreignAccount = await account("STUDENT", "minh", {
      affiliationFacultyId: fb.id,
      affiliationCohortId: c1.id,
    });
  const term = await row("terms", {
      code: "2026.1",
      name: "Kỳ 1",
      maxCredits: 30,
      passScore: 5,
    }),
    subject = await row("subjects", {
      code: "CSDL",
      name: "Cơ sở dữ liệu",
      credits: 3,
    });
  const base = {
    subjectId: subject.id,
    term: term.code,
    capacity: 40,
    status: "OPEN",
    startDate: "2026-01-05",
    endDate: "2026-03-30",
    weekday: 1,
    startTime: "08:00",
    endTime: "10:00",
  };
  const sa = await row("sections", {
      ...base,
      code: "SA",
      facultyId: fa.id,
      cohortId: c1.id,
      lecturerId: teacher.id,
    }),
    sb = await row("sections", {
      ...base,
      code: "SB",
      facultyId: fb.id,
      cohortId: c1.id,
      lecturerId: teacher2.id,
    });
  const ea = await row("enrollments", {
      sectionId: sa.id,
      studentId: students[0].id,
      status: "ACTIVE",
    }),
    eb = await row("enrollments", {
      sectionId: sb.id,
      studentId: students[2].id,
      status: "ACTIVE",
    });
  const scope = await row("staffScopes", {
    accountId: staff.id,
    scopeType: "FACULTY",
    facultyId: fa.id,
    cohortId: c1.id,
    active: true,
  });
  return {
    store,
    row,
    manager,
    staff,
    none,
    fa,
    fb,
    c1,
    c2,
    ca,
    ca2,
    cb,
    ma,
    mb,
    students,
    teacher,
    teacher2,
    unlinked,
    foreignAccount,
    term,
    subject,
    sa,
    sb,
    ea,
    eb,
    scope,
    view: () => staffStore(store, staff),
  };
}
const change = (f, more = {}) => ({
  requestId: uid(),
  version: f.staff.version,
  confirm: true,
  reason: "Phân công công việc",
  allSchools: false,
  scopes: [{ facultyId: f.fa.id, cohortId: f.c1.id }],
  ...more,
});
test("Phạm vi khoa/khóa: lọc danh mục, sinh viên, lớp học phần, tài khoản liên quan", async () => {
  const f = await fixture(),
    s = f.view();
  assert.deepEqual(
    (await s.list("classes")).map((r) => r.id),
    [f.ca.id],
  );
  assert.deepEqual(
    (await s.list("students")).map((r) => r.id),
    [f.students[0].id],
  );
  assert.deepEqual(
    (await s.list("sections")).map((r) => r.id),
    [f.sa.id],
  );
  assert.deepEqual(
    (await s.list("cohorts")).map((r) => r.id),
    [f.c1.id],
  );
  const accounts = await s.list("accounts");
  assert.ok(accounts.some((r) => r.id === f.unlinked.id));
  assert.ok(
    !accounts.some((r) => [f.foreignAccount.id, f.teacher2.id].includes(r.id)),
  );
  assert.deepEqual(
    (await suggestAccounts(s, "m")).map((r) => r.id),
    [f.unlinked.id],
  );
});
test("Nhân viên mới chưa giao phạm vi: không mặc định toàn trường; danh mục chung chỉ đọc", async () => {
  const f = await fixture(),
    s = staffStore(f.store, f.none);
  assert.equal((await s.list("students")).length, 0);
  assert.equal((await s.list("sections")).length, 0);
  assert.equal((await s.list("terms")).length, 1);
  await assert.rejects(
    s.insert("subjects", { id: uid(), code: "X", name: "X", credits: 3 }),
    { status: 403 },
  );
  await assert.rejects(s.insert("cohorts", { id: uid(), code: "K3" }), {
    status: 403,
  });
});
test("Toàn khoa xem nhiều khóa; toàn trường là quyền cấp rõ, giữ truy cập cũ", async () => {
  const f = await fixture();
  await f.store.update("staffScopes", f.scope.id, { cohortId: null }, 1);
  assert.equal((await f.view().list("students")).length, 2);
  await f.row("staffScopes", {
    accountId: f.staff.id,
    scopeType: "ALL",
    facultyId: null,
    cohortId: null,
    active: true,
  });
  assert.equal((await f.view().list("students")).length, 3);
});
test("Lớp chưa phân khoa hoặc có danh sách liên khoa ngoài phạm vi không trả roster một phần", async () => {
  const f = await fixture();
  await f.row("sections", {
    ...f.sa,
    id: uid(),
    code: "OLD",
    facultyId: null,
    cohortId: null,
  });
  assert.equal((await f.view().list("sections")).length, 1);
  await f.row("enrollments", {
    sectionId: f.sa.id,
    studentId: f.students[2].id,
    status: "ACTIVE",
  });
  assert.equal((await f.view().list("sections")).length, 0);
  assert.equal((await f.view().list("enrollments")).length, 0);
});
test("Các bảng con đều theo phạm vi: tài chính, điểm, thi, điểm danh và cấu hình", async () => {
  const f = await fixture();
  for (const [i, section] of [f.sa, f.sb].entries()) {
    const charge = await f.row("charges", {
      code: "HP" + i,
      studentId: f.students[i ? 2 : 0].id,
      term: f.term.code,
      title: "Học phí",
      amount: 100000,
      dueDate: "2026-12-01",
      status: "ISSUED",
      issuedAt: 1,
    });
    await f.row("receipts", {
      chargeId: charge.id,
      amount: 10000,
      status: "PENDING",
    });
    await f.row("adjustments", { chargeId: charge.id, delta: -1000 });
    await f.row("grades", {
      enrollmentId: i ? f.eb.id : f.ea.id,
      status: "DRAFT",
      score: 8,
    });
    await f.row("gradeSchemes", { sectionId: section.id, components: [] });
    await f.row("exams", { sectionId: section.id, status: "DRAFT" });
    await f.row("attendancePolicies", { sectionId: section.id });
    const session = await f.row("attendanceSessions", {
      sectionId: section.id,
      roster: [],
    });
    await f.row("attendanceMarks", {
      sessionId: session.id,
      studentId: f.students[i ? 2 : 0].id,
      enrollmentId: i ? f.eb.id : f.ea.id,
    });
  }
  for (const k of [
    "charges",
    "receipts",
    "adjustments",
    "grades",
    "gradeSchemes",
    "exams",
    "attendancePolicies",
    "attendanceSessions",
    "attendanceMarks",
  ])
    assert.equal((await f.view().list(k)).length, 1, k);
  assert.equal((await financeOverview(f.view(), f.staff)).charges.length, 1);
});
test("Ghi ngoài phạm vi không đổi dữ liệu hoặc ghi nhật ký; chuyển phạm vi bằng payload bị chặn", async () => {
  const f = await fixture();
  await assert.rejects(
    f.view().update("students", f.students[2].id, { fullName: "Sai" }, 1),
    { status: 404 },
  );
  await assert.rejects(
    f.view().update("students", f.students[0].id, { classId: f.cb.id }, 1),
    { status: 403 },
  );
  await assert.rejects(
    f.view().insert("classes", {
      id: uid(),
      majorId: f.mb.id,
      cohortId: f.c1.id,
      code: "BAD",
    }),
    { status: 403 },
  );
  assert.equal((await f.store.list("students"))[0].classId, f.ca.id);
  await assert.rejects(
    saveCharge(
      f.view(),
      {
        requestId: uid(),
        studentId: f.students[2].id,
        term: f.term.code,
        title: "HP",
        amount: 100000,
        dueDate: "2026-12-01",
      },
      f.staff,
    ),
  );
  assert.equal((await f.store.list("charges")).length, 0);
});
test("Tạo hồ sơ đúng tài khoản được phân công, email lọc dần; batch sai rollback", async () => {
  const f = await fixture(),
    input = {
      batchId: uid(),
      rows: [
        {
          accountId: f.unlinked.id,
          email: f.unlinked.email,
          code: "NEW",
          fullName: "Mai",
          classId: f.ca.id,
        },
      ],
    };
  const result = await importStudents(f.view(), input, f.staff);
  assert.equal(result.rows.length, 1);
  assert.equal((await importStudents(f.view(), input, f.staff)).replayed, true);
  const other = await f.row("accounts", {
    role: "STUDENT",
    active: true,
    email: "other@example.test",
    fullName: "Other",
    username: "other",
    affiliationFacultyId: f.fa.id,
    affiliationCohortId: f.c1.id,
  });
  const count = (await f.store.list("students")).length;
  await assert.rejects(
    importStudents(
      f.view(),
      {
        batchId: uid(),
        rows: [
          {
            accountId: other.id,
            code: "NEW2",
            fullName: "Other",
            classId: f.ca.id,
          },
          {
            accountId: f.foreignAccount.id,
            code: "BAD",
            fullName: "Bad",
            classId: f.ca.id,
          },
        ],
      },
      f.staff,
    ),
  );
  assert.equal((await f.store.list("students")).length, count);
});
test("Trùng mã ngoài phạm vi vẫn bị chặn nhưng không trả hồ sơ ngoài quyền", async () => {
  const f = await fixture();
  await assert.rejects(
    importStudents(
      f.view(),
      {
        batchId: uid(),
        rows: [
          {
            accountId: f.unlinked.id,
            code: f.students[2].code,
            fullName: "Mai",
            classId: f.ca.id,
          },
        ],
      },
      f.staff,
    ),
    { status: 409 },
  );
  assert.equal((await f.view().list("students")).length, 1);
});
test("Lịch lớp kiểm tra xung đột toàn trường mà không lộ lớp ngoài khoa", async () => {
  const f = await fixture();
  await f.store.update("sections", f.sb.id, { lecturerId: f.teacher.id }, 1);
  const input = {
    ...f.sa,
    code: "NEW",
    facultyId: f.fa.id,
    cohortId: f.c1.id,
    startTime: "09:00",
    endTime: "11:00",
  };
  // Xung đột chỉ còn ở khoa B; bỏ lớp A để tránh ca trùng dễ hơn.
  await f.store.update("sections", f.sa.id, { weekday: 2 }, 1);
  await assert.rejects(
    saveSection(f.view(), input, f.staff),
    /Giảng viên đã có lớp trùng lịch/,
  );
  assert.equal((await academicOverview(f.view(), f.staff)).sections.length, 1);
});
test("Lịch thi vẫn bắt trùng phòng ở khoa khác; không lộ danh sách khoa khác", async () => {
  const f = await fixture(),
    room = await f.row("rooms", {
      code: "P1",
      name: "Phòng 1",
      capacity: 50,
      active: true,
    });
  const base = {
    examDate: "2026-04-20",
    startTime: "13:00",
    endTime: "15:00",
    roomId: room.id,
    status: "DRAFT",
    invigilatorId: f.teacher.id,
    publishedAt: null,
  };
  const own = await f.row("exams", { ...base, sectionId: f.sa.id });
  await f.row("exams", {
    ...base,
    sectionId: f.sb.id,
    status: "PUBLISHED",
    publishedAt: 1,
    invigilatorId: f.teacher2.id,
  });
  await assert.rejects(
    reviewExam(f.view(), own.id, f.staff),
    /Phòng thi đã có lịch/,
  );
  assert.equal((await f.view().list("exams")).length, 1);
});
test("Chỉ Quản lý cấp phạm vi; thay phạm vi thu hồi phiên, giữ lịch sử và retry an toàn", async () => {
  const f = await fixture();
  await f.row("sessions", {
    tokenHash: "token",
    accountId: f.staff.id,
    accountVersion: 1,
  });
  await assert.rejects(accountAccess(f.store, f.staff.id, f.staff), {
    status: 403,
  });
  await assert.rejects(
    saveAccountAccess(f.store, f.staff.id, change(f), f.staff),
    { status: 403 },
  );
  const input = change(f, { scopes: [{ facultyId: f.fb.id, cohortId: null }] }),
    result = await saveAccountAccess(f.store, f.staff.id, input, f.manager);
  assert.equal(result.version, 2);
  assert.equal((await f.store.list("sessions")).length, 0);
  assert.equal(
    (await f.store.list("staffScopes")).filter((s) => s.active).length,
    1,
  );
  assert.ok((await f.store.list("staffScopes")).some((s) => !s.active));
  assert.equal(
    (await saveAccountAccess(f.store, f.staff.id, input, f.manager)).replayed,
    true,
  );
  await assert.rejects(f.view().list("students"), { status: 401 });
  const current = (await f.store.list("accounts")).find(
    (a) => a.id === f.staff.id,
  );
  assert.deepEqual(
    (await staffStore(f.store, current).list("students")).map((s) => s.id),
    [f.students[2].id],
  );
});
test("Danh sách phạm vi trùng/chồng, khoa/khóa sai, thiếu xác nhận/lý do không được ghi", async () => {
  const f = await fixture(),
    base = change(f);
  for (const patch of [
    { confirm: false },
    { reason: "" },
    { scopes: [{ facultyId: uid() }] },
    { allSchools: true },
    { scopes: [...base.scopes, ...base.scopes] },
    { scopes: [{ facultyId: f.fa.id, cohortId: null }, ...base.scopes] },
    { version: 8 },
  ])
    await assert.rejects(
      saveAccountAccess(f.store, f.staff.id, { ...base, ...patch }, f.manager),
    );
  assert.equal(
    (await f.store.list("accounts")).find((a) => a.id === f.staff.id).version,
    1,
  );
});
test("Phân khoa tài khoản chưa liên kết và Giảng viên có version/audit, không đổi hồ sơ đã có", async () => {
  const f = await fixture();
  const input = {
    requestId: uid(),
    version: 1,
    confirm: true,
    reason: "Chuyển phân công",
    facultyId: f.fb.id,
    cohortId: null,
  };
  await saveAccountAccess(f.store, f.unlinked.id, input, f.manager);
  assert.equal((await suggestAccounts(f.view(), "mai")).length, 0);
  await saveAccountAccess(
    f.store,
    f.teacher.id,
    { ...input, requestId: uid() },
    f.manager,
  );
  assert.equal(
    (await f.store.list("accounts")).find((a) => a.id === f.teacher.id)
      .affiliationFacultyId,
    f.fb.id,
  );
  assert.equal((await f.store.list("students"))[0].classId, f.ca.id);
});
test("Nhật ký/replay giới hạn đúng phiên phạm vi; không lộ log quản lý hoặc batch cũ", async () => {
  const f = await fixture(),
    s = f.view();
  await s.insert("events", {
    id: uid(),
    actorId: f.staff.id,
    entityId: f.students[0].id,
    action: "TEST",
    detail: { fullName: "An" },
  });
  await f.row("events", {
    actorId: f.manager.id,
    action: "PRIVATE",
    detail: { secret: "other" },
  });
  assert.equal((await f.view().list("events")).length, 1);
  assert.equal(
    (await f.view().list("events"))[0].detail.staffScopeToken,
    undefined,
  );
  await saveAccountAccess(
    f.store,
    f.staff.id,
    change(f, { scopes: [] }),
    f.manager,
  );
  const current = (await f.store.list("accounts")).find(
    (a) => a.id === f.staff.id,
  );
  assert.equal((await staffStore(f.store, current).list("events")).length, 0);
});
test("Audit lỗi rollback toàn bộ thay phạm vi, version và phiên", async () => {
  const f = await fixture();
  await f.row("sessions", { tokenHash: "token", accountId: f.staff.id });
  const original = f.store.insert;
  f.store.insert = async function (k, r) {
    if (k === "events") throw Error("audit failed");
    return original.call(this, k, r);
  };
  await assert.rejects(
    saveAccountAccess(f.store, f.staff.id, change(f), f.manager),
    /audit failed/,
  );
  assert.equal(
    (await f.store.list("accounts")).find((a) => a.id === f.staff.id).version,
    1,
  );
  assert.equal((await f.store.list("staffScopes"))[0].active, true);
  assert.equal((await f.store.list("sessions")).length, 1);
});
test("LizzChat dùng cùng phạm vi khi tìm hồ sơ/lớp, hỏi thiếu khoa/khóa, chặn danh mục chung", async () => {
  const f = await fixture(),
    ai = new AiService(f.store, { ready: false });
  const own = await ai.runTool("lookup_students", {}, f.staff, [], [], uid());
  assert.equal(own.total, 1);
  const foreign = await ai.runTool(
    "lookup_students",
    { query: "SV2" },
    f.staff,
    [],
    [],
    uid(),
  );
  assert.equal(foreign.total, 0);
  await assert.rejects(
    ai.runTool(
      "prepare_subject",
      { code: "X", name: "X", credits: 3 },
      f.staff,
      [],
      [],
      uid(),
    ),
    { status: 403 },
  );
  const need = await ai.runTool(
    "prepare_course_section",
    {},
    f.staff,
    [],
    [],
    uid(),
  );
  assert.ok(need.needsInformation.some((s) => s.includes("khoa")));
});
test("HTTP API/màn hình dùng scope thật: riêng tư, danh mục chỉ đọc, không tự cấp quyền", async (t) => {
  const f = await fixture(),
    origin = "http://localhost:3000",
    token = "d".repeat(64);
  await f.row("sessions", {
    tokenHash: tokenHash(token),
    accountId: f.staff.id,
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
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1",
    headers = {
      Cookie: "lizz_session=" + token,
      Origin: origin,
      "Content-Type": "application/json",
    };
  assert.equal((await fetch(base + "/access/me")).status, 401);
  const cap = await (await fetch(base + "/access/me", { headers })).json();
  assert.equal(cap.canManageShared, false);
  const students = await (await fetch(base + "/students", { headers })).json();
  assert.equal(students.rows.length, 1);
  assert.equal(
    (
      await fetch(base + "/accounts/" + f.staff.id + "/access", {
        method: "POST",
        headers,
        body: JSON.stringify(change(f, { allSchools: true, scopes: [] })),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/catalog/faculties", {
        method: "POST",
        headers,
        body: JSON.stringify({ code: "NEW", name: "Khoa mới" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(base + "/students/" + f.students[2].id, {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
      })
    ).status,
    404,
  );
});
test("MySQL scope/đơn vị/token dùng cột whitelist, boolean và bind; không nội suy mã khoa", async () => {
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
          scope_type: "FACULTY",
          faculty_id: "f",
          cohort_id: null,
          active: 0,
          version: 1,
        },
      ],
    ],
  });
  await s.insert("staffScopes", {
    id: uid(),
    accountId: uid(),
    scopeType: "FACULTY",
    facultyId: "x' OR 1=1",
    cohortId: null,
    active: true,
    version: 1,
  });
  assert.match(sql, /INSERT INTO staff_access_scopes/);
  assert.ok(!sql.includes("OR 1=1"));
  assert.ok(params.includes("x' OR 1=1"));
  assert.equal((await s.list("staffScopes"))[0].active, false);
  await s.update(
    "accounts",
    "a",
    { affiliationFacultyId: "f", affiliationCohortId: null },
    1,
  );
  assert.match(sql, /affiliation_faculty_id=\?/);
});

test("Điểm công bố của sinh viên trong phạm vi vẫn đủ khi học ở khoa khác; không lộ nháp/roster ngoài khoa", async () => {
  const { gradeOverview, gradeRoster } = await import(
    "../../backend/local/modules/grades/grade.service.js"
  );
  const f = await fixture();
  const e = await f.row("enrollments", {
    sectionId: f.sb.id,
    studentId: f.students[0].id,
    status: "ACTIVE",
  });
  await f.row("grades", { enrollmentId: e.id, score: 8, status: "DRAFT" });
  assert.equal((await gradeOverview(f.view(), f.staff)).rows.length, 0);
  const g = (await f.store.list("grades"))[0];
  await f.store.update(
    "grades",
    g.id,
    {
      status: "PUBLISHED",
      passScore: 5,
      publishedAt: 1,
      resultSnapshot: {
        subjectId: f.subject.id,
        subjectName: f.subject.name,
        subjectCode: f.subject.code,
        credits: 3,
        term: f.term.code,
        endDate: f.sb.endDate,
        letter: "B",
        points: 3,
        gpaPolicy: { repeatRule: "HIGHEST" },
      },
    },
    1,
  );
  const overview = await gradeOverview(f.view(), f.staff);
  assert.equal(overview.rows.length, 1);
  assert.equal(overview.summaries[0].cumulative.gpa4, 3);
  assert.equal(
    overview.sections.some((s) => s.id === f.sb.id),
    false,
  );
  await assert.rejects(gradeRoster(f.view(), f.sb.id, f.staff), {
    status: 404,
  });
});
test("LizzChat xác nhận dùng cùng scope; thu hồi phạm vi làm đề xuất cũ mất hiệu lực", async () => {
  const f = await fixture(),
    ai = new AiService(f.store, { ready: false }),
    drafts = [];
  const args = {
    rows: [
      {
        email: f.unlinked.email,
        code: "NEWAI",
        fullName: "Mai",
        classCode: f.ca.code,
      },
    ],
  };
  await ai.runTool(
    "prepare_student_profiles",
    args,
    f.staff,
    drafts,
    [],
    uid(),
  );
  assert.equal(drafts.length, 1);
  await f.store.insert("proposals", drafts[0]);
  await ai.decide(drafts[0].id, { version: 1, confirm: true }, f.staff);
  assert.ok((await f.store.list("students")).some((s) => s.code === "NEWAI"));
  const next = [];
  const another = await f.row("accounts", {
    role: "STUDENT",
    username: "new",
    email: "new@example.test",
    fullName: "New",
    active: true,
    affiliationFacultyId: f.fa.id,
    affiliationCohortId: f.c1.id,
  });
  await ai.runTool(
    "prepare_student_profiles",
    {
      rows: [
        {
          email: another.email,
          code: "NEXT",
          fullName: "New",
          classCode: f.ca.code,
        },
      ],
    },
    f.staff,
    next,
    [],
    uid(),
  );
  await f.store.insert("proposals", next[0]);
  await saveAccountAccess(
    f.store,
    f.staff.id,
    change(f, { scopes: [] }),
    f.manager,
  );
  await assert.rejects(
    ai.decide(next[0].id, { version: 1, confirm: true }, f.staff),
    { status: 401 },
  );
  assert.ok(!(await f.store.list("students")).some((s) => s.code === "NEXT"));
});
