import { studentStatusPage } from "./features/student-status.js";
import { notificationsPage } from "./features/notifications.js";
import { groupedNavigation } from "../../shared/navigation-groups.js";
import { navigation } from "../../shared/role-navigation.js";
import { profileRequestsPage } from "./features/profile-requests.js";
import { curriculumPage } from "./features/curriculum.js";
import { timetablePage } from "./features/timetable.js";
import { gradeReviewsPage } from "./features/grade-reviews.js";
import { attendancePage } from "./features/attendance.js";
import { financePage } from "./features/finance.js";
import { examsPage } from "./features/exams.js";
import { auditDetails } from "./components/audit-details.js";
import { policiesPage } from "./features/registration-policies.js";
import { gradesPage } from "./features/grades.js";
import { brand, brandSymbol } from "./components/brand.js";
import { workflowsPage } from "./features/workflows.js";
import { academicPage } from "./features/academic.js";
import { studentServicesPage } from "./features/student-services.js";
import {
  mountLizzChat,
  resetLizzChat,
  openLizzChat,
} from "./features/lizzchat.js";
import { api } from "./services/api.js";
import {
  loginPage,
  changePassword,
  passwordSetupPage,
} from "./features/auth.js";
import { accountsPage } from "./features/accounts.js";
import { catalogPage } from "./features/catalog.js";
import { studentsPage } from "./features/students.js";
import { ROLES } from "../../shared/local-validation.js";
import { escapeHtml as esc, heading, table, notify } from "./components/ui.js";

import { icon } from "./components/icons.js";
import { chatSession } from "./services/session-storage.js";

const app = document.querySelector("#app");
let actor = null;
let renderNumber = 0;

const routeLabel = (item) =>
  item.id === "curriculum" && actor.role === "STUDENT"
    ? "Chương trình của tôi"
    : item.id === "grade-reviews"
      ? {
          MANAGER: "Duyệt điều chỉnh điểm",
          STAFF: "Yêu cầu rà soát điểm",
          LECTURER: "Rà soát và phúc khảo",
          STUDENT: "Phúc khảo điểm",
        }[actor.role]
      : item.id === "tasks"
        ? actor.role === "MANAGER"
          ? "Giao việc và điều phối"
          : "Công việc của tôi"
        : item.id === "approvals"
          ? actor.role === "MANAGER"
            ? "Hồ sơ chờ phê duyệt"
            : "Hồ sơ đã gửi duyệt"
          : item.id === "schedule"
            ? actor.role === "STUDENT"
              ? "Lịch học"
              : actor.role === "LECTURER"
                ? "Lịch giảng dạy"
                : "Thời khóa biểu"
            : item.id === "grades"
              ? actor.role === "LECTURER"
                ? "Nhập điểm"
                : actor.role === "MANAGER"
                  ? "Điểm và công bố"
                  : "Kết quả học tập"
              : item.id === "students" && actor.role === "STUDENT"
                ? "Hồ sơ của tôi"
                : item.id === "academics"
                  ? actor.role === "STUDENT"
                    ? "Đăng ký học phần"
                    : actor.role === "LECTURER"
                      ? "Lớp giảng dạy"
                      : item.label
                  : item.label;

async function updateNotificationBadge() {
  const accountId = actor?.id,
    target = app.querySelector("#notification-count");
  if (!accountId || !target) return;
  try {
    const data = await api("/notifications");
    if (actor?.id !== accountId || !target.isConnected) return;
    target.textContent =
      data.unreadCount > 99 ? "99+" : String(data.unreadCount);
    target.hidden = !data.unreadCount;
    target.parentElement.setAttribute(
      "aria-label",
      `Thông báo, ${data.unreadCount} chưa đọc`,
    );
  } catch {
    if (target.isConnected)
      target.parentElement.setAttribute(
        "aria-label",
        "Thông báo, chưa tải được số chưa đọc",
      );
  }
}
window.addEventListener("lizz:notifications-changed", updateNotificationBadge);
async function showLogin() {
  renderNumber++;
  resetLizzChat();
  document.querySelector("#editor")?.close();
  const editor = document.querySelector("#editor");
  if (editor) editor.innerHTML = "";
  actor = null;
  history.replaceState(null, "", "/");
  loginPage(app, async (account) => {
    actor = account;
    if (!actor.mustChangePassword && actor.role === "STAFF")
      actor.access = await api("/access/me");
    await render();
  });
}

