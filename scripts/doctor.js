import { readConfig } from "../backend/local/config/env.js";
import { createPool } from "../backend/local/database/pool.js";
import { assertDatabaseReady, databaseDiagnostic } from "../backend/local/database/schema.js";

let pool;
try {
  const config = readConfig();
  console.log("Node:", process.version);
  console.log("Origin:", config.origin);
  console.log(
    "LizzChat:",
    config.ai.enabled && config.ai.apiKey && config.ai.model
      ? "đã có cấu hình (chưa gọi dịch vụ)"
      : "chưa cấu hình đầy đủ",
  );
  pool = createPool(config);
  const mysql = await assertDatabaseReady(pool);
  console.log("MySQL:", mysql.version, "·", mysql.collation);
  console.log("Schema:", mysql.migrations, "migration ·", mysql.tables, "bảng đã khớp");
  const [[count]] = await pool.query("SELECT COUNT(*) AS total FROM accounts");
  console.log("Tài khoản:", count.total);
} catch (error) {
  console.error("Chưa sẵn sàng:", databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await pool?.end();
}
