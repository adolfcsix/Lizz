import { api } from "../services/api.js";
import {
  openEditor,
  errorBox,
  bindForm,
  escapeHtml as esc,
  select,
  table,
} from "../components/ui.js";
export function gradeSchemeEditor(data, refresh) {
  const rows = data.scheme?.components || [];
  const dialog = openEditor(
    "Cấu hình điểm thành phần",
    `<p><b>${esc(data.section.code)}</b> · Tổng trọng số phải bằng 100%. Cấu hình được khóa khi lớp bắt đầu có điểm.</p><form>${errorBox()}<div id="scheme-rows"></div><button type="button" id="add-component">Thêm thành phần</button><p id="weight-total" class="hint" aria-live="polite"></p><div class="dialog-actions"><button type="submit" class="primary">Lưu cấu hình</button></div></form>`,
  );
  const target = dialog.querySelector("#scheme-rows");
  const update = () =>
    (dialog.querySelector("#weight-total").textContent =
      "Tổng trọng số: " +
      [...target.querySelectorAll('[name="weight"]')].reduce(
        (n, e) => n + Number(e.value),
        0,
      ) +
      "%");
  const add = (r = {}) => {
    const row = document.createElement("div");
    row.className = "grade-config-row";
    row.innerHTML = `<label>Mã thành phần<input name="code" required pattern="[A-Z][A-Z0-9_]{0,19}" maxlength="20" value="${esc(r.code || "")}" placeholder="VD: QT"></label><label>Tên thành phần<input name="name" required maxlength="80" value="${esc(r.name || "")}" placeholder="VD: Quá trình"></label><label>Trọng số (%)<input name="weight" type="number" min="1" max="100" step="1" required value="${r.weight || ""}"></label><button type="button" aria-label="Bỏ thành phần">Bỏ</button>`;
    row.querySelector("button").onclick = () => {
      row.remove();
      update();
    };
    target.append(row);
    update();
  };
  rows.forEach(add);
  if (!rows.length) add();
  target.oninput = update;
  dialog.querySelector("#add-component").onclick = () => {
    if (target.children.length < 10) add();
  };
  bindForm(
    dialog,
    () =>
      api("/grades/sections/" + data.section.id + "/scheme", {
        method: "POST",
        body: {
          sectionVersion: data.section.version,
          version: data.scheme?.version || 0,
          components: [...target.children].map((r) => ({
            code: r.querySelector('[name="code"]').value.trim(),
            name: r.querySelector('[name="name"]').value.trim(),
            weight: Number(r.querySelector('[name="weight"]').value),
          })),
        },
      }),
    refresh,
    "Đã lưu cách tính điểm học phần.",
  );
}
export async function gpaPolicyEditor(refresh) {
  const data = await api("/grades/settings");
  const dialog = openEditor(
    "Quy đổi điểm và GPA",
    `<form>${errorBox()}${select(
      "Học kỳ",
      "termId",
      data.terms.map((t) => ({ id: t.id, name: t.code + " · " + t.name })),
    )}${select("Học lại / cải thiện", "repeatRule", [
      { id: "LATEST", name: "Lấy lần học sau cùng" },
      { id: "HIGHEST", name: "Lấy điểm tổng kết cao nhất" },
    ])}<p class="hint">Ngưỡng là điểm thấp nhất của mỗi mức. Nhập theo quy chế của nhà trường, bắt đầu từ 0 và bao phủ đến 10. Quy định đã dùng khi công bố sẽ được khóa sửa.</p><p id="gpa-lock" class="hint" role="status"></p><div id="gpa-bands"></div><button type="button" id="add-band">Thêm mức quy đổi</button><div class="dialog-actions"><button type="submit" class="primary">Lưu quy định</button></div></form>`,
  );
  const target = dialog.querySelector("#gpa-bands");
  let policy = null;
  const add = (r = {}) => {
    const row = document.createElement("div");
    row.className = "grade-config-row";
    row.innerHTML = `<label>Điểm từ /10<input name="minScore" type="number" min="0" max="10" step="0.01" required value="${r.minScore ?? ""}"></label><label>Điểm chữ<input name="letter" maxlength="8" pattern="[A-Z][A-Z0-9+\\-]{0,7}" required value="${esc(r.letter || "")}"></label><label>Điểm hệ 4<input name="points" type="number" min="0" max="4" step="0.01" required value="${r.points ?? ""}"></label><button type="button" aria-label="Bỏ mức quy đổi">Bỏ</button>`;
    row.querySelector("button").onclick = () => row.remove();
    target.append(row);
  };
  dialog.querySelector('[name="termId"]').onchange = (e) => {
    policy = data.policies.find((p) => p.termId === e.target.value) || null;
    target.innerHTML = "";
    (policy?.bands || [{}, {}]).forEach(add);
    dialog.querySelector('[name="repeatRule"]').value =
      policy?.repeatRule || "";
    const locked = Boolean(policy?.locked);
    for (const control of target.querySelectorAll("input,button"))
      control.disabled = locked;
    dialog.querySelector('[name="repeatRule"]').disabled = locked;
    dialog.querySelector("#add-band").disabled = locked;
    dialog.querySelector('[type="submit"]').disabled = locked;
    dialog.querySelector("#gpa-lock").textContent = locked
      ? "Quy định đã dùng khi công bố điểm. Chỉ xem, không sửa hồi tố."
      : "";
  };
  dialog.querySelector("#add-band").onclick = () => {
    if (target.children.length < 20) add();
  };
  bindForm(
    dialog,
    (input) =>
      api("/grades/gpa-policies", {
        method: "POST",
        body: {
          termId: input.termId,
          version: policy?.version || 0,
          repeatRule: input.repeatRule,
          bands: [...target.children].map((r) => ({
            minScore: Number(r.querySelector('[name="minScore"]').value),
            letter: r.querySelector('[name="letter"]').value.trim(),
            points: Number(r.querySelector('[name="points"]').value),
          })),
        },
      }),
    refresh,
    "Đã lưu quy định quy đổi.",
  );
}
export function summaryMarkup(summaries, student) {
  return summaries.length
    ? `<section class="panel"><div class="section-heading"><h2>Tổng hợp kết quả</h2></div>${table(
        [
          ...(student ? [] : ["Sinh viên"]),
          "Phạm vi",
          "Tín chỉ đạt / Tính GPA",
          "GPA /10",
          "GPA /4",
          "Căn cứ",
        ],
        summaries.flatMap((s) =>
          [
            ...s.terms.map((t) => ({ ...t, label: t.term })),
            { ...s.cumulative, label: "Tích lũy" },
          ].map(
            (t) =>
              `<tr>${student ? "" : `<td><b>${esc(s.studentCode)}</b><small>${esc(s.studentName)}</small></td>`}<td>${esc(t.label)}</td><td>${t.creditsEarned ?? "—"} / ${t.creditsAttempted ?? "—"}</td><td>${t.gpa10 ?? "—"}</td><td>${t.gpa4 ?? "—"}</td><td><span class="badge">${t.status === "VERIFIED" ? "Đã đối chiếu dữ liệu" : "Chưa xác minh"}</span><small>${esc(t.status === "VERIFIED" ? (t.repeatRule === "LATEST" ? "Lấy lần học sau cùng" : "Lấy điểm tổng kết cao nhất") : t.reason)}</small></td></tr>`,
          ),
        ),
      )}</section>`
    : "";
}
