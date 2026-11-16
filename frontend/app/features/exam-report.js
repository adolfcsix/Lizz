import { api } from "../services/api.js";
import { brand } from "../components/brand.js";
import {
  openEditor,
  escapeHtml as esc,
  field,
  table,
  errorBox,
  showError,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
export const reportStatuses = {
  DRAFT: "Bản nháp",
  SUBMITTED: "Chờ kiểm tra",
  CONFIRMED: "Đã xác nhận",
  RETURNED: "Cần bổ sung",
};
const marks = {
  PRESENT: "Có mặt",
  LATE: "Đến muộn",
  ABSENT: "Vắng",
  EXCUSED: "Vắng có phép",
  NOT_RECORDED: "Chưa ghi nhận",
};
const date = (v) => v?.split("-").reverse().join("/") || "—";
const when = (v) =>
  new Date(v).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
export function reportDocument(data) {
  const report = data.report,
    s = report?.payload.snapshot || data.live;
  return `<article class="exam-report-document"><header class="exam-report-heading">${brand()}<div><p>KHẢO THÍ</p><h2>Biên bản ca thi</h2><span>${report ? reportStatuses[report.status] + " · Bản " + report.version : "Chưa lập biên bản"}</span></div></header>${!data.sourceCurrent ? '<p class="report-source-warning">Nguồn hiện tại đã thay đổi. Nội dung dưới đây là bản lưu tại thời điểm lập, cần kiểm tra lại trước khi sử dụng.</p>' : ""}<dl class="record-summary"><dt>Học phần</dt><dd>${esc(s.subjectName)} · ${esc(s.sectionCode)}</dd><dt>Học kỳ</dt><dd>${esc(s.term)}</dd><dt>Ngày / giờ thi</dt><dd>${date(s.examDate)} · ${esc(s.startTime)}–${esc(s.endTime)}</dd><dt>Phòng thi</dt><dd>${esc(s.roomCode)} · ${esc(s.roomName)}</dd><dt>Giảng viên coi thi</dt><dd>${esc(s.invigilatorName)}</dd></dl><div class="report-totals"><div><span>Danh sách</span><b>${s.total}</b></div><div><span>Có mặt / muộn</span><b>${s.attended}</b></div><div><span>Vắng / có phép</span><b>${s.absent}</b></div><div><span>Số bài thu</span><b>${report?.payload.papers ?? "—"}</b></div></div>${s.counts.NOT_RECORDED ? `<p class="report-source-warning">Chưa ghi nhận ${s.counts.NOT_RECORDED} thí sinh; không tính những người này là vắng.</p>` : ""}<h3>Ghi nhận ca thi</h3><p class="report-notes">${esc(report?.payload.notes || "Chưa có ghi chú.")}</p>${report?.payload.reason ? `<p class="report-source-warning">Lý do xử lý: ${esc(report.payload.reason)}</p>` : ""}<h3>Danh sách đối chiếu</h3>${table(
    ["SBD / Ghế", "Mã sinh viên", "Họ và tên", "Điểm danh"],
    s.rows.map(
      (r) =>
        `<tr><td>${esc(r.candidateNumber || "—")} / ${r.seatNumber ?? "—"}</td><td>${esc(r.code)}</td><td>${esc(r.fullName)}</td><td>${marks[r.status]}</td></tr>`,
    ),
    "Chưa có thí sinh.",
  )}<footer><p>${report ? "Ghi nhận bởi " + esc(report.createdByName) + " · " + esc(when(report.createdAt)) : "Dữ liệu ca thi hiện tại; chưa có bản biên bản được lưu."}</p><p>Xác nhận trên hệ thống không thay thế chữ ký số hoặc chữ ký theo quy định của nhà trường.</p></footer></article>`;
}
export async function examReportDialog(id, actor, revision = "") {
  const dialog = openEditor(
      "Biên bản ca thi",
      '<p class="loading">Đang đối chiếu danh sách và điểm danh…</p>',
    ),
    loading = dialog.querySelector(".loading");
  try {
    const data = await api(
      `/exams/${id}/report${revision ? "?revision=" + encodeURIComponent(revision) : ""}`,
    );
    if (!dialog.open || !loading.isConnected) return;
    const r = data.report,
      s = data.live;
    loading.outerHTML = `${errorBox()}<div class="actions"><button data-report-reload>Tải bản mới nhất</button><button data-report-csv>Xuất CSV</button><button data-report-print>Xem bản in</button></div>${data.canDraft ? `<form class="report-draft-form">${field("Số bài thi đã thu", "papers", "number", r?.payload.papers ?? s.attended)}<label>Ghi chú, sự việc và bàn giao<textarea name="notes" maxlength="4000" rows="4" placeholder="Ghi tình hình ca thi, lý do thiếu bài hoặc nội dung cần bàn giao">${esc(r?.payload.notes || "")}</textarea></label><button type="submit" class="primary">Lưu bản nháp</button></form>` : ""}<div class="actions">${data.canSubmit ? '<button data-report-action="submit" class="primary">Gửi biên bản</button>' : ""}${data.canReview ? '<button data-report-action="confirm" class="primary">Xác nhận biên bản</button><button data-report-action="return">Trả bổ sung</button>' : ""}${data.canReopen ? '<button data-report-action="reopen">Mở lại để bổ sung</button>' : ""}</div>${s.issues.length ? `<p class="report-source-warning">${s.issues.map(esc).join(" ")}</p>` : ""}<div class="report-preview">${reportDocument(data)}</div>${
      data.history.length
        ? `<details><summary>Lịch sử biên bản (${data.history.length})</summary>${table(
            ["Bản", "Trạng thái", "Người ghi nhận", "Thời gian", ""],
            data.history.map(
              (h) =>
                `<tr><td>${h.version}</td><td>${reportStatuses[h.status]}</td><td>${esc(h.createdByName)}</td><td>${esc(when(h.createdAt))}</td><td><button data-report-version="${h.version}">Xem</button></td></tr>`,
            ),
          )}</details>`
        : ""
    }`;
    dialog.querySelector("[data-report-reload]").onclick = () =>
      examReportDialog(id, actor);
    for (const b of dialog.querySelectorAll("[data-report-version]"))
      b.onclick = () => examReportDialog(id, actor, b.dataset.reportVersion);
    const requests = new Map();
    const act = async (action, input, button, host = dialog) => {
      button.disabled = true;
      const requestKey = JSON.stringify({
        action,
        input,
        version: r?.version || 0,
        sourceHash: s.sourceHash,
      });
      if (!requests.has(requestKey))
        requests.set(requestKey, crypto.randomUUID());
      try {
        await api(`/exams/${id}/report/${action}`, {
          method: "POST",
          body: {
            ...input,
            version: r?.version || 0,
            sourceHash: s.sourceHash,
            requestId: requests.get(requestKey),
          },
        });
        notify("Đã cập nhật biên bản ca thi.");
        await examReportDialog(id, actor);
      } catch (error) {
        showError(host, error);
        button.disabled = false;
      }
    };
    const form = dialog.querySelector(".report-draft-form");
    if (form) {
      form.elements.papers.min = 0;
      form.elements.papers.max = 1000;
      form.elements.papers.step = 1;
      form.addEventListener("input", () => {
        const submit = dialog.querySelector('[data-report-action="submit"]');
        if (submit) submit.hidden = true;
      });
      form.onsubmit = (e) => {
        e.preventDefault();
        act(
          "save",
          {
            papers: Number(form.elements.papers.value),
            notes: form.elements.notes.value,
          },
          form.querySelector("button"),
        );
      };
    }
    for (const b of dialog.querySelectorAll("[data-report-action]"))
      b.onclick = () => {
        const action = b.dataset.reportAction,
          reason = ["return", "reopen"].includes(action);
        const decision = openEditor(
          b.textContent,
          `<form>${errorBox()}${reason ? field("Lý do xử lý", "reason") : ""}<p>${action === "submit" ? "Gửi bản nháp đã lưu để bộ phận khảo thí kiểm tra." : action === "confirm" ? "Xác nhận đúng bản đã gửi và nguồn điểm danh hiện tại." : "Bản cũ được giữ nguyên, giảng viên sẽ lập bản bổ sung."}</p><button class="primary" type="submit">Xác nhận</button><button type="button" data-report-cancel>Quay lại</button></form>`,
        );
        decision.querySelector("[data-report-cancel]").onclick = () =>
          examReportDialog(id, actor);
        decision.querySelector("form").onsubmit = async (e) => {
          e.preventDefault();
          const reasonValue = decision.querySelector("[name=reason]")?.value;
          await act(
            action,
            { confirm: true, ...(reason ? { reason: reasonValue } : {}) },
            e.target.querySelector("button"),
            decision,
          );
        };
      };
    dialog.querySelector("[data-report-csv]").onclick = () => {
      const saved = r?.payload.snapshot || s;
      downloadCsv(
        "bien-ban-ca-thi.csv",
        [
          "Học phần",
          "Phòng",
          "Ngày",
          "Trạng thái biên bản",
          "Bản",
          "Nguồn còn khớp",
          "SBD",
          "Ghế",
          "Mã sinh viên",
          "Họ tên",
          "Điểm danh",
          "Số bài thu",
          "Ghi chú",
        ],
        saved.rows.map((row) => [
          saved.sectionCode,
          saved.roomCode,
          saved.examDate,
          r ? reportStatuses[r.status] : "Chưa lập",
          r?.version || 0,
          data.sourceCurrent ? "Có" : "Đã thay đổi",
          row.candidateNumber,
          row.seatNumber,
          row.code,
          row.fullName,
          marks[row.status],
          r?.payload.papers ?? "",
          r?.payload.notes || "",
        ]),
      );
    };
    dialog.querySelector("[data-report-print]").onclick = () =>
      printPreview(data);
  } catch (error) {
    if (dialog.open && loading.isConnected) loading.textContent = error.message;
  }
}
function printPreview(data) {
  const dialog = openEditor(
    "Xem trước bản in",
    `<div class="report-preview">${reportDocument(data)}</div><button class="primary" data-print-report>In biên bản</button>`,
  );
  dialog.querySelector("[data-print-report]").onclick = async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    document.querySelector("#exam-report-sheet")?.remove();
    const sheet = document.createElement("section");
    sheet.id = "exam-report-sheet";
    sheet.innerHTML = reportDocument(data);
    document.body.append(sheet);
    const cleanup = () => {
      sheet.remove();
      document.body.classList.remove("printing-exam-report");
      button.disabled = false;
      window.removeEventListener("afterprint", cleanup);
    };
    dialog.addEventListener("close", cleanup, { once: true });
    try {
      await document.fonts.ready;
      for (const img of sheet.querySelectorAll("img")) await img.decode();
      if (!dialog.open || !sheet.isConnected) {
        cleanup();
        return;
      }
      document.body.classList.add("printing-exam-report");
      window.addEventListener("afterprint", cleanup, { once: true });
      window.print();
      button.disabled = false;
    } catch {
      cleanup();
      notify("Chưa mở được bản in. Vui lòng thử lại.");
    }
  };
}
