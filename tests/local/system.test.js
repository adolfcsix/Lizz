import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { createAccount } from "../../backend/local/modules/accounts/account.service.js";
import { saveCatalog } from "../../backend/local/modules/catalog/catalog.service.js";
import {
  importStudents,
  updateStudent,
  suggestAccounts,
} from "../../backend/local/modules/students/student.service.js";
import { AuthService } from "../../backend/local/modules/auth/auth.service.js";
import { createApp } from "../../backend/local/app.js";
import { parseStudentCsv } from "../../frontend/app/features/student-csv.js";
import { accountIssues } from "../../shared/local-validation.js";

const password = "TestOnly-" + randomUUID();
const accountInput = (username, role = "STUDENT") => ({
  username,
  email: username + "@example.test",
  fullName:
    username === "mai"
      ? "Mai Lan"
      : username === "minh"
        ? "Minh Anh"
        : username,
  role,
  password,
  passwordConfirm: password,
});

async function fixture(capacity = 40) {
  const store = new MemoryStore();
  const admin = await createAccount(store, accountInput("admin", "MANAGER"));
  const mai = await createAccount(store, accountInput("mai"), admin);
  const minh = await createAccount(store, accountInput("minh"), admin);
  const faculty = await saveCatalog(
    store,
    "faculties",
    { code: "CNTT", name: "Công nghệ thông tin" },
    admin,
  );
  const cohort = await saveCatalog(
    store,
    "cohorts",
    { code: "K70", name: "Khóa 70", startYear: 2026 },
    admin,
  );
  const major = await saveCatalog(
    store,
    "majors",
    { code: "IT", name: "CNTT", facultyId: faculty.id },
    admin,
  );
  const classRow = await saveCatalog(
    store,
    "classes",
    {
      code: "IT01",
      name: "CNTT 01",
      majorId: major.id,
      cohortId: cohort.id,
      capacity,
    },
    admin,
  );
  return { store, admin, mai, minh, classRow, faculty, cohort, major };
}
const studentRow = (account, classRow) => ({
  accountId: account.id,
  email: account.email,
  fullName: account.fullName,
  code: "SV-" + account.username,
  classId: classRow.id,
});

test("Local accounts: hash only, case-insensitive duplicate and missing fields rejected", async () => {
  const { store, admin } = await fixture();
  const stored = (await store.list("accounts"))[0];
  assert.match(stored.passwordHash, /^scrypt\$/);
  assert.equal(JSON.stringify(admin).includes(password), false);
  assert.equal("passwordHash" in admin, false);
  await assert.rejects(
    createAccount(
      store,
      { ...accountInput("other"), email: "MAI@EXAMPLE.TEST" },
      admin,
    ),
    /đã tồn tại/,
  );
  assert.ok(accountIssues({}).length > 0);
});

test("Local auth: password, expiry, logout and password rotation invalidate sessions", async () => {
  const { store, admin } = await fixture();
  const auth = new AuthService(store);
  const first = await auth.login("ADMIN", password);
  const second = await auth.login(admin.email, password);
  assert.equal((await auth.current(first.token)).id, admin.id);
  assert.equal(
    (await store.list("sessions")).some((row) => row.tokenHash === first.token),
    false,
  );
  await auth.logout(first.token);
  assert.equal(await auth.current(first.token), null);
  const replacement = "Changed-" + randomUUID();
  await auth.changePassword(admin, {
    currentPassword: password,
    password: replacement,
    passwordConfirm: replacement,
  });
  assert.equal(await auth.current(second.token), null);
  await assert.rejects(auth.login(admin.username, password), /chưa đúng/);
  const third = await auth.login(admin.username, replacement);
  store.data.sessions[0].expiresAt = Date.now() - 1;
  assert.equal(await auth.current(third.token), null);
});

