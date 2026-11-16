import { api } from "../services/api.js";
import {
  heading,
  escapeHtml as esc,
  select,
  errorBox,
  showError,
} from "../components/ui.js";
import {
  NOTICE_KINDS,
  NOTICE_ROLE_KINDS,
} from "../../../shared/notification-labels.js";

const loads = new WeakMap();

export async function notificationsPage(
  container,
  actor,
  query = new URLSearchParams(),
) {
  const generation = (loads.get(container) || 0) + 1,
    hash = location.hash;
  loads.set(container, generation);
  const isCurrent = () =>
    container.isConnected &&
    loads.get(container) === generation &&
    location.hash === hash;
  let data;
  try {
    data = await api("/notifications?" + query);
  } catch (error) {
    if (!isCurrent()) return;
    const target = container.querySelector(".form-error");
    if (!target) throw error;
    showError(container, error);
    target.tabIndex = -1;
    target.focus();
    target.scrollIntoView({ block: "nearest" });
    return;
  }
  if (!isCurrent()) return;
  container.innerHTML =
    heading("Thông báo", '<button id="notice-reload">Làm mới</button>') +
    `<section class="panel notice-panel">${errorBox()}<form id="notice-filter" class="toolbar"><label>Tìm thông báo<input name="q" type="search" value="${esc(query.get("q"))}" placeholder="Nội dung, mã sinh viên hoặc lớp"></label>${select(
      "Nhóm thông báo",
      "kind",
      Object.entries(NOTICE_KINDS)
        .filter(([id]) => NOTICE_ROLE_KINDS[actor.role].includes(id))
        .map(([id, name]) => ({ id, name })),
      query.get("kind"),
      { required: false },
    )}${select("Trạng thái", "status", [{ id: "unread", name: "Chưa đọc" }], query.get("status"), { required: false })}<button>Tìm kiếm</button></form><div class="notice-summary"><p role="status">${data.unreadCount} thông báo chưa đọc</p><button id="notice-read-page" ${data.rows.some((r) => r.readAt === null) ? "" : "disabled"}>Đánh dấu trang này đã đọc</button></div><div class="notice-list">${data.rows.map((r) => `<article class="notice-item ${r.readAt === null ? "is-unread" : ""}"><div class="notice-dot" aria-hidden="true"></div><div class="notice-body"><div class="notice-meta"><span>${NOTICE_KINDS[r.kind]}</span><time datetime="${new Date(r.createdAt).toISOString()}">${esc(new Date(r.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}</time></div><h2>${esc(r.title)}</h2>${r.context ? `<p>${esc(r.context)}</p>` : ""}${r.dueDate ? `<p class="notice-deadline ${r.overdue ? "is-overdue" : ""}">${r.overdue ? "Đã quá hạn" : "Hạn xử lý"}: ${esc(r.dueDate.split("-").reverse().join("/"))}</p>` : ""}<div class="notice-actions"><button data-open-notice="${esc(r.id)}">Mở mục liên quan</button><button data-mark-notice="${esc(r.id)}">${r.readAt === null ? "Đánh dấu đã đọc" : "Đánh dấu chưa đọc"}</button></div></div></article>`).join("") || '<div class="notice-empty"><h2>Không có thông báo phù hợp</h2><p>Các cập nhật mới trong phạm vi của bạn sẽ xuất hiện tại đây.</p></div>'}</div><div class="pagination"><span>Trang ${data.page}/${Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button id="notice-prev" ${data.page <= 1 ? "disabled" : ""}>Trước</button><button id="notice-next" ${data.page * data.pageSize >= data.total ? "disabled" : ""}>Sau</button></div></section>`;
  const filter = container.querySelector("form");
  filter.elements.kind.options[0].textContent = "Tất cả nhóm";
  filter.elements.status.options[0].textContent = "Tất cả trạng thái";
  const refresh = () =>
    isCurrent()
      ? notificationsPage(container, actor, query)
      : Promise.resolve();
  const mark = async (rows, read) => {
    await api("/notifications/read", {
      method: "POST",
      body: { read, rows: rows.map(({ id, version }) => ({ id, version })) },
    });
    window.dispatchEvent(new Event("lizz:notifications-changed"));
  };
  async function run(button, action) {
    button.disabled = true;
    try {
      await action();
    } catch (error) {
      if (!isCurrent()) return;
      showError(container, error);
      const box = container.querySelector(".form-error");
      box.tabIndex = -1;
      box.focus();
      box.scrollIntoView({ block: "nearest" });
    } finally {
      button.disabled = false;
    }
  }
  filter.onsubmit = (event) => {
    event.preventDefault();
    notificationsPage(
      container,
      actor,
      new URLSearchParams(new FormData(filter)),
    ).catch((error) => {
      if (location.hash === hash && container.isConnected)
        showError(container, error);
    });
  };
  container.querySelector("#notice-reload").onclick = (e) =>
    run(e.currentTarget, refresh);
  container.querySelector("#notice-read-page").onclick = (e) =>
    run(e.currentTarget, async () => {
      await mark(
        data.rows.filter((r) => r.readAt === null),
        true,
      );
      await refresh();
    });
  for (const b of container.querySelectorAll("[data-mark-notice]"))
    b.onclick = () =>
      run(b, async () => {
        const row = data.rows.find((r) => r.id === b.dataset.markNotice);
        await mark([row], row.readAt === null);
        await refresh();
      });
  for (const b of container.querySelectorAll("[data-open-notice]"))
    b.onclick = () =>
      run(b, async () => {
        const row = data.rows.find((r) => r.id === b.dataset.openNotice);
        if (row.readAt === null) await mark([row], true);
        if (isCurrent()) location.hash = row.route;
      });
  for (const [id, step] of [
    ["notice-prev", -1],
    ["notice-next", 1],
  ])
    container.querySelector("#" + id).onclick = (e) =>
      run(e.currentTarget, async () => {
        query.set("page", data.page + step);
        await refresh();
      });
}
