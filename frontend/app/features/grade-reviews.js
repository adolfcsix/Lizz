import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  select,
  openEditor,
  errorBox,
  showError,
  bindForm,
  confirmAction,
  notify,
} from "../components/ui.js";
import {
  formatVietnamTime,
  vietnamDateTimeInput,
  parseVietnamDateTime,
} from "../../../shared/academic-format.js";
import { downloadCsv } from "../components/csv-export.js";
export const reviewLabels = {
  REQUESTED: "Chờ rà soát",
  PROPOSED: "Chờ phê duyệt",
  APPROVED: "Đã duyệt · Chưa áp dụng",
  APPLIED: "Đã xử lý",
  REJECTED: "Không chấp nhận",
  CANCELLED: "Đã rút",
};
export async function gradeReviewsPage(container, actor) {
  const data = await api("/grade-reviews"),
    student = actor.role === "STUDENT";
  let page = 1,
    filtered = [];
  const refresh = () => gradeReviewsPage(container, actor);
  container.innerHTML =
    heading(
      student
        ? "Phúc khảo điểm"
        : actor.role === "MANAGER"
          ? "Duyệt điều chỉnh điểm"
          : actor.role === "LECTURER"
            ? "Rà soát và phúc khảo điểm"
            : "Yêu cầu rà soát điểm",
      `<button id="review-new" class="primary">${student ? "Gửi yêu cầu phúc khảo" : "Lập yêu cầu rà soát"}</button>${data.managePeriods ? '<button id="review-period">Đợt phúc khảo</button>' : ""}<button id="review-export">Xuất CSV</button>`,
    ) +
    `<section class="panel"><div class="toolbar"><label>Tìm yêu cầu<input type="search" id="review-query" placeholder="Mã sinh viên, học phần hoặc lý do"></label><label>Trạng thái<select id="review-status"><option value="">Tất cả</option>${Object.entries(
      reviewLabels,
    )
      .map(([v, n]) => `<option value="${v}">${n}</option>`)
      .join("")}</select></label></div><div id="review-list"></div></section>`;
  const paint = () => {
    const q = container
        .querySelector("#review-query")
        .value.toLocaleLowerCase("vi"),
      status = container.querySelector("#review-status").value;
    filtered = data.rows.filter(
      (r) =>
        (!status || r.status === status) &&
        `${r.studentCode} ${r.studentName} ${r.subjectName} ${r.sectionCode} ${r.reason}`
          .toLocaleLowerCase("vi")
          .includes(q),
    );
    const max = Math.max(1, Math.ceil(filtered.length / 10));
    page = Math.min(page, max);
    const target = container.querySelector("#review-list");
    target.innerHTML =
      table(
        [
          ...(student ? [] : ["Sinh viên"]),
          "Học phần / Yêu cầu",
          "Điểm gốc / Đề xuất",
          "Trạng thái",
          "",
        ],
        filtered
          .slice((page - 1) * 10, page * 10)
          .map(
            (r) =>
              `<tr>${student ? "" : `<td><b>${esc(r.studentCode)}</b><small>${esc(r.studentName)}</small></td>`}<td><b>${esc(r.subjectName)}</b><small>${esc(r.reference)} · ${esc(r.sectionCode)} · ${esc(r.term)} · ${r.requestKind === "APPEAL" ? "Phúc khảo" : "Rà soát"}</small><small>${esc(r.reason)}</small></td><td>${r.baseGrade.score} / ${r.proposal?.score ?? "—"}</td><td><span class="badge">${reviewLabels[r.status]}</span><small>${esc(formatVietnamTime(r.createdAt))}</small></td><td><button data-review="${r.id}">Xem hồ sơ</button></td></tr>`,
          ),
        "Chưa có yêu cầu phù hợp.",
      ) +
      `<div class="pagination"><span>Trang ${page}/${max}</span><button id="review-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="review-next" ${page === max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#review-prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#review-next").onclick = () => {
      page++;
      paint();
    };
    target
      .querySelectorAll("[data-review]")
      .forEach(
        (b) => (b.onclick = () => reviewDetail(b.dataset.review, refresh)),
      );
  };
  container.querySelector("#review-query").oninput = container.querySelector(
    "#review-status",
  ).onchange = () => {
    page = 1;
    paint();
  };
  container.querySelector("#review-new").onclick = () =>
    requestForm(data, actor, refresh);
  container
    .querySelector("#review-period")
    ?.addEventListener("click", () => periodForm(data, refresh));
  container.querySelector("#review-export").onclick = () =>
    downloadCsv(
      "LIZZ_PHUC_KHAO.csv",
      [
        "Mã hồ sơ",
        "Mã sinh viên",
        "Sinh viên",
        "Học phần",
        "Lớp",
        "Học kỳ",
        "Loại",
        "Điểm gốc",
        "Đề xuất",
        "Trạng thái",
        "Lý do",
      ],
      filtered.map((r) => [
        r.id,
        r.studentCode,
        r.studentName,
        r.subjectName,
        r.sectionCode,
        r.term,
        r.requestKind === "APPEAL" ? "Phúc khảo" : "Rà soát",
        r.baseGrade.score,
        r.proposal?.score ?? "",
        reviewLabels[r.status],
        r.reason,
      ]),
    );
  paint();
}
function requestForm(data, actor, refresh) {
  const dialog = openEditor(
    actor.role === "STUDENT" ? "Gửi yêu cầu phúc khảo" : "Lập yêu cầu rà soát",
    `<form>${errorBox()}${select(
      "Kết quả học tập",
      "gradeId",
      data.eligible.map((g) => ({
        id: g.id,
        name: `${g.studentCode} · ${g.subjectName} · ${g.sectionCode} · ${g.score}/10`,
      })),
    )}<p id="review-eligibility" class="hint" role="status">Chọn kết quả đã công bố để kiểm tra.</p><label>Lý do đề nghị<textarea name="reason" required rows="4" maxlength="2000"></textarea></label>${actor.role === "MANAGER" ? '<p class="hint">Yêu cầu do bạn khởi tạo cần một Quản lý khác phê duyệt.</p>' : ""}<button type="submit" class="primary" disabled>Kiểm tra và gửi</button></form>`,
  );
  const selectGrade = dialog.querySelector('[name="gradeId"]');
  selectGrade.onchange = () => {
    const grade = data.eligible.find((g) => g.id === selectGrade.value);
    dialog.querySelector("#review-eligibility").textContent = grade
      ? grade.canRequest
        ? "Kết quả có thể gửi yêu cầu. Điểm hiện tại chưa thay đổi."
        : grade.requestBlockReason
      : "Chọn kết quả đã công bố để kiểm tra.";
    dialog.querySelector('[type="submit"]').disabled = !grade?.canRequest;
  };
  const requestId = crypto.randomUUID();
  bindForm(
    dialog,
    async (input) => {
      const grade = data.eligible.find((g) => g.id === input.gradeId),
        decision = await confirmAction(dialog, {
          title: "Xác nhận gửi yêu cầu",
          message: `${grade.subjectName} · ${grade.sectionCode}, điểm ${grade.score}/10. Yêu cầu được gửi để rà soát; chưa sửa điểm.`,
          confirmLabel: "Xác nhận gửi",
        });
      if (!decision.confirmed) throw Error("Chưa gửi yêu cầu.");
      return api("/grade-reviews/requests", {
        method: "POST",
        body: {
          ...input,
          gradeVersion: grade.gradeVersion,
          requestId,
          confirm: true,
        },
      });
    },
    refresh,
    "Đã gửi yêu cầu rà soát điểm.",
  );
}
async function reviewDetail(id, refresh) {
  const dialog = openEditor(
    "Hồ sơ rà soát điểm",
    '<p class="loading">Đang tải hồ sơ…</p>',
  );
  try {
    const data = await api("/grade-reviews/requests/" + id);
    if (!dialog.open || !dialog.isConnected) return;
    const r = data.request,
      scheme = r.baseGrade.resultSnapshot?.scheme;
    const actions = {
      propose: "Gửi kết quả rà soát",
      approve: "Phê duyệt đề xuất",
      apply: "Áp dụng kết quả đã duyệt",
      return: "Trả lại để rà soát",
      reject: "Không chấp nhận",
      cancel: "Rút yêu cầu",
    };
    dialog.querySelector(".loading").outerHTML =
      `${errorBox()}<p><b>${esc(r.studentCode)} · ${esc(r.studentName)}</b><br>${esc(r.subjectName)} · ${esc(r.sectionCode)} · ${esc(r.term)}</p><p><span class="badge">${reviewLabels[r.status]}</span></p><dl class="record-summary"><dt>Lý do đề nghị</dt><dd>${esc(r.reason)}</dd><dt>Điểm khi lập yêu cầu</dt><dd>${r.baseGrade.score}/10</dd><dt>Điểm hiện tại</dt><dd>${data.grade.score}/10</dd><dt>Kết quả đề xuất</dt><dd>${r.proposal ? `${r.proposal.score}/10 · ${esc(r.proposal.reason)}` : "Chưa có kết quả rà soát"}</dd></dl>${
        scheme
          ? table(
              ["Thành phần", "Trọng số", "Điểm gốc", "Đề xuất"],
              scheme.components.map(
                (c) =>
                  `<tr><td>${esc(c.name)}</td><td>${c.weight}%</td><td>${r.baseGrade.componentScores?.[c.code] ?? "—"}</td><td>${r.proposal?.componentScores?.[c.code] ?? "—"}</td></tr>`,
              ),
            )
          : ""
      }${!data.current && ["REQUESTED", "PROPOSED", "APPROVED"].includes(r.status) ? '<p class="inline-note">Điểm đã thay đổi so với lúc lập yêu cầu. Không áp dụng trên dữ liệu cũ.</p>' : ""}${["PROPOSED", "APPROVED"].includes(r.status) && !data.proposalValid ? '<p class="inline-note">Phân công hoặc dữ liệu của người đề xuất đã thay đổi. Cần Quản lý trả lại để rà soát lại.</p>' : ""}${r.status === "APPROVED" ? '<p class="hint">Phê duyệt chưa sửa điểm. Chỉ xác nhận áp dụng mới cập nhật kết quả.</p>' : ""}<div class="dialog-actions">${Object.entries(
        actions,
      )
        .filter(([action]) => data.actions[action])
        .map(
          ([action, label]) =>
            `<button data-action="${action}" ${["approve", "apply", "propose"].includes(action) ? 'class="primary"' : ""}>${label}</button>`,
        )
        .join(
          "",
        )}</div><h3>Lịch sử xử lý</h3><ol class="review-timeline">${r.reviewHistory.map((h) => `<li><b>${esc(h.actorName)}</b> · ${esc(formatVietnamTime(h.at))}<small>${reviewLabels[h.to] || esc(h.to)}</small><p>${esc(h.note)}</p>${h.score !== undefined ? `<small>Đề xuất ${h.score}/10</small>` : ""}</li>`).join("")}</ol>`;
    dialog
      .querySelectorAll("[data-action]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            b.dataset.action === "propose"
              ? proposalForm(data, refresh)
              : decision(data, b.dataset.action, dialog, refresh)),
      );
  } catch (e) {
    const loading = dialog.querySelector(".loading");
    if (loading) loading.textContent = e.message;
    else showError(dialog, e);
  }
}
function proposalForm(data, refresh) {
  const r = data.request,
    scheme = r.baseGrade.resultSnapshot?.scheme;
  const dialog = openEditor(
    "Kết quả rà soát của Giảng viên",
    `<p><b>${esc(r.studentCode)} · ${esc(r.studentName)}</b> · ${esc(r.subjectName)}</p><form>${errorBox()}${scheme ? `<div class="form-grid">${scheme.components.map((c) => `<label>${esc(c.name)} (${c.weight}%)<input name="component-${c.code}" type="number" min="0" max="10" step="0.01" required value="${r.proposal?.componentScores?.[c.code] ?? r.baseGrade.componentScores?.[c.code] ?? ""}"></label>`).join("")}</div>` : `<label>Điểm tổng kết /10<input name="score" type="number" min="0" max="10" step="0.01" required value="${r.proposal?.score ?? r.baseGrade.score}"></label>`}<label>Căn cứ và kết quả rà soát<textarea name="reason" rows="4" maxlength="2000" required></textarea></label><p class="hint">Có thể đề nghị giữ nguyên hoặc điều chỉnh. Máy chủ tính theo trọng số đã chốt; gửi đề xuất chưa đổi điểm.</p><button type="submit" class="primary">Kiểm tra và gửi đề xuất</button></form>`,
  );
  const requestId = crypto.randomUUID();
  bindForm(
    dialog,
    async (input) => {
      const fields = scheme
        ? {
            componentScores: Object.fromEntries(
              scheme.components.map((c) => [
                c.code,
                Number(input["component-" + c.code]),
              ]),
            ),
          }
        : { score: Number(input.score) };
      const d = await confirmAction(dialog, {
        title: "Gửi kết quả rà soát",
        message:
          "Đề xuất sẽ được khóa và chuyển cho Quản lý kiểm tra. Chưa cập nhật điểm của sinh viên.",
        confirmLabel: "Xác nhận gửi đề xuất",
      });
      if (!d.confirmed) throw Error("Chưa gửi đề xuất.");
      return api("/grade-reviews/requests/" + r.id + "/propose", {
        method: "POST",
        body: {
          ...fields,
          reason: input.reason,
          version: r.version,
          requestId,
          confirm: true,
        },
      });
    },
    refresh,
    "Đã gửi kết quả rà soát để phê duyệt.",
  );
}
async function decision(data, action, dialog, refresh) {
  const r = data.request,
    titles = {
      approve: "Phê duyệt kết quả rà soát",
      apply: "Áp dụng điều chỉnh điểm",
      return: "Trả lại kết quả rà soát",
      reject: "Không chấp nhận yêu cầu",
      cancel: "Rút yêu cầu phúc khảo",
    };
  const d = await confirmAction(dialog, {
    title: titles[action],
    message:
      action === "apply"
        ? `${r.studentCode} · ${r.subjectName}: ${data.grade.score} → ${r.proposal.score}/10. GPA và các lần kiểm tra tiên quyết tiếp theo sẽ dùng kết quả mới; giữ lịch sử cũ.`
        : action === "approve"
          ? `Duyệt đề xuất ${r.baseGrade.score} → ${r.proposal.score}/10. Điểm chưa đổi cho đến bước áp dụng.`
          : "Nhập lý do để người gửi và Giảng viên đối chiếu.",
    confirmLabel:
      "Xác nhận " +
      (action === "apply"
        ? "áp dụng"
        : action === "approve"
          ? "phê duyệt"
          : "thao tác"),
    requireReason: ["return", "reject", "cancel"].includes(action),
    reasonLabel: "Lý do",
    reasonError: "Vui lòng nhập lý do xử lý.",
  });
  if (!d.confirmed) return;
  data.requestKeys ||= new Map();
  const key = JSON.stringify([action, d.reason, data.reviewHash]);
  if (!data.requestKeys.has(key))
    data.requestKeys.set(key, crypto.randomUUID());
  const requestId = data.requestKeys.get(key);
  const buttons = dialog.querySelectorAll("button[data-action]");
  buttons.forEach((b) => (b.disabled = true));
  try {
    await api("/grade-reviews/requests/" + r.id + "/" + action, {
      method: "POST",
      body: {
        version: r.version,
        requestId,
        confirm: true,
        reviewHash: data.reviewHash,
        reason: d.reason,
      },
    });
    dialog.close();
    notify(
      action === "apply"
        ? "Đã áp dụng kết quả và lưu lịch sử điểm."
        : "Đã ghi nhận xử lý yêu cầu.",
    );
    await refresh();
  } catch (e) {
    showError(dialog, e);
    buttons.forEach((b) => (b.disabled = false));
  }
}
function periodForm(data, refresh) {
  let period = null;
  const dialog = openEditor(
    "Đợt phúc khảo theo học kỳ",
    `<form>${errorBox()}${select(
      "Học kỳ",
      "termId",
      data.terms.map((t) => ({ id: t.id, name: t.code + " · " + t.name })),
    )}<div class="form-grid"><label>Mở nhận yêu cầu<input name="opensAt" type="datetime-local" required></label><label>Đóng nhận yêu cầu<input name="closesAt" type="datetime-local" required></label></div>${select(
      "Nhận yêu cầu",
      "active",
      [
        { id: "true", name: "Mở theo thời gian đã đặt" },
        { id: "false", name: "Tạm đóng" },
      ],
    )}<p class="hint">Giờ Việt Nam. Đóng đợt không xóa các hồ sơ đã gửi; không tự áp thời hạn khi chưa có quy định.</p><button type="submit" class="primary">Kiểm tra và lưu đợt</button></form>`,
  );
  dialog.querySelector('[name="termId"]').onchange = (e) => {
    period = data.periods.find((p) => p.termId === e.target.value) || null;
    for (const k of ["opensAt", "closesAt"])
      dialog.querySelector('[name="' + k + '"]').value = period
        ? vietnamDateTimeInput(period[k])
        : "";
    dialog.querySelector('[name="active"]').value = period
      ? String(period.active)
      : "";
  };
  const requestId = crypto.randomUUID();
  bindForm(
    dialog,
    async (input) => {
      const opensAt = parseVietnamDateTime(input.opensAt),
        closesAt = parseVietnamDateTime(input.closesAt);
      const d = await confirmAction(dialog, {
        title: "Xác nhận đợt phúc khảo",
        message: `${formatVietnamTime(opensAt)} đến ${formatVietnamTime(closesAt)} · ${input.active === "true" ? "Mở theo thời gian" : "Tạm đóng"}.`,
        confirmLabel: "Xác nhận lưu đợt",
      });
      if (!d.confirmed) throw Error("Chưa lưu thay đổi.");
      return api("/grade-reviews/periods", {
        method: "POST",
        body: {
          termId: input.termId,
          opensAt,
          closesAt,
          active: input.active === "true",
          version: period?.version || 0,
          requestId,
          confirm: true,
        },
      });
    },
    refresh,
    "Đã cập nhật đợt phúc khảo.",
  );
}
