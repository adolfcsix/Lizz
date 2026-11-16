import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import {
  createAccount,
  publicAccount,
  resetAccountPassword,
} from "../../backend/local/modules/accounts/account.service.js";
import { AuthService } from "../../backend/local/modules/auth/auth.service.js";
import {
  hashPassword,
  verifyPassword,
  tokenHash,
} from "../../backend/local/core/password.js";
import { createApp } from "../../backend/local/app.js";
const password = "Issued-" + randomUUID(),
  replacement = "Personal-" + randomUUID();
const passwordHash = await hashPassword(password);
const status = (n) => (e) => e.status === n;
function fixture() {
  const store = new MemoryStore();
  const account = (username, role) => ({
    id: randomUUID(),
    username,
    email: username + "@example.test",
    fullName: username,
    role,
    active: true,
    version: 1,
    passwordHash,
  });
  const manager = account("manager", "MANAGER"),
    student = account("student", "STUDENT"),
    lecturer = account("lecturer", "LECTURER"),
    staff = account("staff", "STAFF");
  store.data.accounts = [manager, student, lecturer, staff];
  store.data.students = [
    { id: randomUUID(), code: "SV2026001", accountId: student.id },
  ];
  return {
    store,
    manager,
    student,
    lecturer,
    staff,
    auth: new AuthService(store),
  };
}
const resetInput = (version = 1) => ({
  password: replacement,
  passwordConfirm: replacement,
  version,
  reason: "Xác minh trực tiếp người nhận",
  confirm: true,
});
test("Auth: username/email/MSSV aliases preserve server role; legacy accounts remain usable", async () => {
  const { auth, student, lecturer, staff, manager } = fixture();
  for (const account of [student, lecturer, staff, manager]) {
    const result = await auth.login(
      "  " + account.email.toUpperCase() + "  ",
      password,
    );
    assert.equal(result.account.role, account.role);
    assert.equal(result.account.mustChangePassword, false);
    assert.equal(result.account.passwordHash, undefined);
  }
  assert.equal(
    (await auth.login(" sv2026001 ", password)).account.id,
    student.id,
  );
});
test("Auth: ambiguous identifier fails instead of selecting another account", async () => {
  const { store, auth } = fixture();
  store.data.accounts[2].username = "SV2026001";
  await assert.rejects(auth.login("SV2026001", password), status(401));
  assert.equal(store.data.sessions.length, 0);
});
test("Auth: orphan and non-student profile links cannot become login aliases", async () => {
  const { store, auth, lecturer } = fixture();
  store.data.students[0].accountId = "missing";
  await assert.rejects(auth.login("SV2026001", password), status(401));
  store.data.students[0].accountId = lecturer.id;
  await assert.rejects(auth.login("SV2026001", password), status(401));
});
test("Auth: whitespace, email and MSSV share a five-attempt limit", async () => {
  const { auth, student } = fixture();
  for (const id of [
    student.username,
    student.email,
    " SV2026001 ",
    student.username.toUpperCase(),
    student.email,
  ])
    await assert.rejects(auth.login(id, "incorrect"), status(401));
  await assert.rejects(auth.login("SV2026001", password), status(429));
});
test("Auth: stale identity/password cannot create a session after verification", async () => {
  const { store, auth } = fixture();
  const transaction = store.transaction;
  store.transaction = function (work) {
    this.data.accounts[1].version++;
    return transaction.call(this, work);
  };
  await assert.rejects(auth.login("student", password), status(401));
  assert.equal(store.data.sessions.length, 0);
});
test("Account creation: issued passwords require setup, bootstrap admin does not", async () => {
  const store = new MemoryStore();
  const input = {
    username: "initial",
    fullName: "Quản lý",
    email: "initial@example.test",
    role: "MANAGER",
    password,
    passwordConfirm: password,
  };
  const manager = await createAccount(store, input);
  assert.equal(manager.mustChangePassword, false);
  const student = await createAccount(
    store,
    {
      ...input,
      username: "issued",
      email: "issued@example.test",
      role: "STUDENT",
    },
    manager,
  );
  assert.equal(student.mustChangePassword, true);
  assert.equal(publicAccount(store.data.accounts[1]).passwordHash, undefined);
});
test("Password reset: role, self, confirmation, reason, version and locked account are checked", async () => {
  const { store, manager, student, staff } = fixture();
  await assert.rejects(
    resetAccountPassword(store, student.id, resetInput(), staff),
    status(403),
  );
  await assert.rejects(
    resetAccountPassword(store, manager.id, resetInput(), manager),
    /của bạn/,
  );
  await assert.rejects(
    resetAccountPassword(
      store,
      student.id,
      { ...resetInput(), confirm: false },
      manager,
    ),
    /Xác nhận/,
  );
  await assert.rejects(
    resetAccountPassword(
      store,
      student.id,
      { ...resetInput(), passwordConfirm: "other" },
      manager,
    ),
    /hai lần/,
  );
  await assert.rejects(
    resetAccountPassword(store, student.id, resetInput(2), manager),
    status(409),
  );
  store.data.accounts[1].active = false;
  await assert.rejects(
    resetAccountPassword(store, student.id, resetInput(), manager),
    status(409),
  );
  assert.equal(store.data.events.length, 0);
});
test("Password reset: stale manager cannot reset another account", async () => {
  const { store, manager, student } = fixture();
  store.data.accounts[0] = { ...manager, version: 2 };
  await assert.rejects(
    resetAccountPassword(store, student.id, resetInput(), manager),
    status(403),
  );
});
test("Password reset: revoke all sessions, preserve identity/profile, hash and audit without secrets", async () => {
  const { store, auth, manager, student } = fixture();
  const one = await auth.login(student.username, password),
    two = await auth.login(student.email, password);
  const profiles = structuredClone(store.data.students);
  await resetAccountPassword(store, student.id, resetInput(), manager);
  assert.equal(await auth.current(one.token), null);
  assert.equal(await auth.current(two.token), null);
  assert.deepEqual(store.data.students, profiles);
  assert.equal(store.data.accounts[1].role, "STUDENT");
  assert.equal(store.data.accounts[1].mustChangePassword, true);
  assert.ok(
    await verifyPassword(replacement, store.data.accounts[1].passwordHash),
  );
  assert.ok(!JSON.stringify(store.data.events).includes(replacement));
  await assert.rejects(auth.login(student.username, password), status(401));
  assert.equal(
    (await auth.login(student.username, replacement)).account
      .mustChangePassword,
    true,
  );
});
test("Password reset: audit failure rolls back password, version and sessions", async () => {
  const { store, auth, manager, student } = fixture();
  const session = await auth.login(student.username, password);
  const before = structuredClone(store.data);
  const insert = store.insert;
  store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(
    resetAccountPassword(store, student.id, resetInput(), manager),
    /audit/,
  );
  assert.deepEqual(store.data, before);
  assert.equal((await auth.current(session.token)).id, student.id);
});
test("Password setup: different password and fresh actor required, completion revokes session", async () => {
  const { store, auth, student } = fixture();
  store.data.accounts[1].mustChangePassword = true;
  const login = await auth.login(student.username, password);
  await assert.rejects(
    auth.changePassword(login.account, {
      currentPassword: password,
      password,
      passwordConfirm: password,
    }),
    /khác/,
  );
  await assert.rejects(
    auth.changePassword(
      { ...login.account, version: 9 },
      {
        currentPassword: password,
        password: replacement,
        passwordConfirm: replacement,
      },
    ),
    /chưa đúng/,
  );
  await auth.changePassword(login.account, {
    currentPassword: password,
    password: replacement,
    passwordConfirm: replacement,
  });
  assert.equal(await auth.current(login.token), null);
  assert.equal(
    (await auth.login(student.username, replacement)).account
      .mustChangePassword,
    false,
  );
  assert.equal(store.data.events.at(-1).action, "ACCOUNT_PASSWORD_CHANGED");
});
test("HTTP: all four roles must set password before business, AI and account APIs", async (t) => {
  const { store } = fixture();
  for (const account of store.data.accounts) account.mustChangePassword = true;
  const config = { origin: "http://localhost:3000" },
    server = createApp({ store, config, mode: "demo" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  for (const account of store.data.accounts) {
    const login = await fetch(base + "/api/v1/auth/login", {
      method: "POST",
      headers: { Origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        identifier: account.username,
        password,
        role: "MANAGER",
        audience: "manager",
      }),
    });
    assert.equal(login.status, 200);
    const payload = await login.json();
    assert.equal(payload.account.role, account.role);
    const headers = {
      Cookie: login.headers.get("set-cookie").split(";")[0],
      Origin: config.origin,
      "Content-Type": "application/json",
    };
    for (const path of [
      "/students",
      "/accounts",
      "/access/me",
      "/notifications",
      "/ai/status",
    ])
      assert.equal(
        (await fetch(base + "/api/v1" + path, { headers })).status,
        403,
        path,
      );
    assert.equal(
      (await fetch(base + "/api/v1/auth/me", { headers })).status,
      200,
    );
    const changed = await fetch(base + "/api/v1/auth/password", {
      method: "POST",
      headers,
      body: JSON.stringify({
        currentPassword: password,
        password: replacement,
        passwordConfirm: replacement,
      }),
    });
    assert.equal(changed.status, 200);
    assert.match(changed.headers.get("set-cookie"), /Max-Age=0/);
    assert.equal(
      (await fetch(base + "/api/v1/auth/me", { headers })).status,
      401,
    );
  }
});
test("MySQL adapter: password flag is decoded and bound through declared columns", async () => {
  const calls = [];
  const store = new MysqlStore({
    query: async (sql) => {
      calls.push({ sql });
      return [[{ id: "a", must_change_password: 1 }]];
    },
    execute: async (sql, values) => {
      calls.push({ sql, values });
      return sql.startsWith("SELECT")
        ? [[{ id: "a", must_change_password: 1 }]]
        : [{ affectedRows: 1 }];
    },
  });
  assert.equal((await store.list("accounts"))[0].mustChangePassword, true);
  await store.update(
    "accounts",
    "a",
    { mustChangePassword: false, passwordHash: "hashed" },
    1,
  );
  assert.match(calls[1].sql, /must_change_password=\?/);
  assert.deepEqual(calls[1].values, [false, "hashed", "a", 1]);
});

test("HTTP reset: only manager can issue; old sessions fail, new password requires setup", async (t) => {
  const { store, manager, student, staff, lecturer } = fixture(),
    config = { origin: "http://localhost:3000" };
  const headersFor = (account) => {
    const token = randomUUID().replaceAll("-", "").repeat(2);
    store.data.sessions.push({
      tokenHash: tokenHash(token),
      accountId: account.id,
      accountVersion: account.version,
      expiresAt: Date.now() + 60000,
    });
    return {
      Cookie: "lizz_session=" + token,
      Origin: config.origin,
      "Content-Type": "application/json",
    };
  };
  const studentHeaders = headersFor(student),
    managerHeaders = headersFor(manager),
    staffHeaders = headersFor(staff),
    lecturerHeaders = headersFor(lecturer);
  const server = createApp({ store, config, mode: "demo" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port + "/api/v1";
  const reset = (headers, id = student.id, input = resetInput()) =>
    fetch(base + "/accounts/" + id + "/password-reset", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
  for (const headers of [studentHeaders, staffHeaders, lecturerHeaders])
    assert.equal((await reset(headers)).status, 403);
  assert.equal((await reset(managerHeaders, manager.id)).status, 400);
  assert.equal(
    (await reset(managerHeaders, student.id, resetInput(2))).status,
    409,
  );
  assert.equal((await reset(managerHeaders)).status, 200);
  assert.equal(
    (await fetch(base + "/auth/me", { headers: studentHeaders })).status,
    401,
  );
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { Origin: config.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: "SV2026001", password: replacement }),
  });
  assert.equal(login.status, 200);
  const account = (await login.json()).account;
  assert.equal(account.role, "STUDENT");
  assert.equal(account.mustChangePassword, true);
  const headers = {
    ...studentHeaders,
    Cookie: login.headers.get("set-cookie").split(";")[0],
  };
  assert.equal((await fetch(base + "/students", { headers })).status, 403);
  assert.equal(store.data.events.at(-1).action, "ACCOUNT_PASSWORD_RESET");
});
test("Password change: audit failure restores original password, setup requirement and sessions", async () => {
  const { store, auth, student } = fixture();
  store.data.accounts[1].mustChangePassword = true;
  const login = await auth.login(student.username, password),
    before = structuredClone(store.data),
    insert = store.insert;
  store.insert = async function (kind, row) {
    if (kind === "events") throw Error("audit unavailable");
    return insert.call(this, kind, row);
  };
  await assert.rejects(
    auth.changePassword(login.account, {
      currentPassword: password,
      password: replacement,
      passwordConfirm: replacement,
    }),
    /audit/,
  );
  assert.deepEqual(store.data, before);
  assert.equal((await auth.current(login.token)).mustChangePassword, true);
});
test("Auth: a student code equal to own username does not create a false ambiguity", async () => {
  const { store, auth, student } = fixture();
  store.data.students[0].code = student.username;
  assert.equal(
    (await auth.login(student.username, password)).account.id,
    student.id,
  );
});

test("Auth: concurrent requests reserve attempts before hashing", async () => {
  const { auth, student } = fixture();
  const results = await Promise.allSettled(
    Array.from({ length: 6 }, () => auth.login(student.username, "incorrect")),
  );
  assert.equal(
    results.filter(
      (row) => row.status === "rejected" && row.reason.status === 401,
    ).length,
    5,
  );
  assert.equal(
    results.filter(
      (row) => row.status === "rejected" && row.reason.status === 429,
    ).length,
    1,
  );
  await assert.rejects(auth.login(student.email, password), status(429));
});
