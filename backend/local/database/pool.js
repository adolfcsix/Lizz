import mysql from "mysql2/promise";
import { readConfig } from "../config/env.js";

export function createPool(config = readConfig()) {
  return mysql.createPool(config.database);
}

export async function verifyMysql(pool) {
  const [[row]] = await pool.query(
    "SELECT VERSION() AS version, @@collation_database AS collation",
  );
  const version = String(row.version);
  const [major, minor, patch] = version
    .split(".")
    .map((v) => Number.parseInt(v, 10));
  if (
    version.includes("MariaDB") ||
    major < 8 ||
    (major === 8 && minor === 0 && patch < 16)
  ) {
    throw Error("Cần MySQL 8.0.16 trở lên. Không thay bằng MariaDB.");
  }
  if (row.collation !== "utf8mb4_unicode_ci")
    throw Error("Database cần COLLATE utf8mb4_unicode_ci.");
  return { version, collation: row.collation };
}
