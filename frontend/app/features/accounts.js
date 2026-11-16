import { accountAccessEditor } from "./account-access.js";
import { api } from "../services/api.js";
import { ROLES, accountIssues } from "../../../shared/local-validation.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  openEditor,
  errorBox,
  showError,
  notify,
} from "../components/ui.js";

export async function accountsPage(container, actor) {
  const { rows } = await api("/accounts");
  container.innerHTML =
    heading(
      "Tài khoản và phân quyền",
      '<button id="create-account" class="primary">Cấp tài khoản</button>',
    ) +
    '<section class="panel"><div class="toolbar"><label>Tìm tài khoản<input id="account-query" type="search" placeholder="Tên, email, tên đăng nhập"></label>' +
    select(
      "Vai trò",
      "roleFilter",
      Object.entries(ROLES).map(([id, name]) => ({ id, name })),
    ) +
    '</div><div id="account-table"></div></section>';
  const search = container.querySelector("#account-query");
  const filter = container.querySelector("[name=roleFilter]");
  filter.required = false;
  filter.options[0].textContent = "Tất cả vai trò";
  let page = 1;
  function paint() {
    const query = search.value.toLocaleLowerCase("vi");
    const result = rows.filter(
      (row) =>
        `${row.username} ${row.email} ${row.fullName}`
          .toLocaleLowerCase("vi")
          .includes(query) &&
        (!filter.value || row.role === filter.value),
    );
    const target = container.querySelector("#account-table");
    target.innerHTML =
      table(
        ["Tài khoản", "Họ tên", "Vai trò", "Trạng thái", ""],
        result.slice((page - 1) * 10, page * 10).map(
          (row) =>
            /* HTML */ `<tr>
              <td>
                <b>${esc(row.username)}</b><small>${esc(row.email)}</small>
              </td>
              <td>${esc(row.fullName)}</td>
              <td>${ROLES[row.role]}</td>
              <td>
                <span class="badge"
                  >${row.active ? "Đang hoạt động" : "Tạm khóa"}</span
                >
                ${row.mustChangePassword ? "<small>Cần đổi mật khẩu</small>" : ""}
              </td>
              <td>
                ${row.active && row.id !== actor?.id ? `<button data-reset="${row.id}">Cấp lại mật khẩu</button>` : ""}
                ${
                  ["STAFF", "STUDENT", "LECTURER"].includes(row.role)
                    ? `<button data-access="${row.id}">${row.role === "STAFF" ? "Phạm vi công việc" : "Đơn vị phụ trách"}</button>`
                    : ""
                }
                ${row.id !== actor?.id ? `<button data-toggle="${row.id}">${row.active ? "Khóa" : "Mở khóa"}</button>` : "<small>Tài khoản của bạn</small>"}
              </td>
            </tr>`,
        ),
      ) +
      /* HTML */ `<div class="pagination">
        <span>Trang ${page}/${Math.max(1, Math.ceil(result.length / 10))}</span
        ><button id="prev" ${page <= 1 ? "disabled" : ""}>Trước</button
        ><button id="next" ${page * 10 >= result.length ? "disabled" : ""}>
          Sau
        </button>
      </div>`;
    target.querySelector("#prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#next").onclick = () => {
      page++;
      paint();
    };
    for (const button of target.querySelectorAll("[data-reset]"))
      button.onclick = () =>
        resetPasswordForm(
          rows.find((row) => row.id === button.dataset.reset),
          () => accountsPage(container, actor),
        );
    for (const button of target.querySelectorAll("[data-access]"))
      button.onclick = () =>
        accountAccessEditor(button.dataset.access, () =>
          accountsPage(container, actor),
        ).catch((e) => notify(e.message));
    for (const button of target.querySelectorAll("[data-toggle]"))
      button.onclick = async () => {
        const account = rows.find((row) => row.id === button.dataset.toggle);
        if (
          !window.confirm(
            `${account.active ? "Khóa" : "Mở khóa"} tài khoản ${account.username}?`,
          )
        )
          return;
        button.disabled = true;
        try {
          await api("/accounts/" + account.id, {
            method: "PATCH",
            body: { active: !account.active, version: account.version },
          });
          await accountsPage(container, actor);
        } catch (error) {
          notify(error.message);
          button.disabled = false;
        }
      };
  }
  search.oninput = filter.onchange = () => {
    page = 1;
    paint();
  };
  container.querySelector("#create-account").onclick = () =>
    createAccountForm(() => accountsPage(container, actor));
  paint();
}

