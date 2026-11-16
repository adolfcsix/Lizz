import { api } from "../services/api.js";
import { STUDY_MODES } from "../../../shared/study-attempts.js";
import {
  escapeHtml as esc,
  table,
  openEditor,
  field,
  select,
  errorBox,
  showError,
  confirmAction,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
export { STUDY_MODES };
export function studyReviewMarkup(review) {
  return `<section class="study-review"><h3>${esc(STUDY_MODES[review.mode])}${review.attemptNumber ? " · Lượt " + review.attemptNumber : ""}</h3><p>${esc(review.note)}</p>${review.reasons.length ? `<ul class="study-blocked">${review.reasons.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>` : ""}${review.policy ? `<p class="hint">Tối đa ${review.policy.maxAttempts} lượt; cải thiện ${review.policy.allowImprovement ? "được phép khi điểm đạt tốt nhất không vượt " + review.policy.maxImprovementScore : "chưa được cho phép"}.</p>` : ""}${
    review.basis.length
      ? table(
          ["Lớp / học kỳ", "Điểm đã công bố", "Kết quả"],
          review.basis.map(
            (r) =>
              `<tr><td>${esc(r.sectionCode)}<small>${esc(r.term)}</small></td><td>${r.score} / 10</td><td>${r.passed ? "Đạt" : "Chưa đạt"}</td></tr>`,
          ),
        )
      : ""
  }</section>`;
}
export async function openStudyHistory({
  studentId = null,
  subjectId = null,
} = {}) {
  const dialog = openEditor(
    "Lịch sử học phần",
    '<p class="loading">Đang tải các lượt học…</p>',
  );
  try {
    const path = studentId
      ? "/academics/students/" +
        encodeURIComponent(studentId) +
        "/study-history"
      : "/academics/my-study-history";
    const data = await api(
      path + (subjectId ? "?subjectId=" + encodeURIComponent(subjectId) : ""),
    );
    if (!dialog.isConnected || !dialog.open) return;
    dialog.querySelector(".loading").outerHTML =
      `<p><b>${esc(data.student.code)} · ${esc(data.student.fullName)}</b></p><p class="hint">${esc(data.note)}</p>${table(
        ["Học phần", "Lớp / học kỳ", "Loại lượt học", "Kết quả"],
        data.rows.map(
          (r) =>
            `<tr><td><b>${esc(r.subjectCode)}</b><small>${esc(r.subjectName)}</small></td><td>${esc(r.sectionCode)}<small>${esc(r.term)}</small></td><td>${esc(STUDY_MODES[r.mode] || STUDY_MODES.UNVERIFIED)}</td><td>${r.resultStatus === "PUBLISHED" ? `${r.score} / 10<small>${r.passed ? "Đạt" : "Chưa đạt"} · Ngưỡng ${r.passScore}</small>` : r.resultStatus === "WITHDRAWN" ? "Đã rút đăng ký" : "Chưa có kết quả công bố đủ căn cứ"}</td></tr>`,
        ),
      )}<div class="actions"><button id="study-history-export">Xuất lịch sử CSV</button></div>`;
    const scroll = dialog.querySelector(".table-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("aria-label", "Các lượt học trong quyền");
    scroll.setAttribute("role", "region");
    dialog.querySelector("#study-history-export").onclick = () =>
      downloadCsv(
        "Lizz_Lich_su_hoc_" + data.student.code + ".csv",
        [
          "Sinh viên",
          "Mã môn",
          "Môn",
          "Lớp",
          "Học kỳ",
          "Loại lượt học",
          "Trạng thái kết quả",
          "Điểm công bố",
          "Ngưỡng đạt",
        ],
        data.rows.map((r) => [
          data.student.code,
          r.subjectCode,
          r.subjectName,
          r.sectionCode,
          r.term,
          STUDY_MODES[r.mode] || STUDY_MODES.UNVERIFIED,
          r.resultStatus === "PUBLISHED"
            ? "Đã công bố"
            : r.resultStatus === "WITHDRAWN"
              ? "Đã rút"
              : "Chưa đủ căn cứ",
          r.score ?? "",
          r.passScore ?? "",
        ]),
      );
  } catch (error) {
    if (dialog.open && dialog.isConnected)
      dialog.querySelector(".loading").textContent = error.message;
  }
}
export function studyPoliciesMarkup(data) {
  return `<section class="panel policy-panel" id="study-policies"><div class="section-heading"><h2>Học lại và cải thiện điểm</h2>${data.canManage ? '<button id="new-study-policy">Thêm quy chế học kỳ</button>' : ""}</div><p class="panel-copy">Cấu hình theo học kỳ đăng ký mới; dữ liệu chưa có quy chế giữ loại lượt học chưa đối chiếu. GPA tiếp tục dùng quy chế quy đổi và chọn điểm đã chốt.</p>${table(
    [
      "Học kỳ",
      "Học lại",
      "Cải thiện",
      "Tối đa lượt",
      "Điểm cũ tối đa để cải thiện",
      "",
    ],
    data.rows.map(
      (p) =>
        `<tr><td>${esc(data.terms.find((t) => t.id === p.termId)?.code)}</td><td>${p.allowRetake ? "Cho phép" : "Chưa cho phép"}</td><td>${p.allowImprovement ? "Cho phép" : "Chưa cho phép"}</td><td>${p.maxAttempts}</td><td>${p.maxImprovementScore}</td><td>${data.canManage ? `<button data-study-policy="${esc(p.id)}">Chỉnh sửa</button>` : ""}</td></tr>`,
    ),
    "Chưa cấu hình quy chế học lại/cải thiện cho học kỳ nào.",
  )}</section>`;
}
export function bindStudyPolicies(root, data, refresh) {
  root
    .querySelector("#new-study-policy")
    ?.addEventListener("click", () => editor(null));
  for (const b of root.querySelectorAll("[data-study-policy]"))
    b.onclick = () =>
      editor(data.rows.find((p) => p.id === b.dataset.studyPolicy));
  function editor(prior) {
    const terms = data.terms.filter((t) =>
      prior ? t.id === prior.termId : !data.rows.some((r) => r.termId === t.id),
    );
    if (!terms.length)
      return notify("Tạo học kỳ mới hoặc chỉnh sửa quy chế đã có.");
    const choices = [
      { id: "yes", name: "Cho phép" },
      { id: "no", name: "Chưa cho phép" },
    ];
    const dialog = openEditor(
      prior
        ? "Chỉnh quy chế học lại/cải thiện"
        : "Thêm quy chế học lại/cải thiện",
      `<form>${errorBox()}<div class="form-grid">${select(
        "Học kỳ đăng ký",
        "termId",
        terms.map((t) => ({ id: t.id, name: t.code + " · " + t.name })),
        prior?.termId || "",
      )}${select("Đăng ký học lại", "allowRetake", choices, prior?.allowRetake === false ? "no" : "yes")}${select("Đăng ký cải thiện", "allowImprovement", choices, prior?.allowImprovement ? "yes" : "no")}${field("Tổng số lượt tối đa, gồm lượt mới", "maxAttempts", "number", prior?.maxAttempts || 2)}${field("Điểm đạt tốt nhất tối đa để cải thiện", "maxImprovementScore", "number", prior?.maxImprovementScore ?? 8)}</div><label>Căn cứ ban hành<textarea name="reason" required maxlength="1000" rows="3">${esc(prior?.reason || "")}</textarea></label><p class="hint">Các giá trị trên biểu mẫu chỉ có hiệu lực sau khi lưu và xác nhận. Quy chế áp dụng cho đăng ký mới, giữ nguyên căn cứ của lượt đã đăng ký.</p><button class="primary" type="submit">Kiểm tra và lưu quy chế</button></form>`,
    );
    const form = dialog.querySelector("form");
    form.elements.maxAttempts.min = 1;
    form.elements.maxAttempts.max = 20;
    form.elements.maxImprovementScore.min = 0;
    form.elements.maxImprovementScore.max = 10;
    form.elements.maxImprovementScore.step = "0.01";
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector("[type=submit]");
      button.disabled = true;
      try {
        const body = {
          termId: form.elements.termId.value,
          allowRetake: form.elements.allowRetake.value === "yes",
          allowImprovement: form.elements.allowImprovement.value === "yes",
          maxAttempts: Number(form.elements.maxAttempts.value),
          maxImprovementScore: Number(form.elements.maxImprovementScore.value),
          reason: form.elements.reason.value,
          ...(prior ? { version: prior.version } : {}),
        };
        for (const control of form.querySelectorAll("input, select, textarea"))
          control.disabled = true;
        const decision = await confirmAction(dialog, {
          title: "Áp dụng quy chế cho đăng ký mới?",
          message: `${terms.find((t) => t.id === body.termId)?.code || ""}: học lại ${body.allowRetake ? "cho phép" : "chưa cho phép"}, cải thiện ${body.allowImprovement ? "cho phép" : "chưa cho phép"}, tối đa ${body.maxAttempts} lượt, ngưỡng cải thiện ${body.maxImprovementScore}. ${body.reason}`,
          confirmLabel: "Xác nhận lưu quy chế",
        });
        if (!decision.confirmed) return;
        await api("/academics/study-policies" + (prior ? "/" + prior.id : ""), {
          method: prior ? "PATCH" : "POST",
          body: { ...body, confirm: true },
        });
        dialog.close();
        notify("Đã lưu quy chế cho học kỳ.");
        await refresh();
      } catch (error) {
        showError(form, error);
      } finally {
        for (const control of form.querySelectorAll("input, select, textarea"))
          control.disabled = false;
        button.disabled = false;
        if (dialog.isConnected && dialog.open) button.focus();
      }
    };
  }
}
