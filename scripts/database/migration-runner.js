import { verifyMysql } from "../../backend/local/database/pool.js";
import { migrationCatalog, migrationStatements } from "../../backend/local/database/migration-catalog.js";
import { assertSchemaReady, schemaContract } from "../../backend/local/database/schema.js";

export async function migrateDatabase(pool, { catalog = null, log = () => {} } = {}) {
  catalog ||= await migrationCatalog();
  schemaContract(catalog);
  await verifyMysql(pool);
  const connection = await pool.getConnection(); let acquired = false;
  try {
    const [[lock]] = await connection.query("SELECT GET_LOCK('lizz_migrations', 5) AS acquired");
    if (lock.acquired !== 1) throw Error("Một tiến trình khác đang chạy migration.");
    acquired = true;
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(120) PRIMARY KEY, checksum CHAR(64) NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    const [history] = await connection.query("SELECT filename,checksum FROM schema_migrations ORDER BY filename");
    const known = new Map(catalog.map((m) => [m.filename, m]));
    // Kiểm tra toàn bộ lịch sử trước khi chạy DDL còn thiếu, không nâng cấp trên checksum sai.
    for (const row of history) {
      if (!known.has(row.filename)) throw Error("Database có migration ngoài gói nguồn: " + row.filename + ". Dùng đúng bản mã nguồn; không xóa lịch sử.");
      if (known.get(row.filename).checksum !== row.checksum)
        throw Error("Migration đã thay đổi: " + row.filename + ". Giữ bản đã chạy và tạo migration mới.");
    }
    let applied = 0;
    for (const migration of catalog) {
      if (history.some((r) => r.filename === migration.filename)) { log("Đã có: " + migration.filename); continue; }
      // DDL tự commit. Chỉ ghi checksum khi mọi câu lệnh trong file đã hoàn tất.
      for (const statement of migrationStatements(migration.source)) await connection.query(statement);
      await connection.execute("INSERT INTO schema_migrations(filename,checksum) VALUES (?,?)", [migration.filename, migration.checksum]);
      applied++; log("Đã áp dụng: " + migration.filename);
    }
    const schema = await assertSchemaReady(connection, catalog);
    return { ...schema, applied };
  } finally {
    try { if (acquired) await connection.query("SELECT RELEASE_LOCK('lizz_migrations')"); }
    finally { connection.release(); }
  }
}
