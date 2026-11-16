import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID, randomBytes } from "node:crypto";
import { once } from "node:events";
import { serviceFixture } from "./student-services-fixture.js";
import {
  studentDocument,
  changePortrait,
  readPortrait,
  portraitHistory,
  inspectPortrait,
} from "../../backend/local/modules/students/profile-document.service.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
const jpeg = await readFile(
  new URL("../fixtures/portrait.jpg", import.meta.url),
);
const content = jpeg.toString("base64");
async function fixture() {
  const f = await serviceFixture();
  await f.store.insert("staffScopes", {
    id: randomUUID(),
    accountId: f.staff.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  });
  f.id = f.profiles[0].id;
  f.input = (extra = {}) => ({
    requestId: randomUUID(),
    version: 1,
    action: "REPLACE",
    reason: "Đối chiếu ảnh hồ sơ",
    confirm: true,
    photoContent: content,
    ...extra,
  });
  f.change = (input = f.input(), actor = f.manager) =>
    changePortrait(f.store, actor, f.id, input);
  return f;
}
const status = (value) => (error) => error.status === value;
test("Student portrait: save/read/replace/remove retains immutable history and no binary in public profile", async () => {
  const f = await fixture();
  const empty = await studentDocument(f.store, f.student, f.id);
  assert.equal(empty.student.photoUrl, null);
  const first = await f.change(undefined, f.staff);
  assert.equal(first.version, 2);
  assert.deepEqual(
    await readPortrait(f.store, f.student, f.id, first.photoId),
    jpeg,
  );
  const doc = await studentDocument(f.store, f.student, f.id);
  assert.equal(doc.student.photoId, first.photoId);
  assert.ok(!JSON.stringify(doc).includes(content));
  const changed = Buffer.from(jpeg);
  changed[changed.length - 3] ^= 1;
  const second = await f.change(
    f.input({ version: 2, photoContent: changed.toString("base64") }),
  );
  await assert.rejects(
    readPortrait(f.store, f.student, f.id, first.photoId),
    status(404),
  );
  const removed = await f.change(
    f.input({ version: 3, action: "REMOVE", photoContent: null }),
  );
  assert.equal(removed.photoId, null);
  assert.equal(removed.version, 4);
  assert.equal((await f.store.list("studentPhotos")).length, 3);
  assert.equal((await f.store.list("studentPhotos"))[0].photoContent, content);
  assert.ok(second.photoId);
  const history = await portraitHistory(f.store, f.staff, f.id);
  assert.equal(history.rows.length, 3);
  assert.ok(!JSON.stringify(history).includes(content));
  assert.ok(!JSON.stringify(await f.store.list("events")).includes(content));
});
test("Student portrait: own access only; lecturer and students cannot change photos or read office history", async () => {
  const f = await fixture(),
    result = await f.change();
  for (const a of [f.student, f.student2, f.teacher]) {
    await assert.rejects(f.change(f.input(), a), status(403));
    await assert.rejects(portraitHistory(f.store, a, f.id), status(403));
  }
  await assert.rejects(studentDocument(f.store, f.student2, f.id), status(404));
  await assert.rejects(
    readPortrait(f.store, f.student2, f.id, result.photoId),
    status(404),
  );
  await assert.rejects(studentDocument(f.store, f.teacher, f.id), status(403));
  await assert.rejects(
    readPortrait(f.store, f.teacher, f.id, result.photoId),
    status(403),
  );
});
test("Student portrait: staff scope is checked in service entry, then rechecked after grant revoked", async () => {
  const f = await fixture();
  const facultyId = randomUUID(),
    majorId = randomUUID(),
    cohortId = randomUUID();
  await f.store.insert("majors", { id: majorId, facultyId, version: 1 });
  await f.store.insert("faculties", {
    id: facultyId,
    name: "Khoa",
    version: 1,
  });
  await f.store.insert("classes", {
    id: f.profiles[0].classId,
    majorId,
    cohortId,
    version: 1,
  });
  const grant = (await f.store.list("staffScopes"))[0];
  await f.store.update(
    "staffScopes",
    grant.id,
    { scopeType: "FACULTY", facultyId, cohortId: null },
    1,
  );
  const photo = await f.change(undefined, f.staff);
  await assert.rejects(
    studentDocument(f.store, f.staff, f.profiles[1].id),
    status(404),
  );
  await f.store.update("staffScopes", grant.id, { active: false }, 2);
  await assert.rejects(
    readPortrait(f.store, f.staff, f.id, photo.photoId),
    status(404),
  );
  await assert.rejects(
    f.change(
      f.input({ version: 2, action: "REMOVE", photoContent: null }),
      f.staff,
    ),
    status(404),
  );
});
test("Student portrait: confirmation, reason, version, actual JPEG, bounds and action required; no partial writes", async () => {
  const f = await fixture();
  for (const extra of [
    { confirm: false },
    { reason: "" },
    { version: "1" },
    { action: "DELETE" },
    { requestId: "x" },
    { action: "REMOVE" },
    { photoContent: "PHN2Zz48L3N2Zz4=" },
    { photoContent: content + "=" },
    { photoContent: Buffer.alloc(96001).toString("base64") },
  ])
    await assert.rejects(f.change(f.input(extra)));
  assert.equal((await f.store.list("studentPhotos")).length, 0);
  assert.equal((await f.store.list("students"))[0].version, 1);
  const tiny = Buffer.from(jpeg);
  for (let i = 0; i < tiny.length - 7; i++)
    if (tiny[i] === 255 && tiny[i + 1] === 192) {
      tiny.writeUInt16BE(1, i + 5);
      break;
    }
  assert.throws(() => inspectPortrait(tiny.toString("base64")));
  assert.throws(() => inspectPortrait(jpeg.subarray(0, -1).toString("base64")));
});
test("Student portrait: retry returns current state without restoring older image; request reuse and stale updates rejected", async () => {
  const f = await fixture(),
    input = f.input(),
    first = await f.change(input);
  assert.equal((await f.change(input)).replayed, true);
  await assert.rejects(f.change({ ...input, reason: "Khác" }), status(409));
  await assert.rejects(f.change(f.input()), status(409));
  await f.change(f.input({ version: 2, action: "REMOVE", photoContent: null }));
  const replay = await f.change(input);
  assert.equal(replay.photoId, null);
  assert.equal(replay.version, 3);
  assert.equal((await f.store.list("studentPhotos")).length, 2);
  assert.ok(first.photoId);
});
test("Student portrait: simultaneous writes have one winner and rollback with audit failure", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.change(), f.change()]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("studentPhotos")).length, 1);
  const g = await fixture(),
    insert = g.store.insert;
  g.store.insert = async function (kind, record) {
    if (kind === "events") throw Error("audit unavailable");
    return insert.call(this, kind, record);
  };
  await assert.rejects(g.change(), /audit unavailable/);
  assert.equal((await g.store.list("studentPhotos")).length, 0);
  assert.equal((await g.store.list("students"))[0].version, 1);
});
test("Student portrait: revoked actor and unchanged content do not create another photo revision", async () => {
  const f = await fixture();
  await f.change();
  await assert.rejects(f.change(f.input({ version: 2 })), status(409));
  await f.store.update("accounts", f.manager.id, { active: false }, 1);
  await assert.rejects(
    f.change(f.input({ version: 2, action: "REMOVE", photoContent: null })),
    status(401),
  );
  assert.equal((await f.store.list("studentPhotos")).length, 1);
});
test("Student portrait SQL: payload is bound, photo table immutable, student photo pointer versioned", async () => {
  const calls = [],
    sql = new MysqlStore({
      execute: async (query, args) => {
        calls.push({ query, args });
        return [{ affectedRows: 1 }];
      },
    });
  await sql.insert("studentPhotos", {
    id: randomUUID(),
    studentId: randomUUID(),
    photoContent: content,
    width: 120,
    height: 160,
    byteLength: jpeg.length,
    priorPhotoId: null,
  });
  assert.ok(calls[0].query.startsWith("INSERT INTO student_photo_changes"));
  assert.ok(!calls[0].query.includes(content));
  assert.ok(calls[0].args.includes(content));
  await sql.update("students", "id", { photoId: "new" }, 2);
  assert.match(calls[1].query, /photo_id=\?.*version=version\+1.*version=\?/);
  await assert.rejects(
    sql.update("studentPhotos", "id", { photoContent: "changed" }, 1),
  );
});
test("Student portrait HTTP: authenticated image bytes, ownership and four-role endpoints", async () => {
  const f = await fixture(),
    server = createApp({
      store: f.store,
      config: { origin: "http://localhost", ai: {} },
      mode: "demo",
      aiProvider: {},
    });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`,
    cookies = {};
  try {
    for (const key of ["manager", "staff", "student", "student2", "teacher"]) {
      const token = randomBytes(32).toString("hex");
      cookies[key] = `lizz_session=${token}`;
      await f.store.insert("sessions", {
        tokenHash: tokenHash(token),
        accountId: f[key].id,
        accountVersion: 1,
        expiresAt: Date.now() + 60000,
      });
    }
    const response = await fetch(`${base}/api/v1/students/${f.id}/photo`, {
      method: "POST",
      headers: {
        Cookie: cookies.staff,
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(f.input()),
    });
    assert.equal(response.status, 200);
    const saved = await response.json();
    for (const [key, expected] of [
      ["manager", 200],
      ["staff", 200],
      ["student", 200],
      ["student2", 404],
      ["teacher", 403],
    ]) {
      const doc = await fetch(`${base}/api/v1/students/${f.id}/profile`, {
        headers: { Cookie: cookies[key] },
      });
      assert.equal(doc.status, expected, key);
      const image = await fetch(base + saved.photoUrl, {
        headers: { Cookie: cookies[key] },
      });
      assert.equal(image.status, expected, key);
      if (expected === 200) {
        assert.equal(image.headers.get("content-type"), "image/jpeg");
        assert.equal(image.headers.get("cache-control"), "private, no-store");
        assert.equal(image.headers.get("x-content-type-options"), "nosniff");
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), jpeg);
      }
    }
    assert.equal((await fetch(base + saved.photoUrl)).status, 401);
    assert.equal(
      (
        await fetch(`${base}/api/v1/students/${f.id}/photo`, {
          method: "POST",
          headers: {
            Cookie: cookies.student,
            Origin: "http://localhost",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(f.input()),
        })
      ).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
