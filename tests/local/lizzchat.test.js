import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import { AiService } from "../../backend/local/modules/ai/ai.service.js";
import { GeminiProvider } from "../../backend/local/integrations/gemini.js";
import { toolsFor } from "../../backend/local/modules/ai/ai.tools.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { once } from "node:events";

// Phản hồi có kịch bản chỉ nằm trong kiểm thử, không nối vào runtime/demo.
class ScriptedProvider {
  ready = true;
  constructor(responses) {
    this.responses = responses;
    this.requests = [];
  }
  async generate(input) {
    this.requests.push(
      structuredClone({ history: input.history, tools: input.tools }),
    );
    const next = this.responses.shift();
    if (next instanceof Error) throw next;
    assert.ok(next, "Fixture cần đủ phản hồi cho lượt hội thoại");
    return next;
  }
}
const call = (name, args) => ({
  steps: [
    { type: "thought", signature: "private-signature" },
    { type: "function_call", id: randomUUID(), name, arguments: args },
  ],
  calls: [],
  text: "",
});
function withCall(name, args) {
  const response = call(name, args);
  response.calls = response.steps.filter(
    (step) => step.type === "function_call",
  );
  return response;
}
const answer = (text) => ({
  steps: [{ type: "model_output", content: [{ type: "text", text }] }],
  calls: [],
  text,
});

async function fixture(responses) {
  const store = new MemoryStore();
  const manager = {
    id: randomUUID(),
    username: "manager",
    email: "manager@example.test",
    fullName: "Quản lý",
    role: "MANAGER",
    active: true,
    version: 1,
  };
  const student = {
    id: randomUUID(),
    username: "mai",
    email: "mai@example.test",
    fullName: "Mai Lan",
    role: "STUDENT",
    active: true,
    version: 1,
  };
  const other = {
    id: randomUUID(),
    username: "minh",
    email: "minh@example.test",
    fullName: "Minh Anh",
    role: "STUDENT",
    active: true,
    version: 1,
  };
  for (const account of [manager, student, other])
    await store.insert("accounts", account);
  const faculty = { id: randomUUID(), code: "CNTT", name: "CNTT", version: 1 };
  const major = {
    id: randomUUID(),
    code: "IT",
    name: "CNTT",
    facultyId: faculty.id,
    version: 1,
  };
  const cohort = {
    id: randomUUID(),
    code: "K70",
    name: "Khóa 70",
    startYear: 2026,
    version: 1,
  };
  const group = {
    id: randomUUID(),
    code: "IT01",
    name: "CNTT 01",
    majorId: major.id,
    cohortId: cohort.id,
    capacity: 40,
    version: 1,
  };
  await store.insert("faculties", faculty);
  await store.insert("majors", major);
  await store.insert("cohorts", cohort);
  await store.insert("classes", group);
  const provider = new ScriptedProvider(responses);
  const ai = new AiService(store, provider);
  const input = (message) => ({
    conversationId: randomUUID(),
    requestId: randomUUID(),
    version: 0,
    message,
  });
  return { store, manager, student, other, group, ai, provider, input };
}
const studentArgs = {
  rows: [
    {
      email: "mai@example.test",
      code: "SV001",
      fullName: "Mai Lan",
      classCode: "IT01",
    },
  ],
};

test("LizzChat asks for missing data and keeps multi-turn context without creating a profile", async () => {
  const f = await fixture([
    withCall("prepare_student_profiles", {
      rows: [{ email: "mai@example.test" }],
    }),
    answer("Bạn bổ sung mã sinh viên, họ tên và mã lớp giúp tôi."),
    withCall("prepare_student_profiles", studentArgs),
    answer("Đã chuẩn bị."),
  ]);
  const first = await f.ai.message(
    f.input("Lập hồ sơ cho Mai qua email mai@example.test"),
    f.manager,
  );
  assert.match(first.messages.at(-1).text, /bổ sung/);
  assert.equal(first.proposals.length, 0);
  assert.equal((await f.store.list("students")).length, 0);
  const second = await f.ai.message(
    {
      conversationId: first.id,
      version: first.version,
      requestId: randomUUID(),
      message: "Mai Lan, SV001, lớp IT01",
    },
    f.manager,
  );
  assert.equal(second.proposals.length, 1);
  assert.equal((await f.store.list("students")).length, 0);
  assert.ok(
    f.provider.requests[2].history.some(
      (step) =>
        step.type === "user_input" &&
        step.content[0].text.includes("Lập hồ sơ"),
    ),
  );
  assert.equal(JSON.stringify(second).includes("private-signature"), false);
});

