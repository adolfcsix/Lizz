import { json, readJson } from "../../core/http.js";
import { authorize } from "../../middlewares/authorize.js";

export async function aiController(context) {
  const { request, response, actor, url, ai } = context;
  authorize(actor, ["MANAGER", "STAFF", "LECTURER", "STUDENT"]);
  if (request.method === "GET" && url.pathname === "/api/v1/ai/status")
    return json(response, {
      name: "LizzChat",
      ready: Boolean(ai.provider.ready),
      provider: "Gemini",
      message: ai.provider.ready
        ? "Đã cấu hình; kết nối thực tế được kiểm tra khi gửi tin."
        : "LizzChat hiện chưa khả dụng.",
    });
  if (request.method === "GET" && url.pathname === "/api/v1/ai/conversations")
    return json(
      response,
      await ai.history(actor, url.searchParams.get("q") || ""),
    );
  if (request.method === "POST" && url.pathname === "/api/v1/ai/messages")
    return json(response, await ai.message(await readJson(request), actor));
  const conversation = url.pathname.match(
    /^\/api\/v1\/ai\/conversations\/([a-f0-9-]{36})$/,
  );
  if (request.method === "GET" && conversation)
    return json(response, await ai.conversation(conversation[1], actor));
  const decision = url.pathname.match(
    /^\/api\/v1\/ai\/proposals\/([a-f0-9-]{36})\/(confirm|cancel)$/,
  );
  if (request.method === "POST" && decision) {
    const result = await ai.decide(
      decision[1],
      await readJson(request),
      actor,
      decision[2] === "cancel",
    );
    return json(
      response,
      {
        ...result,
        ...(result.blocked
          ? {
              error:
                result.proposal.status === "EXPIRED"
                  ? "Đề xuất đã hết hạn. Gửi lại yêu cầu để xem trước bản mới."
                  : "Dữ liệu đã thay đổi sau bản xem trước. Chuẩn bị và xác nhận lại.",
            }
          : {}),
      },
      result.blocked ? 409 : 200,
    );
  }
  return json(response, { error: "Không tìm thấy thao tác LizzChat." }, 404);
}
