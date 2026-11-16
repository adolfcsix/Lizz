import { brand } from "../components/brand.js";
import { api } from "../services/api.js";
import {
  field,
  errorBox,
  showError,
  openEditor,
  notify,
} from "../components/ui.js";

function authLayout(content) {
  return `<main class="auth-layout">
    <section class="auth-story" aria-label="Không gian đại học">
      <a class="auth-brand" href="/" aria-label="Lizz University">${brand({ light: true })}</a>
      <div class="auth-story-copy"><small>HỌC TẬP · GIẢNG DẠY · KẾT NỐI</small>
        <h1>Tri thức được kết nối.<br>Hành trình được đồng hành.</h1>
        <p>Một không gian chung cho cộng đồng đại học.</p>
      </div><small>KHÔNG GIAN ĐẠI HỌC</small>
    </section>
    <section class="auth-access"><div class="auth-card">${brand()}${content}</div>
      <footer class="auth-footer"><span>© Lizz University</span><span>Cổng thông tin đại học</span></footer>
    </section></main>`;
}

function passwordField(label, name, autocomplete = "current-password") {
  return `<label>${label}<span class="password-field"><input name="${name}" type="password" autocomplete="${autocomplete}" placeholder="${label}" required maxlength="128" ${autocomplete === "new-password" ? 'minlength="12"' : ""}><button class="password-visibility" type="button" aria-label="Hiện ${label.toLowerCase()}" aria-pressed="false">Hiện</button></span></label>`;
}

function bindVisibility(container) {
  for (const button of container.querySelectorAll(".password-visibility")) {
    const input = button.previousElementSibling;
    button.onclick = () => {
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.textContent = visible ? "Ẩn" : "Hiện";
      button.setAttribute(
        "aria-label",
        `${visible ? "Ẩn" : "Hiện"} ${input.name === "passwordConfirm" ? "mật khẩu nhập lại" : "mật khẩu"}`,
      );
      button.setAttribute("aria-pressed", String(visible));
    };
  }
}

export function loginPage(container, onLogin) {
  container.innerHTML =
    authLayout(`<h2>Chào mừng bạn trở lại</h2><p>Đăng nhập bằng tài khoản nhà trường cấp.</p>
    <div class="auth-audience" role="group" aria-label="Hướng dẫn đăng nhập theo đối tượng">
      <button type="button" data-audience="student" aria-pressed="true">Sinh viên</button>
      <button type="button" data-audience="staff" aria-pressed="false">Cán bộ, giảng viên</button>
    </div>
    <form id="login">${errorBox()}
      <label><span id="identifier-label">Mã sinh viên hoặc email</span><input name="identifier" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Nhập mã sinh viên hoặc email trường" required maxlength="254" aria-describedby="login-guide"></label>
      ${passwordField("Mật khẩu", "password")}
      <div class="auth-form-meta"><span id="login-guide">Có thể dùng tên đăng nhập được cấp.</span><button type="button" id="forgot-password" class="text-button">Quên mật khẩu?</button></div>
      <button class="primary login-submit" type="submit">Đăng nhập</button>
    </form>
    <div class="auth-help"><b>Bạn cần hỗ trợ tài khoản?</b><p>Liên hệ bộ phận quản trị của nhà trường.</p><button type="button" id="login-help" class="text-button">Thông tin đăng nhập</button></div>`);
  const form = container.querySelector("#login");
  bindVisibility(container);
  for (const button of container.querySelectorAll("[data-audience]"))
    button.onclick = () => {
      for (const item of container.querySelectorAll("[data-audience]"))
        item.setAttribute("aria-pressed", String(item === button));
      const student = button.dataset.audience === "student";
      container.querySelector("#identifier-label").textContent = student
        ? "Mã sinh viên hoặc email"
        : "Email hoặc tên đăng nhập";
      form.elements.identifier.placeholder = student
        ? "Nhập mã sinh viên hoặc email trường"
        : "Nhập email trường hoặc tên đăng nhập";
      container.querySelector("#login-guide").textContent = student
        ? "Có thể dùng tên đăng nhập được cấp."
        : "Dành cho giảng viên, nhân viên và quản lý.";
    };
  container.querySelector("#forgot-password").onclick = () =>
    openEditor(
      "Cấp lại mật khẩu",
      "<p>Liên hệ bộ phận quản trị nhà trường và cung cấp mã sinh viên hoặc tên đăng nhập để xác minh tài khoản. Mật khẩu mới được cấp qua kênh riêng; bạn sẽ đổi lại ngay khi đăng nhập.</p><p>Không gửi mật khẩu qua LizzChat hoặc chia sẻ với người khác.</p>",
    );
  container.querySelector("#login-help").onclick = () =>
    openEditor(
      "Thông tin đăng nhập",
      "<p>Sinh viên dùng mã sinh viên đã liên kết hồ sơ, email trường hoặc tên đăng nhập. Khi hồ sơ chưa được liên kết, dùng email hoặc tên đăng nhập được cấp.</p><p>Giảng viên, nhân viên và quản lý dùng email hoặc tên đăng nhập do nhà trường cấp. Hệ thống mở không gian làm việc theo quyền của tài khoản.</p><p>Nếu chưa có tài khoản, liên hệ bộ phận quản trị nhà trường để được cấp.</p>",
    );
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector(".login-submit");
    button.disabled = true;
    button.textContent = "Đang đăng nhập…";
    form.setAttribute("aria-busy", "true");
    const password = form.elements.password.value;
    form.elements.password.value = "";
    try {
      await onLogin(
        (
          await api("/auth/login", {
            method: "POST",
            body: {
              identifier: form.elements.identifier.value.trim(),
              password,
            },
          })
        ).account,
      );
    } catch (error) {
      showError(form, error);
      form.elements.password.focus();
    } finally {
      button.disabled = false;
      button.textContent = "Đăng nhập";
      form.removeAttribute("aria-busy");
    }
  };
}