test("LizzChat confirmation commits once atomically, preserves account link and returns prior result", async () => {
  const f = await fixture([
    withCall("prepare_student_profiles", studentArgs),
    answer("Sẵn sàng"),
  ]);
  const conversation = await f.ai.message(f.input("Thêm hồ sơ Mai"), f.manager);
  const proposal = conversation.proposals[0];
  await assert.rejects(
    f.ai.decide(proposal.id, { version: 1 }, f.manager),
    /xác nhận/,
  );
  const results = await Promise.all([
    f.ai.decide(proposal.id, { version: 1, confirm: true }, f.manager),
    f.ai.decide(proposal.id, { version: 1, confirm: true }, f.manager),
  ]);
  assert.equal(results.filter((result) => result.replayed).length, 1);
  const profiles = await f.store.list("students");
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].accountId, f.student.id);
  assert.equal(profiles[0].classId, f.group.id);
  assert.equal((await f.store.list("proposals"))[0].status, "EXECUTED");
  assert.equal(
    (await f.store.list("events")).filter(
      (row) => row.action === "LIZZCHAT_CONFIRMED",
    ).length,
    1,
  );
});

test("LizzChat cancel, expiry and stale fingerprint never create business records", async () => {
  for (const type of ["cancel", "expire", "stale"]) {
    const f = await fixture([
      withCall("prepare_student_profiles", studentArgs),
      answer("Xem trước"),
    ]);
    const conversation = await f.ai.message(f.input("Nhập hồ sơ"), f.manager);
    const proposal = conversation.proposals[0];
    if (type === "expire") f.store.data.proposals[0].expiresAt = Date.now() - 1;
    if (type === "stale")
      await f.store.update("classes", f.group.id, { capacity: 30 }, 1);
    const result = await f.ai.decide(
      proposal.id,
      { version: 1, confirm: true },
      f.manager,
      type === "cancel",
    );
    assert.equal(
      result.proposal.status,
      { cancel: "CANCELLED", expire: "EXPIRED", stale: "STALE" }[type],
    );
    assert.equal((await f.store.list("students")).length, 0);
  }
});

test("LizzChat owner, role and field schema cannot be overridden by model arguments", async () => {
  const f = await fixture([
    withCall("prepare_student_profiles", studentArgs),
    answer("Xem trước"),
  ]);
  const conversation = await f.ai.message(f.input("Tạo hồ sơ"), f.manager);
  await assert.rejects(
    f.ai.conversation(conversation.id, f.student),
    /trong quyền/,
  );
  await assert.rejects(
    f.ai.decide(
      conversation.proposals[0].id,
      { version: 1, confirm: true },
      f.student,
    ),
    /trong quyền/,
  );
  await assert.rejects(
    f.ai.runTool(
      "prepare_student_profiles",
      studentArgs,
      f.student,
      [],
      [],
      randomUUID(),
    ),
    /quyền/,
  );
  await assert.rejects(
    f.ai.runTool(
      "lookup_students",
      { role: "MANAGER", query: "" },
      f.student,
      [],
      [],
      randomUUID(),
    ),
    /không cho phép/,
  );
  assert.equal(
    toolsFor(f.student).some((tool) =>
      [
        "prepare_student_profiles",
        "prepare_subject",
        "prepare_course_section",
      ].includes(tool.name),
    ),
    false,
  );
  assert.equal(
    toolsFor({ role: "LECTURER" }).some(
      (tool) => tool.name === "lookup_students",
    ),
    false,
  );
  const info = await f.ai.runTool(
    "lookup_students",
    { query: "" },
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.equal(info.rows.length, 0);
});

test("LizzChat student lookup is scoped before search and does not return another student", async () => {
  const f = await fixture([]);
  for (const [account, code] of [
    [f.student, "SV001"],
    [f.other, "SV002"],
  ])
    await f.store.insert("students", {
      id: randomUUID(),
      accountId: account.id,
      code,
      fullName: account.fullName,
      classId: f.group.id,
      version: 1,
    });
  const result = await f.ai.runTool(
    "lookup_students",
    { query: "" },
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].accountId, f.student.id);
  assert.equal(JSON.stringify(result).includes(f.other.email), false);
  const catalog = await f.ai.runTool(
    "lookup_catalog",
    { kind: "classes", query: "IT01" },
    f.student,
    [],
    [],
    randomUUID(),
  );
  assert.equal(catalog.rows[0].enrolled, 2);
  assert.equal(catalog.rows[0].available, 38);
});

