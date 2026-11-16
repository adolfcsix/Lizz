import { examReportDialog, reportStatuses } from "./exam-report.js";
import { seatingDialog, seatingLabels } from "./exam-seating.js";
import { eligibilityDialog } from "./attendance.js";
import { api } from "../services/api.js";
import { downloadCsv } from "../components/csv-export.js";
import { examExport } from "../../../shared/exam-export.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  errorBox,
  showError,
  openEditor,
  bindForm,
  confirmAction,
  notify,
} from "../components/ui.js";
const statuses = {
  DRAFT: "Bản nháp",
  PUBLISHED: "Đã công bố",
  CANCELLED: "Đã hủy",
};
const date = (value) => value.split("-").reverse().join("/");
export async function examsPage(container, actor) {
  const data = await api("/exams"),
    manage = ["MANAGER", "STAFF"].includes(actor.role);
  let mode = "exams",
    page = 1;
  const refresh = () => examsPage(container, actor);
  container.innerHTML =
    heading(
      "Lịch thi",
      manage
        ? '<button id="new-room">Thêm phòng thi</button><button class="primary" id="new-exam">Lập lịch thi</button>'
        : "",
    ) +
    (manage
      ? '<nav class="tabs" aria-label="Lịch thi và phòng"><button id="exam-tab" aria-pressed="true">Lịch thi</button><button id="room-tab" aria-pressed="false">Phòng thi</button></nav>'
      : "") +
    `<section class="panel"><div class="toolbar"><button id="exam-export" type="button">Xuất CSV</button><label>Tìm kiếm<input type="search" id="exam-query" placeholder="Môn học, lớp hoặc phòng thi"></label><label id="exam-term-label">Học kỳ<select id="exam-term"><option value="">Tất cả học kỳ</option>${[
      ...new Set(data.rows.map((r) => r.term)),
    ]
      .sort()
      .map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)
      .join(
        "",
      )}</select></label><label id="exam-status-label">Trạng thái<select id="exam-status"><option value="">Tất cả</option>${Object.entries(
      statuses,
    )
      .filter(([k]) => manage || k !== "DRAFT")
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("")}</select></label></div><div id="exam-table"></div></section>`;
  const paint = () => {
    const q = container
        .querySelector("#exam-query")
        .value.toLocaleLowerCase("vi"),
      term = container.querySelector("#exam-term").value,
      status = container.querySelector("#exam-status").value;
    const rows = (mode === "rooms" ? data.rooms : data.rows).filter(
      (r) =>
        `${r.code || ""} ${r.name || ""} ${r.sectionCode || ""} ${r.subjectName || ""} ${r.roomCode || ""} ${r.roomName || ""}`
          .toLocaleLowerCase("vi")
          .includes(q) &&
        (mode === "rooms" ||
          ((!term || r.term === term) && (!status || r.status === status))),
    );
    const exportButton = container.querySelector("#exam-export");
    exportButton.disabled = rows.length === 0;
    exportButton.textContent = `Xuất CSV (${rows.length})`;
    exportButton.onclick = () => {
      const output = examExport(mode, rows, actor.role);
      downloadCsv(output.filename, output.headers, output.rows);
    };
    const max = Math.max(1, Math.ceil(rows.length / 10));
    page = Math.min(page, max);
    const target = container.querySelector("#exam-table");
    target.innerHTML =
      table(
        mode === "rooms"
          ? [
              "Phòng thi",
              "Sức chứa",
              "Trạng thái",
              ...(actor.access?.canManageShared !== false ? ["Thao tác"] : []),
            ]
          : [
              "Ngày / giờ thi",
              "Học phần",
              "Phòng / Coi thi",
              "Trạng thái",
              "Thao tác",
            ],
        rows
          .slice((page - 1) * 10, page * 10)
          .map((r) =>
            mode === "rooms"
              ? `<tr><td><b>${esc(r.code)}</b><small>${esc(r.name)}</small></td><td>${r.capacity} chỗ</td><td>${r.active ? "Đang sử dụng" : "Ngừng sử dụng"}</td>${actor.access?.canManageShared !== false ? `<td><button data-room="${r.id}">Chỉnh sửa</button></td>` : ""}</tr>`
              : `<tr><td><b>${esc(date(r.examDate))}</b><small>${esc(r.startTime)}–${esc(r.endTime)}</small></td><td><b>${esc(r.subjectName)}</b><small>${esc(r.sectionCode)} · ${esc(r.term)}</small></td><td>${esc(r.roomCode)} · ${esc(r.roomName)}<small>${esc(r.invigilatorName)}</small>${actor.role === "STUDENT" ? (r.mySeat ? `<small><b>SBD ${esc(r.mySeat.candidateNumber)} · Ghế ${r.mySeat.seatNumber}</b></small>` : `<small>${seatingLabels[r.seatingStatus] || "Chưa xếp chỗ"}</small>`) : ""}</td><td><span class="badge">${statuses[r.status]}</span>${r.reportStatus && Date.parse(r.examDate + "T" + r.endTime + ":00+07:00") <= Date.now() ? `<small>Biên bản: ${reportStatuses[r.reportStatus] || "Chưa lập"}</small>` : ""}${r.cancelReason ? `<small>${esc(r.cancelReason)}</small>` : ""}</td>${actor.role === "STUDENT" ? `<td><button data-exam-eligibility="${r.sectionId}">Điều kiện dự thi</button></td>` : `<td><div class="actions"><button data-exam-eligibility="${r.sectionId}">Điều kiện dự thi</button><button data-roster="${r.id}">Thí sinh</button>${r.status === "PUBLISHED" && (["MANAGER", "STAFF"].includes(actor.role) || r.invigilatorId === actor.id) ? `<button data-report="${r.id}">Biên bản ca thi</button>` : ""}${manage && r.status === "DRAFT" ? `<button data-edit-exam="${r.id}">Chỉnh sửa</button><button data-publish="${r.id}">Công bố</button>` : ""}${manage && r.status !== "CANCELLED" ? `<button data-cancel-exam="${r.id}">Hủy lịch</button>` : ""}</div></td>`}</tr>`,
          ),
        mode === "rooms"
          ? "Chưa có phòng thi."
          : q || term || status
            ? "Không tìm thấy lịch thi phù hợp."
            : "Chưa có lịch thi được công bố.",
      ) +
      `<div class="pagination"><span>Trang ${page}/${max}</span><button id="exam-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="exam-next" ${page === max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#exam-prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#exam-next").onclick = () => {
      page++;
      paint();
    };
    for (const b of target.querySelectorAll("[data-exam-eligibility]"))
      b.onclick = () => eligibilityDialog(b.dataset.examEligibility);
    for (const b of target.querySelectorAll("[data-room]"))
      b.onclick = () =>
        roomForm(
          data.rooms.find((r) => r.id === b.dataset.room),
          refresh,
        );
    for (const b of target.querySelectorAll("[data-edit-exam]"))
      b.onclick = () =>
        examForm(
          data,
          data.rows.find((r) => r.id === b.dataset.editExam),
          refresh,
        );
    for (const b of target.querySelectorAll("[data-publish]"))
      b.onclick = () => publishDialog(b.dataset.publish, refresh);
    for (const b of target.querySelectorAll("[data-report]"))
      b.onclick = () => examReportDialog(b.dataset.report, actor);
    for (const b of target.querySelectorAll("[data-roster]"))
      b.onclick = () => seatingDialog(b.dataset.roster, actor, refresh);
    for (const b of target.querySelectorAll("[data-cancel-exam]"))
      b.onclick = () =>
        cancelDialog(
          data.rows.find((r) => r.id === b.dataset.cancelExam),
          refresh,
        );
  };
  container.querySelector("#exam-query").oninput =
    container.querySelector("#exam-term").onchange =
    container.querySelector("#exam-status").onchange =
      () => {
        page = 1;
        paint();
      };
  if (manage) {
    if (actor.access?.canManageShared === false)
      container.querySelector("#new-room").hidden = true;
    container.querySelector("#new-room").onclick = () =>
      roomForm(null, refresh);
    container.querySelector("#new-exam").onclick = () =>
      examForm(data, null, refresh);
    for (const [id, value] of [
      ["exam-tab", "exams"],
      ["room-tab", "rooms"],
    ])
      container.querySelector("#" + id).onclick = () => {
        mode = value;
        page = 1;
        container.querySelector("#exam-query").value = "";
        container.querySelector("#exam-query").placeholder =
          mode === "rooms"
            ? "Mã hoặc tên phòng thi"
            : "Môn học, lớp hoặc phòng thi";
        for (const [key, v] of [
          ["exam-tab", "exams"],
          ["room-tab", "rooms"],
        ])
          container
            .querySelector("#" + key)
            .setAttribute("aria-pressed", String(v === mode));
        for (const key of ["exam-term-label", "exam-status-label"])
          container.querySelector("#" + key).hidden = mode === "rooms";
        paint();
      };
  }
  paint();
}
export function roomForm(row, refresh) {
  const dialog = openEditor(
    row ? "Chỉnh sửa phòng" : "Thêm phòng",
    `<form>${errorBox()}<div class="form-grid">${field("Mã phòng", "code", "text", row?.code || "")}${field("Tên phòng", "name", "text", row?.name || "")}${field("Sức chứa", "capacity", "number", row?.capacity || 40)}${select(
      "Trạng thái",
      "active",
      [
        { id: "true", name: "Đang sử dụng" },
        { id: "false", name: "Ngừng sử dụng" },
      ],
      String(row?.active ?? true),
    )}</div><button class="primary" type="submit">Lưu phòng</button></form>`,
  );
  bindForm(
    dialog,
    (input) =>
      api("/exams/rooms" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: {
          ...input,
          capacity: Number(input.capacity),
          active: input.active === "true",
          ...(row ? { version: row.version } : {}),
        },
      }),
    refresh,
    "Đã lưu phòng.",
  );
}
function examForm(data, row, refresh) {
  if (
    !data.sections.length ||
    !data.rooms.some((r) => r.active) ||
    !data.teachers.length
  )
    return notify(
      "Cần có lớp học phần, phòng thi và giảng viên coi thi trước khi lập lịch.",
    );
  const dialog = openEditor(
    row ? "Chỉnh sửa lịch thi" : "Lập lịch thi",
    `<form>${errorBox()}<div class="form-grid">${select(
      "Lớp học phần",
      "sectionId",
      data.sections.map((s) => ({
        ...s,
        name: s.code + " · " + s.subjectName + " · " + s.term,
      })),
      row?.sectionId,
    )}${select(
      "Phòng thi",
      "roomId",
      data.rooms
        .filter((r) => r.active)
        .map((r) => ({
          ...r,
          name: r.code + " · " + r.name + " · " + r.capacity + " chỗ",
        })),
      row?.roomId,
    )}${select("Giảng viên coi thi", "invigilatorId", data.teachers, row?.invigilatorId)}${field("Ngày thi", "examDate", "date", row?.examDate || "")}${field("Giờ bắt đầu", "startTime", "time", row?.startTime || "")}${field("Giờ kết thúc", "endTime", "time", row?.endTime || "")}</div><p class="hint">Lưu bản nháp chưa hiển thị lịch cho sinh viên. Giờ thi theo giờ Việt Nam.</p><button class="primary" type="submit">Lưu bản nháp</button></form>`,
  );
  bindForm(
    dialog,
    (input) =>
      api("/exams" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: { ...input, ...(row ? { version: row.version } : {}) },
      }),
    refresh,
    "Đã lưu bản nháp lịch thi.",
  );
}
async function publishDialog(id, refresh) {
  const dialog = openEditor(
    "Công bố lịch thi",
    '<p class="loading">Đang kiểm tra lịch và danh sách thí sinh…</p>',
  );
  try {
    const data = await api("/exams/" + id + "/review");
    if (!dialog.isConnected || !dialog.open) return;
    const r = data.exam;
    dialog.querySelector(".loading").outerHTML =
      `<dl class="record-summary"><dt>Học phần</dt><dd>${esc(r.subjectName)} · ${esc(r.sectionCode)}</dd><dt>Ngày / giờ thi</dt><dd>${date(r.examDate)} · ${esc(r.startTime)}–${esc(r.endTime)}</dd><dt>Phòng thi</dt><dd>${esc(r.roomCode)} · ${data.count}/${data.capacity} chỗ</dd><dt>Coi thi</dt><dd>${esc(r.invigilatorName)}</dd></dl>${errorBox()}`;
    const decision = await confirmAction(dialog, {
      title: "Công bố lịch thi này?",
      message:
        "Sinh viên của lớp và giảng viên liên quan sẽ xem được lịch. Muốn đổi sau công bố cần hủy lịch cũ rồi lập lịch thay thế.",
      confirmLabel: "Công bố lịch thi",
    });
    if (!decision.confirmed) return;
    await api("/exams/" + id + "/publish", {
      method: "POST",
      body: { version: r.version, reviewHash: data.reviewHash, confirm: true },
    });
    dialog.close();
    notify("Đã công bố lịch thi.");
    await refresh();
  } catch (error) {
    if (dialog.isConnected && dialog.open) {
      dialog.querySelector(".loading")?.remove();
      if (!dialog.querySelector(".form-error"))
        dialog.insertAdjacentHTML("beforeend", errorBox());
      showError(dialog, error);
      if (!dialog.querySelector("#retry-exam-review")) {
        dialog.insertAdjacentHTML(
          "beforeend",
          '<button id="retry-exam-review">Kiểm tra lại</button>',
        );
        dialog.querySelector("#retry-exam-review").onclick = () =>
          publishDialog(id, refresh);
      }
    }
  }
}
async function cancelDialog(row, refresh) {
  const dialog = openEditor("Hủy lịch thi", errorBox());
  const decision = await confirmAction(dialog, {
    title: "Hủy lịch " + row.sectionCode + "?",
    message:
      "Lịch cũ được giữ lại cùng lý do hủy. Sinh viên sẽ thấy thông báo hủy nếu lịch đã công bố.",
    confirmLabel: "Xác nhận hủy lịch",
    requireReason: true,
    reasonLabel: "Lý do hủy lịch",
    reasonError: "Nhập lý do hủy lịch thi.",
  });
  if (!decision.confirmed) {
    dialog.close();
    return;
  }
  try {
    await api("/exams/" + row.id + "/cancel", {
      method: "POST",
      body: { version: row.version, reason: decision.reason, confirm: true },
    });
    dialog.close();
    notify("Đã hủy lịch thi.");
    await refresh();
  } catch (error) {
    showError(dialog, error);
  }
}
