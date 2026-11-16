import { createPool } from "../../backend/local/database/pool.js";
import { assertDatabaseReady, databaseDiagnostic } from "../../backend/local/database/schema.js";
import { MysqlStore } from "../../backend/local/database/mysql-store.js";
import { createAccount } from "../../backend/local/modules/accounts/account.service.js";

const pool = createPool();
try {
  await assertDatabaseReady(pool);
  const store = new MysqlStore(pool);
  const existing = await store.list("accounts");
  if (existing.length)
    throw Error(
      "Đã có tài khoản. Dùng quản trị viên hiện tại để cấp tiếp; lệnh này chỉ khởi tạo lần đầu.",
    );
  const password = process.env.ADMIN_PASSWORD;
  const admin = await createAccount(store, {
    username: process.env.ADMIN_USERNAME,
    fullName: process.env.ADMIN_NAME,
    email: process.env.ADMIN_EMAIL,
    role: "MANAGER",
    password,
    passwordConfirm: password,
  });
  console.log(
    "Đã tạo quản trị viên:",
    admin.username,
    "· Xóa ADMIN_PASSWORD khỏi .env sau bước này.",
  );
} catch (error) {
  console.error("Chưa tạo quản trị viên:", databaseDiagnostic(error));
  process.exitCode = 1;
} finally {
  await pool.end();
}
