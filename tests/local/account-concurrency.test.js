import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { createAccount, setAccountActive } from "../../backend/local/modules/accounts/account.service.js";

async function fixture() {
  const store = new MemoryStore(), accounts = [];
  for (const role of ["MANAGER", "MANAGER", "STUDENT"]) {
    const id = randomUUID(), row = { id, username: "u" + accounts.length, email: id + "@example.test", fullName: "Tài khoản kiểm thử", role, active: true, version: 1 };
    await store.insert("accounts", row); accounts.push(row);
  }
  return { store, a: accounts[0], b: accounts[1], student: accounts[2] };
}
const input = () => { const name = "u" + randomUUID().replaceAll("-", "").slice(0, 10); return { username: name, email: name + "@example.test", fullName: "Người kiểm thử", role: "STUDENT", password: "Test-Only-Password-123", passwordConfirm: "Test-Only-Password-123" }; };
test("Account concurrency: managers cannot disable each other into a system without an active manager", async () => {
  const f = await fixture(), results = await Promise.allSettled([
    setAccountActive(f.store, f.b.id, { active: false, version: 1 }, f.a),
    setAccountActive(f.store, f.a.id, { active: false, version: 1 }, f.b),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.list("accounts")).filter((a) => a.role === "MANAGER" && a.active).length, 1);
});
test("Account concurrency: revoked manager cannot create an account after password hashing has started", async () => {
  const f = await fixture(), pending = createAccount(f.store, input(), f.a);
  await f.store.update("accounts", f.a.id, { active: false }, 1);
  await assert.rejects(pending, (e) => e.status === 401);
  assert.equal((await f.store.list("accounts")).length, 3);
});
test("Account concurrency: disable revokes target sessions; stale version and self-disable are rejected", async () => {
  const f = await fixture();
  await f.store.insert("sessions", { tokenHash: "a".repeat(64), accountId: f.student.id });
  await setAccountActive(f.store, f.student.id, { active: false, version: 1 }, f.a);
  assert.equal((await f.store.list("sessions")).length, 0);
  await assert.rejects(setAccountActive(f.store, f.student.id, { active: true, version: 1 }, f.a), (e) => e.status === 409);
  await assert.rejects(setAccountActive(f.store, f.a.id, { active: false, version: 1 }, f.a), (e) => e.status === 400);
});
test("Account concurrency: audit failure restores account state and sessions", async () => {
  const f = await fixture(); await f.store.insert("sessions", { tokenHash: "a".repeat(64), accountId: f.student.id });
  const original = f.store.insert;
  f.store.insert = async function (kind, row) { if (kind === "events") throw Error("audit unavailable"); return original.call(this, kind, row); };
  await assert.rejects(setAccountActive(f.store, f.student.id, { active: false, version: 1 }, f.a), /audit unavailable/);
  assert.equal((await f.store.list("accounts")).find((a) => a.id === f.student.id).active, true);
  assert.equal((await f.store.list("sessions")).length, 1);
});
test("Account concurrency: non-manager cannot create accounts through the service and first bootstrap must be manager", async () => {
  const f = await fixture();
  await assert.rejects(createAccount(f.store, input(), f.student), (e) => e.status === 403);
  const empty = new MemoryStore(); await assert.rejects(createAccount(empty, input()), (e) => e.status === 403);
  assert.equal((await empty.list("accounts")).length, 0);
});
