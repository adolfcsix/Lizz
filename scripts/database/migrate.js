import { createPool } from "../../backend/local/database/pool.js";
import { databaseDiagnostic } from "../../backend/local/database/schema.js";
import { migrateDatabase } from "./migration-runner.js";

const pool = createPool();
try {
  const result = await migrateDatabase(pool, { log: console.log });
  console.log("Schema đã khớp:", result.migrations, "migration ·", result.tables, "bảng");
} catch (error) {
  console.error("Migration chưa hoàn tất:", databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
