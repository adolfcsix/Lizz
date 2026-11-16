import { AppError, requireValue } from "../core/errors.js";

const invalid = () => new AppError(502, "LizzChat chưa xử lý được phản hồi. Vui lòng gửi lại yêu cầu.");
async function readBounded(response) {
  if (!response.body?.getReader) {
    const text = await response.text();
    requireValue(Buffer.byteLength(text) <= 500000, "Phản hồi quá dài. Bạn hãy chia yêu cầu thành các phần nhỏ hơn.", 502);
    return text;
  }
  const reader = response.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      requireValue(bytes <= 500000, "Phản hồi quá dài. Bạn hãy chia yêu cầu thành các phần nhỏ hơn.", 502);
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    try { await reader.cancel(); } catch { /* Giữ nguyên lỗi đọc/timeout ban đầu. */ }
    reader.releaseLock();
  }
}

// Adapter duy nhất gọi Internet. Không nhận endpoint hay API key từ client.
export class GeminiProvider {
  constructor(config = {}, transport = fetch) {
    this.config = config;
    this.transport = transport;
  }

  get ready() {
    return Boolean(this.config.enabled && typeof this.config.apiKey === "string" && this.config.apiKey.trim() &&
      typeof this.config.model === "string" && this.config.model.trim());
  }

  async generate({ history, tools, instruction, signal }) {
    requireValue(
      this.ready,
      "LizzChat hiện chưa khả dụng. Bạn vẫn có thể sử dụng các chức năng khác.",
      503,
    );
    let response;
    signal ||= AbortSignal.timeout(35000);
    try {
      response = await this.transport(
        "https://generativelanguage.googleapis.com/v1beta/interactions",
        {
          method: "POST",
          signal,
          redirect: "error",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.config.apiKey.trim(),
          },
          body: JSON.stringify({
            model: this.config.model.trim(),
            store: false,
            input: history,
            tools,
            system_instruction: instruction,
          }),
        },
      );
    } catch (error) {
      throw new AppError(
        error.name === "TimeoutError" || signal?.aborted ? 504 : 502,
        "LizzChat phản hồi chậm hoặc kết nối bị gián đoạn. Yêu cầu chưa được thực hiện; vui lòng thử lại.",
      );
    }
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* Không đọc nội dung lỗi nhà cung cấp ra log/UI. */ }
      const message =
        response.status === 429
          ? "LizzChat đang nhận nhiều yêu cầu. Vui lòng thử lại sau."
          : "LizzChat chưa xử lý được yêu cầu. Vui lòng thử lại sau.";
      throw new AppError(response.status === 429 ? 429 : 502, message);
    }
    let raw;
    try { raw = await readBounded(response); }
    catch (error) {
      if (error.status) throw error;
      throw new AppError(signal.aborted ? 504 : 502, "LizzChat phản hồi chậm hoặc kết nối bị gián đoạn. Vui lòng thử lại.");
    }
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new AppError(
        502,
        "LizzChat chưa xử lý được phản hồi. Vui lòng gửi lại yêu cầu.",
      );
    }
    requireValue(
      value && ["completed", "requires_action"].includes(value.status) &&
      Array.isArray(value.steps) && value.steps.length <= 40 &&
      value.steps.every((step) => step && typeof step === "object" && typeof step.type === "string"),
      "LizzChat chưa xử lý được phản hồi. Vui lòng gửi lại yêu cầu.",
      502,
    );
    const output = value.steps.filter((step) => step.type === "model_output"),
      calls = value.steps.filter((step) => step.type === "function_call");
    if (output.some((step) => !Array.isArray(step.content) || step.content.some((part) => !part || typeof part.type !== "string" || (part.type === "text" && typeof part.text !== "string")))) throw invalid();
    if (calls.length > 5 || new Set(calls.map((call) => call.id)).size !== calls.length ||
      calls.some((call) => typeof call.id !== "string" || !call.id || call.id.length > 200 ||
        typeof call.name !== "string" || !call.name || call.name.length > 100 || !call.arguments ||
        typeof call.arguments !== "object" || Array.isArray(call.arguments)) ||
      (calls.length ? value.status !== "requires_action" : value.status !== "completed")) throw invalid();
    return {
      // Giữ nguyên thought signature nội bộ cho lượt tiếp theo, không gửi ra UI.
      steps: value.steps,
      text: output
        .flatMap((step) => step.content || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n"),
      calls,
    };
  }
}
