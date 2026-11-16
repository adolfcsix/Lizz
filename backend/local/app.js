import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { AuthService } from "./modules/auth/auth.service.js";
import { routeApi } from "./routes.js";
import { readCookie, json } from "./core/http.js";
import { checkOrigin } from "./middlewares/authorize.js";
import { databaseError } from "./core/errors.js";

import { AiService } from "./modules/ai/ai.service.js";
import { GeminiProvider } from "./integrations/gemini.js";

const root = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

async function serveFrontend(response, pathname) {
  // Chỉ các thư mục public cho phép; tuyệt đối không phục vụ backend/.env/database.
  const prefixes = [
    "/frontend/app/",
    "/shared/",
    "/assets/fonts/",
    "/assets/brand/",
    "/assets/images/",
  ];
  const target =
    pathname === "/"
      ? "frontend/app/index.html"
      : pathname === "/brand.png"
        ? "assets/brand/logo.png"
        : prefixes.some((prefix) => pathname.startsWith(prefix))
          ? pathname.slice(1)
          : null;
  if (!target) return json(response, { error: "Không tìm thấy trang." }, 404);
  const path = resolve(root, target);
  if (!path.startsWith(root + sep))
    return json(response, { error: "Đường dẫn không hợp lệ." }, 400);
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    });
    response.end(body);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    json(response, { error: "Không tìm thấy tệp." }, 404);
  }
}

export function createApp({ store, config, mode = "mysql", aiProvider }) {
  const auth = new AuthService(store);
  const ai = new AiService(store, aiProvider || new GeminiProvider(config.ai));
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, config.origin);
      if (!url.pathname.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(request.method))
          return json(response, { error: "Phương thức không hợp lệ." }, 405);
        return await serveFrontend(response, url.pathname);
      }
      checkOrigin(request, config.origin);
      const actor = await auth.current(readCookie(request, "lizz_session"));
      await routeApi({
        request,
        response,
        url,
        actor,
        auth,
        ai,
        store,
        config,
        mode,
      });
    } catch (raw) {
      const error = databaseError(raw);
      // Không in request body, SQL parameters, session token hoặc mật khẩu.
      if (!error.status)
        console.error("Lizz: lỗi xử lý yêu cầu", error.code || error.name);
      json(
        response,
        {
          error: error.status
            ? error.message
            : "Hệ thống chưa xử lý được yêu cầu. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ.",
        },
        error.status || 500,
      );
    }
  });
}
