import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  select,
  openEditor,
  errorBox,
  showError,
  confirmAction,
  notify,
} from "../components/ui.js";
import {
  CONTACT_FIELDS,
  PROFILE_STATUS,
  PROFILE_ACTION,
  contactValues,
} from "../../../shared/profile-workflow.js";
import { foldText } from "../../../shared/local-validation.js";
const time = (v) =>
  new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
function contactComparison(row) {
  const before = contactValues(row.beforeContact),
    after = contactValues(row.proposedContact);
  return (
    '<div class="pr-comparison">' +
    table(
      ["Thông tin", "Hồ sơ tại lúc gửi", "Nội dung đề nghị"],
      CONTACT_FIELDS.map(
        (f) =>
          `<tr class="${before[f.key] !== after[f.key] ? "pr-changed" : ""}"><td>${f.label}</td><td>${esc(before[f.key] || "Chưa cập nhật")}</td><td>${esc(after[f.key] || "Để trống")}</td></tr>`,
      ),
    ) +
    "</div>"
  );
}
export function contactSummary(contact) {
  const value = contactValues(contact);
  return `<dl class="record-summary">${CONTACT_FIELDS.map((f) => `<dt>${f.label}</dt><dd>${esc(value[f.key] || "Chưa cập nhật")}</dd>`).join("")}</dl>`;
}
export function openContactRequest(student, refresh, prior = null) {
  const values = contactValues(
    prior?.proposedContact || student.contactDetails,
  );
  const dialog = openEditor(
    prior ? "Bổ sung yêu cầu" : "Đề nghị cập nhật liên hệ",
    `<p>${esc(student.code)} · ${esc(student.fullName)}</p>${prior ? `<p class="hint">Nội dung cần đối chiếu: ${esc(prior.reviewHistory.at(-1)?.reason || "")}</p><details open><summary>Hồ sơ hiện tại để đối chiếu</summary>${contactSummary(student.contactDetails)}</details>` : ""}<form>${errorBox()}<div class="form-grid">${CONTACT_FIELDS.map((f) => `<label>${f.label}${f.key === "address" ? `<textarea name="${f.key}" maxlength="${f.max}" rows="3">${esc(values[f.key])}</textarea>` : `<input name="${f.key}" type="${f.key === "personalEmail" ? "email" : f.key.toLowerCase().includes("phone") ? "tel" : "text"}" maxlength="${f.max}" value="${esc(values[f.key])}">`}</label>`).join("")}</div><label>Lý do cập nhật<textarea name="reason" required maxlength="1000" rows="3">${esc(prior?.reason || "")}</textarea></label><p class="hint">Nội dung sẽ được cán bộ kiểm tra và Quản lý phê duyệt trước khi cập nhật hồ sơ.</p><button class="primary" type="submit">${prior ? "Kiểm tra và gửi lại" : "Kiểm tra và gửi đề nghị"}</button></form>`,
  );
  const form = dialog.querySelector("form");
  let previous = "",
    requestId = "";
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const proposedContact = Object.fromEntries(
        CONTACT_FIELDS.map((f) => [f.key, form.elements[f.key].value]),
      );
      const answer = await confirmAction(dialog, {
        title: prior ? "Gửi lại yêu cầu cập nhật" : "Gửi yêu cầu cập nhật",
        message: `${student.code} · ${student.fullName}. ${form.elements.reason.value} Hồ sơ hiện tại chỉ thay đổi sau khi được duyệt.`,
        confirmLabel: "Xác nhận gửi",
      });
      if (!answer.confirmed) return;
      const body = {
        proposedContact,
        reason: form.elements.reason.value,
        baseProfileVersion: student.version,
        ...(prior ? { version: prior.version } : {}),
      };
      const json = JSON.stringify(body);
      if (json !== previous) {
        previous = json;
        requestId = crypto.randomUUID();
      }
      await api(
        "/profile-requests" + (prior ? "/" + prior.id + "/resubmit" : ""),
        { method: "POST", body: { ...body, confirm: true, requestId } },
      );
      dialog.close();
      notify("Đã gửi yêu cầu cập nhật hồ sơ.");
      await refresh();
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  };
  return dialog;
}
export async function profileRequestsPage(container, actor) {
  let data,
    query = "",
    status = "",
    page = 1,
    request = 0;
  const refresh = async () => {
    const own = ++request,
      result = await api("/profile-requests");
    if (own !== request || !container.isConnected) return;
    data = result;
    render();
  };
  function render() {
    container.innerHTML =
      heading(
        actor.role === "STUDENT"
          ? "Yêu cầu hồ sơ của tôi"
          : "Yêu cầu cập nhật hồ sơ",
        data.canRequest && data.students[0]
          ? '<button id="pr-create" class="primary">Gửi đề nghị cập nhật</button>'
          : "",
      ) +
      `<section class="panel profile-requests-panel"><form class="pr-toolbar"><label>Tìm yêu cầu<input id="pr-search" type="search" placeholder="Mã sinh viên, họ tên hoặc mã yêu cầu" value="${esc(query)}"></label>${select("Trạng thái", "status", [{ id: "", name: "Tất cả trạng thái" }, ...Object.entries(PROFILE_STATUS).map(([id, name]) => ({ id, name }))], status, { required: false, placeholder: false })}<button type="button" id="pr-refresh">Tải lại</button></form><p class="form-error" id="pr-error" role="alert"></p><div id="pr-body"></div></section>`;
    const newButton = container.querySelector("#pr-create");
    if (newButton)
      newButton.onclick = () => openContactRequest(data.students[0], refresh);
    container.querySelector("form").onsubmit = (e) => e.preventDefault();
    container.querySelector("#pr-search").oninput = (e) => {
      query = e.target.value;
      page = 1;
      paint();
    };
    container.querySelector('[name="status"]').onchange = (e) => {
      status = e.target.value;
      page = 1;
      paint();
    };
    container.querySelector("#pr-refresh").onclick = async (e) => {
      e.target.disabled = true;
      try {
        await refresh();
      } catch (err) {
        container.querySelector("#pr-error").textContent = err.message;
      } finally {
        e.target.disabled = false;
      }
    };
    paint();
  }
  function paint() {
    const rows = data.rows.filter(
        (r) =>
          (!status || r.status === status) &&
          foldText(r.studentCode + " " + r.studentName + " " + r.id).includes(
            foldText(query),
          ),
      ),
      max = Math.max(1, Math.ceil(rows.length / 10));
    page = Math.min(page, max);
    const body = container.querySelector("#pr-body");
    body.innerHTML =
      table(
        ["Yêu cầu", "Sinh viên", "Trạng thái", "Phụ trách", "Cập nhật", ""],
        rows
          .slice((page - 1) * 10, page * 10)
          .map(
            (r) =>
              `<tr><td><b>${esc(r.id.slice(0, 8).toUpperCase())}</b></td><td><b>${esc(r.studentName)}</b><small>${esc(r.studentCode)}</small></td><td><span class="pr-status pr-${r.status.toLowerCase()}">${PROFILE_STATUS[r.status]}</span></td><td>${esc(r.assignedName || "Chưa tiếp nhận")}</td><td>${esc(time(r.updatedAt))}</td><td><button data-open="${r.id}">Xem yêu cầu</button></td></tr>`,
          ),
        "Chưa có yêu cầu phù hợp.",
      ) +
      `<div class="pagination"><span>${rows.length} yêu cầu · Trang ${page}/${max}</span><div><button id="pr-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="pr-next" ${page === max ? "disabled" : ""}>Sau</button></div></div>`;
    body.querySelector("#pr-prev").onclick = () => {
      page--;
      paint();
    };
    body.querySelector("#pr-next").onclick = () => {
      page++;
      paint();
    };
    for (const b of body.querySelectorAll("[data-open]"))
      b.onclick = () => detail(data.rows.find((r) => r.id === b.dataset.open));
  }
  function detail(row) {
    const dialog = openEditor(
      "Yêu cầu " + row.id.slice(0, 8).toUpperCase(),
      `${errorBox()}<div class="pr-detail-heading"><div><b>${esc(row.studentCode)} · ${esc(row.studentName)}</b><p>${esc(row.reason)}</p></div><span class="pr-status pr-${row.status.toLowerCase()}">${PROFILE_STATUS[row.status]}</span></div>${contactComparison(row)}<div class="pr-actions">${row.actions.map((action) => `<button ${action === "approve" ? 'class="primary"' : ""} data-action="${action}">${PROFILE_ACTION[action]}</button>`).join("")}</div><details class="pr-history"><summary>Lịch sử xử lý (${row.reviewHistory.length})</summary><ol>${row.reviewHistory.map((e) => `<li><div><b>${esc(e.action === "submit" ? "Gửi yêu cầu" : PROFILE_ACTION[e.action] || e.action)}</b><time>${esc(time(e.at))}</time></div><p>${esc(e.reason)}</p><small>${esc(e.actorName || "Người dùng")} · ${PROFILE_STATUS[e.to] || esc(e.to)}</small></li>`).join("")}</ol></details>`,
    );
    for (const b of dialog.querySelectorAll("[data-action]"))
      b.onclick = () => {
        const action = b.dataset.action;
        if (action === "resubmit")
          return openContactRequest(
            data.students.find((s) => s.id === row.studentId),
            refresh,
            row,
          );
        actionForm(row, action);
      };
  }
  function actionForm(row, action) {
    const dialog = openEditor(
      PROFILE_ACTION[action],
      `<p>${esc(row.studentCode)} · ${esc(row.studentName)}</p>${action === "approve" ? contactComparison(row) : ""}<form>${errorBox()}<label>${["reject", "request-info"].includes(action) ? "Lý do / nội dung cần bổ sung" : "Ý kiến xử lý"}<textarea name="reason" required maxlength="1000" rows="4"></textarea></label>${action === "approve" ? '<p class="hint">Chỉ áp dụng đúng nội dung đề nghị đã được kiểm tra. Hồ sơ gốc thay đổi sẽ bị chặn để đối chiếu lại.</p>' : ""}<button class="primary" type="submit">Kiểm tra và xác nhận</button></form>`,
    );
    const form = dialog.querySelector("form");
    let retryBody = "",
      key = "";
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const answer = await confirmAction(dialog, {
          title: PROFILE_ACTION[action],
          message: `${row.studentCode} · ${row.studentName}. ${form.elements.reason.value}`,
          confirmLabel: "Xác nhận " + PROFILE_ACTION[action].toLowerCase(),
        });
        if (!answer.confirmed) return;
        const body = {
          version: row.version,
          reason: form.elements.reason.value,
        };
        const json = JSON.stringify(body);
        if (json !== retryBody) {
          retryBody = json;
          key = crypto.randomUUID();
        }
        await api("/profile-requests/" + row.id + "/" + action, {
          method: "POST",
          body: { ...body, confirm: true, requestId: key },
        });
        dialog.close();
        notify("Đã cập nhật trạng thái yêu cầu.");
        await refresh();
      } catch (error) {
        showError(form, error);
      } finally {
        button.disabled = false;
      }
    };
  }
  await refresh();
}
