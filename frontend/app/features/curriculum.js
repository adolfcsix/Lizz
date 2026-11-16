import { openRecognitions } from "./credit-recognitions.js";
import { openCurriculumTransfers } from "./curriculum-transfers.js";
import {
  openCurriculumBatch,
  openCurriculumComparison,
  canCompareProgram,
} from "./curriculum-tools.js";
import { api } from "../services/api.js";
import {
  heading,
  escapeHtml as esc,
  table,
  select,
  field,
  errorBox,
  showError,
  openEditor,
  confirmAction,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { foldText } from "../../../shared/local-validation.js";
const status = {
  PASSED: "Đã đạt",
  RECOGNIZED: "Đã công nhận tín chỉ",
  IN_PROGRESS: "Đã đăng ký",
  NOT_PASSED: "Chưa đạt",
  NOT_TAKEN: "Chưa ghi nhận",
  UNVERIFIED: "Cần đối chiếu",
  CREDIT_SHORTFALL: "Chưa đủ tín chỉ",
};
const label = (list, id) =>
  list.find((r) => r.id === id)?.name || "Chưa xác định";
const minimum = (p) => p.groups.reduce((n, g) => n + g.minCredits, 0);
function accessibleTables(root) {
  for (const group of root.querySelectorAll(".cp-group")) {
    const scroll = group.querySelector(".table-scroll");
    scroll.tabIndex = 0;
    scroll.setAttribute("role", "region");
    scroll.setAttribute(
      "aria-label",
      "Bảng học phần · " + group.querySelector("h3").textContent,
    );
  }
}
export async function curriculumPage(container, actor) {
  let data,
    mode = actor.role === "STUDENT" ? "progress" : "programs",
    query = "",
    selectedStudent = "",
    epoch = 0;
  const refresh = async () => {
    const e = ++epoch;
    const result = await api("/curricula");
    if (e !== epoch || !container.isConnected) return;
    data = result;
    render();
  };
  function render() {
    container.innerHTML =
      heading(
        actor.role === "STUDENT"
          ? "Chương trình của tôi"
          : "Chương trình đào tạo",
        data.canEdit
          ? '<button class="primary" id="cp-new">Thêm chương trình</button>'
          : "",
      ) +
      (["MANAGER", "STAFF", "STUDENT"].includes(actor.role)
        ? '<div class="cp-detail-actions"><button id="cp-transfers">' +
          (actor.role === "STUDENT"
            ? "Lịch sử chuyển chương trình"
            : "Chuyển phiên bản có phê duyệt") +
          '</button><button id="cp-recognitions">Công nhận học phần</button></div>'
        : "") +
      `<section class="panel curriculum-panel">${data.canEdit ? `<div class="timetable-tabs"><button data-mode="programs" aria-pressed="${mode === "programs"}">Chương trình</button><button data-mode="progress" aria-pressed="${mode === "progress"}">Tiến độ học tập</button></div>` : ""}<div id="cp-content"></div></section>`;
    container
      .querySelector("#cp-transfers")
      ?.addEventListener("click", () =>
        openCurriculumTransfers(actor, data, refresh),
      );
    container
      .querySelector("#cp-recognitions")
      ?.addEventListener("click", () => openRecognitions(actor, data, refresh));
    const newButton = container.querySelector("#cp-new");
    if (newButton) newButton.onclick = () => editProgram();
    for (const b of container.querySelectorAll("[data-mode]"))
      b.onclick = () => {
        mode = b.dataset.mode;
        render();
      };
    if (mode === "progress") renderProgress();
    else renderPrograms();
  }
  function renderPrograms() {
    const host = container.querySelector("#cp-content");
    host.innerHTML = `<div class="cp-toolbar"><label>Tìm chương trình<input type="search" id="cp-query" value="${esc(query)}" placeholder="Mã, tên, ngành hoặc khóa"></label><span id="cp-count" role="status"></span></div><div class="cp-cards" id="cp-cards"></div>`;
    const paint = () => {
      const rows = data.curricula.filter((p) =>
        foldText(
          [
            p.code,
            p.name,
            label(data.majors, p.majorId),
            label(data.cohorts, p.cohortId),
          ].join(" "),
        ).includes(foldText(query)),
      );
      host.querySelector("#cp-count").textContent =
        rows.length + " chương trình";
      host.querySelector("#cp-cards").innerHTML =
        rows
          .map(
            (p) =>
              `<article class="cp-card"><div class="cp-card-top"><span>${esc(p.code)} · Phiên bản ${p.edition}</span><span class="cp-state ${p.status === "PUBLISHED" ? "is-published" : ""}">${p.status === "PUBLISHED" ? "Đã công bố" : "Bản nháp"}</span></div><h2>${esc(p.name)}</h2><p>${esc(label(data.majors, p.majorId))}<br>${esc(label(data.cohorts, p.cohortId))}</p><div class="cp-card-bottom"><span><b>${minimum(p)}</b> tín chỉ tối thiểu <i>·</i> ${p.groups.length} nhóm</span><button data-open="${p.id}">Xem chi tiết</button></div></article>`,
          )
          .join("") || '<p class="empty">Chưa có chương trình phù hợp.</p>';
      for (const b of host.querySelectorAll("[data-open]"))
        b.onclick = () =>
          detail(data.curricula.find((p) => p.id === b.dataset.open));
    };
    host.querySelector("#cp-query").oninput = (e) => {
      query = e.target.value;
      paint();
    };
    paint();
  }
  function programTable(p) {
    return p.groups
      .map(
        (g) =>
          `<section class="cp-group"><div class="cp-group-heading"><h3>${esc(g.name)}</h3><span>${g.kind === "REQUIRED" ? "Bắt buộc" : "Tự chọn"} · Tối thiểu ${g.minCredits} tín chỉ</span></div>${table(
            ["Mã học phần", "Học phần", "Tín chỉ", "Học kỳ dự kiến"],
            g.subjects.map(
              (s) =>
                `<tr><td>${esc(s.subjectCode)}</td><td>${esc(s.subjectName)}</td><td>${s.credits}</td><td>${s.semester}</td></tr>`,
            ),
          )}</section>`,
      )
      .join("");
  }
  function detail(p) {
    const dialog = openEditor(
      p.name,
      `${errorBox()}<p class="cp-meta">${esc(p.code)} · Phiên bản ${p.edition} · ${esc(label(data.majors, p.majorId))} · ${esc(label(data.cohorts, p.cohortId))}</p><div class="cp-detail-actions"><button id="cp-csv">Xuất học phần</button>${canCompareProgram(p, data, actor) ? '<button id="cp-compare">So sánh phiên bản</button>' : ""}${data.canEdit ? `<button id="cp-edit">${p.status === "DRAFT" ? "Chỉnh bản nháp" : "Tạo phiên bản tiếp theo"}</button>${p.status === "PUBLISHED" ? '<button class="primary" id="cp-assign">Áp dụng cho sinh viên</button>' : data.canPublish ? '<button class="primary" id="cp-publish">Công bố chương trình</button>' : ""}` : ""}</div>${programTable(p)}${p.status === "PUBLISHED" ? '<p class="hint">Nội dung đã công bố được giữ nguyên. Phiên bản mới không tự thay chương trình của sinh viên.</p>' : ""}`,
    );
    accessibleTables(dialog);
    dialog.querySelector("#cp-csv").onclick = () =>
      downloadCsv(
        "Lizz_Chuong_trinh_" + p.code + "_P" + p.edition + ".csv",
        [
          "Chương trình",
          "Phiên bản",
          "Nhóm",
          "Loại",
          "Tín chỉ nhóm tối thiểu",
          "Mã môn",
          "Môn",
          "Tín chỉ",
          "Học kỳ dự kiến",
        ],
        p.groups.flatMap((g) =>
          g.subjects.map((s) => [
            p.code,
            p.edition,
            g.name,
            g.kind === "REQUIRED" ? "Bắt buộc" : "Tự chọn",
            g.minCredits,
            s.subjectCode,
            s.subjectName,
            s.credits,
            s.semester,
          ]),
        ),
      );
    const edit = dialog.querySelector("#cp-edit");
    if (edit)
      edit.onclick = () => {
        if (p.status === "DRAFT") return editProgram(p);
        const edition =
          Math.max(
            ...data.curricula
              .filter(
                (r) =>
                  r.code === p.code &&
                  r.majorId === p.majorId &&
                  r.cohortId === p.cohortId,
              )
              .map((r) => r.edition),
          ) + 1;
        if (edition > 999)
          return notify(
            "Đã đạt giới hạn phiên bản. Liên hệ người quản trị hệ thống.",
          );
        editProgram({ ...p, id: null, edition });
      };
    dialog
      .querySelector("#cp-compare")
      ?.addEventListener("click", () => openCurriculumComparison(p, data));
    const assign = dialog.querySelector("#cp-assign");
    if (assign) assign.onclick = () => openCurriculumBatch(p, data, refresh);
    const publish = dialog.querySelector("#cp-publish");
    if (publish)
      publish.onclick = async () => {
        publish.disabled = true;
        try {
          const answer = await confirmAction(dialog, {
            title: "Công bố chương trình",
            message: `${p.code} · Phiên bản ${p.edition}: ${p.groups.length} nhóm, ${minimum(p)} tín chỉ tối thiểu. Sau công bố không chỉnh trực tiếp; việc áp dụng cho sinh viên là bước riêng.`,
            confirmLabel: "Xác nhận công bố",
          });
          if (!answer.confirmed) return;
          await api("/curricula/" + p.id + "/publish", {
            method: "POST",
            body: { version: p.version, confirm: true },
          });
          dialog.close();
          notify("Đã công bố chương trình.");
          await refresh();
        } catch (e) {
          showError(dialog, e);
        } finally {
          publish.disabled = false;
        }
      };
  }
  function editProgram(prior = null) {
    const dialog = openEditor(
      prior?.id ? "Chỉnh chương trình" : "Thêm chương trình",
      `<form id="cp-form">${errorBox()}<div class="form-grid">${field("Mã chương trình", "programCode", "text", prior?.code || "")}${field("Tên chương trình", "programName", "text", prior?.name || "")}${field("Phiên bản", "edition", "number", prior?.edition || 1)}${select("Ngành", "majorId", data.majors, prior?.majorId || "")}${select("Khóa", "cohortId", data.cohorts, prior?.cohortId || "")}</div><div id="cp-groups"></div><div class="cp-form-actions"><button type="button" id="cp-add-group">Thêm nhóm học phần</button><button type="submit" class="primary">Lưu bản nháp</button></div></form>`,
    );
    const form = dialog.querySelector("form"),
      groups = form.querySelector("#cp-groups");
    form.elements.edition.min = 1;
    form.elements.edition.max = 999;
    function groupRow(
      g = { code: "", name: "", kind: "REQUIRED", minCredits: 1, subjects: [] },
    ) {
      if (groups.children.length >= 40)
        return notify("Tối đa 40 nhóm học phần.");
      const el = document.createElement("fieldset");
      el.className = "cp-group-editor";
      el.innerHTML = `<legend>Nhóm học phần</legend><div class="form-grid">${field("Mã nhóm", "groupCode", "text", g.code)}${field("Tên nhóm", "groupName", "text", g.name)}${select(
        "Loại nhóm",
        "kind",
        [
          { id: "REQUIRED", name: "Bắt buộc" },
          { id: "ELECTIVE", name: "Tự chọn" },
        ],
        g.kind,
      )}<label data-min>Tín chỉ cần đạt<input name="minCredits" type="number" min="1" max="3000" value="${g.minCredits}"></label></div><div class="cp-subjects"></div><div class="cp-form-actions"><button type="button" data-add-subject>Thêm học phần</button><button type="button" data-remove-group>Bỏ nhóm</button></div>`;
      const list = el.querySelector(".cp-subjects");
      function subjectRow(s = { subjectId: "", semester: 1 }) {
        if (list.children.length >= 100)
          return notify("Tối đa 100 học phần mỗi nhóm.");
        const row = document.createElement("div");
        row.className = "cp-subject-editor";
        row.innerHTML =
          select(
            "Học phần",
            "subjectId",
            data.subjects.map((s) => ({
              id: s.id,
              name: s.code + " · " + s.name + " · " + s.credits + " tín chỉ",
            })),
            s.subjectId,
          ) +
          `<label>Học kỳ dự kiến<input type="number" name="semester" required min="1" max="20" value="${s.semester}"></label><button type="button" aria-label="Bỏ học phần">Bỏ</button>`;
        row.querySelector("button").onclick = () => row.remove();
        list.append(row);
      }
      el.querySelector("[data-add-subject]").onclick = () => subjectRow();
      el.querySelector("[data-remove-group]").onclick = () => el.remove();
      const toggle = () => {
        const hidden = el.querySelector('[name="kind"]').value !== "ELECTIVE";
        el.querySelector("[data-min]").hidden = hidden;
        el.querySelector('[name="minCredits"]').disabled = hidden;
      };
      el.querySelector('[name="kind"]').onchange = toggle;
      groups.append(el);
      (g.subjects.length ? g.subjects : [{}]).forEach((s) =>
        subjectRow({ subjectId: s.subjectId || "", semester: s.semester || 1 }),
      );
      toggle();
    }
    (
      prior?.groups || [
        {
          code: "BB",
          name: "Học phần bắt buộc",
          kind: "REQUIRED",
          minCredits: 1,
          subjects: [],
        },
      ]
    ).forEach(groupRow);
    form.querySelector("#cp-add-group").onclick = () => groupRow();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const button = form.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const read = (el, name) => el.querySelector(`[name="${name}"]`).value;
        const body = {
          code: form.elements.programCode.value,
          name: form.elements.programName.value,
          edition: Number(form.elements.edition.value),
          majorId: form.elements.majorId.value,
          cohortId: form.elements.cohortId.value,
          version: prior?.version,
          groups: [...groups.children].map((g) => ({
            code: read(g, "groupCode"),
            name: read(g, "groupName"),
            kind: read(g, "kind"),
            minCredits: Number(read(g, "minCredits")),
            subjects: [...g.querySelector(".cp-subjects").children].map(
              (s) => ({
                subjectId: read(s, "subjectId"),
                semester: Number(read(s, "semester")),
              }),
            ),
          })),
        };
        await api("/curricula" + (prior?.id ? "/" + prior.id : ""), {
          method: prior?.id ? "PATCH" : "POST",
          body,
        });
        dialog.close();
        notify("Đã lưu bản nháp chương trình.");
        await refresh();
      } catch (e) {
        showError(form, e);
      } finally {
        button.disabled = false;
      }
    };
  }
  function renderProgress() {
    const host = container.querySelector("#cp-content");
    if (!data.students.some((s) => s.id === selectedStudent))
      selectedStudent =
        actor.role === "STUDENT" ? data.students[0]?.id || "" : "";
    host.innerHTML = `<div class="cp-progress-toolbar">${
      data.canEdit
        ? select(
            "Sinh viên",
            "progressStudent",
            data.students.map((s) => ({
              id: s.id,
              name: s.code + " · " + s.fullName,
            })),
            selectedStudent,
          )
        : ""
    }</div><div id="cp-progress"><p class="empty">${data.students.length ? "Chọn sinh viên để xem chương trình và tiến độ." : "Chưa có hồ sơ sinh viên liên kết."}</p></div>`;
    const choose = host.querySelector('[name="progressStudent"]');
    if (choose)
      choose.onchange = () => {
        selectedStudent = choose.value;
        loadProgress();
      };
    if (selectedStudent) loadProgress();
  }
  async function loadProgress() {
    const host = container.querySelector("#cp-progress"),
      id = selectedStudent,
      request = ++epoch;
    if (!id) {
      host.innerHTML = '<p class="empty">Chọn sinh viên để xem tiến độ.</p>';
      return;
    }
    host.innerHTML = '<p class="loading">Đang tải tiến độ học tập…</p>';
    try {
      const result = await api("/curricula/students/" + id + "/progress");
      if (request !== epoch || !host.isConnected) return;
      if (result.status === "UNASSIGNED") {
        host.innerHTML =
          '<p class="empty">Chưa được áp dụng chương trình đào tạo. Liên hệ cán bộ phụ trách.</p>';
        return;
      }
      const p = result.curriculum;
      host.innerHTML = `<div class="cp-progress-header"><div><span>${esc(result.student.code)} · ${esc(result.student.fullName)}</span><h2>${esc(p.name)}</h2><p>${esc(p.code)} · Phiên bản ${p.edition}</p></div><button id="cp-progress-csv">Xuất tiến độ</button></div><div class="cp-stats"><div><span>Tín chỉ đã ghi nhận</span><b>${result.earnedCredits}<small> / ${result.requiredCredits}</small></b></div><div><span>Tín chỉ còn thiếu</span><b>${result.remainingCredits === null ? "Cần đối chiếu" : result.remainingCredits}</b></div></div><p class="cp-basis ${result.status === "VERIFIED" ? "" : "needs-review"}">${esc(result.note)}</p>${result.groups
        .map(
          (g) =>
            `<section class="cp-group"><div class="cp-group-heading"><div><h3>${esc(g.name)}</h3><span>${g.kind === "REQUIRED" ? "Bắt buộc" : "Tự chọn"} · Ghi nhận ${g.countedCredits}/${g.minCredits} tín chỉ</span></div><progress max="${g.minCredits}" value="${g.countedCredits}" aria-label="Tiến độ ${esc(g.name)}"></progress></div>${table(
              ["Học phần", "Tín chỉ", "Học kỳ dự kiến", "Kết quả"],
              g.subjects.map(
                (s) =>
                  `<tr><td><b>${esc(s.subjectName)}</b><small>${esc(s.subjectCode)}</small></td><td>${s.credits}</td><td>${s.semester}</td><td><span class="cp-result ${["PASSED", "RECOGNIZED"].includes(s.status) ? "is-passed" : ""}">${status[s.status]}</span>${s.score === null ? "" : `<small>Điểm ${s.score}</small>`}</td></tr>`,
              ),
            )}</section>`,
        )
        .join(
          "",
        )}<div class="cp-progress-footer"><a href="#academics">Xem lớp học phần</a><span>Tự chọn được tính tối đa số tín chỉ yêu cầu của từng nhóm.</span></div>`;
      accessibleTables(host);
      host.querySelector("#cp-progress-csv").onclick = () =>
        downloadCsv(
          "Lizz_Tien_do_" + result.student.code + ".csv",
          [
            "Sinh viên",
            "Chương trình",
            "Phiên bản",
            "Nhóm",
            "Mã môn",
            "Môn",
            "Tín chỉ",
            "Học kỳ dự kiến",
            "Trạng thái",
            "Điểm đạt",
            "Phạm vi xác minh",
          ],
          result.groups.flatMap((g) =>
            g.subjects.map((s) => [
              result.student.code,
              p.code,
              p.edition,
              g.name,
              s.subjectCode,
              s.subjectName,
              s.credits,
              s.semester,
              status[s.status],
              s.score ?? "",
              result.note,
            ]),
          ),
        );
    } catch (e) {
      if (request === epoch && host.isConnected) {
        host.innerHTML = `<p class="form-error" role="alert">${esc(e.message)}</p><button id="cp-retry">Thử lại</button>`;
        host.querySelector("#cp-retry").onclick = loadProgress;
      }
    }
  }
  await refresh();
}
