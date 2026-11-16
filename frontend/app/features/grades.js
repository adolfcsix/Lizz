import { openAcademicStanding } from "./academic-standing.js";
import { downloadCsv } from "../components/csv-export.js";
import {
  gradeSchemeEditor,
  gpaPolicyEditor,
  summaryMarkup,
} from "./grade-settings.js";
import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  openEditor,
  errorBox,
  showError,
  notify,
  bindForm,
  confirmAction,
} from "../components/ui.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";
const labels = {
  DRAFT: "Điểm nháp",
  SUBMITTED: "Chờ công bố",
  PUBLISHED: "Đã công bố",
};
export async function gradesPage(container, actor) {
  const data = await api("/grades"),
    student = actor.role === "STUDENT";
  container.innerHTML =
    heading(
      student || actor.role === "STAFF"
        ? "Kết quả học tập"
        : actor.role === "LECTURER"
          ? "Nhập điểm học phần"
          : "Điểm và công bố",
      (["MANAGER", "STAFF"].includes(actor.role) &&
      actor.access?.canManageShared !== false
        ? '<button id="gpa-policy">Quy đổi điểm và GPA</button>'
        : "") +
        (actor.role !== "LECTURER"
          ? '<button id="academic-standing">Đối chiếu học vụ</button>'
          : "") +
        '<button id="grades-export">Xuất CSV</button>',
    ) +
    (!student
      ? `<section class="panel policy-panel"><div class="section-heading"><h2>Bảng điểm theo lớp</h2></div>${table(
          ["Lớp học phần", "Học kỳ", "Môn học", ""],
          data.sections.map(
            (s) =>
              `<tr><td><b>${esc(s.code)}</b></td><td>${esc(s.term)}</td><td>${esc(s.subjectName)}</td><td><button data-grade-section="${s.id}">${actor.role === "LECTURER" ? "Nhập và gửi điểm" : "Xem bảng điểm"}</button></td></tr>`,
          ),
        )}</section>`
      : "") +
    (actor.role !== "LECTURER"
      ? `${student ? "" : `<div class="toolbar"><label>Tổng hợp theo sinh viên<select id="summary-student"><option value="">Chọn sinh viên</option>${(data.summaries || []).map((s) => `<option value="${s.studentId}">${esc(s.studentCode)} · ${esc(s.studentName)}</option>`).join("")}</select></label></div>`}<div id="grade-summary">${student ? summaryMarkup(data.summaries || [], true) : ""}</div>`
      : "") +
    `<section class="panel"><div class="toolbar"><label>Tìm kết quả<input type="search" id="grade-query" placeholder="${student ? "Môn học hoặc lớp học phần" : "Mã sinh viên, môn học hoặc lớp"}"></label><label>Học kỳ<select id="grade-term"><option value="">Tất cả</option>` +
    [...new Set(data.rows.map((r) => r.term))]
      .sort()
      .map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)
      .join("") +
    '</select></label></div><div id="grade-table"></div></section>';
  container
    .querySelector("#gpa-policy")
    ?.addEventListener("click", () =>
      gpaPolicyEditor(() => gradesPage(container, actor)).catch((e) =>
        notify(e.message),
      ),
    );
  container
    .querySelector("#summary-student")
    ?.addEventListener("change", (e) => {
      container.querySelector("#grade-summary").innerHTML = summaryMarkup(
        (data.summaries || []).filter((s) => s.studentId === e.target.value),
        false,
      );
    });
  let page = 1,
    filtered = [];
  container.querySelector("#grades-export").onclick = () =>
    downloadCsv(
      "LIZZ_KET_QUA_HOC_TAP.csv",
      [
        "Mã sinh viên",
        "Sinh viên",
        "Học kỳ",
        "Môn",
        "Lớp học phần",
        "Điểm tổng kết",
        "Điểm chữ",
        "Điểm hệ 4",
        "Tín chỉ đã chốt",
        "Trạng thái",
      ],
      filtered.map((r) => [
        r.studentCode,
        r.studentName,
        r.term,
        r.subjectName,
        r.sectionCode,
        r.score,
        r.resultSnapshot?.letter || "",
        r.resultSnapshot?.points ?? "",
        r.resultSnapshot?.credits ?? "",
        labels[r.status],
      ]),
    );
  const paint = () => {
    const q = container
        .querySelector("#grade-query")
        .value.toLocaleLowerCase("vi"),
      term = container.querySelector("#grade-term").value;
    const rows = data.rows.filter(
        (r) =>
          (!term || r.term === term) &&
          (
            r.studentCode +
            " " +
            r.studentName +
            " " +
            r.subjectName +
            " " +
            r.sectionCode
          )
            .toLocaleLowerCase("vi")
            .includes(q),
      ),
      max = Math.max(1, Math.ceil(rows.length / 10));
    page = Math.min(page, max);
    filtered = rows;
    const target = container.querySelector("#grade-table");
    target.innerHTML = table(
      student
        ? ["Học phần", "Điểm /10", "Quy đổi / Tín chỉ", "Kết quả", "Công bố"]
        : ["Sinh viên", "Học phần", "Điểm", "Trạng thái"],
      rows
        .slice((page - 1) * 10, page * 10)
        .map((r) =>
          student
            ? `<tr><td><b>${esc(r.subjectName)}</b><small>${esc(r.sectionCode)} · ${esc(r.term)}</small>${componentDetails(r)}</td><td><strong>${r.score}</strong><small>Ngưỡng đạt ${r.passScore}</small></td><td>${esc(r.resultSnapshot?.letter || "—")} · ${r.resultSnapshot?.points ?? "—"}/4<small>${r.resultSnapshot?.credits ?? "—"} tín chỉ</small></td><td><span class="badge">${r.passed ? "Đạt" : "Chưa đạt"}</span></td><td>${esc(formatVietnamTime(r.publishedAt))}${r.lastRevisedAt ? `<small>Điều chỉnh ${esc(formatVietnamTime(r.lastRevisedAt))}</small>` : ""}</td></tr>`
            : `<tr><td><b>${esc(r.studentCode)}</b><small>${esc(r.studentName)}</small></td><td>${esc(r.subjectName)}<small>${esc(r.sectionCode)} · ${esc(r.term)}</small></td><td>${r.score}</td><td><span class="badge">${labels[r.status]}</span></td></tr>`,
        ),
      student && !q && !term
        ? "Chưa có kết quả học tập được công bố."
        : "Không tìm thấy kết quả phù hợp.",
    );
    target.innerHTML += `<div class="pagination"><span>Trang ${page}/${max}</span><button id="grade-prev" ${page <= 1 ? "disabled" : ""}>Trước</button><button id="grade-next" ${page >= max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#grade-prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#grade-next").onclick = () => {
      page++;
      paint();
    };
  };
  container.querySelector("#grade-query").oninput = container.querySelector(
    "#grade-term",
  ).onchange = () => {
    page = 1;
    paint();
  };
  paint();
  container
    .querySelector("#academic-standing")
    ?.addEventListener("click", () => openAcademicStanding(actor));
  for (const b of container.querySelectorAll("[data-grade-section]"))
    b.onclick = () =>
      gradeEditor(b.dataset.gradeSection, actor, () =>
        gradesPage(container, actor),
      );
}
export async function gradeEditor(sectionId, actor, refresh) {
  const dialog = openEditor(
    "Bảng điểm học phần",
    '<p class="loading">Đang tải dữ liệu…</p>',
  );
  try {
    const data = await api("/grades/sections/" + sectionId);
    if (!dialog.open || !dialog.isConnected) return;
    const teacher = actor.role === "LECTURER",
      allDraft =
        data.rows.length > 0 &&
        data.rows.every((r) => !r.grade || r.grade.status === "DRAFT"),
      complete =
        data.rows.length > 0 &&
        data.rows.every(
          (r) => r.grade && r.grade.enrollmentVersion === r.enrollmentVersion,
        ),
      submitted =
        complete && data.rows.every((r) => r.grade.status === "SUBMITTED");
    const configured = data.scheme?.components || [],
      canConfigure =
        ["MANAGER", "STAFF"].includes(actor.role) &&
        !data.schemeLocked &&
        data.rows.every((r) => !r.grade);
    dialog.querySelector(".loading").outerHTML =
      `<p><b>${esc(data.section.code)}</b> · Học kỳ ${esc(data.section.term)} · ${data.rows.length} sinh viên</p>${canConfigure ? '<button id="configure-scheme">Cấu hình điểm thành phần</button>' : ""}<p class="hint">Ngưỡng đạt: ${data.term ? data.term.passScore + "/10" : "Chưa cấu hình học kỳ"}. ${data.subject?.credits ?? "—"} tín chỉ. ${data.gpaPolicy ? "Đã có quy định quy đổi GPA." : "Chưa có quy định quy đổi GPA; công bố điểm không tự tạo GPA."} Kiểm tra đầy đủ điểm của sinh viên trước khi gửi hoặc công bố.</p>${
        data.gpaPolicy
          ? `<details class="grade-conversion"><summary>Quy định quy đổi đang áp dụng</summary><p>${data.gpaPolicy.repeatRule === "LATEST" ? "Lấy lần học sau cùng" : "Lấy điểm tổng kết cao nhất"} khi có nhiều kết quả cùng môn.</p>${table(
              ["Điểm từ /10", "Điểm chữ", "Điểm hệ 4"],
              data.gpaPolicy.bands.map(
                (b) =>
                  `<tr><td>${b.minScore}</td><td>${esc(b.letter)}</td><td>${b.points}</td></tr>`,
              ),
            )}</details>`
          : ""
      }<form>${errorBox()}${table(
        [
          "Sinh viên",
          ...configured.map((c) => c.name + " · " + c.weight + "%"),
          "Điểm tổng kết /10",
          "Điểm chữ / Hệ 4",
          "Trạng thái",
        ],
        data.rows.map(
          (r) =>
            `<tr><td><b>${esc(r.code)}</b><small>${esc(r.fullName)}</small></td>${configured.map((c) => `<td>${teacher && allDraft ? `<label class="grade-input-label">${esc(c.name)} ${esc(r.code)}<input name="component-${r.enrollmentId}-${c.code}" type="number" min="0" max="10" step="0.01" required value="${r.grade?.componentScores?.[c.code] ?? ""}" placeholder="Chưa nhập"></label>` : esc(r.grade?.componentScores?.[c.code] ?? "Chưa nhập")}</td>`).join("")}<td>${teacher && allDraft && !configured.length ? `<label class="grade-input-label">Điểm ${esc(r.code)}<input name="score-${r.enrollmentId}" type="number" min="0" max="10" step="0.01" value="${r.grade?.score ?? ""}" placeholder="Chưa nhập" required></label>` : (r.grade?.score ?? "Tính sau khi lưu")}</td><td>${gradeConversion(r.grade, data.gpaPolicy)}</td><td>${r.grade ? (r.grade.enrollmentVersion !== r.enrollmentVersion ? "Đăng ký đã thay đổi · cần lưu lại điểm" : labels[r.grade.status]) : "Chưa có điểm"}</td></tr>`,
        ),
      )}<div class="dialog-actions">${teacher && allDraft ? '<button type="submit" class="primary">Lưu điểm nháp</button>' : ""}</div></form><div class="dialog-actions">${teacher && allDraft && complete ? '<button id="submit-grades" class="primary">Gửi bảng điểm</button>' : ""}${actor.role === "MANAGER" && submitted ? '<button id="return-grades">Trả lại để chỉnh sửa</button><button id="publish-grades" class="primary">Công bố bảng điểm</button>' : ""}</div>${submitted ? '<p class="hint">Bảng điểm đã gửi được khóa sửa cho tới khi Quản lý trả lại hoặc công bố.</p>' : ""}`;
    dialog.querySelector("#configure-scheme")?.addEventListener("click", () =>
      gradeSchemeEditor(data, async () => {
        await refresh();
        await gradeEditor(sectionId, actor, refresh);
      }),
    );
    if (teacher && allDraft)
      bindForm(
        dialog,
        () =>
          api("/grades/sections/" + sectionId, {
            method: "PUT",
            body: {
              schemeVersion: data.scheme?.version || null,
              rows: data.rows.map((r) => ({
                enrollmentId: r.enrollmentId,
                enrollmentVersion: r.enrollmentVersion,
                ...(configured.length
                  ? {
                      componentScores: Object.fromEntries(
                        configured.map((c) => [
                          c.code,
                          Number(
                            dialog.querySelector(
                              '[name="component-' +
                                r.enrollmentId +
                                "-" +
                                c.code +
                                '"]',
                            ).value,
                          ),
                        ]),
                      ),
                    }
                  : {
                      score: Number(
                        dialog.querySelector(
                          '[name="score-' + r.enrollmentId + '"]',
                        ).value,
                      ),
                    }),
                version: r.grade?.version || 0,
              })),
            },
          }),
        async () => {
          await refresh();
          await gradeEditor(sectionId, actor, refresh);
        },
        "Đã lưu điểm nháp. Sinh viên chưa nhìn thấy.",
      );
    let dirty = false;
    const requests = {};
    dialog.querySelector("form").oninput = () => {
      dirty = true;
      const submit = dialog.querySelector("#submit-grades");
      if (submit) {
        submit.disabled = true;
        submit.textContent = "Lưu điểm nháp trước khi gửi";
      }
    };
    const transition = async (action) => {
      if (dirty)
        return showError(dialog, new Error("Lưu điểm nháp trước khi gửi."));
      const decision = await confirmAction(dialog, {
        title:
          action === "publish"
            ? "Công bố kết quả học tập"
            : action === "return"
              ? "Trả lại bảng điểm"
              : "Gửi bảng điểm để kiểm tra",
        message:
          action === "publish"
            ? `Công bố ${data.rows.length} kết quả của ${data.section.code}, ngưỡng đạt ${data.term?.passScore ?? "chưa cấu hình"}/10. Sinh viên sẽ nhìn thấy kết quả và hệ thống dùng kết quả để kiểm tra tiên quyết.`
            : action === "return"
              ? `Bảng điểm ${data.section.code} sẽ trở về trạng thái nháp. Giảng viên phải chỉnh sửa, lưu và gửi lại trước khi công bố.`
              : `Gửi ${data.rows.length} điểm đã lưu của ${data.section.code} để Quản lý kiểm tra. Sau khi gửi, bảng điểm được khóa sửa.`,
        confirmLabel:
          action === "publish"
            ? "Xác nhận công bố"
            : action === "return"
              ? "Xác nhận trả lại"
              : "Xác nhận gửi bảng điểm",
        requireReason: action === "return",
      });
      if (!decision.confirmed) return;
      const reason = decision.reason;
      const buttons = dialog.querySelectorAll(".dialog-actions button");
      buttons.forEach((b) => (b.disabled = true));
      const requestId =
        requests[action] || (requests[action] = crypto.randomUUID());
      try {
        await api("/grades/sections/" + sectionId + "/" + action, {
          method: "POST",
          body: {
            requestId,
            reason,
            sectionVersion: data.section.version,
            termVersion: data.term?.version ?? null,
            schemeVersion: data.scheme?.version || null,
            gpaPolicyVersion: data.gpaPolicy?.version || null,
            reviewHash: data.reviewHash,
            rows: data.rows.map((r) => ({
              id: r.grade.id,
              version: r.grade.version,
            })),
          },
        });
        dialog.close();
        notify(
          action === "publish"
            ? "Đã công bố bảng điểm."
            : action === "return"
              ? "Đã trả lại bảng điểm kèm lý do."
              : "Đã gửi bảng điểm chờ công bố.",
        );
        await refresh();
      } catch (e) {
        showError(dialog, e);
        buttons.forEach((b) => (b.disabled = false));
      }
    };
    dialog
      .querySelector("#submit-grades")
      ?.addEventListener("click", () => transition("submit"));
    dialog
      .querySelector("#publish-grades")
      ?.addEventListener("click", () => transition("publish"));
    dialog
      .querySelector("#return-grades")
      ?.addEventListener("click", () => transition("return"));
  } catch (e) {
    if (dialog.open && dialog.isConnected)
      dialog.querySelector(".loading").textContent = e.message;
  }
}

function componentDetails(row) {
  const scheme = row.resultSnapshot?.scheme;
  if (!scheme) return "";
  return `<details><summary>Điểm thành phần</summary>${scheme.components.map((c) => `<small>${esc(c.name)} (${c.weight}%): ${esc(row.componentScores?.[c.code] ?? "—")}</small>`).join("")}</details>`;
}

function gradeConversion(grade, policy) {
  if (!grade) return "—";
  const band =
    grade.status === "PUBLISHED"
      ? grade.resultSnapshot
      : policy?.bands?.filter((b) => grade.score >= b.minScore).at(-1);
  return band?.letter
    ? esc(band.letter) + " · " + band.points + "/4"
    : "Chưa quy đổi";
}
