import { downloadCsv } from "../components/csv-export.js";
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
  bindForm,
  confirmAction,
  notify,
} from "../components/ui.js";
const states = {
  PRESENT: "Có mặt",
  LATE: "Đi muộn",
  EXCUSED: "Vắng có phép",
  ABSENT: "Vắng mặt",
};
const verdicts = {
  ELIGIBLE: "Đạt điều kiện đã thiết lập",
  INELIGIBLE: "Chưa đạt",
  NOT_VERIFIED: "Chưa xác minh",
};
const date = (value) => value.split("-").reverse().join("/");
export async function attendancePage(container, actor) {
  const data = await api("/attendance"),
    student = actor.role === "STUDENT";
  let page = 1;
  const refresh = () => attendancePage(container, actor);
  container.innerHTML =
    heading(
      "Điểm danh và điều kiện dự thi",
      !student
        ? '<button id="new-attendance" class="primary">Mở buổi điểm danh</button>'
        : "",
    ) +
    `<section class="panel"><div class="toolbar">${select("Lớp học phần", "attendanceSection", data.sections)}<label>Loại buổi<select id="attendance-kind"><option value="">Tất cả</option><option value="CLASS">Buổi học</option><option value="EXAM">Buổi thi</option></select></label><button id="show-eligibility">Điều kiện dự thi</button>${data.canManage ? '<button id="edit-attendance-policy">Thiết lập điều kiện</button>' : ""}</div><div id="attendance-table"></div></section>`;
  const sectionFilter = container.querySelector("[name=attendanceSection]");
  sectionFilter.required = false;
  sectionFilter.options[0].textContent = "Tất cả lớp";
  const chosen = () => {
    const id = sectionFilter.value;
    if (!id) {
      notify("Chọn một lớp học phần trước khi xem hoặc thiết lập điều kiện.");
      return null;
    }
    return id;
  };
  const paint = () => {
    const kind = container.querySelector("#attendance-kind").value,
      rows = data.sessions
        .filter(
          (s) =>
            (!sectionFilter.value || s.sectionId === sectionFilter.value) &&
            (!kind || s.kind === kind),
        )
        .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    const max = Math.max(1, Math.ceil(rows.length / 10));
    page = Math.min(page, max);
    const target = container.querySelector("#attendance-table");
    target.innerHTML =
      table(
        ["Ngày", "Lớp học phần", "Loại buổi", "Trạng thái", "Thao tác"],
        rows
          .slice((page - 1) * 10, page * 10)
          .map(
            (s) =>
              `<tr><td>${date(s.sessionDate)}${s.lessonStartTime ? `<small>${esc(s.lessonStartTime)}–${esc(s.lessonEndTime)}</small>` : ""}</td><td>${esc(data.sections.find((c) => c.id === s.sectionId)?.name || "")}</td><td>${s.kind === "CLASS" ? "Buổi học" : "Buổi thi"}</td><td><span class="badge">${s.status === "CLOSED" ? "Đã chốt" : "Chưa chốt"}</span></td><td><button data-attendance="${s.id}">${s.canEdit && s.status === "OPEN" ? "Ghi điểm danh" : "Xem chi tiết"}</button></td></tr>`,
          ),
        "Chưa có buổi điểm danh phù hợp.",
      ) +
      `<div class="pagination"><span>Trang ${page}/${max}</span><button id="att-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="att-next" ${page === max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#att-prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#att-next").onclick = () => {
      page++;
      paint();
    };
    for (const b of target.querySelectorAll("[data-attendance]"))
      b.onclick = () => attendanceEditor(b.dataset.attendance, actor, refresh);
  };
  sectionFilter.onchange = container.querySelector(
    "#attendance-kind",
  ).onchange = () => {
    page = 1;
    paint();
  };
  container.querySelector("#show-eligibility").onclick = () => {
    const id = chosen();
    if (id) eligibilityDialog(id);
  };
  container
    .querySelector("#edit-attendance-policy")
    ?.addEventListener("click", () => {
      const id = chosen();
      if (id) policyForm(id, refresh);
    });
  container
    .querySelector("#new-attendance")
    ?.addEventListener("click", () => sessionForm(data, actor, refresh));
  paint();
}
function sessionForm(data, actor, refresh) {
  const classes =
    actor.role === "LECTURER"
      ? data.sections.filter((s) => s.lecturerId === actor.id)
      : data.sections;
  if (!classes.length && !data.exams.length)
    return notify("Chưa có lớp hoặc lịch thi được phân công để điểm danh.");
  const dialog = openEditor(
    "Mở buổi điểm danh",
    `<form>${errorBox()}${select(
      "Loại buổi",
      "kind",
      [
        { id: "CLASS", name: "Buổi học" },
        { id: "EXAM", name: "Buổi thi" },
      ],
      classes.length ? "CLASS" : "EXAM",
    )}<div data-class-fields>${select("Lớp học phần", "sectionId", classes)}${field("Ngày học", "sessionDate", "date")}<div id="attendance-lesson"></div></div><div data-exam-fields>${select(
      "Lịch thi",
      "examId",
      data.exams.map((e) => ({
        id: e.id,
        name:
          (data.sections.find((s) => s.id === e.sectionId)?.code || "") +
          " · " +
          date(e.examDate) +
          " · " +
          e.startTime +
          "–" +
          e.endTime,
      })),
    )}</div><p class="hint">Danh sách được lấy từ đăng ký hiện tại. Chưa đến giờ học hoặc giờ thi thì chưa thể ghi nhận điểm danh.</p><button type="submit" class="primary">Mở sổ điểm danh</button></form>`,
  );
  const form = dialog.querySelector("form"),
    kind = form.elements.kind;
  const toggle = () => {
    for (const [selector, active] of [
      ["[data-class-fields]", kind.value === "CLASS"],
      ["[data-exam-fields]", kind.value === "EXAM"],
    ]) {
      const wrap = form.querySelector(selector);
      wrap.hidden = !active;
      for (const control of wrap.querySelectorAll("input,select"))
        control.disabled = !active;
    }
  };
  let selectionEpoch = 0;
  const loadLessons = async () => {
    const epoch = ++selectionEpoch,
      date = form.elements.sessionDate.value,
      id = form.elements.sectionId.value,
      target = form.querySelector("#attendance-lesson");
    target.innerHTML = "";
    if (!date || !id || kind.value !== "CLASS") return;
    target.textContent = "Đang tải buổi học…";
    try {
      const schedule = await api(
        "/timetable?" + new URLSearchParams({ from: date, to: date }),
      );
      if (epoch !== selectionEpoch) return;
      const rows = schedule.rows.filter((r) => r.sectionId === id);
      target.innerHTML = select(
        "Buổi học",
        "lessonKey",
        rows.map((r) => ({
          id: r.meetingId,
          name:
            r.startTime +
            "–" +
            r.endTime +
            " · " +
            (r.roomCode || "Chưa phân phòng"),
        })),
        rows.length === 1 ? rows[0].meetingId : "",
      );
      if (!rows.length)
        target.insertAdjacentHTML(
          "beforeend",
          '<p class="hint">Ngày này không có buổi học; kiểm tra ngày nghỉ hoặc lịch học bù.</p>',
        );
    } catch (error) {
      if (epoch === selectionEpoch) target.textContent = error.message;
    }
  };
  form.elements.sessionDate.onchange = loadLessons;
  form.elements.sectionId.onchange = loadLessons;
  kind.onchange = () => {
    toggle();
    loadLessons();
  };
  toggle();
  bindForm(
    dialog,
    (input) => api("/attendance/sessions", { method: "POST", body: input }),
    refresh,
    "Đã mở buổi điểm danh.",
  );
}
async function policyForm(id, refresh) {
  try {
    const data = await api("/attendance/sections/" + id + "/eligibility"),
      p = data.policy;
    const yesno = [
      { id: "true", name: "Có" },
      { id: "false", name: "Không" },
    ];
    const choice = (key) => (p ? String(p[key]) : "");
    const dialog = openEditor(
      "Điều kiện dự thi · " + data.sectionCode,
      `<form>${errorBox()}<div class="form-grid">${field("Số buổi học tối thiểu cần chốt", "expectedSessions", "number", p?.expectedSessions ?? "")}${field("Tỷ lệ tham dự tối thiểu (%)", "minAttendancePercent", "number", p?.minAttendancePercent ?? "")}${select("Tính đi muộn là tham dự", "latePresent", yesno, choice("latePresent"))}${select("Tính vắng có phép là tham dự", "excusedPresent", yesno, choice("excusedPresent"))}${select("Yêu cầu hoàn tất tài chính học kỳ", "requireFinanceClearance", yesno, choice("requireFinanceClearance"))}${select("Áp dụng khi công bố và điểm danh thi", "enforceForExams", yesno, choice("enforceForExams"))}</div><p class="hint">Chưa đủ dữ liệu điểm danh hoặc chưa xác minh tài chính sẽ không được kết luận là đủ điều kiện. Muốn đổi điều kiện sau khi đã công bố lịch thi, cần hủy lịch trước.</p><button class="primary" type="submit">Lưu điều kiện</button></form>`,
    );
    bindForm(
      dialog,
      (input) =>
        api("/attendance/policies", {
          method: "POST",
          body: {
            sectionId: id,
            version: p?.version || 0,
            expectedSessions: Number(input.expectedSessions),
            minAttendancePercent: Number(input.minAttendancePercent),
            ...Object.fromEntries(
              [
                "latePresent",
                "excusedPresent",
                "requireFinanceClearance",
                "enforceForExams",
              ].map((k) => [k, input[k] === "true"]),
            ),
          },
        }),
      refresh,
      "Đã lưu điều kiện dự thi.",
    );
  } catch (error) {
    notify(error.message);
  }
}
export async function eligibilityDialog(id) {
  const dialog = openEditor(
    "Điều kiện dự thi",
    '<p class="loading">Đang đối chiếu dữ liệu…</p>',
  );
  try {
    const data = await api("/attendance/sections/" + id + "/eligibility");
    if (!dialog.isConnected || !dialog.open) return;
    const p = data.policy;
    dialog.querySelector(".loading").outerHTML =
      `<p><b>${esc(data.sectionCode)}</b></p>${p ? `<p>Tối thiểu ${p.expectedSessions} buổi đã chốt · Tham dự từ ${p.minAttendancePercent}% · ${p.requireFinanceClearance ? "Có đối chiếu tài chính" : "Không yêu cầu đối chiếu tài chính"}</p><p class="hint">${data.enforced ? "Đang áp dụng cho lịch thi và điểm danh thi." : "Chưa bật áp dụng bắt buộc cho lịch thi."}</p>` : "<p>Chưa thiết lập điều kiện dự thi cho lớp này.</p>"}${table(
        ["Sinh viên", "Tham dự / Buổi chốt", "Vắng mặt", "Kết quả"],
        data.rows.map(
          (r) =>
            `<tr><td>${esc(r.code)}<small>${esc(r.fullName)}</small></td><td>${r.recorded < r.sessions ? "Chưa đủ dữ liệu" : r.attended + "/" + r.sessions}${r.percentage === null ? "" : ` · ${r.percentage}%`}</td><td>${r.ABSENT ?? 0}</td><td><span class="badge">${verdicts[r.status]}</span><small>${esc(r.reason)}</small></td></tr>`,
        ),
        "Chưa có sinh viên trong danh sách hiện tại.",
      )}`;
  } catch (error) {
    if (dialog.isConnected && dialog.open)
      dialog.querySelector(".loading").textContent = error.message;
  }
}
async function attendanceEditor(id, actor, refresh) {
  const dialog = openEditor(
    "Sổ điểm danh",
    '<p class="loading">Đang tải danh sách…</p>',
  );
  try {
    const data = await api("/attendance/sessions/" + id);
    if (!dialog.isConnected || !dialog.open) return;
    const s = data.session,
      edit = data.canEdit && s.status === "OPEN";
    dialog.querySelector(".loading").outerHTML =
      `<p><b>${esc(data.sectionCode)}</b> · ${date(s.sessionDate)}${s.lessonStartTime ? ` · ${esc(s.lessonStartTime)}–${esc(s.lessonEndTime)}` : ""} · ${s.kind === "CLASS" ? "Buổi học" : "Buổi thi"} · ${s.status === "CLOSED" ? "Đã chốt" : "Chưa chốt"}</p>${data.rosterChanged ? '<p class="inline-note">Danh sách đăng ký đã thay đổi. Đồng bộ danh sách rồi kiểm tra lại từng sinh viên trước khi lưu hoặc chốt.</p>' : ""}<form>${errorBox()}${table(
        ["Sinh viên", "Trạng thái", "Ghi chú"],
        data.rows.map(
          (r) =>
            `<tr><td><b>${esc(r.code)}</b><small>${esc(r.fullName)}</small></td><td>${
              edit
                ? `<select name="status-${r.studentId}" aria-label="Trạng thái ${esc(r.code)}" required><option value="">Chưa ghi nhận</option>${Object.entries(
                    states,
                  )
                    .map(
                      ([k, v]) =>
                        `<option value="${k}" ${r.mark?.status === k ? "selected" : ""}>${v}</option>`,
                    )
                    .join("")}</select>`
                : esc(r.mark ? states[r.mark.status] : "Chưa ghi nhận")
            }</td><td>${edit ? `<input name="reason-${r.studentId}" aria-label="Ghi chú ${esc(r.code)}" maxlength="1000" value="${esc(r.mark?.reason || "")}">` : esc(r.mark?.reason || "—")}</td></tr>`,
        ),
        "Buổi này chưa có sinh viên.",
      )}${edit ? `<button class="primary" type="submit" ${data.rosterChanged || !data.rows.length ? "disabled" : ""}>Lưu điểm danh</button>` : ""}</form><div class="dialog-actions">${data.canEdit && s.status === "OPEN" ? `<button id="attendance-sync">Đồng bộ danh sách</button><button id="attendance-close" ${data.rosterChanged || !data.rows.length || data.rows.some((r) => !r.mark) ? "disabled" : ""}>Chốt buổi điểm danh</button>` : ""}${data.canEdit && s.status === "CLOSED" ? '<button id="attendance-reopen">Mở lại để chỉnh sửa</button>' : ""}</div>`;
    dialog.insertAdjacentHTML(
      "beforeend",
      '<button id="attendance-export">Xuất CSV</button>',
    );
    dialog.querySelector("#attendance-export").onclick = () =>
      downloadCsv(
        "LIZZ_DIEM_DANH.csv",
        [
          "Lớp",
          "Ngày",
          "Giờ bắt đầu",
          "Giờ kết thúc",
          "Mã buổi",
          "Mã sinh viên",
          "Họ và tên",
          "Trạng thái",
          "Ghi chú",
        ],
        data.rows.map((r) => [
          data.sectionCode,
          s.sessionDate,
          s.lessonStartTime || "",
          s.lessonEndTime || "",
          s.lessonKey || "legacy",
          r.code,
          r.fullName,
          r.mark ? states[r.mark.status] : "Chưa ghi nhận",
          r.mark?.reason || "",
        ]),
      );
    if (edit)
      dialog.querySelector("form").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.target,
          button = form.querySelector("[type=submit]");
        button.disabled = true;
        try {
          await api("/attendance/sessions/" + id + "/marks", {
            method: "POST",
            body: {
              version: s.version,
              rows: data.rows.map((r) => ({
                studentId: r.studentId,
                status: form.elements["status-" + r.studentId].value,
                reason: form.elements["reason-" + r.studentId].value,
                version: r.markVersion,
              })),
            },
          });
          dialog.close();
          await refresh();
          attendanceEditor(id, actor, refresh);
        } catch (error) {
          showError(dialog, error);
          button.disabled = false;
        }
      };
    for (const action of ["sync", "close", "reopen"])
      dialog
        .querySelector("#attendance-" + action)
        ?.addEventListener("click", async () => {
          const decision = await confirmAction(dialog, {
            title: {
              sync: "Đồng bộ danh sách?",
              close: "Chốt buổi điểm danh?",
              reopen: "Mở lại buổi đã chốt?",
            }[action],
            message:
              action === "close"
                ? "Điểm danh đã chốt mới được dùng để tính điều kiện dự thi. Kiểm tra đầy đủ trước khi xác nhận."
                : action === "sync"
                  ? "Lấy lại danh sách đăng ký hiện tại. Các dòng không còn phù hợp được giữ trong lịch sử."
                  : "Cần nhập lý do; việc chỉnh sửa sẽ được lưu vào nhật ký.",
            confirmLabel: "Xác nhận",
            requireReason: action === "reopen",
            reasonLabel: "Lý do mở lại",
            reasonError: "Nhập lý do mở lại buổi điểm danh.",
          });
          if (!decision.confirmed) return;
          try {
            await api("/attendance/sessions/" + id + "/" + action, {
              method: "POST",
              body: {
                version: s.version,
                confirm: true,
                reason: decision.reason,
              },
            });
            dialog.close();
            await refresh();
            attendanceEditor(id, actor, refresh);
          } catch (error) {
            showError(dialog, error);
          }
        });
  } catch (error) {
    if (dialog.isConnected && dialog.open)
      dialog.querySelector(".loading").textContent = error.message;
  }
}
