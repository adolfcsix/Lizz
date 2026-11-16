import { api } from "../services/api.js";
import {
  openEditor,
  errorBox,
  select,
  escapeHtml as esc,
  bindForm,
  confirmAction,
} from "../components/ui.js";
export async function accountAccessEditor(id, refresh) {
  const data = await api("/accounts/" + id + "/access"),
    staff = data.account.role === "STAFF";
  const dialog = openEditor(
    staff ? "Phạm vi công việc" : "Đơn vị của tài khoản",
    `<p><b>${esc(data.account.fullName)}</b> · ${esc(data.account.username)}</p><form>${errorBox()}${staff ? `<label>Phạm vi<select name="scopeMode"><option value="LIMITED">Theo khoa / khóa</option><option value="ALL">Toàn trường</option></select></label><div id="scope-rows"></div><button id="add-scope" type="button">Thêm khoa / khóa</button><p id="scope-help" class="hint">Danh sách trống nghĩa là chưa được giao dữ liệu nghiệp vụ. Không trộn toàn khoa với từng khóa trong cùng khoa.</p>` : `${select("Khoa phụ trách", "facultyId", data.faculties, data.account.affiliationFacultyId || "")}${data.account.role === "STUDENT" ? select("Khóa dự kiến", "cohortId", data.cohorts, data.account.affiliationCohortId || "") : ""}<p class="hint">Dùng để phân công tài khoản chưa có hồ sơ và Giảng viên. Hồ sơ sinh viên đã liên kết được phân quyền theo lớp hành chính hiện tại.</p>`}<label>Lý do cập nhật<textarea name="reason" required maxlength="1000" rows="3"></textarea></label><p class="hint">Cập nhật sẽ thu hồi phiên đăng nhập của tài khoản này. Người dùng cần đăng nhập lại để nhận phạm vi mới.</p><button class="primary" type="submit">Kiểm tra và xác nhận</button></form>`,
  );
  const target = dialog.querySelector("#scope-rows");
  if (staff) {
    const add = (r = {}) => {
      const div = document.createElement("div");
      div.className = "scope-config-row";
      div.innerHTML =
        select("Khoa", "facultyId", data.faculties, r.facultyId || "") +
        select("Khóa", "cohortId", data.cohorts, r.cohortId || "") +
        '<button type="button" aria-label="Bỏ phạm vi">Bỏ</button>';
      const cohort = div.querySelector('[name="cohortId"]');
      cohort.required = false;
      cohort.options[0].textContent = "Tất cả khóa";
      div.querySelector("button").onclick = () => div.remove();
      target.append(div);
    };
    const active = data.scopes.filter((s) => s.active);
    active.filter((s) => s.scopeType === "FACULTY").forEach(add);
    const mode = dialog.querySelector('[name="scopeMode"]');
    mode.value = active.some((s) => s.scopeType === "ALL") ? "ALL" : "LIMITED";
    const toggle = () => {
      const all = mode.value === "ALL";
      target.hidden = all;
      dialog.querySelector("#scope-help").hidden = all;
      dialog.querySelector("#add-scope").hidden = all;
      target.querySelectorAll("select").forEach((e) => (e.disabled = all));
    };
    mode.onchange = toggle;
    toggle();
    dialog.querySelector("#add-scope").onclick = () => {
      if (target.children.length < 30) add();
    };
  } else {
    for (const e of dialog.querySelectorAll("select")) {
      e.required = false;
      e.options[0].textContent =
        e.name === "facultyId" ? "Chưa phân khoa" : "Tất cả khóa";
    }
  }
  const requestId = crypto.randomUUID();
  bindForm(
    dialog,
    async (input) => {
      const all = staff && input.scopeMode === "ALL",
        scopes =
          staff && !all
            ? [...target.children].map((row) => ({
                facultyId: row.querySelector('[name="facultyId"]').value,
                cohortId: row.querySelector('[name="cohortId"]').value || null,
              }))
            : [];
      const description = staff
        ? all
          ? "Toàn trường"
          : scopes.length
            ? scopes
                .map(
                  (s) =>
                    (data.faculties.find((f) => f.id === s.facultyId)?.name ||
                      "Chưa chọn khoa") +
                    " · " +
                    (data.cohorts.find((c) => c.id === s.cohortId)?.name ||
                      "Tất cả khóa"),
                )
                .join("; ")
            : "Chưa giao dữ liệu nghiệp vụ"
        : data.faculties.find((f) => f.id === input.facultyId)?.name ||
          "Chưa phân khoa";
      const decision = await confirmAction(dialog, {
        title: "Xác nhận phân phạm vi",
        message:
          data.account.fullName +
          ": " +
          description +
          ". Phiên hiện tại sẽ được thu hồi.",
        confirmLabel: "Xác nhận cập nhật",
      });
      if (!decision.confirmed)
        throw Error("Chưa cập nhật. Bạn có thể kiểm tra lại phạm vi.");
      return api("/accounts/" + id + "/access", {
        method: "POST",
        body: {
          version: data.account.version,
          requestId,
          confirm: true,
          reason: input.reason,
          ...(staff
            ? { allSchools: all, scopes }
            : {
                facultyId: input.facultyId || null,
                cohortId: input.cohortId || null,
              }),
        },
      });
    },
    refresh,
    "Đã cập nhật phạm vi và thu hồi phiên đăng nhập cũ.",
  );
}
