// Trình duyệt chặn bộ nhớ phiên vẫn dùng được ứng dụng; hội thoại hiện tại giữ trong state.
export function chatSession(action, key, value) {
  try {
    const storage = globalThis.sessionStorage;
    if (action === "get") return storage?.getItem(key) || null;
    if (action === "set") storage?.setItem(key, value);
    if (action === "remove") storage?.removeItem(key);
  } catch { /* Không làm lỗi đăng nhập/đăng xuất hay khung chat khi storage bị chặn. */ }
  return null;
}
