import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { serviceFixture } from "./student-services-fixture.js";
import { createApp } from "../../backend/local/app.js";
import { tokenHash } from "../../backend/local/core/password.js";
import { navigation } from "../../shared/role-navigation.js";
const all = ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  office = ["MANAGER", "STAFF"];
const surfaces = [
  ["/accounts", ["MANAGER"]],
  ["/catalog", all],
  ["/students", [...office, "STUDENT"]],
  ["/academics", all],
  ["/academics/policies", all],
  ["/curricula", all],
  ["/grades", all],
  ["/grade-reviews", all],
  ["/timetable", all],
  ["/exams", all],
  ["/attendance", all],
  ["/finance", [...office, "STUDENT"]],
  ["/workflows", office],
  ["/profile-requests", [...office, "STUDENT"]],
  ["/audit", office],
  ["/access/me", all],
];
for (const role of all)
  test(
    "Role surface: " +
      role +
      " has the intended API read boundary across 16 modules",
    async (t) => {
      const f = await serviceFixture(),
        actor = {
          MANAGER: f.manager,
          STAFF: f.staff,
          LECTURER: f.teacher,
          STUDENT: f.student,
        }[role],
        token = "e".repeat(64),
        origin = "http://localhost:4173";
      if (role === "STAFF")
        await f.store.insert("staffScopes", {
          id: randomUUID(),
          accountId: actor.id,
          scopeType: "ALL",
          facultyId: null,
          cohortId: null,
          active: true,
          version: 1,
        });
      await f.store.insert("sessions", {
        tokenHash: tokenHash(token),
        accountId: actor.id,
        accountVersion: 1,
        expiresAt: Date.now() + 60000,
      });
      const server = createApp({
        store: f.store,
        config: { origin },
        mode: "demo",
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      t.after(() => new Promise((resolve) => server.close(resolve)));
      const base = "http://127.0.0.1:" + server.address().port + "/api/v1";
      for (const [path, allowed] of surfaces) {
        const response = await fetch(base + path, {
          headers: { Cookie: "lizz_session=" + token },
        });
        assert.equal(
          response.status,
          allowed.includes(role) ? 200 : 403,
          role + " " + path + " " + (await response.text()),
        );
      }
    },
  );
test("Role navigation: teacher/student keep their academic pages without internal management, office roles retain handoff routes", () => {
  assert.equal(navigation[0].id, "home");
  assert.equal(new Set(navigation.map((r) => r.id)).size, navigation.length);
  const ids = (role) =>
    navigation.filter((r) => r.roles.includes(role)).map((r) => r.id);
  for (const role of all)
    for (const id of [
      "home",
      "academics",
      "curriculum",
      "schedule",
      "attendance",
      "exams",
      "grades",
      "grade-reviews",
      "profile",
    ])
      assert.ok(ids(role).includes(id), role + " missing " + id);
  for (const id of [
    "tasks",
    "approvals",
    "catalog",
    "accounts",
    "audit",
    "finance",
    "profile-requests",
    "students",
  ])
    assert.ok(!ids("LECTURER").includes(id), "lecturer must not have " + id);
  for (const id of [
    "tasks",
    "approvals",
    "catalog",
    "accounts",
    "audit",
    "policies",
  ])
    assert.ok(!ids("STUDENT").includes(id), "student must not have " + id);
  for (const role of office)
    for (const id of [
      "tasks",
      "approvals",
      "students",
      "profile-requests",
      "catalog",
      "policies",
      "finance",
      "audit",
    ])
      assert.ok(ids(role).includes(id));
  assert.ok(!ids("STAFF").includes("accounts"));
  assert.ok(ids("MANAGER").includes("accounts"));
});
