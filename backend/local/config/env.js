// Cấu hình chỉ đọc ở backend. Không gửi biến môi trường cho trình duyệt.
export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  const database = env.DB_NAME || "lizz";
  const dbPort = Number(env.DB_PORT || 3306);
  if (!/^[A-Za-z0-9_]+$/.test(database))
    throw Error("DB_NAME chỉ dùng chữ, số, gạch dưới.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT không hợp lệ.");
  if (!Number.isInteger(dbPort) || dbPort < 1 || dbPort > 65535)
    throw Error("DB_PORT không hợp lệ.");
  let origin;
  try {
    const url = new URL(env.APP_ORIGIN || `http://localhost:${port}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw Error();
    origin = url.origin;
  } catch { throw Error("APP_ORIGIN cần địa chỉ http/https của ứng dụng, không kèm đường dẫn hoặc thông tin đăng nhập."); }
  return {
    host: env.HOST || "127.0.0.1",
    port,
    origin,
    ai: {
      enabled: env.LIZZCHAT_ENABLED === "true",
      apiKey: env.GEMINI_API_KEY || "",
      model: env.GEMINI_MODEL || "",
    },
    database: {
      host: env.DB_HOST || "127.0.0.1",
      port: dbPort,
      database,
      user: env.DB_USER || "lizz_app",
      password: env.DB_PASSWORD || "",
      charset: "utf8mb4_unicode_ci",
      timezone: "Z",
      dateStrings: ["DATE"],
      connectionLimit: 5,
      multipleStatements: false,
      decimalNumbers: true,
    },
  };
}
