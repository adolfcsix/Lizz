import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { migrationCatalog, migrationStatements } from "../../backend/local/database/migration-catalog.js";
import { schemaContract, inspectSchema, assertSchemaReady, assertDatabaseReady, databaseDiagnostic } from "../../backend/local/database/schema.js";
import { migrateDatabase } from "../../scripts/database/migration-runner.js";
import { readConfig } from "../../backend/local/config/env.js";

const catalog = [{ filename: "001_core.sql", checksum: "a".repeat(64), source: "CREATE TABLE accounts (id CHAR(36) PRIMARY KEY, full_name VARCHAR(160) NOT NULL, role ENUM('MANAGER','STUDENT') NOT NULL, active BOOLEAN NOT NULL, CONSTRAINT ck_active CHECK(active IN (0,1))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;" }];
function fixture() {
  const d = {
    tables: ["schema_migrations", "accounts"].map((tableName) => ({ tableName, tableType: "BASE TABLE", engine: "InnoDB", collation: "utf8mb4_unicode_ci" })),
    columns: [["schema_migrations", "filename", "varchar(120)"], ["schema_migrations", "checksum", "char(64)"], ["schema_migrations", "applied_at", "datetime"], ["accounts", "id", "char(36)"], ["accounts", "full_name", "varchar(160)"], ["accounts", "role", "enum('MANAGER','STUDENT')"], ["accounts", "active", "tinyint(1)"]].map(([tableName, columnName, columnType]) => ({ tableName, columnName, columnType, nullable: "NO", extra: "" })),
    constraints: [{ tableName: "schema_migrations", constraintName: "PRIMARY", constraintType: "PRIMARY KEY" }, { tableName: "accounts", constraintName: "PRIMARY", constraintType: "PRIMARY KEY" }, { tableName: "accounts", constraintName: "ck_active", constraintType: "CHECK", enforced: "YES" }],
    history: [{ filename: catalog[0].filename, checksum: catalog[0].checksum }], calls: [], locked: 1, releases: 0,
  };
  const pool = {
    query: async (sql) => {
      d.calls.push(sql);
      if (sql.includes("VERSION()")) return [[{ version: "8.0.36", collation: "utf8mb4_unicode_ci" }]];
      if (sql.includes("GET_LOCK")) return [[{ acquired: d.locked }]];
      if (sql.includes("RELEASE_LOCK")) return [[{ released: 1 }]];
      if (sql.includes("information_schema.TABLES")) return [structuredClone(d.tables)];
      if (sql.includes("information_schema.COLUMNS")) return [structuredClone(d.columns)];
      if (sql.includes("information_schema.TABLE_CONSTRAINTS")) return [structuredClone(d.constraints)];
      if (sql.startsWith("SELECT filename,checksum")) return [structuredClone(d.history)];
      if (d.failDdl && sql.startsWith("CREATE TABLE accounts")) throw Object.assign(Error("DDL failed"), { code: "DDL_FAILED" });
      return [[]];
    },
    execute: async (sql, args) => { d.calls.push(sql); if (sql.startsWith("INSERT INTO schema_migrations")) d.history.push({ filename: args[0], checksum: args[1] }); return [{ affectedRows: 1 }]; },
    release: () => { d.releases++; },
  };
  pool.getConnection = async () => pool;
  return { d, pool };
}
test("Schema: current 27 migrations derive all final tables and columns, including role conversion, generated date and service finance FK", async () => {
  const files = await migrationCatalog(), s = schemaContract(files);
  assert.equal(files.length, 27); assert.equal(Object.keys(s).length, 52);
  assert.equal(Object.values(s).reduce((n, t) => n + Object.keys(t.columns).length, 0), 474);
  assert.equal(s.accounts.columns.role.type, "enum('MANAGER','STAFF','LECTURER','STUDENT')");
  assert.equal(s.attendance_sessions.columns.class_date.generated, true);
  assert.equal(s.attendance_sessions.constraints.uq_att_session_day, undefined);
  assert.equal(s.attendance_sessions.constraints.uq_att_session_lesson, "UNIQUE");
  assert.equal(s.student_service_requests.columns.charge_id.type, "char(36)");
  assert.equal(s.student_service_requests.constraints.fk_ssr_charge, "FOREIGN KEY");
});
test("Schema: healthy matching metadata is read-only and accepts boolean display type", async () => {
  const { d, pool } = fixture(), r = await assertSchemaReady(pool, catalog);
  assert.equal(r.ready, true); assert.ok(d.calls.every((sql) => sql.startsWith("SELECT")));
});
test("Schema: DEFAULT_GENERATED on timestamps is not confused with a generated column", async () => {
  const { d, pool } = fixture();
  d.columns.find((c) => c.columnName === "applied_at").extra = "DEFAULT_GENERATED";
  assert.equal((await inspectSchema(pool, catalog)).ready, true);
});
test("Schema: absent migration history never passes and is not read as an existing table", async () => {
  const { d, pool } = fixture(); d.tables = d.tables.filter((t) => t.tableName !== "schema_migrations");
  const r = await inspectSchema(pool, catalog);
  assert.equal(r.ready, false); assert.ok(r.issues.some((i) => i.code === "MIGRATION_HISTORY_MISSING"));
  assert.ok(!d.calls.some((sql) => sql.startsWith("SELECT filename,checksum")));
});
test("Schema: pending, tampered and unknown newer migrations are rejected before startup", async () => {
  for (const alter of [(d) => { d.history = []; }, (d) => { d.history[0].checksum = "b".repeat(64); }, (d) => { d.history.push({ filename: "999_future.sql", checksum: "f".repeat(64) }); }]) {
    const { d, pool } = fixture(); alter(d);
    await assert.rejects(assertSchemaReady(pool, catalog), (e) => e.code === "SCHEMA_NOT_READY" && e.message.includes("npm run db:migrate"));
  }
});
test("Schema: a complete migration log cannot hide missing tables, columns or narrowed fields", async () => {
  for (const alter of [(d) => { d.tables.pop(); }, (d) => { d.columns = d.columns.filter((c) => c.columnName !== "full_name"); }, (d) => { d.columns.find((c) => c.columnName === "full_name").columnType = "varchar(20)"; }, (d) => { d.columns.find((c) => c.columnName === "role").nullable = "YES"; }]) {
    const { d, pool } = fixture(); alter(d); assert.equal((await inspectSchema(pool, catalog)).ready, false);
  }
});
test("Schema: wrong engine, collation, disabled check and missing primary key fail closed", async () => {
  for (const alter of [(d) => { d.tables[1].engine = "MyISAM"; }, (d) => { d.tables[1].collation = "latin1_swedish_ci"; }, (d) => { d.constraints[2].enforced = "NO"; }, (d) => { d.constraints = d.constraints.filter((c) => c.tableName !== "accounts" || c.constraintName !== "PRIMARY"); }]) {
    const { d, pool } = fixture(); alter(d); assert.equal((await inspectSchema(pool, catalog)).ready, false);
  }
});
test("Schema: loss of a generated column expression is diagnosed", async () => {
  const { d, pool } = fixture(), files = [{ ...catalog[0], source: catalog[0].source.replace("active BOOLEAN NOT NULL", "active BOOLEAN NOT NULL, generated_flag INT GENERATED ALWAYS AS (1) STORED") }];
  d.columns.push({ tableName: "accounts", columnName: "generated_flag", columnType: "int", nullable: "YES", extra: "" });
  assert.equal((await inspectSchema(pool, files)).ready, false);
  d.columns.at(-1).extra = "STORED GENERATED"; assert.equal((await inspectSchema(pool, files)).ready, true);
});
test("Migrations: checksum mismatch/newer history prevents all pending DDL and releases acquired lock", async () => {
  for (const change of [(d) => { d.history[0].checksum = "z".repeat(64); }, (d) => { d.history.push({ filename: "999_future.sql", checksum: "z".repeat(64) }); }]) {
    const { d, pool } = fixture(); change(d);
    await assert.rejects(migrateDatabase(pool, { catalog }));
    assert.ok(!d.calls.some((sql) => sql.startsWith("CREATE TABLE accounts")));
    assert.ok(d.calls.some((sql) => sql.includes("RELEASE_LOCK"))); assert.equal(d.releases, 1);
  }
});
test("Migrations: failed DDL never records a completed file and always releases resources", async () => {
  const { d, pool } = fixture(); d.history = []; d.failDdl = true;
  await assert.rejects(migrateDatabase(pool, { catalog }), (e) => e.code === "DDL_FAILED");
  assert.equal(d.history.length, 0); assert.equal(d.releases, 1);
  assert.ok(d.calls.some((sql) => sql.includes("RELEASE_LOCK")));
});
test("Migrations: lock contention runs no DDL and does not release someone else's lock", async () => {
  const { d, pool } = fixture(); d.locked = 0;
  await assert.rejects(migrateDatabase(pool, { catalog }), /tiến trình khác/);
  assert.ok(!d.calls.some((sql) => sql.startsWith("CREATE")));
  assert.ok(!d.calls.some((sql) => sql.includes("RELEASE_LOCK"))); assert.equal(d.releases, 1);
});
test("Migrations: new files are stamped once; rerun skips DDL and checks physical schema", async () => {
  const { d, pool } = fixture(); d.history = [];
  assert.equal((await migrateDatabase(pool, { catalog })).applied, 1);
  const count = d.calls.filter((sql) => sql.startsWith("CREATE TABLE accounts")).length;
  assert.equal((await migrateDatabase(pool, { catalog })).applied, 0);
  assert.equal(d.calls.filter((sql) => sql.startsWith("CREATE TABLE accounts")).length, count);
  d.columns.pop(); await assert.rejects(migrateDatabase(pool, { catalog }), (e) => e.code === "SCHEMA_NOT_READY");
});
test("Migrations: sequence gaps and duplicate prefixes are rejected as incomplete packages", async () => {
  const path = await mkdtemp(join(tmpdir(), "lizz-migrations-"));
  try {
    await writeFile(join(path, "002_b.sql"), "SELECT 1;");
    await assert.rejects(migrationCatalog(pathToFileURL(path + "/")), /số thứ tự/);
    await writeFile(join(path, "001_a.sql"), "SELECT 1;");
    await writeFile(join(path, "001_duplicate.sql"), "SELECT 1;");
    await assert.rejects(migrationCatalog(pathToFileURL(path + "/")), /số thứ tự/);
  } finally { await rm(path, { recursive: true, force: true }); }
});
test("Migrations: quoted semicolons/commas are preserved; unsupported DDL cannot bypass schema verification", () => {
  assert.deepEqual(migrationStatements("INSERT INTO a VALUES ('a;b,c');\n-- note\nUPDATE a SET b='c';"), ["INSERT INTO a VALUES ('a;b,c')", "UPDATE a SET b='c'"]);
  assert.throws(() => schemaContract([{ ...catalog[0], source: "DROP TABLE accounts;" }]), /chưa được hỗ trợ/);
});
test("Config: trailing slash in origin is normalized and cannot silently break every write", () => {
  assert.equal(readConfig({ APP_ORIGIN: "http://LOCALHOST:3000/" }).origin, "http://localhost:3000");
  for (const origin of ["file:///tmp/site", "http://user:secret@localhost:3000", "http://localhost:3000/login", "http://localhost:3000/?a=b", "bad"])
    assert.throws(() => readConfig({ APP_ORIGIN: origin }), /APP_ORIGIN/);
  for (const p of ["0", "65536", "abc"]) assert.throws(() => readConfig({ DB_PORT: p }), /DB_PORT/);
});
test("Startup: database failure propagates before serving; diagnostics do not print SQL/passwords", async () => {
  const { pool } = fixture();
  pool.query = async () => { throw Object.assign(Error("unavailable"), { code: "ECONNREFUSED" }); };
  await assert.rejects(assertDatabaseReady(pool), (e) => databaseDiagnostic(e) === "ECONNREFUSED");
  const result = spawnSync(process.execPath, ["backend/local/server.js"], { cwd: new URL("../../", import.meta.url), env: { ...process.env, LIZZ_DEMO: "false", DB_HOST: "127.0.0.1", DB_PORT: "1", DB_PASSWORD: "test-only-marker", APP_ORIGIN: "http://localhost:31999", PORT: "31999" }, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /ECONNREFUSED/);
  assert.ok(!result.stdout.includes("Lizz:")); assert.ok(!result.stderr.includes("test-only-marker"));
});
test("Startup: invalid origin exits with a useful message without leaking credentials", () => {
  const result = spawnSync(process.execPath, ["backend/local/server.js", "--demo"], { cwd: new URL("../../", import.meta.url), env: { ...process.env, APP_ORIGIN: "http://user:test-only-marker@localhost:3000" }, encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /APP_ORIGIN/); assert.ok(!result.stderr.includes("test-only-marker"));
});
test("Startup: occupied port exits cleanly instead of an unhandled server exception", async (t) => {
  const reserved = createServer(); reserved.listen(0, "127.0.0.1"); await once(reserved, "listening");
  t.after(() => new Promise((resolve) => reserved.close(resolve)));
  const port = reserved.address().port;
  const result = spawnSync(process.execPath, ["backend/local/server.js", "--demo", "--port", String(port)], { cwd: new URL("../../", import.meta.url), env: { ...process.env, APP_ORIGIN: "http://localhost:" + port }, encoding: "utf8", timeout: 8000 });
  assert.equal(result.status, 1); assert.match(result.stderr, /EADDRINUSE/); assert.ok(!result.stderr.includes("Unhandled"));
});
