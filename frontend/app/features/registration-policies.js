import { studyPoliciesMarkup, bindStudyPolicies } from "./study-attempts.js";
import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  openEditor,
  errorBox,
  notify,
  bindForm,
  confirmAction,
  showError,
} from "../components/ui.js";
import {
  vietnamDateTimeInput,
  parseVietnamDateTime,
  formatVietnamTime,
} from "../../../shared/academic-format.js";
const periodLabel = (p, now) =>
  p.status === "CLOSED"
    ? "Đã đóng"
    : now < p.opensAt
      ? "Chưa đến giờ mở"
      : now < p.closesAt
        ? "Đang đăng ký"
        : now < p.withdrawUntil
          ? "Chỉ còn thời gian rút"
          : "Đã kết thúc";
export async function policiesPage(container, actor) {
  const [data, study] = await Promise.all([
    api("/academics/policies"),
    api("/academics/study-policies"),
  ]);
  const refresh = () => policiesPage(container, actor);
  const termName = (id) => data.terms.find((t) => t.id === id)?.code || "—";
  const subjectName = (id) => {
    const s = data.subjects.find((s) => s.id === id);
    return s ? s.code + " · " + s.name : "—";
  };
  container.innerHTML =
    heading(
      "Đợt đăng ký và điều kiện",
      '<button id="new-term">Thêm học kỳ</button><button id="new-period" class="primary">Mở đợt đăng ký</button>',
    ) +
    `<section class="panel policy-panel"><div class="section-heading"><h2>Học kỳ và hạn mức</h2><span>${data.terms.length} học kỳ</span></div>${table(
      ["Học kỳ", "Tín chỉ tối đa", "Ngưỡng đạt thang 10", ""],
      data.terms.map(
        (t) =>
          `<tr><td><b>${esc(t.code)}</b><small>${esc(t.name)}</small></td><td>${t.maxCredits}</td><td>${t.passScore}</td><td><button data-term="${t.id}">Chỉnh sửa</button></td></tr>`,
      ),
    )}</section>` +
    `<section class="panel policy-panel"><div class="section-heading"><h2>Thời gian đăng ký và rút</h2><span>Cập nhật ${esc(formatVietnamTime(data.serverTime))} · giờ Việt Nam</span></div>${table(
      ["Đợt / học kỳ", "Đối tượng", "Đăng ký", "Hạn rút", "Trạng thái", ""],
      data.periods.map(
        (p) =>
          `<tr><td><b>${esc(p.title)}</b><small>${esc(termName(p.termId))}</small></td><td>${esc(p.facultyId ? data.faculties.find((f) => f.id === p.facultyId)?.name || "Khoa chưa xác định" : "Tất cả khoa")}<small>${esc(p.cohortId ? data.cohorts.find((c) => c.id === p.cohortId)?.name || "Khóa chưa xác định" : "Tất cả khóa")}</small></td><td>${esc(formatVietnamTime(p.opensAt))}<small>đến ${esc(formatVietnamTime(p.closesAt))}</small></td><td>${esc(formatVietnamTime(p.withdrawUntil))}</td><td><span class="badge">${periodLabel(p, data.serverTime)}</span></td><td><button data-period="${p.id}">Chỉnh sửa</button></td></tr>`,
      ),
    )}</section>` +
    `<section class="panel policy-panel"><div class="section-heading"><h2>Môn tiên quyết</h2><button id="new-requirement">Thêm điều kiện</button></div><p class="panel-copy">Chỉ tính môn đã đạt và công bố điểm trước khi lớp mới bắt đầu.</p>${table(
      ["Môn muốn học", "Phải đạt trước", "Hiệu lực", ""],
      data.requirements.map(
        (r) =>
          `<tr><td>${esc(subjectName(r.subjectId))}</td><td>${esc(subjectName(r.requiredSubjectId))}</td><td>${r.active ? "Đang áp dụng" : "Đã tắt"}</td><td><button data-requirement="${r.id}">Chỉnh sửa</button></td></tr>`,
      ),
    )}</section>` +
    studyPoliciesMarkup(study);
  bindStudyPolicies(container.querySelector("#study-policies"), study, refresh);
  container.querySelector("#new-term").onclick = () =>
    termEditor(null, refresh);
  container.querySelector("#new-period").onclick = () =>
    periodEditor(data, null, refresh);
  container.querySelector("#new-requirement").onclick = () =>
    requirementEditor(data, null, refresh);
  for (const b of container.querySelectorAll("[data-term]"))
    b.onclick = () =>
      termEditor(
        data.terms.find((t) => t.id === b.dataset.term),
        refresh,
      );
  for (const b of container.querySelectorAll("[data-period]"))
    b.onclick = () =>
      periodEditor(
        data,
        data.periods.find((t) => t.id === b.dataset.period),
        refresh,
      );
  for (const b of container.querySelectorAll("[data-requirement]"))
    b.onclick = () =>
      requirementEditor(
        data,
        data.requirements.find((t) => t.id === b.dataset.requirement),
        refresh,
      );
  if (actor?.access?.canManageShared === false)
    for (const b of container.querySelectorAll("button")) b.hidden = true;
}
function termEditor(row, refresh) {
  const dialog = openEditor(
    row ? "Chỉnh sửa học kỳ" : "Thêm học kỳ",
    `<form>${errorBox()}<div class="form-grid">${field("Mã học kỳ", "code", "text", row?.code || "")}${field("Tên học kỳ", "name", "text", row?.name || "")}${field("Tín chỉ tối đa mỗi sinh viên", "maxCredits", "number", row?.maxCredits || "")}${field("Điểm tối thiểu đạt học phần", "passScore", "number", row?.passScore ?? "")}</div><p class="hint">Ngưỡng đạt do nhà trường cấu hình; không đổi hồi tố khi học kỳ đã công bố điểm. Hạ hạn mức tín chỉ không tự xóa đăng ký cũ.</p><button type="submit" class="primary">Lưu học kỳ</button></form>`,
  );
  dialog.querySelector("[name=passScore]").step = "0.01";
  if (row) dialog.querySelector("[name=code]").readOnly = true;
  bindForm(
    dialog,
    (input) =>
      api("/academics/terms" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: {
          ...input,
          maxCredits: Number(input.maxCredits),
          passScore: Number(input.passScore),
          ...(row ? { version: row.version } : {}),
        },
      }),
    refresh,
  );
}
function periodEditor(data, row, refresh) {
  if (!data.terms.length)
    return notify("Tạo học kỳ và hạn mức trước khi mở đợt.");
  const dialog = openEditor(
    row ? "Chỉnh sửa đợt đăng ký" : "Mở đợt đăng ký",
    `<form>${errorBox()}<div class="form-grid">${field("Tên đợt", "title", "text", row?.title || "")}${select(
      "Học kỳ",
      "termId",
      data.terms.map((t) => ({ id: t.id, name: t.code + " · " + t.name })),
      row?.termId,
    )}${select("Khoa được đăng ký", "facultyId", [{ id: "ALL", name: "Tất cả khoa" }, ...data.faculties], row?.facultyId || "ALL")}${select("Khóa được đăng ký", "cohortId", [{ id: "ALL", name: "Tất cả khóa" }, ...data.cohorts], row?.cohortId || "ALL")}${field("Mở đăng ký · giờ Việt Nam", "opensAt", "datetime-local", vietnamDateTimeInput(row?.opensAt))}${field("Đóng đăng ký · giờ Việt Nam", "closesAt", "datetime-local", vietnamDateTimeInput(row?.closesAt))}${field("Hạn rút · giờ Việt Nam", "withdrawUntil", "datetime-local", vietnamDateTimeInput(row?.withdrawUntil))}${select(
      "Hiệu lực",
      "status",
      [
        { id: "OPEN", name: "Bật theo thời gian đã đặt" },
        { id: "CLOSED", name: "Đóng đợt" },
      ],
      row?.status || "OPEN",
    )}</div><p class="hint">Ngày mở phải trước ngày đóng; hạn rút không sớm hơn ngày đóng. Hai đợt cùng học kỳ chỉ được trùng giờ nếu đối tượng không giao nhau. Đợt đã nhận đăng ký giữ nguyên khoa/khóa; mở đợt mới khi cần thay đối tượng.</p><button type="submit" class="primary">Lưu đợt đăng ký</button></form>`,
  );
  if (row) dialog.querySelector("[name=termId]").disabled = true;
  const form = dialog.querySelector("form"),
    button = form.querySelector('[type="submit"]');
  form.onsubmit = async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      const input = Object.fromEntries(new FormData(form));
      const body = {
        ...input,
        termId: row?.termId || input.termId,
        facultyId: input.facultyId === "ALL" ? null : input.facultyId,
        cohortId: input.cohortId === "ALL" ? null : input.cohortId,
        opensAt: parseVietnamDateTime(input.opensAt),
        closesAt: parseVietnamDateTime(input.closesAt),
        withdrawUntil: parseVietnamDateTime(input.withdrawUntil),
        ...(row ? { version: row.version } : {}),
      };
      const audience =
        (data.faculties.find((f) => f.id === body.facultyId)?.name ||
          "Tất cả khoa") +
        " · " +
        (data.cohorts.find((c) => c.id === body.cohortId)?.name ||
          "Tất cả khóa");
      const confirm = await confirmAction(dialog, {
        title: "Lưu đợt đăng ký",
        message:
          body.title +
          " · " +
          audience +
          ". Đăng ký từ " +
          formatVietnamTime(body.opensAt) +
          " đến " +
          formatVietnamTime(body.closesAt) +
          ". Hạn rút " +
          formatVietnamTime(body.withdrawUntil) +
          ". Thay đổi không tự kéo dài hạn rút của đăng ký đã có.",
        confirmLabel: "Xác nhận lưu đợt",
      });
      if (!confirm.confirmed) return;
      await api("/academics/periods" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body,
      });
      dialog.close();
      notify("Đã lưu đợt đăng ký.");
      await refresh();
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  };
}
function requirementEditor(data, row, refresh) {
  if (data.subjects.length < 2)
    return notify("Cần ít nhất hai môn để cấu hình tiên quyết.");
  const subjects = data.subjects.map((s) => ({
    id: s.id,
    name: s.code + " · " + s.name,
  }));
  const dialog = openEditor(
    row ? "Chỉnh sửa điều kiện" : "Thêm môn tiên quyết",
    `<form>${errorBox()}${select("Môn muốn học", "subjectId", subjects, row?.subjectId)}${select("Phải đạt trước môn", "requiredSubjectId", subjects, row?.requiredSubjectId)}${select(
      "Hiệu lực",
      "active",
      [
        { id: "true", name: "Áp dụng" },
        { id: "false", name: "Tắt điều kiện" },
      ],
      String(row?.active ?? true),
    )}<p class="hint">Môn tiên quyết không được phụ thuộc ngược vào môn đang chọn. Thay đổi điều kiện không hủy các đăng ký đã được chấp nhận.</p><button type="submit" class="primary">Lưu điều kiện</button></form>`,
  );
  if (row)
    for (const n of ["subjectId", "requiredSubjectId"])
      dialog.querySelector("[name=" + n + "]").disabled = true;
  bindForm(
    dialog,
    (input) =>
      api("/academics/requirements" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: {
          subjectId: row?.subjectId || input.subjectId,
          requiredSubjectId: row?.requiredSubjectId || input.requiredSubjectId,
          active: input.active === "true",
          ...(row ? { version: row.version } : {}),
        },
      }),
    refresh,
  );
}