test("LizzChat retries do not call the provider twice and failed model output leaves no draft", async () => {
  const f = await fixture([
    withCall("prepare_student_profiles", studentArgs),
    answer("Chuẩn bị"),
  ]);
  const input = f.input("Tạo hồ sơ");
  const first = await f.ai.message(input, f.manager);
  await f.ai.message(input, f.manager);
  assert.equal(f.provider.requests.length, 2);
  assert.equal((await f.store.list("proposals")).length, 1);
  await assert.rejects(
    f.ai.message({ ...input, requestId: randomUUID(), version: 0 }, f.manager),
    /đã thay đổi/,
  );
  const broken = await fixture([
    withCall("prepare_student_profiles", studentArgs),
    new Error("fixture outage"),
  ]);
  await assert.rejects(
    broken.ai.message(broken.input("Tạo hồ sơ"), broken.manager),
    /fixture outage/,
  );
  assert.equal((await broken.store.list("proposals")).length, 0);
  assert.equal((await broken.store.list("students")).length, 0);
  assert.equal(first.proposals[0].status, "PREPARED");
});

test("LizzChat catalog and profile change use the original services only after confirmation", async () => {
  const f = await fixture([
    withCall("prepare_catalog_entry", {
      kind: "faculties",
      code: "KT",
      name: "Kinh tế",
    }),
    answer("Xem trước"),
  ]);
  const conversation = await f.ai.message(
    f.input("Thêm khoa Kinh tế mã KT"),
    f.manager,
  );
  assert.equal((await f.store.list("faculties")).length, 1);
  await f.ai.decide(
    conversation.proposals[0].id,
    { version: 1, confirm: true },
    f.manager,
  );
  assert.equal((await f.store.list("faculties")).length, 2);
  await f.store.insert("students", {
    id: randomUUID(),
    accountId: f.student.id,
    code: "SV001",
    fullName: "Mai Lan",
    classId: f.group.id,
    version: 1,
  });
  f.provider.responses.push(
    withCall("prepare_student_change", {
      studentCode: "SV001",
      fullName: "Nguyễn Mai Lan",
    }),
    answer("Cập nhật"),
  );
  const next = await f.ai.message(f.input("Sửa tên SV001"), f.manager);
  await f.ai.decide(
    next.proposals[0].id,
    { version: 1, confirm: true },
    f.manager,
  );
  assert.equal((await f.store.list("students"))[0].fullName, "Nguyễn Mai Lan");
  assert.equal(
    (await f.store.list("events")).some(
      (row) =>
        row.action === "STUDENT_UPDATED" &&
        row.detail.before.fullName === "Mai Lan",
    ),
    true,
  );
});