function createAccountForm(refresh) {
  const dialog = openEditor(
    "Cấp tài khoản",
    /* HTML */ `<p>
        Tạo mật khẩu ban đầu để cấp riêng cho người dùng. Mật khẩu không hiển
        thị lại sau khi lưu.
      </p>
      <form>
        ${errorBox()}
        <div class="form-grid">
          ${field("Tên đăng nhập", "username")}${field(
            "Họ và tên",
            "fullName",
          )}${field("Email trường / liên hệ", "email", "email")}${select(
            "Vai trò",
            "role",
            Object.entries(ROLES).map(([id, name]) => ({ id, name })),
          )}${field("Mật khẩu ban đầu", "password", "password")}${field(
            "Nhập lại mật khẩu",
            "passwordConfirm",
            "password",
          )}
        </div>
        <p class="hint">
          Mật khẩu 12–128 ký tự. Sinh viên, giảng viên và cán bộ không tự đăng
          ký. Người được cấp sẽ đổi mật khẩu trước khi sử dụng hệ thống.
        </p>
        <button class="primary">Kiểm tra và cấp tài khoản</button>
      </form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const input = Object.fromEntries(new FormData(form));
    const issues = accountIssues(input);
    if (issues.length) return showError(form, new Error(issues.join(" ")));
    if (
      !window.confirm(
        `Cấp tài khoản ${input.username}\nEmail: ${input.email}\nVai trò: ${ROLES[input.role]}?`,
      )
    )
      return;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await api("/accounts", { method: "POST", body: input });
      form.reset();
      dialog.close();
      notify("Đã cấp tài khoản.");
      await refresh();
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    } finally {
      input.password = "";
      input.passwordConfirm = "";
    }
  };
}

function resetPasswordForm(account, refresh) {
  const dialog = openEditor(
    "Cấp lại mật khẩu",
    `<p>Tài khoản: <b>${esc(account.username)}</b> · ${esc(account.fullName)}</p><form>${errorBox()}${field("Mật khẩu tạm thời", "password", "password")}${field("Nhập lại mật khẩu tạm thời", "passwordConfirm", "password")}${field("Lý do cấp lại", "reason")}<p class="hint">Mọi phiên đăng nhập của tài khoản sẽ kết thúc. Cấp mật khẩu qua kênh riêng; người dùng phải đổi lại khi đăng nhập.</p><label class="password-reset-confirm"><input type="checkbox" name="confirm" required> Tôi đã xác minh người nhận và đồng ý cấp lại mật khẩu.</label><button type="submit" class="primary">Xác nhận cấp lại</button></form>`,
  );
  const form = dialog.querySelector("form");
  form.elements.password.autocomplete = "new-password";
  form.elements.passwordConfirm.autocomplete = "new-password";
  form.elements.reason.minLength = 5;
  form.elements.reason.maxLength = 1000;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const input = Object.fromEntries(new FormData(form));
    input.confirm = form.elements.confirm.checked;
    input.version = account.version;
    try {
      await api(`/accounts/${account.id}/password-reset`, {
        method: "POST",
        body: input,
      });
      form.reset();
      dialog.close();
      notify("Đã cấp lại mật khẩu. Hãy chuyển riêng cho người dùng.");
      await refresh();
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    } finally {
      input.password = "";
      input.passwordConfirm = "";
    }
  };
}