export function passwordSetupPage(container, onLogout) {
  container.innerHTML =
    authLayout(`<h2>Thiết lập mật khẩu của bạn</h2><p>Đổi mật khẩu được cấp để tiếp tục vào hệ thống.</p>
    <form id="password-setup">${errorBox()}${passwordField("Mật khẩu được cấp", "currentPassword")}${passwordField("Mật khẩu mới", "password", "new-password")}${passwordField("Nhập lại mật khẩu mới", "passwordConfirm", "new-password")}
      <p class="hint">Mật khẩu mới gồm 12–128 ký tự và khác mật khẩu được cấp.</p>
      <button class="primary login-submit" type="submit">Lưu mật khẩu mới</button>
    </form><div class="auth-help"><button id="setup-logout" type="button" class="text-button">Đăng xuất</button></div>`);
  bindVisibility(container);
  const form = container.querySelector("form");
  container.querySelector("#setup-logout").onclick = async () => {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      await onLogout();
    } catch (error) {
      showError(form, error);
    }
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector(".login-submit");
    button.disabled = true;
    button.textContent = "Đang lưu…";
    form.setAttribute("aria-busy", "true");
    try {
      await api("/auth/password", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      form.reset();
      await onLogout();
      notify("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
      button.textContent = "Lưu mật khẩu mới";
      form.removeAttribute("aria-busy");
    }
  };
}

export function changePassword(onLogout) {
  const dialog = openEditor(
    "Đổi mật khẩu",
    /* HTML */ `<form>
      ${errorBox()}${field(
        "Mật khẩu hiện tại",
        "currentPassword",
        "password",
      )}${field("Mật khẩu mới", "password", "password")}${field(
        "Nhập lại mật khẩu mới",
        "passwordConfirm",
        "password",
      )}
      <p class="hint">
        Sau khi đổi, mọi phiên đăng nhập của tài khoản sẽ kết thúc.
      </p>
      <button class="primary">Đổi mật khẩu</button>
    </form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      await api("/auth/password", {
        method: "POST",
        body: Object.fromEntries(new FormData(form)),
      });
      form.reset();
      dialog.close();
      notify("Đã đổi mật khẩu. Vui lòng đăng nhập lại.");
      await onLogout();
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    }
  };
}
