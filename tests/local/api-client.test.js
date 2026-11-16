import test from "node:test";
import assert from "node:assert/strict";
import { api } from "../../frontend/app/services/api.js";
function setup(t, transport) {
  const oldFetch = globalThis.fetch, oldWindow = globalThis.window, events = [];
  globalThis.fetch = transport; globalThis.window = { dispatchEvent: (event) => events.push(event.type) };
  t.after(() => { globalThis.fetch = oldFetch; globalThis.window = oldWindow; }); return events;
}
test("API client: keeps business errors/version conflicts and never auto-retries writes", async (t) => {
  let calls = 0;
  setup(t, async () => { calls++; return new Response(JSON.stringify({ error: "Hồ sơ đã thay đổi.", conflict: true }), { status: 409 }); });
  await assert.rejects(api("/student-services/requests/a/submit", { method: "POST", body: { version: 1 } }), (e) => e.status === 409 && e.data.conflict && e.message === "Hồ sơ đã thay đổi.");
  assert.equal(calls, 1);
});
test("API client: expired session is signaled even if a proxy returns non-JSON", async (t) => {
  const events = setup(t, async () => new Response("<html>unauthorized</html>", { status: 401 }));
  await assert.rejects(api("/academics"), (e) => e.status === 401 && !e.message.includes("<html>"));
  assert.deepEqual(events, ["lizz:session-expired"]);
});
test("API client: unsuccessful login does not emit an unrelated session-expired event", async (t) => {
  const events = setup(t, async () => new Response('{"error":"Thông tin chưa đúng."}', { status: 401 }));
  await assert.rejects(api("/auth/login", { method: "POST", body: { identifier: "x" } }), (e) => e.status === 401);
  assert.deepEqual(events, []);
});
test("API client: network failure/ambiguous write outcome is understandable and does not claim rollback", async (t) => {
  let calls = 0; setup(t, async () => { calls++; throw TypeError("Failed to fetch"); });
  await assert.rejects(api("/academics/registrations", { method: "POST", body: { requestId: "a" } }), (e) => e.status === 0 && /Kiểm tra trạng thái/.test(e.message) && !/chưa được thực hiện/.test(e.message));
  assert.equal(calls, 1);
});
test("API client: timeouts release a pending request and user abort is distinguished", async (t) => {
  setup(t, (_url, { signal }) => new Promise((_, reject) => {
    const stop = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) stop(); else signal.addEventListener("abort", stop, { once: true });
  }));
  await assert.rejects(api("/academics", { timeoutMs: 5 }), (e) => e.status === 504 && /phản hồi chậm/.test(e.message));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(api("/academics", { signal: controller.signal }), (e) => e.name === "AbortError");
});
test("API client: success preserves safe request headers and rejects malformed successful payloads", async (t) => {
  setup(t, async (url, options) => {
    assert.equal(url, "/api/v1/academics"); assert.equal(options.credentials, "same-origin"); assert.equal(options.headers.Accept, "application/json");
    return new Response('{"rows":[]}');
  });
  assert.deepEqual(await api("/academics"), { rows: [] });
  for (const payload of ["null", "[]", "oops"]) {
    globalThis.fetch = async () => new Response(payload);
    await assert.rejects(api("/academics"), (e) => e.status === 502 && e.message && !e.message.includes("Unexpected token"));
  }
});
