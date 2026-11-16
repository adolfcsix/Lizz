import test from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider } from "../../backend/local/integrations/gemini.js";
import { checkGemini } from "../../backend/local/integrations/gemini-check.js";
const config = { enabled: true, apiKey: "fixture-key-only", model: "model-for-test" };
const output = (text) => ({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text }] }] });
const call = { type: "function_call", id: "call-1", name: "lizz_health_echo", arguments: { echo: "LIZZ_AI_OK" } };
const input = { history: [], tools: [], instruction: "test" };
test("Gemini readiness: missing/whitespace configuration cannot send a request", async () => {
  let sent = 0;
  for (const c of [{ ...config, apiKey: " " }, { ...config, model: " " }, { ...config, enabled: false }]) {
    const p = new GeminiProvider(c, async () => { sent++; });
    assert.equal(p.ready, false);
    await assert.rejects(checkGemini(c, p), (e) => e.status === 503);
  }
  assert.equal(sent, 0);
});
test("Gemini readiness: HTTP auth/quota/server failures are bounded and never echo provider secrets", async () => {
  for (const code of [401, 403, 429, 500]) {
    const p = new GeminiProvider(config, async () => new Response("sensitive-provider-body-fixture-key-only", { status: code }));
    await assert.rejects(p.generate(input), (e) => e.status === (code === 429 ? 429 : 502) && !e.message.includes("fixture-key-only"));
  }
});
test("Gemini readiness: failed/incomplete interactions do not become successful answers", async () => {
  for (const status of ["failed", "incomplete", "cancelled", "requires_continuation", "in_progress"]) {
    const p = new GeminiProvider(config, async () => new Response(JSON.stringify({ ...output("text"), status })));
    await assert.rejects(p.generate(input), (e) => e.status === 502);
  }
});
test("Gemini readiness: malformed nested output or tool arguments return controlled errors, not TypeErrors", async () => {
  for (const value of [null, { status: "completed", steps: [null] }, { status: "completed", steps: [{ type: "model_output", content: [null] }] }, { status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: {} }] }] }, { status: "requires_action", steps: [{ ...call, arguments: [] }] }, { status: "requires_action", steps: [call, call] }, { status: "requires_action", steps: [] }]) {
    const p = new GeminiProvider(config, async () => new Response(JSON.stringify(value)));
    await assert.rejects(p.generate(input), (e) => e.status === 502 && e.name !== "TypeError");
  }
});
test("Gemini readiness: oversized response is cancelled before the full body is buffered", async () => {
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(500001)); }, cancel() { cancelled = true; } });
  const p = new GeminiProvider(config, async () => new Response(stream));
  await assert.rejects(p.generate(input), (e) => e.status === 502 && /quá dài/.test(e.message));
  assert.equal(cancelled, true);
});
test("Gemini readiness: connection loss while reading the body is controlled", async () => {
  const p = new GeminiProvider(config, async () => new Response(new ReadableStream({ start(controller) { controller.error(Error("body interrupted")); } })));
  await assert.rejects(p.generate(input), (e) => e.status === 502 && /gián đoạn/.test(e.message));
});
test("Gemini readiness: transport timeout and malformed JSON do not claim an operation succeeded", async () => {
  const p = new GeminiProvider(config, async () => { throw new DOMException("Timeout", "TimeoutError"); });
  await assert.rejects(p.generate(input), (e) => e.status === 504);
  const invalid = new GeminiProvider(config, async () => new Response("not json"));
  await assert.rejects(invalid.generate(input), (e) => e.status === 502);
});
test("Gemini readiness: synthetic probe completes a real adapter tool round trip and preserves thought signatures", async () => {
  const requests = [], thought = { type: "thought", signature: "fixture-signature" };
  const p = new GeminiProvider(config, async (url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    assert.equal(options.redirect, "error"); assert.equal(body.store, false);
    assert.ok(!options.body.includes(config.apiKey));
    return new Response(JSON.stringify(requests.length === 1 ? { status: "requires_action", steps: [thought, call] } : output("LIZZ_AI_OK")));
  });
  const result = await checkGemini(config, p);
  assert.equal(result.toolRoundTrip, true); assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].input[1], thought);
  assert.equal(requests[1].input.at(-1).call_id, call.id);
  assert.equal(requests[1].input.at(-1).type, "function_result");
  assert.ok(!JSON.stringify(result).includes("fixture-signature"));
});
test("Gemini readiness: text-only response is not accepted as proof of tool support", async () => {
  const p = new GeminiProvider(config, async () => new Response(JSON.stringify(output("LIZZ_AI_OK"))));
  await assert.rejects(checkGemini(config, p), (e) => e.status === 502 && /gọi công cụ/.test(e.message));
});
test("Gemini readiness: bad second-round output cannot mark the connection test complete", async () => {
  let n = 0;
  const p = new GeminiProvider(config, async () => new Response(JSON.stringify(++n === 1 ? { status: "requires_action", steps: [call] } : output("không có kết quả"))));
  await assert.rejects(checkGemini(config, p), (e) => e.status === 502);
});