test("Local account suggestions narrow m to ma and exclude linked profiles", async () => {
  const { store, admin, mai, classRow } = await fixture();
  assert.equal((await suggestAccounts(store, "m")).length, 2);
  assert.equal((await suggestAccounts(store, "ma"))[0].id, mai.id);
  await importStudents(
    store,
    { batchId: randomUUID(), rows: [studentRow(mai, classRow)] },
    admin,
  );
  assert.equal((await suggestAccounts(store, "ma")).length, 0);
});

test("Local batch: invalid second row rolls back first, batch and audit", async () => {
  const { store, admin, mai, minh, classRow } = await fixture();
  const before = (await store.list("events")).length;
  await assert.rejects(
    importStudents(
      store,
      {
        batchId: randomUUID(),
        rows: [
          studentRow(mai, classRow),
          { ...studentRow(minh, classRow), email: "forged@example.test" },
        ],
      },
      admin,
    ),
    /Dòng 2/,
  );
  assert.equal((await store.list("students")).length, 0);
  assert.equal((await store.list("batches")).length, 0);
  assert.equal((await store.list("events")).length, before);
});

test("Local batch: concurrent final place allocated once, retries idempotent", async () => {
  const { store, admin, mai, minh, classRow } = await fixture(1);
  const batches = [mai, minh].map((account) => ({
    batchId: randomUUID(),
    rows: [studentRow(account, classRow)],
  }));
  const results = await Promise.allSettled(
    batches.map((input) => importStudents(store, input, admin)),
  );
  assert.equal(results.filter((row) => row.status === "fulfilled").length, 1);
  const index = results.findIndex((row) => row.status === "fulfilled");
  const replay = await importStudents(store, batches[index], admin);
  assert.equal(replay.replayed, true);
  assert.equal((await store.list("students")).length, 1);
  await assert.rejects(
    importStudents(store, { ...batches[index], rows: [] }, admin),
    /1 đến 50/,
  );
  await assert.rejects(
    importStudents(
      store,
      {
        ...batches[index],
        rows: [{ ...batches[index].rows[0], code: "OTHER" }],
      },
      admin,
    ),
    /dữ liệu khác/,
  );
});

test("Local catalog checks references, year uniqueness and prevents capacity shrink", async () => {
  const { store, admin, mai, classRow } = await fixture();
  await assert.rejects(
    saveCatalog(
      store,
      "majors",
      { code: "BAD", name: "Sai", facultyId: "missing" },
      admin,
    ),
    /khoa/,
  );
  await assert.rejects(
    saveCatalog(
      store,
      "cohorts",
      { code: "K71", name: "Khóa khác", startYear: 2026 },
      admin,
    ),
    /Mỗi năm/,
  );
  await importStudents(
    store,
    { batchId: randomUUID(), rows: [studentRow(mai, classRow)] },
    admin,
  );
  await assert.rejects(
    saveCatalog(
      store,
      "classes",
      { ...classRow, capacity: 0 },
      admin,
      classRow.id,
    ),
    /Sĩ số/,
  );
  await assert.rejects(
    saveCatalog(
      store,
      "classes",
      { ...classRow, name: "Mới", version: 0 },
      admin,
      classRow.id,
    ),
    /đã thay đổi/,
  );
});

test("Local profile update preserves identity, checks version, records before/after", async () => {
  const { store, admin, mai, minh, classRow } = await fixture();
  const {
    rows: [profile],
  } = await importStudents(
    store,
    { batchId: randomUUID(), rows: [studentRow(mai, classRow)] },
    admin,
  );
  await assert.rejects(
    updateStudent(store, profile.id, { ...profile, accountId: minh.id }, admin),
    /Không đổi tài khoản/,
  );
  const updated = await updateStudent(
    store,
    profile.id,
    { ...profile, fullName: "Mai Lan Nguyễn" },
    admin,
  );
  assert.equal(updated.id, profile.id);
  await assert.rejects(
    updateStudent(store, profile.id, profile, admin),
    /đã thay đổi/,
  );
  const audit = (await store.list("events")).at(-1);
  assert.equal(audit.detail.before.fullName, "Mai Lan");
  assert.equal(audit.detail.after.fullName, "Mai Lan Nguyễn");
});

