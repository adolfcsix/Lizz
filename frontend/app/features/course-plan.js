import { COURSE_PROGRESS, filterCoursePlan } from "../../../shared/course-plan.js";
import { escapeHtml as esc, table, openEditor } from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";

const options = (rows) => rows.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("");
const control = (id, label, empty, rows) => `<label>${label}<select id="${id}"><option value="">${empty}</option>${options(rows)}</select></label>`;
const kind = (r) => r.kind === "REQUIRED" ? "Bắt buộc" : "Tự chọn";
function groups(plan) {
  return [...new Map(plan.courses.map((r) => [r.groupCode, `${r.groupCode} · ${r.groupName}`]))];
}
function semesters(plan) {
  return [...new Set(plan.courses.map((r) => r.semester))].sort((a, b) => a - b).map((s) => [String(s), String(s)]);
}
export function coursePlanControls(plan) {
  if (!plan.curriculum)
    return `<p class="inline-note">${esc(plan.note)}</p>`;
  return `<div class="toolbar">${control("plan-scope", "Chương trình", "Tất cả lớp", [["CURRICULUM", "Trong chương trình của tôi"]])}${control("plan-group", "Nhóm học phần", "Tất cả nhóm", groups(plan))}${control("plan-semester", "Học kỳ dự kiến", "Tất cả", semesters(plan))}${control("plan-progress", "Tiến độ", "Tất cả", [["NEEDS_STUDY", "Cần học tiếp"], ...Object.entries(COURSE_PROGRESS)])}</div><p class="hint">${esc(plan.curriculum.code)} · Phiên bản ${plan.curriculum.edition} · ${plan.remainingCredits === null ? "Tín chỉ còn thiếu cần đối chiếu" : `Còn ${plan.remainingCredits} tín chỉ theo yêu cầu nhóm`}${plan.status !== "VERIFIED" ? ` · ${esc(plan.note)}` : ""}</p><div class="actions"><button id="plan-open">Xem kế hoạch học phần</button><span id="plan-subject" role="status"></span><button id="plan-clear" hidden>Bỏ chọn môn</button></div>`;
}
export function readCourseFilters(root) {
  return {
    curriculum: Boolean(root.querySelector("#plan-scope")?.value),
    group: root.querySelector("#plan-group")?.value || "",
    semester: root.querySelector("#plan-semester")?.value || "",
    progress: root.querySelector("#plan-progress")?.value || "",
    available: root.querySelector("#plan-available")?.checked || false,
  };
}
export function bindCoursePlan(root, data, change, choose) {
  for (const id of ["plan-scope", "plan-group", "plan-semester", "plan-progress", "plan-available"])
    root.querySelector("#" + id)?.addEventListener("change", change);
  root.querySelector("#plan-open")?.addEventListener("click", () => openPlan(data, choose, root.querySelector("#academic-term").value));
}
function openPlan(data, choose, term) {
  const plan = data.coursePlan;
  const dialog = openEditor("Kế hoạch học phần", `<p>${esc(plan.curriculum.name)} · Phiên bản ${plan.curriculum.edition}</p><p class="hint">Đối chiếu lúc ${esc(formatVietnamTime(plan.asOf))}. Tự chọn theo tín chỉ còn thiếu của nhóm; các môn chưa chọn không phải tất cả đều bắt buộc. Số lớp mở còn chỗ chưa xác nhận điều kiện đăng ký.</p><div class="toolbar"><label>Tìm học phần<input id="cp-query" type="search" placeholder="Mã hoặc tên học phần"></label>${control("cp-group", "Nhóm", "Tất cả nhóm", groups(plan))}${control("cp-semester", "Học kỳ dự kiến", "Tất cả", semesters(plan))}${control("cp-progress", "Tiến độ", "Tất cả", [["NEEDS_STUDY", "Cần học tiếp"], ...Object.entries(COURSE_PROGRESS)])}</div><p>${esc(term ? "Lớp học phần trong học kỳ " + term : "Lớp học phần ở tất cả học kỳ")}</p><p id="cp-count" role="status"></p><div id="cp-table"></div><div class="actions"><button id="cp-export">Xuất danh sách CSV</button></div>`);
  if (plan.status !== "VERIFIED")
    dialog.querySelector(".hint").insertAdjacentHTML("afterend", `<p class="inline-note">${esc(plan.note)} Các học phần cần học tiếp dưới đây là thông tin để đối chiếu.</p>`);
  dialog.querySelector("#cp-progress").value = "NEEDS_STUDY";
  let filtered = [], page = 1;
  const sections = data.sections.filter((s) => !term || s.term === term);
  const offered = (r) => sections.filter((s) => s.subjectId === r.subjectId);
  const open = (r) => offered(r).filter((s) => s.status === "OPEN" && s.available > 0 && s.registration?.status !== "ACTIVE").length;
  const label = (r) => (COURSE_PROGRESS[r.status] || "Cần đối chiếu") + (r.kind === "ELECTIVE" && r.groupRemainingCredits === 0 ? " · Nhóm đã đủ tín chỉ" : "");
  function paint() {
    filtered = filterCoursePlan(plan.courses, {
      q: dialog.querySelector("#cp-query").value,
      group: dialog.querySelector("#cp-group").value,
      semester: dialog.querySelector("#cp-semester").value,
      progress: dialog.querySelector("#cp-progress").value,
    });
    const max = Math.max(1, Math.ceil(filtered.length / 10));
    page = Math.min(page, max);
    dialog.querySelector("#cp-count").textContent = `${filtered.length} học phần phù hợp`;
    const target = dialog.querySelector("#cp-table");
    target.innerHTML = table(["Học phần", "Nhóm và kỳ dự kiến", "Tiến độ", "Lớp học phần"], filtered.slice((page - 1) * 10, page * 10).map((r) => `<tr><td><b>${esc(r.subjectCode)}</b><small>${esc(r.subjectName)} · ${r.credits} tín chỉ</small></td><td>${esc(r.groupName)}<small>${kind(r)} · Kỳ ${r.semester}</small></td><td>${esc(label(r))}</td><td>${offered(r).length ? `<span>${open(r)} lớp mở còn chỗ</span><button data-plan-subject="${esc(r.subjectId)}">Xem lớp</button>` : "Chưa có lớp trong học kỳ đã chọn"}</td></tr>`), "Không có học phần phù hợp với bộ lọc.") + `<div class="pagination"><span>Trang ${page}/${max}</span><button id="cp-prev" ${page <= 1 ? "disabled" : ""}>Trước</button><button id="cp-next" ${page >= max ? "disabled" : ""}>Sau</button></div>`;
    const scroll = target.querySelector(".table-scroll");
    if (scroll) { scroll.tabIndex = 0; scroll.setAttribute("role", "region"); scroll.setAttribute("aria-label", "Kế hoạch học phần"); }
    target.querySelector("#cp-prev").onclick = () => { page--; paint(); };
    target.querySelector("#cp-next").onclick = () => { page++; paint(); };
    for (const button of target.querySelectorAll("[data-plan-subject]"))
      button.onclick = () => { choose(plan.courses.find((r) => r.subjectId === button.dataset.planSubject)); dialog.close(); };
  }
  for (const input of dialog.querySelectorAll("input, select"))
    input.addEventListener(input.tagName === "INPUT" ? "input" : "change", () => { page = 1; paint(); });
  dialog.querySelector("#cp-export").onclick = () => downloadCsv("LIZZ_KE_HOACH_HOC_PHAN.csv", ["Chương trình", "Phiên bản", "Học kỳ lọc lớp", "Mã học phần", "Tên học phần", "Tín chỉ", "Nhóm", "Loại", "Kỳ dự kiến", "Tiến độ", "Tín chỉ nhóm còn thiếu", "Lớp mở còn chỗ", "Thời điểm đối chiếu", "Căn cứ tiến độ", "Ghi chú"], filtered.map((r) => [plan.curriculum.code, plan.curriculum.edition, term || "Tất cả", r.subjectCode, r.subjectName, r.credits, r.groupName, kind(r), r.semester, label(r), r.groupRemainingCredits, open(r), formatVietnamTime(plan.asOf), plan.status === "VERIFIED" ? "Đủ căn cứ tiến độ" : "Cần đối chiếu", plan.note]));
  paint();
}
