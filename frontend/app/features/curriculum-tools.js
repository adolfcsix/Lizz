import { api } from "../services/api.js";
import {
  escapeHtml as esc,
  openEditor,
  select,
  table,
  errorBox,
  showError,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { foldText } from "../../../shared/local-validation.js";
import { CURRICULUM_DIFF_LABELS } from "../../../shared/curriculum-comparison.js";
function reportError(root, error) {
  showError(root, error);
  if (!error.message) return;
  const target = root.querySelector(".form-error");
  if (target) {
    target.tabIndex = -1;
    target.focus();
    target.scrollIntoView({ block: "nearest" });
  }
}
function startReview(dialog, heading) {
  if (heading) {
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  }
  dialog.scrollTop = 0;
}
const changes = { ADDED: "Thêm", REMOVED: "Bỏ", CHANGED: "Điều chỉnh" };
const statuses = {
  ELIGIBLE: "Đủ điều kiện",
  ASSIGNED: "Đã có chương trình",
  STALE: "Hồ sơ đã thay đổi",
  WRONG_AUDIENCE: "Không đúng ngành/khóa",
  UNAVAILABLE: "Không có hồ sơ trong quyền",
};
const kind = (v) => (v === "REQUIRED" ? "Bắt buộc" : "Tự chọn");
const family = (a, b) =>
  a.code === b.code && a.majorId === b.majorId && a.cohortId === b.cohortId;
export function canCompareProgram(program, data, actor) {
  return (
    actor.role !== "STUDENT" &&
    data.curricula.some((p) => p.id !== program.id && family(p, program))
  );
}
function accessibleScroll(root) {
  for (const el of root.querySelectorAll(".table-scroll")) {
    el.tabIndex = 0;
    el.setAttribute("role", "region");
    el.setAttribute(
      "aria-label",
      el.closest("section")?.querySelector("h3")?.textContent ||
        "Bảng đối chiếu sinh viên",
    );
  }
}
export const subjectText = (s) =>
  s
    ? `${s.subjectCode} · ${s.subjectName}\n${s.groupCode} · ${kind(s.kind)} · ${s.credits} tín chỉ · Học kỳ ${s.semester}`
    : "—";
export const groupText = (g) =>
  g ? `${g.name} · ${kind(g.kind)} · Tối thiểu ${g.minCredits} tín chỉ` : "—";
export function openCurriculumComparison(program, data) {
  const options = data.curricula
    .filter((p) => family(p, program))
    .sort((a, b) => a.edition - b.edition)
    .map((p) => ({
      id: p.id,
      name: `Phiên bản ${p.edition} · ${p.status === "PUBLISHED" ? "Đã công bố" : "Bản nháp"}`,
    }));
  const dialog = openEditor(
    "So sánh phiên bản · " + program.code,
    `<p class="cp-meta">${esc(program.name)}</p><form id="cc-form">${errorBox()}<div class="form-grid">${select("Phiên bản gốc", "before", options, program.id)}${select("Phiên bản đối chiếu", "after", options, options.find((o) => o.id !== program.id)?.id || "")}</div><button class="primary" type="submit">Đối chiếu nội dung</button></form><div id="cc-result" aria-live="polite"></div>`,
  );
  const form = dialog.querySelector("form"),
    result = dialog.querySelector("#cc-result");
  dialog.classList.add("curriculum-comparison-dialog");
  dialog.addEventListener(
    "close",
    () => dialog.classList.remove("curriculum-comparison-dialog"),
    { once: true },
  );
  let epoch = 0;
  form.onchange = () => {
    epoch++;
    result.innerHTML =
      '<p class="hint">Bấm Đối chiếu nội dung để xem cặp phiên bản đã chọn.</p>';
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const current = ++epoch,
      button = form.querySelector("button");
    button.disabled = true;
    reportError(form, Error(""));
    result.innerHTML = '<p role="status">Đang đối chiếu…</p>';
    try {
      const params = new URLSearchParams(new FormData(form));
      const value = await api("/curricula/compare?" + params);
      if (current !== epoch || !dialog.open || !dialog.isConnected) return;
      const m = value.minimumCredits;
      result.innerHTML = `<div class="cc-summary"><div><span>Học phần thêm</span><b>${value.counts.ADDED}</b></div><div><span>Học phần bỏ</span><b>${value.counts.REMOVED}</b></div><div><span>Điều chỉnh</span><b>${value.counts.CHANGED}</b></div><div><span>Giữ nguyên</span><b>${value.counts.UNCHANGED}</b></div></div><p class="cp-basis">Tín chỉ tối thiểu: ${m.before} → ${m.after} (${m.delta > 0 ? "+" : ""}${m.delta}). Sinh viên tiếp tục dùng phiên bản đã được áp dụng.</p>${value.title ? `<section><h3>Tên chương trình</h3><p>${esc(value.title.before)} → ${esc(value.title.after)}</p></section>` : ""}<section><h3>Nhóm học phần thay đổi</h3>${table(
        ["Mã nhóm", "Thay đổi", "Trước", "Sau"],
        value.groups.map(
          (g) =>
            `<tr><td>${esc(g.code)}</td><td>${changes[g.change]}</td><td>${esc(groupText(g.before))}</td><td>${esc(groupText(g.after))}</td></tr>`,
        ),
        "Các yêu cầu của nhóm học phần được giữ nguyên.",
      )}</section><section><h3>Học phần thay đổi</h3>${table(
        ["Học phần", "Thay đổi", "Trước", "Sau"],
        value.subjects.map(
          (s) =>
            `<tr><td><b>${esc((s.after || s.before).subjectCode)}</b><small>${esc(s.fields.map((f) => CURRICULUM_DIFF_LABELS[f]).join(", "))}</small></td><td>${changes[s.change]}</td><td class="cc-value">${esc(subjectText(s.before))}</td><td class="cc-value">${esc(subjectText(s.after))}</td></tr>`,
        ),
        "Nội dung học phần được giữ nguyên.",
      )}</section><div class="actions"><button id="cc-export">Xuất đối chiếu CSV</button></div>`;
      accessibleScroll(result);
      result.querySelector("#cc-export").onclick = () => {
        const pair = `Phiên bản ${value.before.edition} / ${value.after.edition}`;
        const rows = [
          [
            program.code,
            pair,
            "Tổng tín chỉ tối thiểu",
            "",
            "",
            m.before,
            m.after,
          ],
        ];
        if (value.title)
          rows.push([
            program.code,
            pair,
            "Tên chương trình",
            "",
            "Điều chỉnh",
            value.title.before,
            value.title.after,
          ]);
        for (const g of value.groups)
          rows.push([
            program.code,
            pair,
            "Nhóm",
            g.code,
            changes[g.change],
            groupText(g.before),
            groupText(g.after),
          ]);
        for (const s of value.subjects)
          rows.push([
            program.code,
            pair,
            "Học phần",
            (s.after || s.before).subjectCode,
            changes[s.change],
            subjectText(s.before),
            subjectText(s.after),
          ]);
        downloadCsv(
          `Lizz_Doi_chieu_${program.code}_${value.before.edition}_${value.after.edition}.csv`,
          [
            "Chương trình",
            "Cặp phiên bản",
            "Nội dung",
            "Mã",
            "Thay đổi",
            "Trước",
            "Sau",
          ],
          rows,
        );
      };
    } catch (error) {
      if (current === epoch && dialog.isConnected) {
        result.innerHTML = "";
        reportError(form, error);
      }
    } finally {
      button.disabled = false;
    }
  };
  form.requestSubmit();
}

export function openCurriculumBatch(program, data, refresh) {
  const candidates = data.students
    .filter((s) => {
      const c = data.classes.find((c) => c.id === s.classId);
      return c?.majorId === program.majorId && c?.cohortId === program.cohortId;
    })
    .sort((a, b) => a.code.localeCompare(b.code, "vi"));
  const classes = data.classes.filter((c) =>
    candidates.some((s) => s.classId === c.id),
  );
  const assigned = new Set(data.assignments.map((a) => a.studentId));
  const selected = new Set();
  const dialog = openEditor(
    "Áp dụng chương trình · " + program.code,
    `<p class="cp-meta">${esc(program.name)} · Phiên bản ${program.edition}</p><form id="cb-form">${errorBox()}<div class="form-grid"><label>Tìm sinh viên<input type="search" name="search" placeholder="Mã hoặc họ tên"></label>${select("Lớp hành chính", "classId", classes, "", { required: false })}</div><div class="cb-selection-toolbar"><span id="cb-count" role="status"></span><button type="button" id="cb-select-page">Chọn trang này</button><button type="button" id="cb-clear">Bỏ chọn tất cả</button></div><div id="cb-roster"></div><label>Căn cứ áp dụng<textarea name="reason" rows="3" maxlength="1000" required></textarea></label><p class="hint">Mỗi đợt tối đa 50 sinh viên chưa có chương trình. Đăng ký và điểm hiện có được giữ nguyên; đăng ký mới được đối chiếu chương trình đã áp dụng.</p><button type="submit" class="primary" id="cb-preview" disabled>Đối chiếu danh sách</button></form><section id="cb-review" hidden></section>`,
  );
  const form = dialog.querySelector("form"),
    roster = dialog.querySelector("#cb-roster"),
    review = dialog.querySelector("#cb-review");
  form.elements.classId.options[0].textContent = "Tất cả lớp";
  let page = 1,
    visible = [];
  function paint() {
    const q = foldText(form.elements.search.value);
    const filtered = candidates.filter(
      (s) =>
        (!form.elements.classId.value ||
          s.classId === form.elements.classId.value) &&
        foldText(s.code + " " + s.fullName).includes(q),
    );
    const pages = Math.max(1, Math.ceil(filtered.length / 20));
    page = Math.min(page, pages);
    visible = filtered.slice((page - 1) * 20, page * 20);
    const hiddenSelected =
      selected.size - filtered.filter((s) => selected.has(s.id)).length;
    dialog.querySelector("#cb-count").textContent =
      `${selected.size}/50 đã chọn · ${filtered.length} hồ sơ phù hợp${hiddenSelected ? ` · ${hiddenSelected} đã chọn nằm ngoài bộ lọc` : ""}`;
    dialog.querySelector("#cb-preview").disabled = !selected.size;
    dialog.querySelector("#cb-clear").disabled = !selected.size;
    dialog.querySelector("#cb-select-page").disabled = !visible.some(
      (s) => !assigned.has(s.id),
    );
    roster.innerHTML =
      table(
        ["Chọn", "Sinh viên", "Lớp", "Chương trình"],
        visible.map(
          (s) =>
            `<tr><td><input type="checkbox" data-student="${esc(s.id)}" aria-label="Chọn ${esc(s.code)}" ${selected.has(s.id) ? "checked" : ""} ${assigned.has(s.id) ? "disabled" : ""}></td><td><b>${esc(s.code)}</b><small>${esc(s.fullName)}</small></td><td>${esc(data.classes.find((c) => c.id === s.classId)?.name)}</td><td>${assigned.has(s.id) ? "Đã áp dụng" : "Chưa áp dụng"}</td></tr>`,
        ),
        "Không có sinh viên phù hợp bộ lọc.",
      ) +
      `<div class="pagination"><span>Trang ${page}/${pages}</span><button type="button" id="cb-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button type="button" id="cb-next" ${page >= pages ? "disabled" : ""}>Sau</button></div>`;
    accessibleScroll(roster);
    for (const c of roster.querySelectorAll("[data-student]"))
      c.onchange = () => {
        if (c.checked && selected.size >= 50) {
          c.checked = false;
          return reportError(
            form,
            Error(
              "Mỗi đợt tối đa 50 sinh viên. Bỏ bớt lựa chọn trước khi chọn thêm.",
            ),
          );
        }
        c.checked
          ? selected.add(c.dataset.student)
          : selected.delete(c.dataset.student);
        paint();
        roster.querySelector(`[data-student="${c.dataset.student}"]`)?.focus();
      };
    roster.querySelector("#cb-prev").onclick = () => {
      page--;
      paint();
    };
    roster.querySelector("#cb-next").onclick = () => {
      page++;
      paint();
    };
  }
  form.elements.search.oninput = () => {
    page = 1;
    paint();
  };
  form.elements.classId.onchange = () => {
    page = 1;
    paint();
  };
  dialog.querySelector("#cb-clear").onclick = () => {
    selected.clear();
    paint();
  };
  dialog.querySelector("#cb-select-page").onclick = () => {
    const ids = visible.filter((s) => !assigned.has(s.id)).map((s) => s.id),
      union = new Set([...selected, ...ids]);
    if (union.size > 50)
      return reportError(
        form,
        Error(
          "Chọn cả trang sẽ vượt 50 sinh viên. Hãy chọn riêng các hồ sơ cần áp dụng.",
        ),
      );
    for (const id of ids) selected.add(id);
    paint();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const body = {
        curriculumId: program.id,
        version: program.version,
        reason: form.elements.reason.value,
        students: candidates
          .filter((s) => selected.has(s.id))
          .map((s) => ({ studentId: s.id, studentVersion: s.version })),
      };
      const checked = await api("/curricula/assignment-batches/preview", {
        method: "POST",
        body,
      });
      if (!dialog.open || !dialog.isConnected) return;
      form.hidden = true;
      review.hidden = false;
      review.innerHTML = `${errorBox().replace('id="form-error"', 'id="cb-review-error"')}<h3>Đối chiếu trước khi áp dụng</h3><p><b>${esc(checked.program.code)} · Phiên bản ${checked.program.edition}</b><br>${esc(checked.program.majorName)} · ${esc(checked.program.cohortName)}</p><p class="cb-reason">Căn cứ: ${esc(checked.reason)}</p>${table(
        ["Sinh viên", "Lớp", "Kết quả đối chiếu"],
        checked.rows.map(
          (s) =>
            `<tr><td><b>${esc(s.studentCode || "Chưa xác định")}</b><small>${esc(s.studentName)}</small></td><td>${esc(s.className)}</td><td>${statuses[s.status]}</td></tr>`,
        ),
      )}<p class="cp-basis ${checked.canApply ? "" : "needs-review"}">${checked.eligibleCount}/${checked.rows.length} hồ sơ đủ điều kiện. ${checked.canApply ? "Xác nhận sẽ áp dụng cho toàn bộ danh sách này." : "Cần kiểm tra lại các hồ sơ chưa đủ điều kiện trước khi tiếp tục."}</p><div class="actions"><button type="button" id="cb-back">Quay lại danh sách</button><button type="button" id="cb-apply" class="primary" ${checked.canApply ? "" : "disabled"}>Xác nhận áp dụng ${checked.rows.length} sinh viên</button></div>`;
      accessibleScroll(review);
      startReview(dialog, review.querySelector("h3"));
      const applyBody = {
        ...body,
        previewHash: checked.previewHash,
        confirm: true,
        requestId: crypto.randomUUID(),
      };
      review.querySelector("#cb-back").onclick = () => {
        review.hidden = true;
        form.hidden = false;
        paint();
        startReview(dialog, dialog.querySelector(".dialog-header h2"));
      };
      review.querySelector("#cb-apply").onclick = async () => {
        for (const b of review.querySelectorAll("button")) b.disabled = true;
        try {
          const result = await api("/curricula/assignment-batches", {
            method: "POST",
            body: applyBody,
          });
          dialog.close();
          await refresh();
          notify(`Đã áp dụng chương trình cho ${result.count} sinh viên.`);
          const receipt = openEditor(
            "Kết quả áp dụng chương trình",
            `<p><b>${esc(result.program.code)} · Phiên bản ${result.program.edition}</b></p><p>Đã áp dụng cho ${result.count} sinh viên.</p>${table(
              ["Mã sinh viên", "Họ tên", "Lớp"],
              result.rows.map(
                (s) =>
                  `<tr><td>${esc(s.studentCode)}</td><td>${esc(s.studentName)}</td><td>${esc(s.className)}</td></tr>`,
              ),
            )}<div class="actions"><button id="cb-export">Xuất danh sách đã áp dụng</button></div>`,
          );
          accessibleScroll(receipt);
          receipt.querySelector("#cb-export").onclick = () =>
            downloadCsv(
              "Lizz_Ap_dung_" + result.program.code + ".csv",
              [
                "Mã đợt",
                "Chương trình",
                "Phiên bản",
                "Mã sinh viên",
                "Họ tên",
                "Lớp",
                "Căn cứ",
                "Thời điểm",
              ],
              result.rows.map((s) => [
                result.batchId,
                result.program.code,
                result.program.edition,
                s.studentCode,
                s.studentName,
                s.className,
                result.reason,
                new Date(result.createdAt).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                }),
              ]),
            );
        } catch (error) {
          reportError(review, error);
          for (const b of review.querySelectorAll("button")) b.disabled = false;
        }
      };
    } catch (error) {
      reportError(form, error);
    } finally {
      button.disabled = !selected.size;
    }
  };
  paint();
}