test("Local HTTP: secure boundary, role checks, own profiles and no private files", async (t) => {
  const { store, admin, mai, classRow } = await fixture();
  const teacher = await createAccount(
    store,
    accountInput("teacher", "LECTURER"),
    admin,
  );
  await importStudents(
    store,
    { batchId: randomUUID(), rows: [studentRow(mai, classRow)] },
    admin,
  );
  const config = { origin: "http://localhost:3000" };
  const server = createApp({ store, config, mode: "demo" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = (path, options = {}) => fetch(base + path, options);
  assert.equal((await call("/api/v1/accounts")).status, 401);
  const [legacyLogo, currentLogo] = await Promise.all([
    call("/brand.png"),
    call("/assets/brand/logo.png"),
  ]);
  assert.equal(legacyLogo.status, 200);
  assert.equal(currentLogo.status, 200);
  assert.deepEqual(
    new Uint8Array(await legacyLogo.arrayBuffer()),
    new Uint8Array(await currentLogo.arrayBuffer()),
  );
  assert.equal((await call("/.env")).status, 404);
  assert.equal((await call("/backend/local/config/env.js")).status, 404);
  assert.match(
    (await call("/")).headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  const establishedPasswords = new Map();
  const login = async (username) => {
    const headers = {
      Origin: config.origin,
      "Content-Type": "application/json",
    };
    let response = await call("/api/v1/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({
        identifier: username,
        password: establishedPasswords.get(username) || password,
      }),
    });
    if ((await response.clone().json()).account?.mustChangePassword) {
      const replacement = "Personal-" + randomUUID();
      const changed = await call("/api/v1/auth/password", {
        method: "POST",
        headers: {
          ...headers,
          Cookie: response.headers.get("set-cookie").split(";")[0],
        },
        body: JSON.stringify({
          currentPassword: password,
          password: replacement,
          passwordConfirm: replacement,
        }),
      });
      assert.equal(changed.status, 200);
      establishedPasswords.set(username, replacement);
      response = await call("/api/v1/auth/login", {
        method: "POST",
        headers,
        body: JSON.stringify({ identifier: username, password: replacement }),
      });
    }
    return response;
  };
  const response = await login(mai.username);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict/);
  const headers = {
    Cookie: cookie.split(";")[0],
    Origin: config.origin,
    "Content-Type": "application/json",
  };
  assert.equal((await call("/api/v1/accounts", { headers })).status, 403);
  assert.equal(
    (await call("/api/v1/students/account-options?q=m", { headers })).status,
    403,
  );
  const list = await (await call("/api/v1/students", { headers })).json();
  assert.equal(list.rows.length, 1);
  assert.equal(list.rows[0].accountId, mai.id);
  assert.equal(
    (
      await call("/api/v1/students/batches", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/api/v1/auth/logout", {
        method: "POST",
        headers: { ...headers, Origin: "https://bad.test" },
        body: "{}",
      })
    ).status,
    403,
  );
  const teacherCookie = (await login(teacher.username)).headers
    .get("set-cookie")
    .split(";")[0];
  assert.equal(
    (await call("/api/v1/students", { headers: { Cookie: teacherCookie } }))
      .status,
    403,
  );
  const adminCookie = (await login(admin.username)).headers
    .get("set-cookie")
    .split(";")[0];
  const created = await call("/api/v1/catalog/faculties", {
    method: "POST",
    headers: { ...headers, Cookie: adminCookie },
    body: JSON.stringify({ code: "KT", name: "Kinh tế" }),
  });
  assert.equal(created.status, 201);
});

test("CSV parser preserves quoted Vietnamese names and rejects malformed rows", () => {
  const rows = parseStudentCsv(
    'email,code,name,class\r\nmai@example.test,SV1,"Nguyễn, Mai",IT01',
  );
  assert.equal(rows[0].fullName, "Nguyễn, Mai");
  assert.throws(() => parseStudentCsv("x,y,z"), /4|cần/);
  assert.throws(() => parseStudentCsv('"x,y,z'), /nháy/);
});