test("Gemini adapter uses stateless fixed endpoint and keeps keys out of data payloads", async () => {
  const calls = [];
  const key = "fixture-" + randomUUID();
  const provider = new GeminiProvider(
    { enabled: true, apiKey: key, model: "model-configured-for-test" },
    async (url, options) => {
      calls.push({ url, options });
      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: "Xin chào" }],
            },
          ],
        }),
      );
    },
  );
  const result = await provider.generate({
    history: [
      { type: "user_input", content: [{ type: "text", text: "Xin chào" }] },
    ],
    tools: [],
    instruction: "Test",
    signal: AbortSignal.timeout(1000),
  });
  assert.equal(result.text, "Xin chào");
  assert.equal(
    calls[0].url,
    "https://generativelanguage.googleapis.com/v1beta/interactions",
  );
  assert.equal(JSON.parse(calls[0].options.body).store, false);
  assert.equal(calls[0].options.body.includes(key), false);
  const disabled = new GeminiProvider({ enabled: false });
  await assert.rejects(disabled.generate({}), { status: 503 });
});

test("MysqlStore parameterizes JSON proposal updates and nested transaction keeps the same connection", async () => {
  let statement, values;
  const connection = {
    execute: async (sql, args) => {
      statement = sql;
      values = args;
      return [{ affectedRows: 1 }];
    },
  };
  const store = new MysqlStore(connection, true);
  await store.transaction((tx) =>
    tx.update(
      "proposals",
      "id",
      { status: "EXECUTED", result: { rows: ["one"] } },
      1,
    ),
  );
  assert.ok(statement.includes("result_json=?"));
  assert.equal(values[1], '{"rows":["one"]}');
  assert.equal(statement.includes("one"), false);
});

test("LizzChat HTTP requires session, Origin, owner and explicit confirmation", async (t) => {
  const f = await fixture([
    withCall("prepare_student_profiles", studentArgs),
    answer("Xem trước"),
  ]);
  const conversation = await f.ai.message(f.input("Thêm hồ sơ"), f.manager);
  const proposal = conversation.proposals[0];
  const managerToken = "a".repeat(64),
    studentToken = "b".repeat(64);
  for (const [token, actor] of [
    [managerToken, f.manager],
    [studentToken, f.student],
  ])
    await f.store.insert("sessions", {
      tokenHash: tokenHash(token),
      accountId: actor.id,
      accountVersion: actor.version,
      expiresAt: Date.now() + 100_000,
    });
  const origin = "http://localhost:3000";
  const server = createApp({
    store: f.store,
    config: { origin },
    mode: "demo",
    aiProvider: f.provider,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const headers = (token) => ({
    Cookie: "lizz_session=" + token,
    Origin: origin,
    "Content-Type": "application/json",
  });
  assert.equal((await fetch(base + "/api/v1/ai/status")).status, 401);
  const status = await (
    await fetch(base + "/api/v1/ai/status", { headers: headers(managerToken) })
  ).json();
  assert.equal(status.name, "LizzChat");
  assert.equal("apiKey" in status, false);
  assert.equal(
    (
      await fetch(base + "/api/v1/ai/conversations/" + conversation.id, {
        headers: headers(studentToken),
      })
    ).status,
    404,
  );
  assert.equal((await fetch(base + "/api/v1/ai/conversations")).status, 401);
  const ownHistory = await (
    await fetch(base + "/api/v1/ai/conversations", {
      headers: headers(managerToken),
    })
  ).json();
  assert.equal(ownHistory.total, 1);
  assert.equal(ownHistory.rows[0].id, conversation.id);
  assert.equal(ownHistory.rows[0].pendingCount, 1);
  const otherHistory = await (
    await fetch(base + "/api/v1/ai/conversations", {
      headers: headers(studentToken),
    })
  ).json();
  assert.equal(otherHistory.total, 0);
  const path = base + "/api/v1/ai/proposals/" + proposal.id + "/confirm";
  assert.equal(
    (
      await fetch(path, {
        method: "POST",
        headers: { ...headers(managerToken), Origin: "https://bad.test" },
        body: '{"version":1,"confirm":true}',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(path, {
        method: "POST",
        headers: headers(managerToken),
        body: '{"version":1,"confirm":false}',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await fetch(path, {
        method: "POST",
        headers: headers(studentToken),
        body: '{"version":1,"confirm":true}',
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await fetch(path, {
        method: "POST",
        headers: headers(managerToken),
        body: '{"version":1,"confirm":true}',
      })
    ).status,
    200,
  );
  assert.equal((await f.store.list("students")).length, 1);
});
