import { json, readJson, readCookie } from "../../core/http.js";
import { authorize } from "../../middlewares/authorize.js";

export async function authController(context) {
  const { request, response, auth, actor, url, config } = context;
  const secure = config.origin.startsWith("https:") ? "; Secure" : "";
  const cookie = (value) =>
    `lizz_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? 28800 : 0}${secure}`;
  if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
    const input = await readJson(request);
    const result = await auth.login(
      input.identifier,
      input.password,
      request.socket.remoteAddress,
    );
    return json(response, { account: result.account }, 200, {
      "Set-Cookie": cookie(result.token),
    });
  }
  authorize(actor, ["MANAGER", "STAFF", "LECTURER", "STUDENT"]);
  if (request.method === "GET" && url.pathname === "/api/v1/auth/me")
    return json(response, { account: actor });
  if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
    await auth.logout(readCookie(request, "lizz_session"));
    return json(response, { ok: true }, 200, { "Set-Cookie": cookie("") });
  }
  if (request.method === "POST" && url.pathname === "/api/v1/auth/password") {
    await auth.changePassword(actor, await readJson(request));
    return json(response, { ok: true }, 200, { "Set-Cookie": cookie("") });
  }
  json(response, { error: "Không tìm thấy thao tác đăng nhập." }, 404);
}
