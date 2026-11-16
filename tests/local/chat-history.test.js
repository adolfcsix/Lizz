import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";

for (const role of ["MANAGER", "STAFF", "LECTURER", "STUDENT"])
  test(`Lịch sử ${role}: chỉ tài khoản và phiên quyền hiện tại, không lộ dữ liệu nội bộ`, async () => {
    const store = new MemoryStore(),
      actor = { id: randomUUID(), role, active: true, version: 2 };
    if (role === "STAFF") {
      await store.insert("accounts", actor);
      await store.insert("staffScopes", {
        id: randomUUID(),
        accountId: actor.id,
        scopeType: "ALL",
        facultyId: null,
        cohortId: null,
        active: true,
        version: 1,
      });
    }
    const ai = new AiService(store, { ready: false });
    const add = async (owner, version, text) => {
      const row = {
        id: randomUUID(),
        actorId: owner,
        accountVersion: version,
        version: 1,
        messages: [{ role: "user", text, at: "2026-11-15T00:00:00Z" }],
        history: [{ signature: "private" }],
      };
      await store.insert("conversations", row);
      return row;
    };
    const own = await add(actor.id, 2, "Học phí của tôi");
    await add(actor.id, 1, "Học phí cũ");
    await add(randomUUID(), 2, "Học phí người khác");
    for (const p of [
      { status: "PREPARED", actorId: actor.id, expiresAt: Date.now() + 100000 },
      { status: "PREPARED", actorId: actor.id, expiresAt: 0 },
      { status: "EXECUTED", actorId: actor.id, expiresAt: Date.now() + 100000 },
      {
        status: "PREPARED",
        actorId: randomUUID(),
        expiresAt: Date.now() + 100000,
      },
    ])
      await store.insert("proposals", {
        id: randomUUID(),
        conversationId: own.id,
        ...p,
      });
    const result = await ai.history(actor, "hoc phi");
    assert.equal(result.total, 1);
    assert.equal(result.rows[0].id, own.id);
    assert.equal(result.rows[0].pendingCount, 1);
    assert.deepEqual(Object.keys(result.rows[0]).sort(), [
      "id",
      "pendingCount",
      "title",
      "updatedAt",
    ]);
    await assert.rejects(ai.conversation(own.id, { ...actor, version: 3 }), {
      status: role === "STAFF" ? 401 : 404,
    });
  });
test("Lịch sử: thứ tự mới nhất, giới hạn 20, tìm kiếm và kiểm tra đầu vào", async () => {
  const store = new MemoryStore(),
    ai = new AiService(store, {}),
    actor = { id: randomUUID(), role: "STUDENT", version: 1, active: true };
  for (let i = 0; i < 25; i++)
    await store.insert("conversations", {
      id: randomUUID(),
      actorId: actor.id,
      accountVersion: 1,
      messages: [
        {
          role: "user",
          text: "Nội dung " + i,
          at: new Date(100000 + i * 1000).toISOString(),
        },
      ],
    });
  const result = await ai.history(actor);
  assert.equal(result.total, 25);
  assert.equal(result.rows.length, 20);
  assert.equal(result.rows[0].title, "Nội dung 24");
  assert.equal((await ai.history(actor, "nội dung 0")).total, 1);
  await assert.rejects(ai.history(actor, "x".repeat(161)), { status: 400 });
  await assert.rejects(ai.history(null));
});
