function apiError(message, status = 0, data = null) {
  const error = new Error(message); error.status = status; error.data = data; return error;
}
export async function api(path, { method = "GET", body, signal, timeoutMs = path === "/ai/messages" ? 45000 : 20000 } = {}) {
  const controller = new AbortController(), cancel = () => controller.abort(signal?.reason);
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  const writing = !["GET", "HEAD"].includes(method.toUpperCase());
  try {
    const response = await fetch("/api/v1" + path, {
      method, credentials: "same-origin", signal: controller.signal,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.status === 401 && !["/auth/me", "/auth/login"].includes(path))
      window.dispatchEvent(new Event("lizz:session-expired"));
    let data;
    try { data = JSON.parse(await response.text()); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw apiError("Chưa nhận được phản hồi hợp lệ từ hệ thống. " +
        (writing ? "Kiểm tra trạng thái trước khi gửi lại." : "Vui lòng thử tải lại."), response.ok ? 502 : response.status || 502);
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw apiError("Phản hồi chưa đúng định dạng. Vui lòng tải lại hoặc liên hệ bộ phận hỗ trợ.", 502);
    if (!response.ok) throw apiError(typeof data.error === "string" ? data.error : "Không thể xử lý yêu cầu.", response.status, data);
    return data;
  } catch (error) {
    if (error.status !== undefined) throw error;
    if (signal?.aborted && !timedOut) {
      const cancelled = apiError("Đã dừng yêu cầu."); cancelled.name = "AbortError"; throw cancelled;
    }
    throw apiError((timedOut ? "Hệ thống phản hồi chậm. " : "Kết nối bị gián đoạn. ") +
      (writing ? "Kiểm tra trạng thái trước khi gửi lại." : "Vui lòng kiểm tra kết nối và thử tải lại."), timedOut ? 504 : 0);
  } finally {
    clearTimeout(timer); signal?.removeEventListener("abort", cancel);
  }
}
