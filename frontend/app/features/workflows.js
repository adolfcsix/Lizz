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
  notify,
} from "../components/ui.js";
const taskLabels = {
  NEW: "Mới giao",
  IN_PROGRESS: "Đang xử lý",
  WAITING: "Chờ phản hồi",
  COMPLETED: "Đã hoàn tất",
};
const approvalLabels = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt · Chưa áp dụng",
  REJECTED: "Từ chối",
  APPLIED: "Đã áp dụng",
};
export async function workflowsPage(container, actor, mode = "tasks") {
  const data = await api("/workflows");
  if (mode === "approvals") return approvalsPage(container, actor, data);
  container.innerHTML =
    heading(
      actor.role === "MANAGER" ? "Giao việc và điều phối" : "Công việc của tôi",
      actor.role === "MANAGER"
        ? '<button class="primary" id="new-task">Giao công việc</button>'
        : '<button class="primary" id="new-transfer">Lập hồ sơ chuyển lớp</button>',
    ) +
    `<section class="panel"><div class="toolbar"><label>Tìm công việc<input type="search" id="task-query" placeholder="Tên việc, người nhận…"></label><label>Trạng thái<select id="task-state"><option value="">Tất cả</option>${Object.entries(
      taskLabels,
    )
      .map(([k, v]) => `<option value="${k}">${v}</option>`)
      .join("")}</select></label></div><div id="tasks-table"></div></section>`;
  const paint = () => {
    const q = container
      .querySelector("#task-query")
      .value.toLocaleLowerCase("vi");
    const status = container.querySelector("#task-state").value;
    const rows = data.tasks.filter(
      (t) =>
        (!status || t.status === status) &&
        `${t.title} ${t.assigneeName}`.toLocaleLowerCase("vi").includes(q),
    );
    container.querySelector("#tasks-table").innerHTML = table(
      ["Công việc", "Người phụ trách", "Hạn", "Trạng thái", ""],
      rows.map(
        (t) =>
          `<tr><td><b>${esc(t.title)}</b><small>${esc(t.priority === "HIGH" ? "Ưu tiên cao" : "Thông thường")}</small></td><td>${esc(t.assigneeName)}</td><td class="date-cell">${esc(String(t.dueDate).slice(0, 10).split("-").reverse().join("/"))}</td><td><span class="badge">${taskLabels[t.status]}</span></td><td><button data-task="${t.id}">Xem và xử lý</button></td></tr>`,
      ),
    );
    for (const b of container.querySelectorAll("[data-task]"))
      b.onclick = () =>
        taskEditor(
          data.tasks.find((t) => t.id === b.dataset.task),
          data,
          actor,
          () => workflowsPage(container, actor),
        );
  };
  container.querySelector("#task-query").oninput = container.querySelector(
    "#task-state",
  ).onchange = paint;
  paint();
  container
    .querySelector("#new-task")
    ?.addEventListener("click", () =>
      taskEditor(null, data, actor, () => workflowsPage(container, actor)),
    );
  container
    .querySelector("#new-transfer")
    ?.addEventListener("click", () =>
      transferEditor(() => workflowsPage(container, actor, "approvals")),
    );
}
function taskEditor(row, data, actor, refresh) {
  const create = !row;
  const dialog = openEditor(
    create ? "Giao công việc" : row.title,
    `<form>${errorBox()}<div class="form-grid">${create ? field("Tên công việc", "title") : ""}${actor.role === "MANAGER" ? select("Người phụ trách", "assignedTo", data.staff, row?.assignedTo) : ""}${
      create
        ? field("Hạn xử lý", "dueDate", "date") +
          select(
            "Ưu tiên",
            "priority",
            [
              { id: "NORMAL", name: "Thông thường" },
              { id: "HIGH", name: "Cao" },
            ],
            "NORMAL",
          )
        : select(
            "Trạng thái",
            "status",
            Object.entries(taskLabels)
              .filter(([k]) => k !== "NEW")
              .map(([id, name]) => ({ id, name })),
            row.status === "NEW" ? "IN_PROGRESS" : row.status,
          )
    }</div><label>Ghi chú<textarea name="notes" maxlength="3000" rows="3">${esc(row?.notes || "")}</textarea></label>${!create && actor.role === "MANAGER" ? '<label>Lý do bàn giao (nếu đổi người)<input name="reason" maxlength="1000"></label>' : ""}<div class="dialog-actions"><button class="primary" type="submit">${create ? "Xác nhận giao việc" : "Lưu cập nhật"}</button></div></form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const input = Object.fromEntries(new FormData(form));
    if (row) {
      input.version = row.version;
      if (input.assignedTo === row.assignedTo) delete input.assignedTo;
    }
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await api("/workflows/tasks" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: input,
      });
      dialog.close();
      notify(create ? "Đã giao việc." : "Đã lưu tiến độ và lịch sử.");
      await refresh();
    } catch (e) {
      showError(form, e);
      button.disabled = false;
    }
  };
}
async function transferEditor(refresh) {
  const [{ rows }, catalog] = await Promise.all([
    api("/students?page=1"),
    api("/catalog"),
  ]);
  const dialog = openEditor(
    "Lập hồ sơ chuyển lớp",
    `<p>Chỉ gửi hồ sơ chờ quyết định. Chưa thay đổi lớp của sinh viên.</p><form>${errorBox()}<label>Tìm sinh viên<input id="transfer-search" type="search" placeholder="Gõ tên hoặc mã sinh viên"></label>${select(
      "Sinh viên",
      "studentId",
      rows.map((r) => ({ id: r.id, name: r.code + " · " + r.fullName })),
    )}${select("Lớp đề nghị", "classId", catalog.classes)}<label>Lý do và căn cứ<textarea name="reason" required maxlength="1000" rows="3"></textarea></label><button class="primary" type="submit">Gửi hồ sơ chờ phê duyệt</button></form>`,
  );
  let students = rows,
    timer,
    sequence = 0;
  const requestId = crypto.randomUUID();
  dialog.querySelector("#transfer-search").oninput = (event) => {
    clearTimeout(timer);
    const q = event.target.value;
    const current = ++sequence;
    timer = setTimeout(async () => {
      try {
        const result = await api("/students?q=" + encodeURIComponent(q));
        if (current !== sequence) return;
        students = result.rows;
        const selectEl = dialog.querySelector("[name=studentId]");
        selectEl.innerHTML =
          '<option value="">Chọn sinh viên</option>' +
          students
            .map(
              (r) =>
                `<option value="${r.id}">${esc(r.code + " · " + r.fullName)}</option>`,
            )
            .join("");
      } catch (e) {
        showError(dialog, e);
      }
    }, 200);
  };
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target,
      input = Object.fromEntries(new FormData(form));
    const student = students.find((r) => r.id === input.studentId);
    if (!student) return showError(form, new Error("Chọn hồ sơ sinh viên."));
    const source = catalog.classes.find((c) => c.id === student.classId),
      target = catalog.classes.find((c) => c.id === input.classId);
    if (
      !window.confirm(
        `Gửi hồ sơ ${student.code}\n${source?.code} → ${target?.code}\nChưa chuyển lớp cho tới khi được duyệt và xác nhận áp dụng.`,
      )
    )
      return;
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await api("/workflows/transfers", {
        method: "POST",
        body: { ...input, requestId, studentVersion: student.version },
      });
      dialog.close();
      notify("Đã gửi hồ sơ chờ phê duyệt. Chưa đổi lớp.");
      await refresh();
    } catch (e) {
      showError(form, e);
      button.disabled = false;
    }
  };
}
function approvalsPage(container, actor, data) {
  container.innerHTML =
    heading(
      actor.role === "MANAGER" ? "Hồ sơ chờ phê duyệt" : "Hồ sơ đã gửi duyệt",
      '<button id="new-transfer" class="primary">Lập hồ sơ chuyển lớp</button>',
    ) +
    '<section class="panel">' +
    table(
      ["Hồ sơ", "Người gửi", "Trạng thái", ""],
      data.approvals.map(
        (a) =>
          `<tr><td><b>${esc(a.title)}</b><small>${esc(a.id.slice(0, 8))} · Bản ${a.version}</small></td><td>${esc(a.requesterName)}</td><td><span class="badge">${approvalLabels[a.status]}</span></td><td><button data-approval="${a.id}">Xem hồ sơ</button></td></tr>`,
      ),
    ) +
    "</section>";
  container.querySelector("#new-transfer").onclick = () =>
    transferEditor(() => workflowsPage(container, actor, "approvals"));
  for (const button of container.querySelectorAll("[data-approval]"))
    button.onclick = () =>
      approvalEditor(
        data.approvals.find((a) => a.id === button.dataset.approval),
        actor,
        () => workflowsPage(container, actor, "approvals"),
      );
}
function approvalEditor(row, actor, refresh) {
  const canDecide =
    actor.role === "MANAGER" &&
    row.requestedBy !== actor.id &&
    row.status === "PENDING";
  const dialog = openEditor(
    row.title,
    `<p class="badge">${approvalLabels[row.status]}</p>${table(
      ["Thông tin", "Hiện tại", "Đề nghị"],
      row.preview.map(
        (p) =>
          `<tr><th>${esc(p.label)}</th><td>${esc(p.before)}</td><td>${esc(p.after)}</td></tr>`,
      ),
    )}<p><b>Lý do đề nghị:</b> ${esc(row.payload.reason)}</p>${row.decisionReason ? `<p><b>Quyết định:</b> ${esc(row.decisionReason)}</p>` : ""}${row.result ? `<p class="success-note">Đã cập nhật lớp của sinh viên theo quyết định đã duyệt.</p>` : ""}<form>${errorBox()}${canDecide ? '<label>Lý do quyết định<textarea name="reason" required maxlength="1000" rows="3"></textarea></label><div class="dialog-actions"><button type="submit" name="decision" value="REJECTED">Từ chối</button><button type="submit" name="decision" value="APPROVED" class="primary">Phê duyệt hồ sơ</button></div>' : row.status === "APPROVED" ? '<p>Hồ sơ sinh viên chưa thay đổi. Xác nhận để cập nhật lớp theo quyết định đã duyệt.</p><button class="primary" type="submit">Xác nhận áp dụng quyết định</button>' : row.status === "PENDING" ? "<p>Đang chờ người có thẩm quyền phê duyệt. Người đề nghị không tự duyệt hồ sơ của mình.</p>" : ""}</form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target;
    const buttons = form.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    try {
      if (canDecide)
        await api("/workflows/approvals/" + row.id + "/decide", {
          method: "POST",
          body: {
            version: row.version,
            decision: event.submitter.value,
            reason: form.elements.reason.value,
          },
        });
      else
        await api("/workflows/approvals/" + row.id + "/apply", {
          method: "POST",
          body: { version: row.version, confirm: true },
        });
      dialog.close();
      notify(canDecide ? "Đã lưu quyết định." : "Đã áp dụng và lưu lịch sử.");
      await refresh();
    } catch (e) {
      showError(form, e);
      buttons.forEach((b) => (b.disabled = false));
    }
  };
}
