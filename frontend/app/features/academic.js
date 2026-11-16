import { filterPlannedSections } from "../../../shared/course-plan.js";
import { coursePlanControls, readCourseFilters, bindCoursePlan } from "./course-plan.js";
import {
  STUDY_MODES,
  studyReviewMarkup,
  openStudyHistory,
} from "./study-attempts.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";
import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  openEditor,
  errorBox,
  showError,
  notify,
  bindForm as saveForm,
} from "../components/ui.js";
const managers = ["MANAGER", "STAFF"];
const days = [
  "",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
  "Chủ nhật",
];
const requestKeys = new Map();
const schedule = (row) =>
  row.scheduleSummary ||
  `${days[row.weekday]} · ${row.startTime}–${row.endTime}`;
const numeric = (form, input) => {
  for (const key of input) form[key] = Number(form[key]);
  return form;
};
const pendingKey = (actor, key) => {
  const id = actor.id + ":" + key;
  if (!requestKeys.has(id)) requestKeys.set(id, crypto.randomUUID());
  return requestKeys.get(id);
};

export async function academicPage(container, actor) {
  const data = await api("/academics");
  if (actor.role === "STUDENT")
    data.coursePlan = await api("/academics/my-course-plan");
  data.requireFaculty = actor.access?.canManageShared === false;
  data.requireCohort =
    data.requireFaculty &&
    actor.access.scopes.length > 0 &&
    actor.access.scopes.every((s) => s.cohortId);
  const manager = managers.includes(actor.role),
    student = actor.role === "STUDENT";
  let mode = "sections",
    onlyMine = false,
    selectedSubject = null,
    page = 1;
  container.innerHTML =
    heading(
      manager
        ? "Môn học và lớp học phần"
        : student
          ? "Đăng ký học phần"
          : "Lớp giảng dạy",
      manager
        ? (actor.access?.canManageShared !== false
            ? '<button id="add-subject">Thêm môn học</button>'
            : "") +
            '<button id="add-section" class="primary">Mở lớp học phần</button>'
        : "",
    ) +
    `<div class="academic-summary"><span><strong>${data.subjects.length}</strong> môn học</span><span><strong>${data.sections.length}</strong> ${actor.role === "LECTURER" ? "lớp được giao" : "lớp học phần"}</span>${student ? `<span><strong>${data.sections.filter((r) => r.registration?.status === "ACTIVE").length}</strong> lớp đã đăng ký</span>` : ""}</div>` +
    (student && !data.profileLinked
      ? '<p class="inline-note">Tài khoản chưa liên kết hồ sơ sinh viên. Bạn có thể xem lớp; cần cán bộ hoàn tất hồ sơ trước khi đăng ký.</p>'
      : "") +
    '<section class="panel"><div class="toolbar"><label>Tìm kiếm<input id="academic-query" type="search" placeholder="Mã lớp, môn học hoặc giảng viên"></label><label>Học kỳ<select id="academic-term"><option value="">Tất cả học kỳ</option>' +
    [...new Set(data.sections.map((r) => r.term))]
      .sort()
      .map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)
      .join("") +
    '</select></label></div>' +
    (student ? coursePlanControls(data.coursePlan) : "") +
    '<div class="academic-tabs">' +
    (manager
      ? '<button id="tab-sections" aria-pressed="true">Lớp học phần</button><button id="tab-subjects" aria-pressed="false">Danh mục môn học</button>'
      : student
        ? '<button id="mine" aria-pressed="false">Chỉ xem lớp đã đăng ký</button><label class="checkbox-field"><input id="plan-available" type="checkbox"> Lớp mở còn chỗ</label>'
        : "") +
    '</div><div id="academic-table"></div></section>';
  const query = container.querySelector("#academic-query"),
    term = container.querySelector("#academic-term"),
    target = container.querySelector("#academic-table");
  const refresh = () => academicPage(container, actor);
  function paint() {
    const search = query.value.trim().toLocaleLowerCase("vi");
    const rows = student ? filterPlannedSections(data.sections, data.coursePlan, {
      ...readCourseFilters(container), q: query.value, term: term.value,
      onlyMine, subjectId: selectedSubject?.subjectId,
    }) : (mode === "subjects" ? data.subjects : data.sections).filter(
      (r) =>
        `${r.code} ${r.name || r.subjectName} ${r.lecturerName || ""}`
          .toLocaleLowerCase("vi")
          .includes(search) &&
        (mode === "subjects" || !term.value || r.term === term.value) &&
        (!onlyMine || r.registration?.status === "ACTIVE"),
    );
    const max = Math.max(1, Math.ceil(rows.length / 10));
    page = Math.min(page, max);
    target.innerHTML =
      mode === "subjects"
        ? table(
            [
              "Môn học",
              "Số tín chỉ",
              ...(actor.access?.canManageShared !== false ? ["Thao tác"] : []),
            ],
            rows
              .slice((page - 1) * 10, page * 10)
              .map(
                (r) =>
                  `<tr><td><b>${esc(r.code)}</b><small>${esc(r.name)}</small></td><td>${r.credits}</td>${actor.access?.canManageShared !== false ? `<td><button data-subject="${r.id}">Chỉnh sửa</button></td>` : ""}</tr>`,
              ),
          )
        : table(
            ["Lớp học phần", "Lịch và giảng viên", "Chỗ học", "Thao tác"],
            rows
              .slice((page - 1) * 10, page * 10)
              .map(
                (r) =>
                  `<tr><td><b>${esc(r.code)}</b><small>${esc(r.subjectName)} · ${r.credits} tín chỉ</small><small>Học kỳ ${esc(r.term)}</small></td><td>${esc(schedule(r))}<small>${esc(r.startDate)} đến ${esc(r.endDate)}</small><small>${esc(r.lecturerName)}</small></td><td><span class="badge ${r.status === "OPEN" ? "badge-open" : ""}">${r.status === "OPEN" ? "Đang nhận đăng ký" : "Đã đóng đăng ký"}</span><small>${r.enrolled}/${r.capacity} sinh viên · Còn ${r.available} chỗ</small></td><td>${manager ? `<button data-section="${r.id}">Chỉnh sửa</button> <button data-roster="${r.id}">Danh sách lớp</button>` : student ? (r.registration?.status === "ACTIVE" ? `<span class="badge">Đã đăng ký</span>${["RETAKE", "IMPROVEMENT"].includes(r.registration.studyMode) ? `<small>${STUDY_MODES[r.registration.studyMode]}</small>` : ""}<button data-withdraw="${r.id}" ${r.status !== "OPEN" ? "disabled" : ""}>Rút đăng ký</button>` : `<button data-register="${r.id}" ${!data.profileLinked || r.status !== "OPEN" || !r.available ? "disabled" : ""}>Đăng ký</button>`) : `<button data-roster="${r.id}">Danh sách lớp</button>`}${student ? `<button data-study-history="${r.subjectId}">Lịch sử học phần</button>` : ""}</td></tr>`,
              ),
          );
    target.innerHTML += `<div class="pagination"><span>${rows.length} ${mode === "subjects" ? "môn học" : "lớp học phần"} · Trang ${page}/${max}</span><button id="academic-prev" ${page <= 1 ? "disabled" : ""}>Trước</button><button id="academic-next" ${page >= max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#academic-prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#academic-next").onclick = () => {
      page++;
      paint();
    };
    for (const button of target.querySelectorAll("[data-subject]"))
      button.onclick = () =>
        subjectForm(
          data.subjects.find((r) => r.id === button.dataset.subject),
          refresh,
        );
    for (const button of target.querySelectorAll("[data-section]"))
      button.onclick = () =>
        sectionForm(
          data,
          data.sections.find((r) => r.id === button.dataset.section),
          refresh,
        );
    for (const button of target.querySelectorAll("[data-roster]"))
      button.onclick = () => rosterDialog(button.dataset.roster);
    for (const button of target.querySelectorAll("[data-study-history]"))
      button.onclick = () =>
        openStudyHistory({ subjectId: button.dataset.studyHistory });
    for (const button of target.querySelectorAll(
      "[data-register],[data-withdraw]",
    ))
      button.onclick = () =>
        registrationDialog(
          data.sections.find(
            (r) =>
              r.id === (button.dataset.register || button.dataset.withdraw),
          ),
          actor,
          Boolean(button.dataset.withdraw),
          refresh,
        );
  }
  query.oninput = term.onchange = () => {
    page = 1;
    paint();
  };
  if (student) {
    bindCoursePlan(container, data, () => { page = 1; paint(); }, (subject) => {
      selectedSubject = subject;
      onlyMine = false;
      container.querySelector("#mine").setAttribute("aria-pressed", "false");
      query.value = "";
      for (const id of ["plan-group", "plan-semester", "plan-progress"])
        container.querySelector("#" + id).value = "";
      container.querySelector("#plan-scope").value = "CURRICULUM";
      container.querySelector("#plan-available").checked = false;
      container.querySelector("#plan-subject").textContent = subject.subjectCode + " · " + subject.subjectName;
      container.querySelector("#plan-clear").hidden = false;
      page = 1;
      paint();
      query.focus();
    });
    container.querySelector("#plan-clear")?.addEventListener("click", () => {
      selectedSubject = null;
      container.querySelector("#plan-subject").textContent = "";
      container.querySelector("#plan-clear").hidden = true;
      page = 1;
      paint();
    });
  }
  container
    .querySelector("#add-subject")
    ?.addEventListener("click", () => subjectForm(null, refresh));
  container
    .querySelector("#add-section")
    ?.addEventListener("click", () => sectionForm(data, null, refresh));
  for (const name of ["subjects", "sections"])
    container.querySelector("#tab-" + name)?.addEventListener("click", () => {
      mode = name;
      page = 1;
      for (const other of ["subjects", "sections"])
        container
          .querySelector("#tab-" + other)
          .setAttribute("aria-pressed", String(other === name));
      term.disabled = name === "subjects";
      paint();
    });
  container.querySelector("#mine")?.addEventListener("click", (event) => {
    onlyMine = !onlyMine;
    event.currentTarget.setAttribute("aria-pressed", String(onlyMine));
    page = 1;
    paint();
  });
  paint();
}
function subjectForm(row, refresh) {
  const dialog = openEditor(
    row ? "Chỉnh sửa môn học" : "Thêm môn học",
    `<form>${errorBox()}<div class="form-grid">${field("Mã môn học", "code", "text", row?.code || "")}${field("Tên môn học", "name", "text", row?.name || "")}${field("Số tín chỉ", "credits", "number", row?.credits || 3)}</div><p class="hint">Không thể đổi thông tin môn học đã có lớp học phần.</p><button class="primary">${row ? "Lưu thay đổi" : "Thêm môn học"}</button></form>`,
  );
  saveForm(
    dialog,
    async (input) =>
      api("/academics/subjects" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: {
          ...numeric(input, ["credits"]),
          ...(row ? { version: row.version } : {}),
        },
      }),
    refresh,
  );
}
function sectionForm(data, row, refresh) {
  if (!data.subjects.length || !data.teachers.length)
    return notify(
      "Cần có môn học và tài khoản Giảng viên đang hoạt động trước khi mở lớp.",
    );
  const dialog = openEditor(
    row ? "Chỉnh sửa lớp học phần" : "Mở lớp học phần",
    `<form>${errorBox()}<fieldset><legend>Thông tin lớp</legend><div class="form-grid">${field("Mã lớp học phần", "code", "text", row?.code || "")}${field("Mã học kỳ", "term", "text", row?.term || "")}${select("Môn học", "subjectId", data.subjects, row?.subjectId)}${select("Giảng viên", "lecturerId", data.teachers, row?.lecturerId)}${select("Khoa phụ trách", "facultyId", data.faculties || [], row?.facultyId)}${select("Khóa", "cohortId", data.cohorts || [], row?.cohortId)}${field("Sĩ số tối đa", "capacity", "number", row?.capacity || 40)}${select(
      "Nhận đăng ký",
      "status",
      [
        { id: "OPEN", name: "Mở" },
        { id: "CLOSED", name: "Đóng" },
      ],
      row?.status || "OPEN",
    )}</div></fieldset><fieldset><legend>Lịch hằng tuần</legend><div class="form-grid">${field("Từ ngày", "startDate", "date", row?.startDate || "")}${field("Đến ngày", "endDate", "date", row?.endDate || "")}${select(
      "Ngày học",
      "weekday",
      days.slice(1).map((name, i) => ({ id: String(i + 1), name })),
      String(row?.weekday || 1),
    )}${field("Giờ bắt đầu", "startTime", "time", row?.startTime || "")}${field("Giờ kết thúc", "endTime", "time", row?.endTime || "")}</div></fieldset><p class="hint">Phân nhiều buổi, phòng học, ngày nghỉ và học bù tại Thời khóa biểu. Lớp đã có sinh viên không đổi môn hoặc học kỳ ở đây.</p><button class="primary">${row ? "Lưu thay đổi" : "Mở lớp học phần"}</button></form>`,
  );
  if (row?.timetableVersion) {
    const schedule = dialog.querySelectorAll("fieldset")[1];
    schedule.hidden = true;
    for (const c of schedule.querySelectorAll("input,select"))
      c.disabled = true;
    schedule.insertAdjacentHTML(
      "afterend",
      `<p><b>Lịch đang áp dụng</b><br>${esc(row.scheduleSummary)}<br><a href="#schedule" data-schedule-link>Điều chỉnh tại Thời khóa biểu</a></p>`,
    );
    dialog.querySelector("[data-schedule-link]").onclick = () => dialog.close();
  }
  for (const key of ["facultyId", "cohortId"]) {
    const field = dialog.querySelector(`[name="${key}"]`);
    field.required =
      key === "facultyId"
        ? Boolean(data.requireFaculty)
        : Boolean(data.requireCohort);
    field.options[0].textContent = field.required
      ? key === "facultyId"
        ? "Chọn khoa phụ trách"
        : "Chọn khóa"
      : key === "facultyId"
        ? "Chưa phân khoa"
        : "Tất cả khóa";
  }
  saveForm(
    dialog,
    (input) =>
      api("/academics/sections" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: {
          ...numeric(
            {
              ...Object.fromEntries(
                ["startDate", "endDate", "weekday", "startTime", "endTime"]
                  .filter(() => Boolean(row?.timetableVersion))
                  .map((k) => [k, row[k]]),
              ),
              ...input,
            },
            ["capacity", "weekday"],
          ),
          ...(row ? { version: row.version } : {}),
        },
      }),
    refresh,
  );
}
async function rosterDialog(id) {
  const dialog = openEditor(
    "Danh sách lớp",
    '<p class="loading">Đang tải danh sách sinh viên…</p>',
  );
  try {
    const data = await api("/academics/sections/" + id + "/students");
    if (!dialog.isConnected || !dialog.open) return;
    dialog.querySelector(".loading").outerHTML =
      `<p>${esc(data.section.code)} · Học kỳ ${esc(data.section.term)} · ${data.rows.length} sinh viên</p>` +
      table(
        ["Mã sinh viên", "Họ và tên", "Loại lượt học"],
        data.rows.map(
          (r) =>
            `<tr><td>${esc(r.code)}</td><td>${esc(r.fullName)}</td><td>${esc(STUDY_MODES[r.studyMode] || STUDY_MODES.UNVERIFIED)}</td></tr>`,
        ),
      );
  } catch (error) {
    if (dialog.isConnected && dialog.open)
      dialog.querySelector(".loading").textContent = error.message;
  }
}
async function registrationDialog(row, actor, withdraw, refresh) {
  let studyAttempt = null;
  const dialog = openEditor(
    withdraw ? "Rút đăng ký lớp học phần" : "Xác nhận đăng ký",
    `<form>${errorBox()}<dl class="record-summary"><dt>Lớp học phần</dt><dd>${esc(row.code)} · ${esc(row.subjectName)}</dd><dt>Học kỳ</dt><dd>${esc(row.term)}</dd><dt>Giảng viên</dt><dd>${esc(row.lecturerName)}</dd><dt>Lịch học</dt><dd>${esc(schedule(row))}<br>${esc(row.startDate)} đến ${esc(row.endDate)}</dd><dt>Số tín chỉ</dt><dd>${row.credits}</dd></dl><p>${withdraw ? "Rút lớp học phần này khỏi danh sách đăng ký của bạn?" : "Kiểm tra thông tin lớp trước khi xác nhận đăng ký."}</p><p class="hint" id="registration-check">Đang kiểm tra điều kiện…</p><div id="study-review"></div><p class="hint">Điều kiện tài chính chưa được xác minh.</p><button class="primary" disabled>${withdraw ? "Xác nhận rút đăng ký" : "Xác nhận đăng ký"}</button></form>`,
  );
  try {
    const check = await api(
      withdraw
        ? "/academics/registrations/" + row.registration.id + "/eligibility"
        : "/academics/sections/" + row.id + "/eligibility",
    );
    if (!dialog.open || !dialog.isConnected) return;
    dialog.querySelector("#registration-check").textContent = withdraw
      ? "Trong hạn rút của " +
        check.periodTitle +
        (check.withdrawalDeadline
          ? " · đến " + formatVietnamTime(check.withdrawalDeadline)
          : "")
      : check.periodTitle +
        " · Tín chỉ sau đăng ký: " +
        check.nextCredits +
        "/" +
        check.maxCredits +
        " · Tiên quyết: " +
        (check.requirements.join(", ") || "Không cấu hình");
    if (!withdraw && check.curriculum)
      dialog.querySelector("#registration-check").textContent +=
        " · Chương trình: " +
        check.curriculum.code +
        " / Phiên bản " +
        check.curriculum.edition;
    if (!withdraw) {
      studyAttempt = check.studyAttempt;
      if (studyAttempt)
        dialog.querySelector("#study-review").innerHTML =
          studyReviewMarkup(studyAttempt);
      const reviewTable = dialog.querySelector("#study-review .table-scroll");
      if (reviewTable) {
        reviewTable.tabIndex = 0;
        reviewTable.setAttribute("role", "region");
        reviewTable.setAttribute(
          "aria-label",
          "Điểm công bố làm căn cứ đăng ký",
        );
      }
      if (!check.allowed) return;
    }
    dialog.querySelector("form button").disabled = false;
  } catch (error) {
    if (dialog.open && dialog.isConnected) {
      showError(dialog, error);
      dialog.querySelector("#registration-check").textContent =
        "Chưa đủ điều kiện để xác nhận.";
    }
    return;
  }
  const key =
    (withdraw ? "withdraw:" : "register:") +
    (withdraw ? row.registration.id + ":" + row.registration.version : row.id);
  saveForm(
    dialog,
    () =>
      api(
        "/academics/registrations" +
          (withdraw ? "/" + row.registration.id + "/withdraw" : ""),
        {
          method: "POST",
          body: withdraw
            ? {
                version: row.registration.version,
                requestId: pendingKey(actor, key),
              }
            : {
                sectionId: row.id,
                requestId: pendingKey(actor, key),
                confirm: true,
                studyMode: studyAttempt?.mode,
                studyReviewHash: studyAttempt?.reviewHash,
              },
        },
      ),
    async () => {
      requestKeys.delete(actor.id + ":" + key);
      await refresh();
    },
  );
}
