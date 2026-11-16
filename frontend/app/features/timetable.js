import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  errorBox,
  showError,
  openEditor,
  confirmAction,
  notify,
} from "../components/ui.js";
import { brand } from "../components/brand.js";
import { icon } from "../components/icons.js";
import { downloadCsv } from "../components/csv-export.js";
import { roomForm } from "./exams.js";
import { foldText } from "../../../shared/local-validation.js";
import {
  calendarWeek,
  addCalendarDays as add,
  weekLessons,
  filterLessonRows,
  lessonTone,
  serializeTimetableIcs,
} from "../../../shared/timetable-view.js";
const dayName = (v) =>
  v === 7
    ? "Chủ nhật"
    : ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][v];
const dateName = (v) => v.split("-").reverse().join("/");
const today = () =>
  new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
const shortDate = (v) => v.slice(8, 10) + "/" + v.slice(5, 7);
const labelRow = (r) =>
  `${r.subjectName} · ${r.sectionCode} · ${dateName(r.date)}, ${r.startTime}–${r.endTime}, ${r.roomCode || "chưa phân phòng"}${r.exception ? ", học bù" : ""}`;
export async function timetablePage(container, actor) {
  let days = calendarWeek(today()),
    selectedDate = today(),
    mode = "calendar",
    view = "week",
    query = "",
    term = "",
    sectionId = "",
    roomCode = "",
    page = 1,
    data,
    epoch = 0;
  const load = async (date = days[0], focusDate = null) => {
    let next;
    try {
      next = calendarWeek(date);
    } catch (error) {
      if (!data) throw error;
      container.querySelector("#tt-error").textContent = error.message;
      return;
    }
    const request = ++epoch;
    container.setAttribute("aria-busy", "true");
    for (const b of container.querySelectorAll("[data-week-action]"))
      b.disabled = true;
    try {
      const result = await api(
        "/timetable?" + new URLSearchParams({ from: next[0], to: next[6] }),
      );
      if (request !== epoch || !container.isConnected) return;
      data = result;
      days = next;
      if (focusDate && days.includes(focusDate)) selectedDate = focusDate;
      else if (!days.includes(selectedDate))
        selectedDate = days.includes(today())
          ? today()
          : weekLessons(data.rows, days[0]).find((d) => d.rows.length)?.date ||
            days[0];
      render();
    } catch (error) {
      if (request !== epoch) return;
      if (!data) throw error;
      render();
      container.querySelector("#tt-error").textContent = error.message;
    } finally {
      if (request === epoch) container.removeAttribute("aria-busy");
    }
  };
  const matches = (r) =>
    foldText(
      [
        r.sectionCode,
        r.code,
        r.name,
        r.subjectName,
        r.roomCode,
        r.roomName,
        r.lecturerName,
        r.term,
      ].join(" "),
    ).includes(foldText(query));
  const filtered = () =>
    mode === "calendar"
      ? filterLessonRows(data.rows, { query, term, sectionId, roomCode })
      : (mode === "rooms" ? data.rooms : data.sections).filter(
          (r) => matches(r) && (mode === "rooms" || !term || r.term === term),
        );
  function render() {
    const terms = [...new Set(data.sections.map((s) => s.term))]
      .sort()
      .reverse();
    container.innerHTML =
      heading(
        actor.role === "STUDENT"
          ? "Lịch học của tôi"
          : actor.role === "LECTURER"
            ? "Lịch giảng dạy"
            : "Thời khóa biểu",
        `<details class="tt-export-menu"><summary>${icon("download")}Xuất lịch</summary><div><button id="tt-export">Bảng dữ liệu (CSV)</button>${mode === "calendar" ? '<button id="tt-ics">Tải lịch cá nhân (.ics)</button><button id="tt-print">In thời khóa biểu</button>' : ""}</div></details>`,
      ) +
      `<section class="panel timetable-panel">${data.manage ? `<div class="timetable-tabs"><button aria-pressed="${mode === "calendar"}" data-mode="calendar">Lịch tuần</button><button aria-pressed="${mode === "plans"}" data-mode="plans">Phân lịch học</button><button aria-pressed="${mode === "rooms"}" data-mode="rooms">Phòng học và phòng thi</button></div>` : ""}${mode === "calendar" ? `<div class="tt-week-bar"><div><h2 id="tt-week-title">${shortDate(days[0])} – ${dateName(days[6])}</h2><span>Giờ Việt Nam <i aria-hidden="true">·</i> <span id="tt-week-count"></span></span></div><div class="tt-week-actions"><button id="tt-today" data-week-action>Hôm nay</button><div class="tt-week-step"><button id="tt-week-prev" data-week-action aria-label="Tuần trước">${icon("previous")}</button><button id="tt-week-next" data-week-action aria-label="Tuần sau">${icon("next")}</button></div><label class="tt-jump"><span class="visually-hidden">Chọn ngày để xem tuần</span><input id="tt-jump" type="date" min="1900-01-01" max="9998-12-24" aria-label="Chọn ngày để xem tuần" value="${days[0]}"></label></div></div>` : ""}<form id="tt-filter" class="tt-filter"><label>Tìm ${mode === "rooms" ? "phòng" : "lịch"}<input name="q" type="search" value="${esc(query)}" placeholder="${mode === "rooms" ? "Mã hoặc tên phòng" : "Môn học, lớp, giảng viên hoặc phòng"}"></label>${mode !== "rooms" ? select("Học kỳ", "term", [{ id: "ALL", name: "Tất cả học kỳ" }, ...terms.map((t) => ({ id: t, name: t }))], term || "ALL", { required: false, placeholder: false }) : ""}${mode === "calendar" ? `<div class="tt-view-switch" role="group" aria-label="Cách xem lịch"><button type="button" data-view="week" aria-pressed="${view === "week"}">${icon("grid")}<span class="tt-label-week">Theo tuần</span><span class="tt-label-day">Theo ngày</span></button><button type="button" data-view="list" aria-pressed="${view === "list"}">${icon("list")}<span>Danh sách</span></button></div>` : ""}${mode === "calendar" ? `<details class="tt-more-filters" ${sectionId || roomCode ? "open" : ""}><summary>Lọc theo lớp và phòng <span id="tt-filter-count"></span></summary><div>${select("Lớp học phần", "sectionId", [{ id: "", name: "Tất cả lớp học phần" }, ...data.sections.filter((s) => !term || s.term === term).map((s) => ({ id: s.id, name: s.code + " · " + s.subjectName }))], sectionId, { required: false, placeholder: false })}${select("Phòng học", "roomCode", [{ id: "", name: "Tất cả phòng" }, ...[...new Set([...data.rows.map((r) => r.roomCode), ...data.rooms.map((r) => r.code), roomCode === "__UNASSIGNED__" ? "" : roomCode].filter(Boolean))].sort().map((code) => ({ id: code, name: code })), { id: "__UNASSIGNED__", name: "Chưa phân phòng" }], roomCode, { required: false, placeholder: false })}<button type="button" id="tt-clear-filters">Bỏ lọc</button></div></details>` : ""}</form><p class="form-error" id="tt-error" role="alert"></p><div id="tt-body"></div></section>`;
    const form = container.querySelector("#tt-filter");
    form.onsubmit = (e) => e.preventDefault();
    form.elements.q.oninput = () => {
      query = form.elements.q.value;
      page = 1;
      paint();
    };
    if (form.elements.term)
      form.elements.term.onchange = () => {
        term =
          form.elements.term.value === "ALL" ? "" : form.elements.term.value;
        sectionId = "";
        page = 1;
        render();
      };
    for (const name of ["sectionId", "roomCode"])
      if (form.elements[name])
        form.elements[name].onchange = () => {
          sectionId = form.elements.sectionId.value;
          roomCode = form.elements.roomCode.value;
          paint();
        };
    const clearFilters = form.querySelector("#tt-clear-filters");
    if (clearFilters)
      clearFilters.onclick = () => {
        query = term = sectionId = roomCode = "";
        render();
        container.querySelector('[name="q"]').focus();
      };
    for (const b of container.querySelectorAll("[data-mode]"))
      b.onclick = () => {
        mode = b.dataset.mode;
        page = 1;
        render();
      };
    for (const b of container.querySelectorAll("[data-view]"))
      b.onclick = () => {
        view = b.dataset.view;
        for (const c of container.querySelectorAll("[data-view]"))
          c.setAttribute("aria-pressed", String(c.dataset.view === view));
        paint();
      };
    if (mode === "calendar") {
      container.querySelector("#tt-print").onclick = printWeek;
      container.querySelector("#tt-week-prev").onclick = () =>
        load(add(days[0], -7));
      container.querySelector("#tt-week-next").onclick = () =>
        load(add(days[0], 7));
      container.querySelector("#tt-today").onclick = () => {
        load(today(), today());
      };
      container.querySelector("#tt-jump").onchange = (e) => {
        try {
          calendarWeek(e.target.value);
          load(e.target.value, e.target.value);
        } catch (error) {
          container.querySelector("#tt-error").textContent = error.message;
          e.target.value = days[0];
        }
      };
    }
    container.querySelector("#tt-export").onclick = () => {
      const rows = filtered();
      if (mode === "rooms")
        downloadCsv(
          "Lizz_Danh_muc_phong.csv",
          ["Mã phòng", "Tên phòng", "Sức chứa", "Trạng thái"],
          rows.map((r) => [
            r.code,
            r.name,
            r.capacity,
            r.active ? "Đang sử dụng" : "Ngừng sử dụng",
          ]),
        );
      else if (mode === "plans")
        downloadCsv(
          "Lizz_Phan_lich.csv",
          [
            "Lớp",
            "Môn",
            "Học kỳ",
            "Giảng viên",
            "Từ ngày",
            "Đến ngày",
            "Lịch định kỳ",
          ],
          rows.map((r) => [
            r.code,
            r.subjectName,
            r.term,
            r.lecturerName,
            r.startDate,
            r.endDate,
            r.scheduleSummary,
          ]),
        );
      else
        downloadCsv(
          "Lizz_Thoi_khoa_bieu_" + days[0] + ".csv",
          [
            "Ngày",
            "Bắt đầu",
            "Kết thúc",
            "Lớp",
            "Môn",
            "Giảng viên",
            "Phòng",
            "Học bù từ",
          ],
          rows.map((r) => [
            r.date,
            r.startTime,
            r.endTime,
            r.sectionCode,
            r.subjectName,
            r.lecturerName,
            r.roomCode,
            r.originalDate || "",
          ]),
        );
    };
    const ics = container.querySelector("#tt-ics");
    if (ics)
      ics.onclick = async () => {
        const rows = filtered();
        container.querySelector(".tt-export-menu").open = false;
        if (!rows.length)
          return notify("Tuần này không có buổi học phù hợp để xuất.");
        const dialog = openEditor(
          "Lưu lịch cá nhân",
          `<p>${rows.length} buổi học từ ${dateName(days[0])} đến ${dateName(days[6])} theo bộ lọc đang chọn.</p><p class="hint">Tệp dùng cho ứng dụng lịch cá nhân. Thay đổi sau này trên Lizz không tự cập nhật hoặc xóa lịch bạn đã nhập.</p>${errorBox()}`,
        );
        const answer = await confirmAction(dialog, {
          title: "Tải tệp lịch của tuần",
          message: "Kiểm tra lại tuần học và bộ lọc trước khi tải.",
          confirmLabel: "Tải tệp .ics",
        });
        if (!answer.confirmed) {
          dialog.close();
          return;
        }
        try {
          const blob = new Blob([serializeTimetableIcs(rows)], {
              type: "text/calendar;charset=utf-8",
            }),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = "Lizz_Lich_tuan_" + days[0] + ".ics";
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          dialog.close();
        } catch (error) {
          showError(dialog, error);
        }
      };
    paint();
  }
  function rowCard(r, index) {
    return `<button class="tt-agenda-card tt-tone-${lessonTone(r)}" data-lesson="${index}" aria-label="${esc(labelRow(r))}"><span class="tt-agenda-time"><b>${esc(r.startTime)}</b><span>${esc(r.endTime)}</span></span><span><b>${esc(r.subjectName)}</b><small>${esc(r.sectionCode)} · ${esc(r.lecturerName)}</small>${r.exception ? `<em>Học bù từ ${shortDate(r.originalDate)}</em>` : ""}</span><span class="tt-room-pill">${esc(r.roomCode || "Chưa phân phòng")}</span></button>`;
  }
  function paint() {
    const body = container.querySelector("#tt-body"),
      rows = filtered();
    if (mode === "calendar") {
      const week = weekLessons(rows, days[0]);
      container.querySelector("#tt-filter-count").textContent =
        sectionId || roomCode
          ? `(${Number(Boolean(sectionId)) + Number(Boolean(roomCode))})`
          : "";
      const selected = week.find((d) => d.date === selectedDate).rows;
      container.querySelector("#tt-week-count").textContent =
        `${rows.length} buổi · ${new Set(rows.map((r) => r.sectionId)).size} học phần`;
      const dayNav = `<div class="tt-day-picks" role="group" aria-label="Ngày trong tuần">${days.map((date, i) => `<button data-day="${date}" aria-pressed="${date === selectedDate}" class="${date === today() ? "is-today" : ""}" aria-label="${dayName(i + 1)} ${dateName(date)}, ${rows.filter((r) => r.date === date).length} buổi"><span>${i === 6 ? "CN" : "T" + (i + 2)}</span><b>${Number(date.slice(8))}</b><i class="${rows.some((r) => r.date === date) ? "has-lessons" : ""}" aria-hidden="true"></i></button>`).join("")}</div>`;
      const board = `<div class="tt-week-board" role="region" aria-label="Thời khóa biểu theo tuần">${week.map(({ date, rows: lessons }, i) => `<section class="tt-board-day ${date === today() ? "is-today" : ""} ${lessons.length ? "" : "is-empty"}" aria-label="${dayName(i + 1)} ${dateName(date)}"><button class="tt-board-date" data-day="${date}" aria-label="Xem ${dayName(i + 1)} ${dateName(date)}"><span>${dayName(i + 1)}</span><b>${date.slice(8)}<small> / ${date.slice(5, 7)}</small></b>${date === today() ? "<em>Hôm nay</em>" : `<small>${lessons.length} buổi học</small>`}</button><div class="tt-board-lessons">${lessons.map((r) => `<button class="tt-lesson tt-tone-${lessonTone(r)}" data-lesson="${rows.indexOf(r)}" aria-label="${esc(labelRow(r))}"><span class="tt-lesson-top"><time>${esc(r.startTime)} – ${esc(r.endTime)}</time>${r.exception ? "<em>Học bù</em>" : ""}</span><b>${esc(r.subjectName)}</b><span class="tt-lesson-code">${esc(r.sectionCode)}</span><span class="tt-lesson-bottom"><span>${icon("location")}${esc(r.roomCode || "Chưa phân phòng")}</span><span>${esc(r.lecturerName || "Chưa phân công")}</span></span></button>`).join("") || '<p class="tt-day-free">Không có buổi học' + (query || term || sectionId || roomCode ? " phù hợp" : "") + ".</p>"}</div></section>`).join("")}</div>`;
      const dayView = `<div class="tt-day-view">${dayNav}<div class="tt-selected-day"><h3>${dayName(new Date(selectedDate + "T00:00:00Z").getUTCDay() || 7)} <span>${dateName(selectedDate)}</span></h3>${selected.map((r) => rowCard(r, rows.indexOf(r))).join("") || '<p class="empty">Không có buổi học phù hợp trong ngày này.</p>'}</div></div>`;
      const list = `<div class="tt-week-list">${
        days
          .filter((date) => rows.some((r) => r.date === date))
          .map(
            (date) =>
              `<section><h3>${dayName(new Date(date + "T00:00:00Z").getUTCDay() || 7)} <span>${dateName(date)}</span></h3>${rows
                .filter((r) => r.date === date)
                .map((r) => rowCard(r, rows.indexOf(r)))
                .join("")}</section>`,
          )
          .join("") ||
        '<p class="empty">Không có buổi học phù hợp trong tuần này.</p>'
      }</div>`;
      const sectionIds = new Set(
        data.sections
          .filter(
            (s) =>
              (!term || s.term === term) && (!sectionId || s.id === sectionId),
          )
          .map((s) => s.id),
      );
      for (const r of rows) sectionIds.add(r.sectionId);
      const exceptions = data.exceptions.filter((e) =>
        sectionIds.has(e.sectionId),
      );
      body.innerHTML = `<div class="tt-calendar tt-view-${view}">${view === "week" ? (rows.length ? "" : '<p class="tt-empty-note" role="status">Không có buổi học phù hợp trong tuần này.</p>') + board + dayView : list}</div>${
        exceptions.length
          ? `<details class="timetable-exceptions"><summary>Ngày nghỉ và thay đổi lịch (${exceptions.length})</summary><p class="hint">Theo học kỳ và lớp đã chọn; ngày nghỉ vẫn được giữ khi lọc buổi học.</p>${table(
              ["Lớp", "Buổi gốc", "Thay đổi", "Lý do"],
              exceptions.map(
                (e) =>
                  `<tr><td>${esc(e.sectionCode)}</td><td>${dateName(e.date)}</td><td>${e.kind === "CANCEL" ? "Nghỉ học" : `Học bù ${dateName(e.targetDate)} · ${esc(e.startTime)}–${esc(e.endTime)}`}</td><td>${esc(e.reason)}</td></tr>`,
              ),
            )}</details>`
          : ""
      }`;
      for (const b of body.querySelectorAll("[data-day]"))
        b.onclick = () => {
          selectedDate = b.dataset.day;
          paint();
          body
            .querySelector(`.tt-day-picks [data-day="${selectedDate}"]`)
            ?.focus();
          const detail = body.querySelector(".tt-selected-day");
          if (getComputedStyle(detail.parentElement).display === "none")
            openDay(
              rows.filter((r) => r.date === selectedDate),
              selectedDate,
            );
        };
      for (const b of body.querySelectorAll("[data-lesson]"))
        b.onclick = () => lessonDetail(rows[Number(b.dataset.lesson)]);
      return;
    }
    const max = Math.max(1, Math.ceil(rows.length / 12));
    page = Math.min(page, max);
    const part = rows.slice((page - 1) * 12, page * 12);
    if (mode === "plans") {
      body.innerHTML = table(
        ["Lớp học phần", "Lịch định kỳ", "Khoảng ngày", ""],
        part.map(
          (s) =>
            `<tr><td><b>${esc(s.code)}</b><small>${esc(s.subjectName)} · ${esc(s.term)}</small><small>${esc(s.lecturerName)}</small></td><td>${esc(s.scheduleSummary)}<small>${data.plans.some((p) => p.sectionId === s.id) ? "Đã phân lịch" : "Chưa phân phòng"}</small></td><td>${dateName(s.startDate)} – ${dateName(s.endDate)}</td><td><button data-plan="${s.id}">Chỉnh lịch</button></td></tr>`,
        ),
      );
      for (const b of body.querySelectorAll("[data-plan]"))
        b.onclick = () =>
          planForm(
            data,
            data.sections.find((s) => s.id === b.dataset.plan),
            () => load(),
          );
    } else {
      body.innerHTML =
        (data.manageRooms
          ? '<div class="panel-actions"><button id="tt-new-room" class="primary">Thêm phòng</button></div>'
          : "") +
        table(
          ["Mã phòng", "Tên phòng", "Sức chứa", "Trạng thái", ""],
          part.map(
            (r) =>
              `<tr><td><b>${esc(r.code)}</b></td><td>${esc(r.name)}</td><td>${r.capacity}</td><td>${r.active ? "Đang sử dụng" : "Ngừng sử dụng"}</td><td>${data.manageRooms ? `<button data-room="${r.id}">Chỉnh sửa</button>` : ""}</td></tr>`,
          ),
        );
      const addRoom = body.querySelector("#tt-new-room");
      if (addRoom) addRoom.onclick = () => roomForm(null, () => load());
      for (const b of body.querySelectorAll("[data-room]"))
        b.onclick = () =>
          roomForm(
            data.rooms.find((r) => r.id === b.dataset.room),
            () => load(),
          );
    }
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="pagination"><span>Trang ${page}/${max}</span><div><button id="tt-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="tt-next" ${page === max ? "disabled" : ""}>Sau</button></div></div>`,
    );
    body.querySelector("#tt-prev").onclick = () => {
      page--;
      paint();
    };
    body.querySelector("#tt-next").onclick = () => {
      page++;
      paint();
    };
  }
  function printWeek() {
    const rows = filtered();
    if (!rows.length) return notify("Không có buổi học phù hợp để in.");
    document.querySelector("#tt-print-sheet")?.remove();
    const sheet = document.createElement("section");
    sheet.id = "tt-print-sheet";
    sheet.hidden = true;
    sheet.innerHTML = `<header><div class="tt-print-brand">${brand()}</div><div><h1>Thời khóa biểu</h1><p>${esc(actor.fullName)} · ${shortDate(days[0])} – ${dateName(days[6])} · Giờ Việt Nam</p></div></header><p>${rows.length} buổi học${query ? " · Tìm: " + esc(query) : ""}${term ? " · Học kỳ: " + esc(term) : ""}${roomCode ? " · Phòng: " + esc(roomCode === "__UNASSIGNED__" ? "Chưa phân phòng" : roomCode) : ""}</p><div class="tt-print-table"><table><thead><tr><th scope="col">Ngày</th><th scope="col">Giờ học</th><th scope="col">Học phần / Lớp</th><th scope="col">Phòng</th><th scope="col">Giảng viên</th></tr></thead><tbody>${weekLessons(
      rows,
      days[0],
    )
      .flatMap(({ date, rows: lessons }, i) =>
        lessons.map(
          (r) =>
            `<tr><td>${dayName(i + 1)}<br>${shortDate(date)}</td><td>${esc(r.startTime)}–${esc(r.endTime)}</td><td><b>${esc(r.subjectName)}</b><br>${esc(r.sectionCode)}${r.exception ? "<br>Học bù từ " + dateName(r.originalDate) : ""}</td><td>${esc(r.roomCode || "Chưa phân phòng")}</td><td>${esc(r.lecturerName || "Chưa phân công")}</td></tr>`,
        ),
      )
      .join(
        "",
      )}</tbody></table></div><footer>Bản lịch tại thời điểm in. Kiểm tra thay đổi mới nhất trên Lizz trước khi đến lớp.</footer>`;
    const cleanup = () => {
      sheet.remove();
      document.body.classList.remove("tt-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    const dialog = openEditor(
      "Xem trước bản in",
      `<div class="tt-print-preview">${sheet.innerHTML}</div><div class="panel-actions"><button type="button" class="primary" id="tt-confirm-print">In lịch</button></div>`,
    );
    dialog.addEventListener("close", cleanup, { once: true });
    dialog.querySelector("#tt-confirm-print").onclick = () => {
      document.body.append(sheet);
      document.body.classList.add("tt-printing");
      window.addEventListener("afterprint", cleanup, { once: true });
      try {
        window.print();
      } catch {
        cleanup();
        notify("Chưa thể mở cửa sổ in. Vui lòng thử lại.");
      }
    };
  }

  function lessonDetail(r) {
    openEditor(
      r.subjectName,
      `<div class="tt-detail-title tt-tone-${lessonTone(r)}">${icon("schedule")}<div><b>${esc(r.sectionCode)}</b><span>${dateName(r.date)} · ${esc(r.startTime)}–${esc(r.endTime)}</span></div></div><dl class="record-summary"><dt>Phòng học</dt><dd>${esc(r.roomCode || "Chưa phân phòng")}${r.roomName ? " · " + esc(r.roomName) : ""}</dd><dt>Giảng viên</dt><dd>${esc(r.lecturerName || "Chưa phân công")}</dd><dt>Học kỳ</dt><dd>${esc(r.term)}</dd>${r.exception ? `<dt>Học bù cho</dt><dd>${dateName(r.originalDate)}</dd><dt>Lý do</dt><dd>${esc(r.reason || "—")}</dd>` : ""}</dl>`,
    );
  }
  function openDay(rows, date) {
    const dialog = openEditor(
      "Lịch học · " + dateName(date),
      rows.map((r, i) => rowCard(r, i)).join("") ||
        '<p class="empty">Không có buổi học phù hợp.</p>',
    );
    for (const b of dialog.querySelectorAll("[data-lesson]"))
      b.onclick = () => lessonDetail(rows[Number(b.dataset.lesson)]);
  }
  await load();
}
function planForm(data, section, refresh) {
  if (!data.rooms.some((r) => r.active))
    return notify("Cần có phòng đang sử dụng trước khi phân lịch học.");
  const prior = data.plans.find((p) => p.sectionId === section.id),
    plans = prior
      ? structuredClone(prior)
      : { version: 0, meetings: [], exceptions: [] };
  // Lịch cũ được đọc nguyên vẹn từ mô tả API riêng; dùng dữ liệu lớp để giữ thứ/giờ gốc.
  const dialog = openEditor(
    "Phân lịch · " + section.code,
    `<p>${esc(section.subjectName)} · ${esc(section.lecturerName)} · ${dateName(section.startDate)} – ${dateName(section.endDate)}</p><form>${errorBox()}<fieldset><legend>Buổi học mỗi tuần</legend><div id="tt-meetings"></div><button type="button" id="tt-add-meeting">Thêm buổi học</button></fieldset><fieldset><legend>Ngày nghỉ và học bù</legend><div id="tt-exceptions"></div><button type="button" id="tt-add-exception">Thêm ngoại lệ</button></fieldset><label>Lý do điều chỉnh<textarea name="reason" rows="3" maxlength="1000" required></textarea></label><p class="hint">Lưu thay thế lịch đang áp dụng. Buổi đã mở điểm danh được giữ nguyên; mọi xung đột được kiểm tra lại trước khi ghi.</p><button class="primary" type="submit">Kiểm tra và lưu lịch</button></form>`,
  );
  const form = dialog.querySelector("form"),
    meetings = dialog.querySelector("#tt-meetings"),
    exceptions = dialog.querySelector("#tt-exceptions");
  const rooms = data.rooms
    .filter((r) => r.active)
    .map((r) => ({
      id: r.id,
      name: r.code + " · " + r.name + " · " + r.capacity + " chỗ",
    }));
  function meetingRow(
    m = {
      id: crypto.randomUUID(),
      weekday: 1,
      startTime: "",
      endTime: "",
      roomId: "",
    },
  ) {
    const row = document.createElement("div");
    row.className = "timetable-edit-row";
    row.dataset.meetingId = m.id;
    row.innerHTML = `<div class="form-grid">${select(
      "Ngày học",
      "weekday",
      Array.from({ length: 7 }, (_, i) => ({
        id: String(i + 1),
        name: dayName(i + 1),
      })),
      String(m.weekday),
    )}${field("Bắt đầu", "startTime", "time", m.startTime)}${field("Kết thúc", "endTime", "time", m.endTime)}${select("Phòng học", "roomId", rooms, m.roomId || "")}</div><button type="button" data-remove>Bỏ buổi học</button>`;
    row.querySelector("[data-remove]").onclick = () => {
      row.remove();
      updateChoices();
    };
    row.querySelector('[name="weekday"]').onchange = updateChoices;
    meetings.append(row);
    updateChoices();
  }
  function choices() {
    return [...meetings.children].map((r, i) => ({
      id: r.dataset.meetingId,
      name:
        "Buổi " +
        (i + 1) +
        " · " +
        dayName(Number(r.querySelector('[name="weekday"]').value)),
    }));
  }
  function updateChoices() {
    for (const r of exceptions.children) {
      const s = r.querySelector('[name="meetingId"]'),
        value = s.value;
      s.innerHTML =
        '<option value="">Chọn buổi gốc</option>' +
        choices()
          .map((m) => `<option value="${m.id}">${esc(m.name)}</option>`)
          .join("");
      s.value = value;
    }
  }
  function exceptionRow(
    e = { meetingId: "", date: "", kind: "CANCEL", reason: "" },
  ) {
    const row = document.createElement("div");
    row.className = "timetable-edit-row";
    row.innerHTML = `<div class="form-grid">${select("Buổi gốc", "meetingId", choices(), e.meetingId)}${field("Ngày gốc", "date", "date", e.date)}${select(
      "Thay đổi",
      "kind",
      [
        { id: "CANCEL", name: "Nghỉ học" },
        { id: "MOVE", name: "Học bù / đổi giờ, phòng" },
      ],
      e.kind,
    )}</div><div data-move class="form-grid">${field("Ngày học bù", "targetDate", "date", e.targetDate || "")}${field("Bắt đầu", "startTime", "time", e.startTime || "")}${field("Kết thúc", "endTime", "time", e.endTime || "")}${select("Phòng học bù", "roomId", rooms, e.roomId || "")}</div><label>Lý do ngoại lệ<input name="exceptionReason" maxlength="1000" required value="${esc(e.reason)}"></label><button type="button" data-remove>Bỏ ngoại lệ</button>`;
    const toggle = () => {
      const wrap = row.querySelector("[data-move]");
      wrap.hidden = row.querySelector('[name="kind"]').value !== "MOVE";
      for (const c of wrap.querySelectorAll("input,select"))
        c.disabled = wrap.hidden;
    };
    row.querySelector('[name="kind"]').onchange = toggle;
    row.querySelector("[data-remove]").onclick = () => row.remove();
    exceptions.append(row);
    toggle();
  }
  if (!prior)
    plans.meetings = [
      {
        id: "legacy",
        weekday: section.weekday,
        startTime: section.startTime,
        endTime: section.endTime,
        roomId: null,
      },
    ];
  plans.meetings.forEach(meetingRow);
  plans.exceptions.forEach(exceptionRow);
  dialog.querySelector("#tt-add-meeting").onclick = () => {
    if (meetings.children.length >= 16)
      return notify("Mỗi lớp tối đa 16 buổi mỗi tuần.");
    meetingRow();
  };
  dialog.querySelector("#tt-add-exception").onclick = () => {
    if (exceptions.children.length >= 64)
      return notify("Mỗi lịch tối đa 64 ngoại lệ.");
    exceptionRow();
  };
  let retryBody = null,
    retryKey = null;
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const read = (r, n) => r.querySelector(`[name="${n}"]`).value;
      const payload = {
        version: plans.version,
        sectionVersion: section.version,
        reason: form.elements.reason.value,
        meetings: [...meetings.children].map((r) => ({
          id: r.dataset.meetingId,
          weekday: Number(read(r, "weekday")),
          startTime: read(r, "startTime"),
          endTime: read(r, "endTime"),
          roomId: read(r, "roomId"),
        })),
        exceptions: [...exceptions.children].map((r) => ({
          meetingId: read(r, "meetingId"),
          date: read(r, "date"),
          kind: read(r, "kind"),
          reason: read(r, "exceptionReason"),
          ...(read(r, "kind") === "MOVE"
            ? {
                targetDate: read(r, "targetDate"),
                startTime: read(r, "startTime"),
                endTime: read(r, "endTime"),
                roomId: read(r, "roomId"),
              }
            : {}),
        })),
      };
      const answer = await confirmAction(dialog, {
        title: "Áp dụng thời khóa biểu",
        message: `${section.code}: ${payload.meetings.length} buổi mỗi tuần, ${payload.exceptions.length} ngoại lệ. Lịch mới sẽ dùng cho đăng ký, lịch thi và điểm danh sau khi lưu.`,
        confirmLabel: "Xác nhận lưu lịch",
      });
      if (!answer.confirmed) return;
      const body = JSON.stringify(payload);
      if (body !== retryBody) {
        retryKey = crypto.randomUUID();
        retryBody = body;
      }
      await api("/timetable/sections/" + section.id, {
        method: "POST",
        body: { ...payload, confirm: true, requestId: retryKey },
      });
      dialog.close();
      notify("Đã cập nhật thời khóa biểu.");
      await refresh();
    } catch (error) {
      showError(form, error);
    } finally {
      button.disabled = false;
    }
  };
}
