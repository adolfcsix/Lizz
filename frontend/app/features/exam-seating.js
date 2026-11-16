import { api } from "../services/api.js";
import {
  table,
  escapeHtml as esc,
  field,
  errorBox,
  showError,
  openEditor,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
export const seatingLabels = {
  CURRENT: "Đã xếp chỗ",
  STALE: "Cần xếp lại",
  NOT_ASSIGNED: "Chưa xếp chỗ",
  CANCELLED: "Lịch đã hủy",
};
export function seatingTable(container, rows, metadata = {}) {
  container.innerHTML = `<div class="toolbar"><label>Tìm thí sinh<input type="search" data-seat-query placeholder="Mã sinh viên, họ tên, số báo danh"></label><button data-seat-export>Xuất CSV</button></div><div data-seat-table></div>`;
  let page = 1;
  const filtered = () =>
    rows.filter((row) =>
      `${row.code} ${row.fullName} ${row.candidateNumber || ""} ${row.seatNumber || ""}`
        .toLocaleLowerCase("vi")
        .includes(
          container
            .querySelector("[data-seat-query]")
            .value.toLocaleLowerCase("vi"),
        ),
    );
  function paint() {
    const result = filtered(),
      max = Math.max(1, Math.ceil(result.length / 15));
    page = Math.min(page, max);
    const target = container.querySelector("[data-seat-table]");
    target.innerHTML =
      table(
        ["Số báo danh", "Ghế", "Mã sinh viên", "Họ và tên"],
        result
          .slice((page - 1) * 15, page * 15)
          .map(
            (row) =>
              `<tr><td><b>${esc(row.candidateNumber || "—")}</b></td><td>${row.seatNumber || "—"}</td><td>${esc(row.code)}</td><td>${esc(row.fullName)}</td></tr>`,
          ),
        "Chưa có thí sinh phù hợp.",
      ) +
      `<div class="pagination"><span>${result.length} thí sinh · Trang ${page}/${max}</span><button data-seat-prev ${page === 1 ? "disabled" : ""}>Trước</button><button data-seat-next ${page === max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("[data-seat-prev]").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("[data-seat-next]").onclick = () => {
      page++;
      paint();
    };
  }
  container.querySelector("[data-seat-query]").oninput = () => {
    page = 1;
    paint();
  };
  container.querySelector("[data-seat-export]").onclick = () =>
    downloadCsv(
      "danh-sach-thi.csv",
      [
        "Lớp học phần",
        "Phòng",
        "Ngày thi",
        "Giờ",
        "Trạng thái xếp chỗ",
        "Lần lập",
        "Số báo danh",
        "Ghế",
        "Mã sinh viên",
        "Họ và tên",
      ],
      filtered().map((row) => [
        metadata.sectionCode,
        metadata.roomCode,
        metadata.examDate,
        metadata.startTime,
        metadata.status,
        metadata.version,
        row.candidateNumber,
        row.seatNumber,
        row.code,
        row.fullName,
      ]),
    );
  paint();
}
export async function seatingDialog(id, actor, refresh) {
  const dialog = openEditor(
    "Danh sách thí sinh",
    '<p class="loading">Đang tải danh sách…</p>',
  );
  const loading = dialog.querySelector(".loading");
  try {
    const data = await api("/exams/" + id + "/students");
    if (!dialog.open || !loading.isConnected) return;
    const exam = data.exam,
      manage = ["MANAGER", "STAFF"].includes(actor.role),
      canAssign =
        manage &&
        exam.status === "PUBLISHED" &&
        Date.parse(exam.examDate + "T" + exam.startTime + ":00+07:00") >
          Date.now();
    dialog.querySelector(".loading").outerHTML =
      `<p><b>${esc(exam.subjectName)} · ${esc(exam.sectionCode)}</b><br>${esc(exam.roomCode)} · ${esc(exam.examDate.split("-").reverse().join("/"))} · ${esc(exam.startTime)}–${esc(exam.endTime)}</p><div class="section-title"><span class="badge">${seatingLabels[data.seatingStatus]}</span>${canAssign ? '<button class="primary" id="assign-exam-seats">' + (data.seatingVersion ? "Lập lại danh sách" : "Xếp số báo danh và ghế") + "</button>" : ""}</div>${data.seatingStatus === "STALE" ? '<p class="hint">Lịch, phòng hoặc danh sách thí sinh đã thay đổi. Số báo danh và ghế cũ tạm thời không được sử dụng.</p>' : ""}<div id="seating-roster"></div><p class="hint">Chỗ ngồi không thay thế kết quả kiểm tra điều kiện dự thi.</p>${
        manage && data.seatingHistory.length
          ? `<details><summary>Lịch sử lập danh sách (${data.seatingHistory.length})</summary>${table(
              ["Lần lập", "Thời gian", "Thí sinh", "Lý do"],
              data.seatingHistory.map(
                (row) =>
                  `<tr><td>${row.version}</td><td>${esc(new Date(row.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}</td><td>${row.count}</td><td>${esc(row.reason)}</td></tr>`,
              ),
            )}</details>`
          : ""
      }`;
    seatingTable(dialog.querySelector("#seating-roster"), data.rows, {
      ...exam,
      status: seatingLabels[data.seatingStatus],
      version: data.seatingVersion,
    });
    dialog.querySelector("#assign-exam-seats")?.addEventListener("click", () =>
      seatingForm(
        id,
        async () => {
          await refresh();
          await seatingDialog(id, actor, refresh);
        },
        exam,
      ),
    );
  } catch (error) {
    if (dialog.open && loading.isConnected) loading.textContent = error.message;
  }
}
function seatingForm(id, refresh, exam, draft = {}) {
  const dialog = openEditor(
    "Xếp số báo danh và chỗ ngồi",
    `<form>${errorBox()}<div class="form-grid">${field("Tiền tố số báo danh", "prefix", "text", draft.prefix ?? "THI-")}${field("Số bắt đầu", "startNumber", "number", draft.startNumber ?? 1)}</div>${field("Lý do lập danh sách", "reason", "text", draft.reason || "")}<p class="hint">Sắp theo mã sinh viên, đánh số ghế từ 1 trong phòng đã công bố. Mỗi ca thi có danh sách riêng.</p><button class="primary" type="submit">Xem trước danh sách</button></form>`,
  );
  const form = dialog.querySelector("form");
  form.elements.prefix.required = false;
  form.elements.prefix.maxLength = 16;
  form.elements.startNumber.min = 1;
  form.elements.startNumber.max = 999000;
  form.elements.startNumber.step = 1;
  form.elements.reason.minLength = 5;
  form.elements.reason.maxLength = 1000;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("button");
    button.disabled = true;
    const input = Object.fromEntries(new FormData(form));
    input.startNumber = Number(input.startNumber);
    try {
      const review = await api(`/exams/${id}/seating/review`, {
        method: "POST",
        body: input,
      });
      if (!dialog.open || !form.isConnected) return;
      dialog.innerHTML = `<div class="dialog-header"><h2>Xác nhận danh sách phòng thi</h2><button type="button" data-seat-close aria-label="Đóng biểu mẫu">Đóng</button></div><p><b>${esc(exam.sectionCode)} · ${esc(exam.roomCode)} · ${esc(review.exam.examDate.split("-").reverse().join("/"))}</b> · ${review.rows.length} thí sinh · Lần lập ${review.version + 1}</p><p class="hint">${esc(review.reason)}</p>${errorBox()}<div data-seat-preview></div><div class="actions"><button type="button" data-seat-back>Chỉnh lại</button><button type="button" class="primary" data-seat-confirm>Xác nhận lưu danh sách</button></div>`;
      seatingTable(dialog.querySelector("[data-seat-preview]"), review.rows, {
        ...exam,
        examDate: review.exam.examDate,
        startTime: review.exam.startTime,
        status: "Xem trước",
        version: review.version + 1,
      });
      dialog.querySelector("[data-seat-close]").onclick = () => dialog.close();
      dialog.querySelector("[data-seat-back]").onclick = () =>
        seatingForm(id, refresh, exam, input);
      dialog.querySelector("[data-seat-confirm]").onclick = async (event) => {
        const submit = event.currentTarget;
        submit.disabled = true;
        try {
          await api(`/exams/${id}/seating/confirm`, {
            method: "POST",
            body: {
              ...input,
              version: review.version,
              reviewHash: review.reviewHash,
              confirm: true,
            },
          });
          dialog.close();
          notify("Đã lưu số báo danh và chỗ ngồi.");
          await refresh();
        } catch (error) {
          showError(dialog, error);
          submit.disabled = false;
        }
      };
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    }
  };
}
