import { migrationCatalog, migrationStatements, sqlParts } from "./migration-catalog.js";
import { verifyMysql } from "./pool.js";

const types = (type) => type.trim().replace(/^BOOL(?:EAN)?$/i, "tinyint")
  .replace(/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)(?:\(\d+\))?$/i, (_, t) => t.toLowerCase() === "integer" ? "int" : t.toLowerCase())
  .replace(/^([a-z]+)/i, (t) => t.toLowerCase()).replace(/,\s+/g, ",");
function column(part, prior = null) {
  const match = part.match(/^`?([a-z_][a-z0-9_]*)`?\s+([a-z]+(?:\([^)]*\))?)/i);
  if (!match) throw Error("Không đọc được cột trong migration của gói nguồn.");
  return { name: match[1], type: types(match[2]), nullable: /\bNOT NULL\b|\bPRIMARY KEY\b/i.test(part) ? "NO" : /\bNULL\b/i.test(part) ? "YES" : prior?.nullable || "YES", generated: /\bGENERATED ALWAYS\b/i.test(part) };
}
function addDefinition(table, part) {
  const constraint = part.match(/^CONSTRAINT\s+`?([a-z0-9_]+)`?\s+(FOREIGN KEY|CHECK|UNIQUE)/i);
  if (constraint) { table.constraints[constraint[1]] = constraint[2].toUpperCase(); return; }
  if (/^PRIMARY KEY\b/i.test(part)) { table.constraints.PRIMARY = "PRIMARY KEY"; return; }
  const unique = part.match(/^UNIQUE(?: KEY| INDEX)?\s+`?([a-z0-9_]+)`?\s*\(/i);
  if (unique) { table.constraints[unique[1]] = "UNIQUE"; return; }
  if (/^(?:INDEX|KEY|CHECK)\b/i.test(part)) return;
  const c = column(part); table.columns[c.name] = c;
  if (/\bPRIMARY KEY\b/i.test(part)) table.constraints.PRIMARY = "PRIMARY KEY";
  else if (/\bUNIQUE\b/i.test(part)) table.constraints[c.name] = "UNIQUE";
}
// Hợp đồng chỉ được suy từ DDL trong gói nguồn tin cậy, không nhận SQL từ API/client.
export function schemaContract(catalog) {
  const tables = {
    schema_migrations: { columns: {
      filename: { name: "filename", type: "varchar(120)", nullable: "NO" },
      checksum: { name: "checksum", type: "char(64)", nullable: "NO" },
      applied_at: { name: "applied_at", type: "datetime", nullable: "NO" },
    }, constraints: { PRIMARY: "PRIMARY KEY" } },
  };
  for (const migration of catalog)
    for (const statement of migrationStatements(migration.source)) {
      const create = statement.match(/^CREATE TABLE(?: IF NOT EXISTS)?\s+`?([a-z0-9_]+)`?\s*\(([\s\S]*)\)\s*ENGINE\s*=\s*InnoDB\b/i);
      if (create) {
        if (tables[create[1]]) throw Error("Bảng bị khai báo lặp trong gói migration.");
        const table = { columns: {}, constraints: {} };
        for (const part of sqlParts(create[2])) addDefinition(table, part);
        tables[create[1]] = table; continue;
      }
      const alter = statement.match(/^ALTER TABLE\s+`?([a-z0-9_]+)`?\s+([\s\S]+)$/i);
      if (alter) {
        const table = tables[alter[1]];
        if (!table) throw Error("Migration sửa bảng chưa được khai báo.");
        for (const part of sqlParts(alter[2])) {
          if (/^ADD COLUMN\b/i.test(part)) {
            const c = column(part.replace(/^ADD COLUMN\s+/i, ""));
            if (table.columns[c.name]) throw Error("Migration thêm trùng cột.");
            table.columns[c.name] = c;
          } else if (/^ADD CONSTRAINT\b/i.test(part)) addDefinition(table, part.replace(/^ADD\s+/i, ""));
          else if (/^MODIFY(?: COLUMN)?\s+/i.test(part)) {
            const rest = part.replace(/^MODIFY(?: COLUMN)?\s+/i, ""), name = rest.match(/^`?([a-z0-9_]+)/i)?.[1];
            if (!table.columns[name]) throw Error("Migration sửa cột chưa được khai báo.");
            table.columns[name] = column(rest, table.columns[name]);
          } else if (/^ADD UNIQUE(?: KEY| INDEX)?\s+/i.test(part)) addDefinition(table, part.replace(/^ADD\s+/i, ""));
          else if (/^ADD (?:INDEX|KEY)\b/i.test(part)) continue;
          else if (/^DROP INDEX\s+/i.test(part)) delete table.constraints[part.replace(/^DROP INDEX\s+/i, "").replaceAll("`", "")];
          else throw Error("Có kiểu ALTER chưa được hỗ trợ bởi kiểm tra schema. Cập nhật bộ kiểm tra cùng migration.");
        }
        continue;
      }
      if (!/^(UPDATE|INSERT)\b/i.test(statement)) throw Error("Có câu lệnh migration chưa được hỗ trợ bởi kiểm tra schema.");
    }
  return tables;
}
export class SchemaNotReady extends Error {
  constructor(issues) {
    super("Database chưa khớp mã nguồn: " + issues.slice(0, 16).map((i) => i.message).join("; ") +
      (issues.length > 16 ? `; còn ${issues.length - 16} mục cần kiểm tra` : "") +
      ". Sao lưu và chạy npm run db:migrate; không tự sửa checksum hoặc xóa dữ liệu.");
    this.name = "SchemaNotReady"; this.code = "SCHEMA_NOT_READY"; this.issues = issues;
  }
}
export async function inspectSchema(pool, catalog = null) {
  catalog ||= await migrationCatalog();
  const expected = schemaContract(catalog), issues = [], add = (code, message) => issues.push({ code, message });
  const [tables] = await pool.query("SELECT TABLE_NAME AS tableName, TABLE_TYPE AS tableType, ENGINE AS engine, TABLE_COLLATION AS collation FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
  const [columns] = await pool.query("SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable, EXTRA AS extra FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()");
  const [constraints] = await pool.query("SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName, CONSTRAINT_TYPE AS constraintType, ENFORCED AS enforced FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE()");
  const byTable = new Map(tables.map((t) => [t.tableName, t]));
  for (const [name, contract] of Object.entries(expected)) {
    const table = byTable.get(name);
    if (!table) { add("TABLE_MISSING", "thiếu bảng " + name); continue; }
    if (table.tableType !== "BASE TABLE" || table.engine !== "InnoDB" || table.collation !== "utf8mb4_unicode_ci")
      add("TABLE_INCOMPATIBLE", "engine/collation chưa đúng ở " + name);
    for (const [key, wanted] of Object.entries(contract.columns)) {
      const actual = columns.find((c) => c.tableName === name && c.columnName === key);
      if (!actual) add("COLUMN_MISSING", `thiếu cột ${name}.${key}`);
      else if (types(actual.columnType) !== wanted.type || actual.nullable !== wanted.nullable || Boolean(wanted.generated) !== /\b(?:STORED|VIRTUAL) GENERATED\b/i.test(String(actual.extra || "")))
        add("COLUMN_INCOMPATIBLE", `kiểu/nullability chưa đúng ở ${name}.${key}`);
    }
    for (const [key, type] of Object.entries(contract.constraints)) {
      const found = constraints.find((c) => c.tableName === name && c.constraintName === key);
      if (!found || found.constraintType !== type || (type === "CHECK" && found.enforced !== "YES"))
        add("CONSTRAINT_MISSING", `thiếu ràng buộc đang hiệu lực ${name}.${key}`);
    }
  }
  const historyReady = byTable.has("schema_migrations") && ["filename", "checksum"].every((key) => columns.some((c) => c.tableName === "schema_migrations" && c.columnName === key));
  if (historyReady) {
    const [history] = await pool.query("SELECT filename,checksum FROM schema_migrations ORDER BY filename");
    const known = new Map(catalog.map((m) => [m.filename, m]));
    for (const row of history) if (!known.has(row.filename)) add("MIGRATION_UNKNOWN", "database có migration ngoài gói nguồn: " + row.filename);
    for (const migration of catalog) {
      const row = history.find((r) => r.filename === migration.filename);
      if (!row) add("MIGRATION_PENDING", "chưa chạy " + migration.filename);
      else if (row.checksum !== migration.checksum) add("MIGRATION_CHANGED", "checksum không khớp " + migration.filename);
    }
  } else add("MIGRATION_HISTORY_MISSING", "chưa có lịch sử migration hợp lệ");
  return { ready: issues.length === 0, migrations: catalog.length, tables: Object.keys(expected).length, issues };
}
export async function assertSchemaReady(pool, catalog = null) {
  const report = await inspectSchema(pool, catalog);
  if (!report.ready) throw new SchemaNotReady(report.issues);
  return report;
}
export async function assertDatabaseReady(pool) {
  const mysql = await verifyMysql(pool), schema = await assertSchemaReady(pool);
  return { ...mysql, ...schema };
}
export const databaseDiagnostic = (error) => error.code === "SCHEMA_NOT_READY" ? error.message : error.code || error.message;
