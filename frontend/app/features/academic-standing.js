import { api } from "../services/api.js";
import {
  escapeHtml as esc,
  table,
  select,
  openEditor,
  errorBox,
  showError,
  confirmAction,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { foldText } from "../../../shared/local-validation.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";
import { STANDING_LABELS } from "../../../shared/academic-standing.js";
const accessible = (root) => {
  for (const e of root.querySelectorAll(".table-scroll")) {
    e.tabIndex = 0;
    e.setAttribute("role", "region");
    e.setAttribute("aria-label", "Đối chiếu kết quả học kỳ");
  }
};
const value = (n) => (n === null || n === undefined ? "—" : String(n));
export async function openAcademicStanding(actor, initialTermId = "") {
  const dialog = openEditor(
    "Đối chiếu học vụ",
    '<p class="loading">Đang tải học kỳ…</p>',
  );
  let settings,
    data = null,
    epoch = 0,
    page = 1;
  const size = 10;
  try {
    settings = await api("/grades/standing/settings");
    if (!dialog.isConnected || !dialog.open) return;
    dialog.querySelector(".loading").outerHTML =
      `${errorBox()}<form id="as-controls" class="standing-controls"><div class="form-grid">${select(
        "Học kỳ đối chiếu",
        "termId",
        settings.terms.map((t) => ({
          id: t.id,
          name: t.code + " · " + t.name,
        })),
        initialTermId,
      )}</div><div class="dialog-actions"><button class="primary" type="submit">Đối chiếu</button>${settings.canManage ? '<button id="as-policy" type="button">Cấu hình quy chế</button>' : ""}</div></form><div id="as-results"></div>`;
    dialog
      .querySelector("#as-policy")
      ?.addEventListener("click", () =>
        policyEditor(
          actor,
          settings,
          dialog.querySelector("[name=termId]").value,
        ),
      );
    dialog.querySelector("#as-controls").onsubmit = async (e) => {
      e.preventDefault();
      const termId = e.target.elements.termId.value;
      if (!termId) return;
      const seq = ++epoch;
      page = 1;
      dialog.querySelector("#as-results").innerHTML =
        '<p class="loading">Đang đối chiếu kết quả đã công bố…</p>';
      showError(dialog, { message: "" });
      const controls = [...e.target.elements];
      controls.forEach((control) => (control.disabled = true));
      try {
        const result = await api(
          "/grades/standing?termId=" + encodeURIComponent(termId),
        );
        if (seq !== epoch || !dialog.isConnected || !dialog.open) return;
        data = result;
        render();
      } catch (error) {
        if (seq === epoch && dialog.open && dialog.isConnected) {
          dialog.querySelector("#as-results").innerHTML = "";
          showError(dialog, error);
        }
      } finally {
        controls.forEach((control) => (control.disabled = false));
      }
    };
    dialog.querySelector("[name=termId]").onchange = () => {
      epoch++;
      data = null;
      dialog.querySelector("#as-results").innerHTML = "";
    };
    if (
      initialTermId &&
      settings.terms.some((term) => term.id === initialTermId)
    )
      dialog.querySelector("#as-controls").requestSubmit();
  } catch (error) {
    if (dialog.open && dialog.isConnected)
      dialog.querySelector(".loading").textContent = error.message;
  }
  function render() {
    const host = dialog.querySelector("#as-results");
    host.innerHTML = `<p class="hint">${esc(data.note)}</p><p class="hint">Dữ liệu lúc ${esc(formatVietnamTime(data.asOf))}${data.policy ? " · Quy chế phiên bản " + data.policy.version : ""}</p>${data.policy ? `<p class="hint">Căn cứ: ${esc(data.policy.reason)}</p>` : '<p class="inline-note">Học kỳ chưa được cấu hình quy chế đối chiếu.</p>'}<div class="toolbar"><label>Tìm sinh viên<input id="as-query" type="search" placeholder="Mã hoặc tên sinh viên"></label><label>Kết quả<select id="as-status"><option value="">Tất cả</option>${Object.entries(
      STANDING_LABELS,
    )
      .map(([id, label]) => `<option value="${id}">${label}</option>`)
      .join(
        "",
      )}</select></label><button id="as-export">Xuất đối chiếu CSV</button></div><div id="as-table"></div>`;
    const rows = () =>
      data.rows.filter(
        (r) =>
          foldText(r.studentCode + " " + r.studentName).includes(
            foldText(host.querySelector("#as-query").value),
          ) &&
          (!host.querySelector("#as-status").value ||
            r.status === host.querySelector("#as-status").value),
      );
    const paint = () => {
      const filtered = rows();
      page = Math.max(
        1,
        Math.min(page, Math.ceil(filtered.length / size) || 1),
      );
      host.querySelector("#as-table").innerHTML =
        table(
          [
            "Sinh viên",
            "GPA hệ 4 / xếp loại",
            "Tín chỉ chưa đạt",
            "Đối chiếu",
            "",
          ],
          filtered
            .slice((page - 1) * size, page * size)
            .map(
              (r) =>
                `<tr><td><b>${esc(r.studentCode)}</b><small>${esc(r.studentName)}</small></td><td>${value(r.gpa4)}<small>${esc(r.classification || "Chưa xếp loại")}</small>${r.rawGpa4 !== null && Math.abs(r.rawGpa4 - r.gpa4) > 0.000000001 ? `<small>Gốc: ${r.rawGpa4.toFixed(6)}</small>` : ""}</td><td>${value(r.failedCredits)}</td><td><span class="badge">${STANDING_LABELS[r.status]}</span></td><td><button data-as-detail="${esc(r.studentId)}">Xem căn cứ</button></td></tr>`,
            ),
          "Chưa có sinh viên phù hợp.",
        ) +
        `<div class="pagination"><span>Trang ${page}/${Math.ceil(filtered.length / size) || 1} · ${filtered.length} sinh viên</span><button id="as-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="as-next" ${page * size >= filtered.length ? "disabled" : ""}>Sau</button></div>`;
      accessible(host);
      host.querySelector("#as-prev").onclick = () => {
        page--;
        paint();
      };
      host.querySelector("#as-next").onclick = () => {
        page++;
        paint();
      };
      for (const b of host.querySelectorAll("[data-as-detail]"))
        b.onclick = () =>
          detail(
            data,
            filtered.find((r) => r.studentId === b.dataset.asDetail),
            actor,
          );
    };
    host.querySelector("#as-query").oninput = host.querySelector(
      "#as-status",
    ).onchange = () => {
      page = 1;
      paint();
    };
    host.querySelector("#as-export").onclick = () =>
      downloadCsv(
        "Lizz_Doi_chieu_hoc_vu_" + data.term.code + ".csv",
        [
          "Sinh viên",
          "Họ tên",
          "Học kỳ",
          "Trạng thái",
          "Xếp loại học kỳ",
          "GPA hệ 4 hiển thị",
          "GPA gốc",
          "TC tính GPA",
          "TC đạt",
          "TC chưa đạt",
          "Lý do",
          "Quy chế ID",
          "Phiên bản quy chế",
          "Thời điểm dữ liệu",
        ],
        rows().map((r) => [
          r.studentCode,
          r.studentName,
          r.term,
          STANDING_LABELS[r.status],
          r.classification || "",
          r.gpa4 ?? "",
          r.rawGpa4 ?? "",
          r.creditsAttempted ?? "",
          r.creditsEarned ?? "",
          r.failedCredits ?? "",
          r.reasons.join(" "),
          r.policyId || "",
          r.policyVersion || "",
          new Date(data.asOf).toISOString(),
        ]),
      );
    paint();
  }
}
function detail(data, row, actor) {
  const d = openEditor(
    "Căn cứ học vụ · " + row.studentCode,
    `<p><b>${esc(row.studentName)}</b> · Học kỳ ${esc(row.term)}</p><p>${STANDING_LABELS[row.status]}${row.classification ? " · " + esc(row.classification) : ""}</p><ul>${row.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul><p>GPA gốc: ${value(row.rawGpa4)} · GPA hiển thị: ${value(row.gpa4)}<br>Tín chỉ tính GPA / đạt / chưa đạt: ${value(row.creditsAttempted)} / ${value(row.creditsEarned)} / ${value(row.failedCredits)}</p>${
      row.basis.length
        ? table(
            ["Lớp / môn", "Điểm công bố", "Điểm hệ 4", "Tín chỉ"],
            row.basis.map(
              (b) =>
                `<tr><td>${esc(b.sectionCode)}<small>${esc(b.subjectCode)}</small></td><td>${b.score} / 10<small>Ngưỡng đạt ${b.passScore}</small></td><td>${b.points}</td><td>${b.credits}</td></tr>`,
            ),
          )
        : ""
    }${
      row.issues.length
        ? table(
            ["Lớp cần đối chiếu", "Căn cứ còn thiếu"],
            row.issues.map(
              (i) =>
                `<tr><td>${esc(i.sectionCode)}</td><td>${esc(i.reason)}</td></tr>`,
            ),
          )
        : ""
    }<p class="hint">${esc(data.note)}</p><button id="as-back">Về đối chiếu học vụ</button>`,
  );
  accessible(d);
  d.querySelector("#as-back").onclick = () =>
    openAcademicStanding(actor, data.term.id);
}
function policyEditor(actor, settings, termId) {
  const prior = settings.policies.find((p) => p.termId === termId),
    d = openEditor(
      "Quy chế đối chiếu học kỳ",
      `<form>${errorBox()}${select(
        "Học kỳ",
        "termId",
        settings.terms.map((t) => ({
          id: t.id,
          name: t.code + " · " + t.name,
        })),
        termId,
      )}<div class="form-grid"><label>GPA hệ 4 thấp hơn<input name="gpa4Below" type="number" min="0" max="4" step="0.01" value="${prior?.payload.gpa4Below ?? ""}" placeholder="Để trống nếu không áp dụng"></label><label>Tín chỉ chưa đạt từ<input name="failedCreditsAtLeast" type="number" min="1" max="200" step="1" value="${prior?.payload.failedCreditsAtLeast ?? ""}" placeholder="Để trống nếu không áp dụng"></label></div><p class="hint">Ít nhất một tiêu chí. Chỉ cần thỏa một tiêu chí sẽ hiện Cần rà soát; chưa tự ban hành quyết định cảnh báo.</p><h3>Xếp loại học kỳ theo GPA hệ 4</h3><p class="hint">Nhập theo quy chế của trường, bắt đầu từ ngưỡng 0; không dùng để xếp loại tốt nghiệp.</p><div id="as-bands"></div><button type="button" id="as-add-band">Thêm mức xếp loại</button><label>Căn cứ quy chế<textarea name="reason" required maxlength="1000" rows="3">${esc(prior?.reason || "")}</textarea></label><button type="submit" class="primary">Kiểm tra và lưu quy chế</button></form>`,
    ),
    form = d.querySelector("form");
  const add = (b = {}) => {
    const row = document.createElement("div");
    row.className = "standing-band";
    row.innerHTML = `<label>GPA từ<input name="minGpa4" type="number" required min="0" max="4" step="0.01" value="${b.minGpa4 ?? ""}"></label><label>Tên xếp loại<input name="label" required maxlength="60" value="${esc(b.label || "")}"></label><button type="button">Bỏ mức</button>`;
    row.querySelector("button").onclick = () => row.remove();
    form.querySelector("#as-bands").append(row);
  };
  (prior?.payload.bands || [{ minGpa4: 0 }, {}]).forEach(add);
  form.querySelector("#as-add-band").onclick = () => {
    if (form.querySelector("#as-bands").children.length < 10) add();
  };
  form.elements.termId.onchange = () => {
    const selected = settings.policies.find(
      (p) => p.termId === form.elements.termId.value,
    );
    form.elements.gpa4Below.value = selected?.payload.gpa4Below ?? "";
    form.elements.failedCreditsAtLeast.value =
      selected?.payload.failedCreditsAtLeast ?? "";
    form.elements.reason.value = selected?.reason || "";
    form.querySelector("#as-bands").innerHTML = "";
    (selected?.payload.bands || [{ minGpa4: 0 }, {}]).forEach(add);
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    showError(form, { message: "" });
    const payload = {
        gpa4Below:
          form.elements.gpa4Below.value === ""
            ? null
            : Number(form.elements.gpa4Below.value),
        failedCreditsAtLeast:
          form.elements.failedCreditsAtLeast.value === ""
            ? null
            : Number(form.elements.failedCreditsAtLeast.value),
        bands: [...form.querySelector("#as-bands").children].map((r) => ({
          minGpa4: Number(r.querySelector("[name=minGpa4]").value),
          label: r.querySelector("[name=label]").value,
        })),
      },
      body = {
        termId: form.elements.termId.value,
        version:
          settings.policies.find((p) => p.termId === form.elements.termId.value)
            ?.version || 0,
        payload,
        reason: form.elements.reason.value,
      };
    const controls = [...form.elements];
    controls.forEach((c) => (c.disabled = true));
    try {
      const decision = await confirmAction(d, {
        title: "Áp dụng quy chế đối chiếu?",
        message: `Học kỳ ${settings.terms.find((t) => t.id === body.termId)?.code}. GPA: ${payload.gpa4Below === null ? "không áp dụng" : "dưới " + payload.gpa4Below}; tín chỉ chưa đạt: ${payload.failedCreditsAtLeast === null ? "không áp dụng" : "từ " + payload.failedCreditsAtLeast}. Xếp loại: ${payload.bands.map((b) => b.minGpa4 + " → " + b.label).join("; ")}. Căn cứ: ${body.reason}`,
        confirmLabel: "Xác nhận lưu quy chế",
      });
      if (!decision.confirmed) return;
      await api("/grades/standing/policies", {
        method: "POST",
        body: { ...body, confirm: true },
      });
      notify("Đã lưu quy chế đối chiếu học kỳ.");
      if (d.open && d.isConnected) openAcademicStanding(actor, body.termId);
    } catch (error) {
      showError(form, error);
    } finally {
      controls.forEach((c) => (c.disabled = false));
      if (d.open && d.isConnected) form.querySelector("[type=submit]").focus();
    }
  };
}
