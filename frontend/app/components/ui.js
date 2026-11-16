export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
export const field = (label, name, type = "text", value = "") =>
  /* HTML */ `<label
    >${escapeHtml(label)}<input
      name="${name}"
      type="${type}"
      value="${escapeHtml(value)}"
      required
      maxlength="${type === "password" ? 128 : 160}"
      ${
        type === "password" ? 'minlength="12" autocomplete="new-password"' : ""
      }
  /></label>`;
export const select = (
  label,
  name,
  rows,
  value = "",
  { required = true, placeholder = true } = {},
) =>
  /* HTML */ `<label
    >${escapeHtml(label)}<select
      name="${name}"
      aria-label="${escapeHtml(label)}"
      ${required ? "required" : ""}
    >
      ${placeholder ? `<option value="">Chọn ${escapeHtml(label.toLowerCase())}</option>` : ""}
      ${rows
        .map(
          (row) =>
            /* HTML */ `<option
              value="${escapeHtml(row.id)}"
              ${row.id === value ? "selected" : ""}
            >
              ${escapeHtml(row.name || row.code)}
            </option>`,
        )
        .join("")}
    </select></label
  >`;
export const errorBox = () =>
  '<p class="form-error" role="alert" id="form-error"></p>';

export function showError(container, error) {
  const target = container.querySelector(".form-error");
  if (target) target.textContent = error.message;
}

export function notify(message) {
  const target = document.querySelector("#notice");
  target.textContent = message;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    target.textContent = "";
  }, 5000);
}

export function openEditor(title, html) {
  const prior = document.querySelector("#editor");
  prior.close();
  const dialog = prior.cloneNode(false);
  prior.replaceWith(dialog);
  dialog.innerHTML = /* HTML */ `<div class="dialog-header">
      <h2 id="editor-title">${escapeHtml(title)}</h2>
      <button type="button" data-close aria-label="Đóng biểu mẫu">Đóng</button>
    </div>
    ${html}`;
  dialog.setAttribute("aria-labelledby", "editor-title");
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
  return dialog;
}

export function table(headers, rows, emptyMessage = "Chưa có dữ liệu.") {
  return /* HTML */ `<div class="table-scroll" tabindex="0" role="region" aria-label="Bảng dữ liệu, có thể cuộn ngang">
    <table>
      <thead>
        <tr>
          ${headers
            .map(
              (text) => /* HTML */ `<th scope="col">${escapeHtml(text)}</th>`,
            )
            .join("")}
        </tr>
      </thead>
      <tbody>
        ${
          rows.length
            ? rows.join("")
            : /* HTML */ `<tr>
                <td colspan="${headers.length}" class="empty">
                  ${escapeHtml(emptyMessage)}
                </td>
              </tr>`
        }
      </tbody>
    </table>
  </div>`;
}

export function heading(title, actions = "", message = "") {
  return `<header class="page-heading"><div><h1>${escapeHtml(title)}</h1>${message ? `<p role="status">${escapeHtml(message)}</p>` : ""}</div>${actions ? `<div class="actions">${actions}</div>` : ""}</header>`;
}

// Một nơi xử lý gửi form, trạng thái chờ và lỗi, dùng chung giữa các nghiệp vụ.
export function bindForm(
  container,
  save,
  refresh,
  successMessage = "Đã lưu dữ liệu.",
) {
  const form = container.querySelector("form");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit],button:not([type])");
    button.disabled = true;
    try {
      await save(Object.fromEntries(new FormData(form)));
      if (container.tagName === "DIALOG") container.close();
      notify(successMessage);
      await refresh();
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    }
  };
}

// Khung xác nhận dùng trong biểu mẫu, không mở hộp thoại của trình duyệt.
export async function confirmAction(
  container,
  {
    title,
    message,
    confirmLabel,
    requireReason = false,
    reasonLabel = "Lý do trả lại",
    reasonError = "Nhập lý do để Giảng viên đối chiếu và chỉnh sửa.",
  },
) {
  if (container.querySelector(".decision-panel"))
    return { confirmed: false, reason: "" };
  const focusBefore = document.activeElement;
  const section = document.createElement("section"),
    headingId = "decision-" + crypto.randomUUID();
  section.className = "decision-panel";
  section.setAttribute("aria-labelledby", headingId);
  section.innerHTML = `<h3 id="${headingId}">${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p>${requireReason ? `<label>${escapeHtml(reasonLabel)}<textarea rows="3" maxlength="1000" required></textarea></label>` : ""}<p class="decision-error" role="alert"></p><div class="dialog-actions"><button type="button" data-decision-cancel>Quay lại</button><button type="button" class="primary" data-decision-confirm>${escapeHtml(confirmLabel)}</button></div>`;
  container.append(section);
  return new Promise((resolve) => {
    const finish = (result) => {
      container.removeEventListener("close", closed);
      section.remove();
      if (focusBefore?.isConnected) focusBefore.focus();
      resolve(result);
    };
    const closed = () => finish({ confirmed: false, reason: "" });
    container.addEventListener("close", closed, { once: true });
    section.querySelector("[data-decision-cancel]").onclick = closed;
    section.querySelector("[data-decision-confirm]").onclick = () => {
      const reason = section.querySelector("textarea")?.value.trim() || "";
      if (requireReason && !reason) {
        section.querySelector(".decision-error").textContent = reasonError;
        section.querySelector("textarea").focus();
        return;
      }
      finish({ confirmed: true, reason });
    };
    section.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closed();
      }
    };
    (
      section.querySelector("textarea") ||
      section.querySelector("[data-decision-cancel]")
    ).focus();
  });
}
