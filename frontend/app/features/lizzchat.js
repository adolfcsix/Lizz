import { api } from "../services/api.js";
import { chatSession } from "../services/session-storage.js";
import {
  escapeHtml as esc,
  notify,
  openEditor,
  confirmAction,
} from "../components/ui.js";
import { chatContext } from "./chat-context.js";
let state = null,
  host,
  historyTimer,
  expiryTimer;
const symbols = {
  book: '<path d="M5 7c4-2 7-2 11 1 4-3 7-3 11-1v18c-4-2-7-2-11 1-4-3-7-3-11-1ZM16 8v18M9 11l4 1m-4 4 4 1m7-5 3-1m-3 6 3-1"/>',
  history: '<path d="M3 11a9 9 0 1 1 2 7M3 5v6h6m3-4v6l4 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M5 12h14"/>',
  width:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16"/>',
  back: '<path d="m12 5-7 7 7 7M5 12h14"/>',
};
const glyph = (name, size = 18) =>
  `<svg viewBox="0 0 ${name === "book" ? 32 : 24} ${name === "book" ? 32 : 24}" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
const labels = {
  PREPARED: "Chờ bạn xác nhận",
  EXECUTED: "Đã thực hiện",
  CANCELLED: "Đã hủy",
  EXPIRED: "Đã hết hạn",
  STALE: "Dữ liệu đã thay đổi",
};
export function openLizzChat(message = "") {
  if (!state) return;
  state.open = true;
  state.view = "chat";
  if (message) state.draft = message;
  paint();
  host.querySelector("#lizzchat-input")?.focus();
}
export function resetLizzChat() {
  if (state) chatSession("remove", "lizzchat-" + state.actor.id);
  state = null;
  clearTimeout(historyTimer);
  clearTimeout(expiryTimer);
  document.body.classList.remove("chat-open", "chat-wide");
  host?.remove();
  host = null;
}
export async function mountLizzChat(actor, refreshPage) {
  if (state?.actor.id === actor.id && state.actor.version === actor.version) {
    state.refreshPage = refreshPage;
    const route = location.hash || "#home";
    if (state.route !== route) {
      state.route = route;
      if (state.open) paint();
    }
    return;
  }
  host?.remove();
  const savedId = chatSession("get", "lizzchat-" + actor.id);
  state = {
    actor,
    refreshPage,
    route: location.hash || "#home",
    open: false,
    wide: false,
    view: "chat",
    ready: false,
    busy: false,
    draft: "",
    error: "",
    checked: false,
    history: [],
    historyTotal: 0,
    historyQuery: "",
    loadingHistory: false,
    historyRequest: 0,
    conversation: {
      id: savedId || crypto.randomUUID(),
      version: 0,
      messages: [],
      proposals: [],
    },
  };
  host = document.createElement("div");
  host.id = "lizzchat";
  document.body.append(host);
  const current = state;
  paint();
  await checkConnection();
  if (state !== current) return;
  if (savedId) {
    try {
      state.conversation = await api("/ai/conversations/" + savedId);
    } catch {
      chatSession("remove", "lizzchat-" + actor.id);
      state.conversation.id = crypto.randomUUID();
    }
  }
  if (state === current) paint();
}
async function checkConnection() {
  if (!state) return;
  const current = state;
  state.checked = false;
  paint();
  try {
    const status = await api("/ai/status");
    if (state !== current) return;
    state.ready = status.ready;
    state.error = "";
  } catch {
    if (state === current) {
      state.ready = false;
      state.error = "Chưa kiểm tra được kết nối. Bạn có thể thử lại.";
    }
  } finally {
    if (state === current) {
      state.checked = true;
      paint();
    }
  }
}
function proposalCard(proposal) {
  const status =
    proposal.status === "PREPARED" && proposal.expiresAt <= Date.now()
      ? "EXPIRED"
      : proposal.status;
  return /* HTML */ `<article class="chat-proposal">
    <div class="chat-proposal-head">
      <b>${esc(proposal.title)}</b
      ><span>${labels[status] || "Cần kiểm tra"}</span>
    </div>
    ${proposal.preview
      .map(
        (row) =>
          "<dl>" +
          Object.entries(row)
            .map(
              ([key, value]) =>
                /* HTML */ `<div>
                  <dt>${esc(key)}</dt>
                  <dd>${esc(value)}</dd>
                </div>`,
            )
            .join("") +
          "</dl>",
      )
      .join("")}${status === "PREPARED"
      ? /* HTML */ `<p>
            Chưa ghi dữ liệu. Hạn xác nhận
            ${new Date(proposal.expiresAt).toLocaleTimeString("vi-VN")}.
          </p>
          <div class="actions">
            <button
              class="primary"
              data-confirm="${proposal.id}"
              ${state.busy ? "disabled" : ""}
            >
              Xác nhận thực hiện</button
            ><button
              data-cancel="${proposal.id}"
              ${state.busy ? "disabled" : ""}
            >
              Hủy đề xuất
            </button>
          </div>`
      : status === "EXPIRED"
        ? "<p>Đề xuất đã hết hạn. Gửi lại yêu cầu để xem bản mới.</p>"
        : ""}${proposal.status === "EXECUTED"
      ? proposal.action === "SUBMIT_TRANSFER"
        ? "<p>Đã gửi hồ sơ chờ Quản lý phê duyệt. Chưa chuyển lớp sinh viên.</p>"
        : "<p>Đã thực hiện yêu cầu. Bạn có thể kiểm tra tại trang liên quan.</p>"
      : ""}
  </article>`;
}

function historyView() {
  return `<div class="chat-history"><label>Tìm cuộc trò chuyện<input id="chat-history-query" type="search" maxlength="160" value="${esc(state.historyQuery)}" placeholder="Tìm theo nội dung đã hỏi"></label>${state.loadingHistory ? '<p class="chat-working" role="status">Đang tải lịch sử…</p>' : ""}<div class="chat-history-list">${state.history.length ? state.history.map((row) => `<button type="button" data-conversation="${row.id}"><b>${esc(row.title)}</b><span>${row.updatedAt ? esc(new Date(row.updatedAt).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })) : "Cuộc trò chuyện"}${row.pendingCount ? " · " + row.pendingCount + " đề xuất chờ xác nhận" : ""}</span></button>`).join("") : state.loadingHistory ? "" : '<p class="chat-empty">Chưa có cuộc trò chuyện phù hợp.</p>'}</div>${state.historyTotal > 20 ? '<p class="chat-caption">Hiển thị 20 cuộc trò chuyện gần nhất. Tìm từ khóa để xem cuộc khác.</p>' : ""}</div>`;
}
function paint() {
  if (!state || !host) return;
  const changedView = host.dataset.view !== state.view;
  host.dataset.view = state.view;
  const active = document.activeElement,
    focusedId = host.contains(active) ? active.id : null;
  const selection =
    focusedId && typeof active.selectionStart === "number"
      ? [active.selectionStart, active.selectionEnd]
      : null;
  const priorLog = host.querySelector(".chat-messages"),
    scroll = priorLog?.scrollTop || 0,
    nearEnd =
      !priorLog ||
      priorLog.scrollHeight - priorLog.scrollTop - priorLog.clientHeight < 40;
  document.body.classList.toggle("chat-open", state.open);
  document.body.classList.toggle("chat-wide", state.open && state.wide);
  const context = chatContext(state.actor.role, state.route),
    history = state.view === "history";
  host.innerHTML = `<button id="lizzchat-trigger" type="button" class="chat-launcher" aria-label="${state.open ? "Thu gọn" : "Mở"} LizzChat" aria-controls="lizzchat-panel" aria-expanded="${state.open}" aria-keyshortcuts="Alt+L" title="LizzChat · Alt+L"><span class="chat-seal">${glyph("book", 32)}<i aria-hidden="true"></i></span><span class="chat-launcher-label">LizzChat</span></button>${state.open ? `<section id="lizzchat-panel" class="chat-panel" role="dialog" aria-modal="${matchMedia("(max-width:1150px)").matches}" aria-label="LizzChat"><header><span class="chat-header-mark" aria-hidden="true">${glyph("book", 25)}</span><div class="chat-identity"><b>LizzChat</b><small>${state.checked ? (state.ready ? "Trợ lý đại học" : "Hiện chưa khả dụng") : "Đang kiểm tra…"}</small></div><div class="chat-header-actions"><button type="button" id="chat-history" aria-label="${history ? "Trở về trò chuyện" : "Lịch sử trò chuyện"}" title="${history ? "Trở về trò chuyện" : "Lịch sử"}" ${state.busy ? "disabled" : ""}>${glyph(history ? "back" : "history")}</button><button type="button" id="new-chat" aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới" ${state.busy ? "disabled" : ""}>${glyph("plus")}</button><button type="button" class="chat-width-button" id="chat-width" aria-label="${state.wide ? "Thu hẹp" : "Mở rộng"} khung trò chuyện" title="${state.wide ? "Thu hẹp" : "Mở rộng"}" aria-pressed="${state.wide}">${glyph("width")}</button><button type="button" id="close-chat" aria-label="Thu nhỏ LizzChat" title="Thu nhỏ">${glyph("close")}</button></div></header><div class="chat-messages" role="log" aria-live="polite">${history ? historyView() : state.conversation.messages.length ? state.conversation.messages.map((message) => `<article class="chat-message ${message.role === "user" ? "from-user" : ""}"><b>${message.role === "user" ? "Bạn" : "LizzChat"}</b><p>${esc(message.text)}</p>${message.sources?.length ? '<details class="chat-sources"><summary>Nguồn dữ liệu</summary>' + message.sources.map((source) => `<small>${esc(source.name)} · ${esc(new Date(source.asOf).toLocaleTimeString("vi-VN"))}</small>`).join("") + "</details>" : ""}</article>`).join("") : `<div class="chat-welcome"><span class="chat-context">${esc(context.label)}</span><div class="chat-welcome-mark" aria-hidden="true">${glyph("book", 42)}</div><h2>Bạn cần hỗ trợ gì?</h2><div class="chat-prompts">${context.prompts.map((text) => `<button type="button" data-prompt="${esc(text)}">${esc(text)}</button>`).join("")}</div></div>`}${history ? "" : state.conversation.proposals.map(proposalCard).join("")}${state.busy ? '<p class="chat-working" role="status">Đang xử lý yêu cầu…</p>' : ""}</div><p class="chat-error" role="alert">${esc(state.error)}</p>${!history ? `${state.checked && !state.ready ? '<div class="chat-connection"><span>Chưa thể gửi tin nhắn.</span><button type="button" id="chat-reconnect">Thử kết nối lại</button></div>' : ""}<form id="lizzchat-form"><label class="visually-hidden" for="lizzchat-input">Tin nhắn cho LizzChat</label><div class="chat-compose"><textarea id="lizzchat-input" rows="2" maxlength="3000" placeholder="Bạn muốn hỏi hoặc cần hỗ trợ gì?" ${state.busy ? "readonly" : ""}>${esc(state.draft)}</textarea><button type="submit" class="primary" ${!state.ready || state.busy ? "disabled" : ""}>Gửi</button></div><small>Kiểm tra nội dung trước khi xác nhận.</small></form>` : ""}</section>` : ""}`;
  host.querySelector(".chat-launcher").onclick = () =>
    state.open ? closeChat() : openLizzChat();
  if (!state.open) return;
  host.querySelector(".chat-panel").onkeydown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeChat();
      return;
    }
    if (event.key === "Tab" && matchMedia("(max-width:1150px)").matches) {
      const controls = [
        ...host.querySelectorAll(
          "button:not([disabled]),textarea,input,summary",
        ),
      ].filter((el) => el.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  };
  host.querySelector("#close-chat").onclick = closeChat;
  host.querySelector("#chat-width").onclick = () => {
    state.wide = !state.wide;
    paint();
  };
  host.querySelector("#chat-history").onclick = () => {
    if (history) {
      state.view = "chat";
      paint();
      host.querySelector("textarea")?.focus();
    } else {
      state.view = "history";
      paint();
      host.querySelector("#chat-history-query")?.focus();
      loadHistory();
    }
  };
  host.querySelector("#new-chat").onclick = newConversation;
  if (history) {
    host.querySelector("#chat-history-query").oninput = (event) => {
      state.historyQuery = event.target.value;
      clearTimeout(historyTimer);
      historyTimer = setTimeout(loadHistory, 250);
    };
    for (const b of host.querySelectorAll("[data-conversation]"))
      b.onclick = () => resumeConversation(b.dataset.conversation);
  } else {
    for (const b of host.querySelectorAll("[data-prompt]"))
      b.onclick = () => openLizzChat(b.dataset.prompt);
    host
      .querySelector("#chat-reconnect")
      ?.addEventListener("click", checkConnection);
    const input = host.querySelector("#lizzchat-input");
    input.oninput = (event) => {
      state.draft = event.target.value;
    };
    input.onkeydown = (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!state.busy && state.ready && state.draft.trim()) sendMessage();
      }
    };
    host.querySelector("#lizzchat-form").onsubmit = (event) => {
      event.preventDefault();
      sendMessage();
    };
    for (const b of host.querySelectorAll("[data-confirm],[data-cancel]"))
      b.onclick = () =>
        decideProposal(
          b.dataset.confirm || b.dataset.cancel,
          Boolean(b.dataset.cancel),
        );
  }
  const log = host.querySelector(".chat-messages");
  log.scrollTop = history
    ? changedView
      ? 0
      : scroll
    : nearEnd
      ? log.scrollHeight
      : scroll;
  if (focusedId) {
    const target = host.querySelector("#" + focusedId);
    if (target) {
      target.focus({ preventScroll: true });
      if (selection && target.setSelectionRange)
        target.setSelectionRange(...selection);
    }
  }
  clearTimeout(expiryTimer);
  const expiry = state.conversation.proposals
    .filter((p) => p.status === "PREPARED" && p.expiresAt > Date.now())
    .map((p) => p.expiresAt);
  if (expiry.length)
    expiryTimer = setTimeout(
      () => {
        if (state?.open) paint();
      },
      Math.min(...expiry) - Date.now() + 30,
    );
}
function closeChat() {
  if (!state) return;
  state.open = false;
  paint();
  host.querySelector(".chat-launcher").focus();
}
async function loadHistory() {
  if (!state) return;
  const current = state,
    sequence = ++state.historyRequest;
  state.loadingHistory = true;
  state.error = "";
  paint();
  try {
    const result = await api(
      "/ai/conversations?q=" + encodeURIComponent(state.historyQuery),
    );
    if (state !== current || sequence !== state.historyRequest) return;
    state.history = result.rows;
    state.historyTotal = result.total;
  } catch (error) {
    if (state === current && sequence === state.historyRequest)
      state.error = error.message;
  } finally {
    if (state === current && sequence === state.historyRequest) {
      state.loadingHistory = false;
      if (state.view === "history") paint();
    }
  }
}
async function discardDraft() {
  if (!state.draft.trim()) return true;
  const dialog = openEditor("Tin nhắn chưa gửi", "");
  const decision = await confirmAction(dialog, {
    title: "Chuyển cuộc trò chuyện?",
    message:
      "Tin nhắn bạn đang soạn chưa được gửi. Tiếp tục sẽ bỏ phần đang soạn; các cuộc trò chuyện đã lưu vẫn được giữ.",
    confirmLabel: "Tiếp tục",
  });
  dialog.close();
  return decision.confirmed;
}
async function newConversation() {
  const current = state;
  if (!current || current.busy || !(await discardDraft()) || state !== current)
    return;
  state.conversation = {
    id: crypto.randomUUID(),
    version: 0,
    messages: [],
    proposals: [],
  };
  state.view = "chat";
  state.draft = "";
  state.error = "";
  state.pending = null;
  chatSession("remove", "lizzchat-" + state.actor.id);
  paint();
  host.querySelector("textarea")?.focus();
}
async function resumeConversation(id) {
  const current = state;
  if (!current || current.busy || !(await discardDraft()) || state !== current)
    return;
  state.busy = true;
  paint();
  try {
    const conversation = await api("/ai/conversations/" + id);
    if (state !== current) return;
    state.conversation = conversation;
    state.view = "chat";
    state.draft = "";
    state.pending = null;
    state.error = "";
    chatSession("set", "lizzchat-" + state.actor.id, id);
    paint();
    host.querySelector("textarea")?.focus();
  } catch (error) {
    if (state === current) state.error = error.message;
  } finally {
    if (state === current) {
      state.busy = false;
      paint();
    }
  }
}
document.addEventListener("keydown", (event) => {
  if (
    state &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.toLowerCase() === "l"
  ) {
    event.preventDefault();
    state.open ? closeChat() : openLizzChat();
  }
});

async function sendMessage() {
  if (!state?.draft.trim() || state.busy || !state.ready) return;
  const current = state;
  if (!state.pending || state.pending.message !== state.draft.trim())
    state.pending = {
      conversationId: state.conversation.id,
      version: state.conversation.version,
      requestId: crypto.randomUUID(),
      message: state.draft.trim(),
    };
  state.busy = true;
  state.error = "";
  paint();
  try {
    const conversation = await api("/ai/messages", {
      method: "POST",
      body: state.pending,
    });
    if (state !== current) return;
    state.conversation = conversation;
    state.pending = null;
    state.draft = "";
    chatSession("set", "lizzchat-" + state.actor.id, conversation.id);
  } catch (error) {
    if (state === current) {
      state.error = error.message;
      if (error.status === 409) {
        try {
          const latest = await api(
            "/ai/conversations/" + state.conversation.id,
          );
          if (state !== current) return;
          state.conversation = latest;
          state.pending = null;
          state.error =
            "Đã tải lại hội thoại mới nhất. Kiểm tra nội dung rồi gửi lại yêu cầu nếu cần.";
        } catch {
          /* Giữ yêu cầu và mã chống lặp khi chưa đồng bộ được. */
        }
      }
    }
  } finally {
    if (state === current) {
      state.busy = false;
      paint();
    }
  }
}

async function decideProposal(id, cancel) {
  const proposal = state.conversation.proposals.find((row) => row.id === id);
  if (!proposal || state.busy) return;
  const current = state;
  state.busy = true;
  state.error = "";
  paint();
  try {
    const result = await api(
      "/ai/proposals/" + id + (cancel ? "/cancel" : "/confirm"),
      { method: "POST", body: { version: proposal.version, confirm: !cancel } },
    );
    if (state !== current) return;
    Object.assign(proposal, result.proposal);
    if (proposal.status === "EXECUTED") {
      notify(
        proposal.action === "SUBMIT_TRANSFER"
          ? "Đã gửi đề nghị chờ duyệt. Chưa chuyển lớp."
          : "LizzChat đã thực hiện sau xác nhận của bạn.",
      );
      await state.refreshPage();
    }
  } catch (error) {
    if (state !== current) return;
    if (error.data?.proposal) Object.assign(proposal, error.data.proposal);
    state.error = error.message;
  } finally {
    if (state === current) {
      state.busy = false;
      paint();
    }
  }
}

matchMedia("(max-width:1150px)").addEventListener("change", () => {
  if (state?.open) paint();
});