function syncMenu() {
  const sidebar = app.querySelector("#sidebar");
  const shell = app.querySelector(".app-shell");
  if (!sidebar || !shell) return;
  const mobile = matchMedia("(max-width:700px)").matches;
  const opened = shell.classList.contains("mobile-open");
  sidebar.inert = mobile && !opened;
  app.querySelector(".workspace").inert = mobile && opened;
  for (const toggle of sidebar.querySelectorAll(".nav-group-toggle")) {
    const links = document.getElementById(toggle.getAttribute("aria-controls"));
    links.hidden = !mobile && shell.classList.contains("collapsed") ? false : toggle.getAttribute("aria-expanded") !== "true";
  }
  const control = app.querySelector("#collapse");
  const expanded = mobile ? opened : !shell.classList.contains("collapsed");
  control.textContent = mobile ? "×" : expanded ? "‹" : "›";
  control.setAttribute("aria-expanded", String(expanded));
  control.setAttribute("aria-label", expanded ? "Thu gọn menu" : "Mở rộng menu");
}
window.addEventListener("resize", syncMenu);

async function render() {
  if (!actor) return showLogin();
  if (actor.mustChangePassword) {
    resetLizzChat();
    return passwordSetupPage(app, showLogin);
  }
  const current = ++renderNumber;
  mountLizzChat(actor, render);
  const pages = navigation.filter((item) => item.roles.includes(actor.role));
  const page =
    pages.find((item) => item.id === location.hash.slice(1)) || pages[0];
  app.innerHTML = `<div class="app-shell"><button class="menu-backdrop" id="menu-backdrop" aria-label="Đóng menu" tabindex="-1"></button>
    <aside id="sidebar"><div class="side-brand"><a class="brand" href="#home" aria-label="Lizz University">${brand({ light: true })}${brandSymbol()}</a><button id="collapse" class="collapse" aria-label="Thu gọn menu" aria-expanded="true">−</button></div>
    <p class="side-caption">${esc(ROLES[actor.role])}</p><nav aria-label="Chức năng chính">${groupedNavigation(pages.filter(item => item.id !== "notifications")).map(group => {
      const active = group.items.some(item => item.id === page.id);
      const opened = active || chatSession("get", `lizz:nav:${actor.id}:${group.id}`) === "open";
      const links = group.items.map(item => `<a href="#${item.id}" title="${esc(routeLabel(item))}" aria-label="${esc(routeLabel(item))}" ${item.id === page.id ? 'aria-current="page"' : ''}>${icon(item.id)}<span>${esc(routeLabel(item))}</span></a>`).join("");
      return group.items.length === 1 ? `<section class="nav-group nav-single">${links}</section>` : `<section class="nav-group"><button class="nav-group-toggle" type="button" aria-expanded="${opened}" aria-controls="nav-${group.id}" data-group="${group.id}"><span>${esc(group.label)}</span><i aria-hidden="true">⌄</i></button><div class="nav-group-links" id="nav-${group.id}" ${opened ? '' : 'hidden'}>${links}</div></section>`;
    }).join("")}</nav>
    <div class="side-footer"><b>${esc(actor.fullName)}</b><span>${esc(ROLES[actor.role])}</span></div></aside>
    <div class="workspace"><header class="topbar"><button id="mobile-menu" aria-controls="sidebar" aria-expanded="false" aria-label="Mở menu">${icon("menu")}</button><span class="breadcrumb">${esc(ROLES[actor.role])} / ${esc(routeLabel(page))}</span><div class="topbar-account"><a class="notification-shortcut" href="#notifications" aria-label="Thông báo">${icon("notifications")}<span id="notification-count" hidden></span></a><span class="actor-initial" aria-hidden="true">${esc(
      actor.fullName
        .trim()
        .split(/\s+/)
        .slice(-2)
        .map((n) => n[0])
        .join(""),
    )}</span><details><summary>${esc(actor.fullName)}</summary><div class="account-menu"><a href="#profile">Tài khoản của tôi</a><button id="logout">Đăng xuất</button></div></details></div></header>
    <main id="content" tabindex="-1"><p class="loading">Đang tải dữ liệu…</p></main></div></div>`;
  const content = app.querySelector("#content");
  const sidebar = app.querySelector("#sidebar");
  const shell = app.querySelector(".app-shell");
  const menuKey = `lizz:menu:${actor.id}`;
  const collapseButton = app.querySelector("#collapse");
  const restoreCollapsed = chatSession("get", menuKey) === "collapsed";
  shell.classList.toggle("collapsed", restoreCollapsed);
  collapseButton.setAttribute("aria-expanded", String(!restoreCollapsed));
  collapseButton.setAttribute("aria-label", restoreCollapsed ? "Mở rộng menu" : "Thu gọn menu");
  for (const toggle of sidebar.querySelectorAll(".nav-group-toggle")) {
    toggle.onclick = () => {
      const open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      document.getElementById(toggle.getAttribute("aria-controls")).hidden = !open;
      chatSession("set", `lizz:nav:${actor.id}:${toggle.dataset.group}`, open ? "open" : "closed");
    };
  }
  updateNotificationBadge();
  app.querySelector("#logout").onclick = async () => {
    try {
      await api("/auth/logout", { method: "POST", body: {} });
      await showLogin();
    } catch (error) {
      notify(error.message);
    }
  };

  const closeMenu = () => {
    app.querySelector(".app-shell").classList.remove("mobile-open");
    app.querySelector("#mobile-menu").setAttribute("aria-expanded", "false");
    syncMenu();
    app.querySelector("#mobile-menu").focus();
  };
  app.querySelector("#menu-backdrop").onclick = closeMenu;
  app.querySelector("#sidebar").onkeydown = (event) => {
    if (event.key === "Escape") closeMenu();
    if (event.key === "Tab" && shell.classList.contains("mobile-open") && matchMedia("(max-width:700px)").matches) {
      const controls = [...sidebar.querySelectorAll('a[href], button:not(:disabled)')].filter(element => !element.closest('[hidden]'));
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  };
  app.querySelector("#collapse").onclick = (event) => {
    if (matchMedia("(max-width:700px)").matches) return closeMenu();
    const collapsed = app
      .querySelector(".app-shell")
      .classList.toggle("collapsed");
    chatSession("set", menuKey, collapsed ? "collapsed" : "expanded");
    event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
    event.currentTarget.setAttribute(
      "aria-label",
      collapsed ? "Mở rộng menu" : "Thu gọn menu",
    );
  };
  app.querySelector("#mobile-menu").onclick = (event) => {
    const opened = app
      .querySelector(".app-shell")
      .classList.toggle("mobile-open");
    event.currentTarget.setAttribute("aria-expanded", String(opened));
    syncMenu();
    if (opened) app.querySelector("#collapse").focus();
  };
  syncMenu();
  try {
    if (page.id === "student-services") await studentServicesPage(content, actor);
    else if (page.id === "student-status") await studentStatusPage(content, actor);
    else if (page.id === "notifications")
      await notificationsPage(content, actor);
    else if (page.id === "profile-requests")
      await profileRequestsPage(content, actor);
    else if (page.id === "curriculum") await curriculumPage(content, actor);
    else if (page.id === "grade-reviews")
      await gradeReviewsPage(content, actor);
    else if (page.id === "attendance") await attendancePage(content, actor);
    else if (page.id === "finance") await financePage(content, actor);
    else if (page.id === "exams") await examsPage(content, actor);
    else if (page.id === "tasks" || page.id === "approvals")
      await workflowsPage(content, actor, page.id);
    else if (page.id === "policies") await policiesPage(content, actor);
    else if (page.id === "grades") await gradesPage(content, actor);
    else if (page.id === "schedule") await timetablePage(content, actor);
    else if (page.id === "profile") await profilePage(content);
    else if (page.id === "accounts") await accountsPage(content, actor);
    else if (page.id === "academics") await academicPage(content, actor);
    else if (page.id === "catalog") await catalogPage(content, actor);
    else if (page.id === "students") await studentsPage(content, actor);
    else if (page.id === "audit") await auditPage(content);
    else await homePage(content);
  } catch (error) {
    if (current !== renderNumber) return;
    if (error.status === 401) return showLogin();
    content.innerHTML =
      heading("Chưa tải được dữ liệu", "", error.message) +
      '<button id="retry">Thử lại</button>';
    content.querySelector("#retry").onclick = render;
  }
}

async function homePage(container) {
  const manager = ["MANAGER", "STAFF"].includes(actor.role);
  const [catalog, academic, work] = await Promise.all([
    api("/catalog"),
    api("/academics"),
    manager ? api("/workflows") : Promise.resolve(null),
  ]);
  const active = academic.sections.filter(
    (r) => r.registration?.status === "ACTIVE",
  );
  const stats = manager
    ? [
        [
          "Công việc chưa hoàn tất",
          work.tasks.filter((t) => t.status !== "COMPLETED").length,
        ],
        [
          "Hồ sơ chờ duyệt",
          work.approvals.filter((t) => t.status === "PENDING").length,
        ],
        ["Lớp học phần", academic.sections.length],
        ["Lớp hành chính", catalog.classes.length],
      ]
    : actor.role === "LECTURER"
      ? [
          ["Lớp phụ trách", academic.sections.length],
          [
            "Lượt sinh viên đăng ký",
            academic.sections.reduce((n, r) => n + r.enrolled, 0),
          ],
          [
            "Môn học phụ trách",
            new Set(academic.sections.map((r) => r.subjectId)).size,
          ],
        ]
      : [
          ["Lớp đã đăng ký", active.length],
          ["Tín chỉ đăng ký", active.reduce((n, r) => n + r.credits, 0)],
          [
            "Lớp còn chỗ",
            academic.sections.filter(
              (r) => r.status === "OPEN" && r.available > 0,
            ).length,
          ],
        ];
  container.innerHTML =
    heading(
      actor.role === "MANAGER"
        ? "Tổng quan điều hành"
        : actor.role === "STAFF"
          ? "Công việc của tôi"
          : actor.role === "LECTURER"
            ? "Tổng quan giảng dạy"
            : "Tổng quan học tập",
      "",
    ) +
    `<section class="academic-hero"><div><p class="eyebrow">KHÔNG GIAN ĐẠI HỌC</p><h2>Chào ${esc(actor.fullName)}.</h2><p>${manager ? "Theo dõi công việc và xử lý hồ sơ với trách nhiệm rõ ràng." : actor.role === "LECTURER" ? "Lịch giảng dạy và các lớp được phân công trong tầm tay." : "Thông tin học tập và lịch học của bạn."}</p></div></section><div class="stat-grid">${stats.map(([label, value]) => `<article><span>${esc(label)}</span><strong>${value}</strong></article>`).join("")}</div>`;
  if (manager) {
    container.innerHTML +=
      '<section class="panel dashboard-table"><div class="section-heading"><h2>Công việc cần theo dõi</h2><a href="#tasks">Xem tất cả</a></div>' +
      table(
        ["Công việc", "Người phụ trách", "Hạn xử lý", "Trạng thái"],
        work.tasks
          .filter((t) => t.status !== "COMPLETED")
          .slice(0, 5)
          .map(
            (t) =>
              `<tr><td><a href="#tasks">${esc(t.title)}</a></td><td>${esc(t.assigneeName)}</td><td>${esc(String(t.dueDate).slice(0, 10))}</td><td><span class="badge">${esc({ NEW: "Mới giao", IN_PROGRESS: "Đang xử lý", WAITING: "Chờ phản hồi" }[t.status])}</span></td></tr>`,
          ),
      ) +
      "</section>";
  } else {
    const sections = actor.role === "STUDENT" ? active : academic.sections;
    container.innerHTML +=
      '<section class="panel dashboard-table"><div class="section-heading"><h2>' +
      (actor.role === "LECTURER" ? "Lớp được phân công" : "Lớp đã đăng ký") +
      '</h2><a href="#schedule">Xem lịch</a></div>' +
      table(
        ["Học phần", "Lớp", "Lịch hằng tuần", "Sĩ số"],
        sections
          .slice(0, 5)
          .map(
            (r) =>
              `<tr><td>${esc(r.subjectName)}</td><td>${esc(r.code)}</td><td>${esc(r.scheduleSummary)}</td><td>${r.enrolled} / ${r.capacity}</td></tr>`,
          ),
      ) +
      "</section>";
  }
  const shortcuts = manager
    ? [
        [
          "students",
          "Hồ sơ sinh viên",
          "Liên kết tài khoản và nhập danh sách.",
        ],
        ["catalog", "Tổ chức đào tạo", "Khóa, khoa, ngành và lớp hành chính."],
        ["academics", "Môn học và lớp học phần", "Phân công, lịch và sĩ số."],
      ]
    : [
        [
          "academics",
          actor.role === "STUDENT" ? "Đăng ký học phần" : "Lớp giảng dạy",
          actor.role === "STUDENT"
            ? "Chọn lớp và theo dõi đăng ký."
            : "Danh sách lớp và sinh viên phụ trách.",
        ],
        [
          "profile",
          "Tài khoản cá nhân",
          "Thông tin tài khoản và đổi mật khẩu.",
        ],
      ];
  container.innerHTML +=
    '<div class="quick-links">' +
    shortcuts
      .map(
        ([id, title, note]) =>
          `<a href="#${id}">${icon(id)}<span><b>${title}</b><small>${note}</small></span></a>`,
      )
      .join("") +
    "</div>";
}
async function profilePage(container) {
  const { account } = await api("/auth/me");
  container.innerHTML =
    heading("Tài khoản của tôi", "") +
    `<section class="panel profile-card"><dl><div><dt>Họ và tên</dt><dd>${esc(account.fullName)}</dd></div><div><dt>Email trường</dt><dd>${esc(account.email)}</dd></div><div><dt>Tên đăng nhập</dt><dd>${esc(account.username)}</dd></div><div><dt>Vai trò</dt><dd>${esc(ROLES[account.role])}</dd></div>${actor.role === "STAFF" ? `<div><dt>Phạm vi công việc</dt><dd>${esc(actor.access?.allSchools ? "Toàn trường" : actor.access?.scopes?.map((s) => s.facultyName + " · " + (s.cohortName || "Tất cả khóa")).join("; ") || "Chưa được giao dữ liệu nghiệp vụ")}</dd></div>` : ""}</dl><button id="password" class="primary">Đổi mật khẩu</button></section>`;
  container.querySelector("#password").onclick = () =>
    changePassword(showLogin);
}

async function auditPage(container) {
  const { rows } = await api("/audit");
  const labels = {
    CHARGE_CREATED: "Lập khoản thu",
    CHARGE_UPDATED: "Sửa khoản thu",
    CHARGE_ISSUED: "Phát hành khoản thu",
    CHARGE_CANCELLED: "Hủy khoản thu",
    CHARGE_ADJUSTED: "Điều chỉnh khoản thu",
    RECEIPT_REPORTED: "Gửi thông tin thu",
    RECEIPT_CONFIRM: "Xác nhận thu",
    RECEIPT_REJECT: "Không chấp nhận phiếu thu",
    RECEIPT_REVERSE: "Hủy xác nhận thu",
    RECEIPT_REOPEN: "Mở lại phiếu thu",
    ATTENDANCE_POLICY_SAVED: "Thiết lập điều kiện dự thi",
    ATTENDANCE_SESSION_CREATED: "Mở buổi điểm danh",
    ATTENDANCE_SAVED: "Ghi điểm danh",
    ATTENDANCE_SYNC: "Đồng bộ danh sách điểm danh",
    ATTENDANCE_CLOSE: "Chốt buổi điểm danh",
    ATTENDANCE_REOPEN: "Mở lại buổi điểm danh",
    ROOM_CREATED: "Thêm phòng thi",
    ROOM_UPDATED: "Sửa phòng thi",
    EXAM_CREATED: "Lập lịch thi",
    EXAM_UPDATED: "Sửa lịch thi",
    EXAM_PUBLISHED: "Công bố lịch thi",
    EXAM_CANCELLED: "Hủy lịch thi",
    TERM_CREATED: "Thêm học kỳ",
    TERM_UPDATED: "Điều chỉnh quy định học kỳ",
    PERIOD_CREATED: "Mở đợt đăng ký",
    PERIOD_UPDATED: "Điều chỉnh đợt đăng ký",
    REQUIREMENT_CREATED: "Thêm môn tiên quyết",
    REQUIREMENT_UPDATED: "Điều chỉnh tiên quyết",
    GRADES_SAVED: "Lưu điểm nháp",
    GRADES_SUBMITTED: "Gửi bảng điểm",
    GRADES_RETURNED: "Trả lại bảng điểm",
    STAFF_SCOPES_CHANGED: "Thay phạm vi công việc Nhân viên",
    ACCOUNT_AFFILIATION_CHANGED: "Phân đơn vị phụ trách tài khoản",
    TIMETABLE_SAVED: "Cập nhật thời khóa biểu",
    GRADE_REVIEW_PERIOD_SAVED: "Thiết lập đợt phúc khảo",
    GRADE_REVIEW_REQUESTED: "Lập yêu cầu rà soát điểm",
    GRADE_REVIEW_PROPOSED: "Gửi đề xuất kết quả rà soát",
    GRADE_REVIEW_APPROVE: "Phê duyệt đề xuất điểm",
    GRADE_REVIEW_APPLY: "Áp dụng kết quả rà soát",
    GRADE_REVIEW_RETURN: "Trả lại yêu cầu rà soát",
    GRADE_REVIEW_REJECT: "Không chấp nhận yêu cầu rà soát",
    GRADE_REVIEW_CANCEL: "Rút yêu cầu rà soát",
    GRADE_SCHEME_SAVED: "Lưu cấu hình điểm thành phần",
    GPA_POLICY_SAVED: "Lưu quy định quy đổi GPA",
    GRADES_PUBLISHED: "Công bố bảng điểm",
    TASK_CREATED: "Giao công việc",
    TASK_UPDATED: "Cập nhật công việc",
    TASK_REASSIGNED: "Bàn giao công việc",
    APPROVAL_SUBMITTED: "Gửi hồ sơ phê duyệt",
    APPROVAL_DECIDED: "Quyết định hồ sơ",
    APPROVAL_APPLIED: "Áp dụng quyết định",
    ACCOUNT_CREATED: "Cấp tài khoản",
    ACCOUNT_ENABLED: "Mở khóa tài khoản",
    ACCOUNT_DISABLED: "Khóa tài khoản",
    CATALOG_CREATED: "Thêm danh mục",
    CATALOG_UPDATED: "Sửa danh mục",
    STUDENT_CREATED: "Thêm hồ sơ sinh viên",
    STUDENT_UPDATED: "Sửa hồ sơ sinh viên",
    SUBJECT_CREATED: "Thêm môn học",
    SUBJECT_UPDATED: "Sửa môn học",
    SECTION_CREATED: "Mở lớp học phần",
    SECTION_UPDATED: "Sửa lớp học phần",
    CREDIT_RECOGNITION_PENDING: "Đề nghị công nhận học phần",
    SERVICE_DEFINITION_SAVED: "Lưu nháp thủ tục sinh viên",
    SERVICE_DEFINITION_PUBLISH: "Công bố thủ tục sinh viên",
    SERVICE_DEFINITION_CLOSE: "Đóng nhận hồ sơ thủ tục",
    STUDENT_SERVICE_DRAFT: "Lưu nháp hồ sơ thủ tục",
    STUDENT_SERVICE_SUBMITTED: "Gửi hồ sơ thủ tục",
    STUDENT_SERVICE_IN_PROGRESS: "Tiếp nhận hồ sơ thủ tục",
    STUDENT_SERVICE_NEEDS_INFO: "Yêu cầu bổ sung thủ tục",
    STUDENT_SERVICE_READY: "Ghi nhận kết quả thủ tục",
    STUDENT_SERVICE_DELIVERED: "Xác nhận trả kết quả thủ tục",
    STUDENT_SERVICE_REJECTED: "Từ chối hồ sơ thủ tục",
    STUDENT_SERVICE_CANCELLED: "Hủy hồ sơ thủ tục",
    STUDENT_SERVICE_REASSIGNED: "Đổi người phụ trách thủ tục",
    STUDENT_SERVICE_FINANCE_LINKED: "Cập nhật liên kết khoản thu thủ tục",
    CREDIT_RECOGNITION_APPROVED: "Phê duyệt công nhận học phần",
    CREDIT_RECOGNITION_APPLIED: "Áp dụng công nhận học phần",
    CREDIT_RECOGNITION_REVOKED: "Thu hồi công nhận học phần",
    CREDIT_RECOGNITION_REJECTED: "Từ chối công nhận học phần",
    CREDIT_RECOGNITION_CANCELLED: "Hủy đề nghị công nhận học phần",
    EXAM_REPORT_SAVE: "Lưu nháp biên bản thi",
    EXAM_REPORT_SUBMIT: "Gửi biên bản thi",
    EXAM_REPORT_CONFIRM: "Xác nhận biên bản thi",
    EXAM_REPORT_RETURN: "Trả bổ sung biên bản thi",
    EXAM_REPORT_REOPEN: "Mở lại biên bản thi",
    EXAM_SEATING_CONFIRMED: "Lập số báo danh và chỗ ngồi",
    ACCOUNT_PASSWORD_RESET: "Cấp lại mật khẩu",
    ACCOUNT_PASSWORD_CHANGED: "Đổi mật khẩu",
    COURSE_REGISTERED: "Đăng ký học phần",
    COURSE_WITHDRAWN: "Rút đăng ký",
    LIZZCHAT_CONFIRMED: "Thực hiện qua LizzChat",
  };
  container.innerHTML =
    heading("Lịch sử thao tác", "") +
    '<section class="panel">' +
    table(
      ["Thao tác", "Thông tin", "Đối chiếu"],
      rows.map(
        (row) =>
          /* HTML */ `<tr>
            <td>${esc(labels[row.action] || row.action)}</td>
            <td>
              ${esc(
                row.detail.username ||
                  row.detail.code ||
                  row.detail.after?.name ||
                  row.detail.after?.code ||
                  (row.detail.rows
                    ? row.detail.rows.length + " kết quả"
                    : "") ||
                  "",
              )}
            </td>
            <td>
              <details>
                <summary>Xem thay đổi</summary>
                ${auditDetails(row.detail)}
              </details>
            </td>
          </tr>`,
      ),
    ) +
    "</section>";
}

window.addEventListener("hashchange", render);
window.addEventListener("lizz:session-expired", () => {
  if (actor) showLogin();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    app.querySelector(".app-shell")?.classList.remove("mobile-open");
    app.querySelector("#mobile-menu")?.setAttribute("aria-expanded", "false");
    syncMenu();
  }
});
try {
  await api("/health");
  try {
    actor = (await api("/auth/me")).account;
    if (!actor.mustChangePassword && actor.role === "STAFF")
      actor.access = await api("/access/me");
  } catch (error) {
    if (error.status !== 401) throw error;
  }
  await render();
} catch (error) {
  app.innerHTML = /* HTML */ `<main class="startup-error">
    <h1>Cổng thông tin tạm thời gián đoạn</h1>
    <p>
      Chưa thể tải cổng thông tin. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ
      trợ nếu tình trạng này tiếp diễn.
    </p>
    <button id="reload-app" class="primary">Tải lại trang</button>
  </main>`;
  app.querySelector("#reload-app").onclick = () => location.reload();
}
