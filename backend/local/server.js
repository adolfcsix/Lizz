import { readConfig } from "./config/env.js";
import { createApp } from "./app.js";
import { createPool } from "./database/pool.js";
import { assertDatabaseReady, databaseDiagnostic } from "./database/schema.js";
import { MysqlStore } from "./database/mysql-store.js";
import { MemoryStore } from "./database/memory-store.js";
import { seedDemo } from "./database/seed-demo.js";

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const demo =
  process.argv.includes("--demo") || process.env.LIZZ_DEMO === "true";
let pool;
try {
  const config = readConfig({
    ...process.env,
    PORT: option("--port") || process.env.PORT,
    HOST: option("--host") || process.env.HOST,
  });
  let store;
  if (demo) {
    store = new MemoryStore();
    await seedDemo(store);
  } else {
    pool = createPool(config);
    await assertDatabaseReady(pool);
    store = new MysqlStore(pool);
  }
  const server = createApp({ store, config, mode: demo ? "demo" : "mysql" });
  server.on("error", async (error) => {
    console.error("Không mở được máy chủ Lizz:", error.code || error.name);
    await pool?.end();
    process.exitCode = 1;
  });
  server.listen(config.port, config.host, () => {
    console.log(
      `Lizz: ${config.origin} · ${demo ? "DEMO, dữ liệu mất khi dừng" : "MySQL"}`,
    );
  });
  const close = () =>
    server.close(async () => {
      await pool?.end();
      process.exit(0);
    });
  process.on("SIGTERM", close);
  process.on("SIGINT", close);
} catch (error) {
  console.error("Không khởi động được Lizz:", databaseDiagnostic(error));
  await pool?.end();
  process.exitCode = 1;
}
