import { GeminiProvider } from "./gemini.js";
import { requireValue } from "../core/errors.js";

// Chỉ dùng câu thăm dò và công cụ echo, không đọc/gửi hồ sơ hoặc chạy nghiệp vụ.
export async function checkGemini(config, provider = new GeminiProvider(config)) {
  requireValue(provider.ready, "LizzChat chưa đủ cấu hình: kiểm tra LIZZCHAT_ENABLED, GEMINI_API_KEY và GEMINI_MODEL trong .env.", 503);
  const marker = "LIZZ_AI_OK", signal = AbortSignal.timeout(35000),
    history = [{ type: "user_input", content: [{ type: "text", text: "Kiểm tra kết nối. Hãy gọi lizz_health_echo với echo=LIZZ_AI_OK, sau đó trả lời đúng giá trị echo do công cụ trả về." }] }],
    tools = [{ type: "function", name: "lizz_health_echo", description: "Công cụ kiểm tra kết nối, chỉ trả lại chuỗi kiểm tra, không thay đổi dữ liệu.", parameters: { type: "object", properties: { echo: { type: "string" } }, required: ["echo"], additionalProperties: false } }],
    instruction = "Bạn đang kiểm tra kết nối của Lizz. Chỉ gọi công cụ đã cung cấp và trả lại kết quả kiểm tra.";
  const first = await provider.generate({ history, tools, instruction, signal });
  requireValue(first.calls.length === 1 && first.calls[0].name === "lizz_health_echo" && first.calls[0].arguments?.echo === marker,
    "Đã nhận phản hồi nhưng chưa xác nhận được khả năng gọi công cụ của model đã chọn.", 502);
  history.push(...first.steps, { type: "function_result", name: "lizz_health_echo", call_id: first.calls[0].id, result: [{ type: "text", text: JSON.stringify({ echo: marker }) }] });
  const final = await provider.generate({ history, tools, instruction, signal });
  requireValue(final.calls.length === 0 && final.text.includes(marker), "Model chưa hoàn tất vòng gọi công cụ và nhận kết quả.", 502);
  return { ready: true, connection: true, toolRoundTrip: true, data: "synthetic-probe-only" };
}
