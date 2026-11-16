import { api } from "../services/api.js";
import {
  heading,
  table,
  escapeHtml as esc,
  select,
  openEditor,
  errorBox,
  showError,
  confirmAction,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { foldText } from "../../../shared/local-validation.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";
import {
  STUDY_STATES,
  STATUS_REQUEST_KINDS,
  STATUS_REQUEST_STATES,
  statusRequestActions,
  STATUS_ACTION_LABELS,
} from "../../../shared/student-status.js";
const appliedTime = (r) =>
  r.result?.appliedAt ? formatVietnamTime(r.result.appliedAt) : "Chưa áp dụng";
function tables(root) {
  for (const e of root.querySelectorAll(".table-scroll")) {
    e.tabIndex = 0;
    e.setAttribute("role", "region");
    e.setAttribute("aria-label", "Hồ sơ bảo lưu và quay lại học");
  }
}
function previewMarkup(p) {
  return `<section class="study-review"><h3>${esc(p.student.code)} · ${esc(p.student.fullName)}</h3><p><b>${STUDY_STATES[p.before]} → ${STUDY_STATES[p.after]}</b> · Học kỳ ${esc(p.term.code)}</p><p>${esc(p.note)}</p><p>${p.registrations.length} lớp đăng ký đang hiệu lực được giữ nguyên.</p>${
    p.registrations.length
      ? table(
          ["Lớp học phần", "Học kỳ"],
          p.registrations.map(
            (r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.term)}</td></tr>`,
          ),
        )
      : ""
  }</section>`;
}
export async function studentStatusPage(container, actor) {
  let data,
    page = 1,
    q = "",
    state = "";
  const size = 10;
  async function refresh() {
    const next = await api("/student-status");
    if (!container.isConnected) return;
    data = next;
    paint();
  }
  function paint() {
    const rows = data.rows.filter(
      (r) =>
        (!state || r.status === state) &&
        foldText(
          r.preview.student.code + " " + r.preview.student.fullName,
        ).includes(foldText(q)),
    );
    page = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
    const mine = actor.role === "STUDENT" ? data.students[0] : null;
    container.innerHTML =
      heading(
        "Bảo lưu và quay lại học",
        '<button id="ss-new" class="primary">Lập yêu cầu</button>',
      ) +
      (mine
        ? `<section class="panel study-state-card"><h2>${mine.hasDecision ? STUDY_STATES[mine.state] : "Chưa có quyết định bảo lưu"}</h2><p class="hint">${mine.hasDecision ? "Theo quyết định đã áp dụng lúc " + esc(formatVietnamTime(mine.appliedAt)) : "Chưa có quyết định bảo lưu trong hệ thống; giữ quyền đăng ký hiện có."}</p></section>`
        : "") +
      `<section class="panel"><p class="panel-copy">${esc(data.note)}</p><div class="toolbar"><label>Tìm hồ sơ<input id="ss-query" type="search" value="${esc(q)}" placeholder="Mã hoặc tên sinh viên"></label><label>Trạng thái<select id="ss-state"><option value="">Tất cả</option>${Object.entries(
        STATUS_REQUEST_STATES,
      )
        .map(
          ([id, label]) =>
            `<option value="${id}" ${state === id ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><button id="ss-export">Xuất danh sách CSV</button></div>${table(
        ["Sinh viên", "Yêu cầu / học kỳ", "Trạng thái", ""],
        rows
          .slice((page - 1) * size, page * size)
          .map(
            (r) =>
              `<tr><td><b>${esc(r.preview.student.code)}</b><small>${esc(r.preview.student.fullName)}</small></td><td>${STATUS_REQUEST_KINDS[r.kind]}<small>${esc(r.preview.term.code)}</small></td><td><span class="badge">${STATUS_REQUEST_STATES[r.status]}</span>${r.result?.appliedAt ? `<small>${esc(appliedTime(r))}</small>` : ""}</td><td><button data-ss="${esc(r.id)}">Xem hồ sơ</button></td></tr>`,
          ),
        "Chưa có yêu cầu phù hợp.",
      )}<div class="pagination"><span>Trang ${page}/${Math.ceil(rows.length / size) || 1} · ${rows.length} hồ sơ</span><button id="ss-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="ss-next" ${page * size >= rows.length ? "disabled" : ""}>Sau</button></div></section>`;
    tables(container);
    container.querySelector("#ss-new").disabled =
      !data.students.length || !data.terms.length;
    const query = container.querySelector("#ss-query");
    query.oninput = (e) => {
      q = e.target.value;
      page = 1;
      const start = e.target.selectionStart;
      paint();
      const next = container.querySelector("#ss-query");
      next.focus();
      next.setSelectionRange(start, start);
    };
    container.querySelector("#ss-state").onchange = (e) => {
      state = e.target.value;
      page = 1;
      paint();
    };
    container.querySelector("#ss-prev").onclick = () => {
      page--;
      paint();
    };
    container.querySelector("#ss-next").onclick = () => {
      page++;
      paint();
    };
    container.querySelector("#ss-export").onclick = () =>
      downloadCsv(
        "Lizz_Bao_luu_quay_lai_hoc.csv",
        [
          "Mã sinh viên",
          "Họ tên",
          "Loại",
          "Học kỳ",
          "Trạng thái",
          "Thời điểm áp dụng",
        ],
        rows.map((r) => [
          r.preview.student.code,
          r.preview.student.fullName,
          STATUS_REQUEST_KINDS[r.kind],
          r.preview.term.code,
          STATUS_REQUEST_STATES[r.status],
          r.result?.appliedAt ? new Date(r.result.appliedAt).toISOString() : "",
        ]),
      );
    container.querySelector("#ss-new").onclick = editor;
    for (const b of container.querySelectorAll("[data-ss]"))
      b.onclick = () => detail(data.rows.find((r) => r.id === b.dataset.ss));
  }
  function editor() {
    const d = openEditor(
        "Lập yêu cầu học vụ",
        `<form>${errorBox()}${actor.role !== "STUDENT" ? '<label>Tìm sinh viên<input id="ss-student-search" type="search" placeholder="Mã hoặc tên sinh viên"></label>' : ""}${select(
          "Sinh viên",
          "studentId",
          data.students.map((s) => ({
            id: s.id,
            name: s.code + " · " + s.fullName,
          })),
          actor.role === "STUDENT" ? data.students[0]?.id : "",
        )}${select("Yêu cầu", "kind", [])}${select(
          "Học kỳ làm căn cứ",
          "termId",
          data.terms.map((t) => ({ id: t.id, name: t.code + " · " + t.name })),
        )}<label>Căn cứ đề nghị<textarea name="reason" required maxlength="1000" rows="3"></textarea></label><p class="hint">Chỉ có hiệu lực từ lúc áp dụng quyết định. Không tự rút lớp, miễn học phí hoặc khôi phục chỗ học.</p><button class="primary" type="submit">Đối chiếu trước khi gửi</button></form>`,
      ),
      form = d.querySelector("form");
    function kinds() {
      const s = data.students.find(
        (s) => s.id === form.elements.studentId.value,
      );
      form.elements.kind.innerHTML = s
        ? `<option value="${s.state === "ON_LEAVE" ? "RETURN" : "LEAVE"}">${s.state === "ON_LEAVE" ? "Quay lại học" : "Bảo lưu"}</option>`
        : '<option value="">Chọn sinh viên trước</option>';
    }
    form.elements.studentId.onchange = kinds;
    kinds();
    if (actor.role === "STUDENT") form.elements.studentId.disabled = true;
    form.querySelector("#ss-student-search")?.addEventListener("input", (e) => {
      const q = foldText(e.target.value);
      form.elements.studentId.innerHTML =
        '<option value="">Chọn sinh viên</option>' +
        data.students
          .filter((s) => foldText(s.code + " " + s.fullName).includes(q))
          .map(
            (s) =>
              `<option value="${esc(s.id)}">${esc(s.code + " · " + s.fullName)}</option>`,
          )
          .join("");
      kinds();
    });
    const requestId = crypto.randomUUID();
    form.onsubmit = async (e) => {
      e.preventDefault();
      showError(form, { message: "" });
      const input = {
          ...Object.fromEntries(new FormData(form)),
          ...(actor.role === "STUDENT"
            ? { studentId: data.students[0].id }
            : {}),
        },
        controls = [...form.elements].map((e) => [e, e.disabled]);
      controls.forEach(([e]) => (e.disabled = true));
      let panel;
      try {
        const preview = await api("/student-status/preview", {
          method: "POST",
          body: input,
        });
        if (!d.isConnected || !d.open) return;
        panel = document.createElement("div");
        panel.innerHTML = previewMarkup(preview);
        d.append(panel);
        tables(panel);
        const decision = await confirmAction(d, {
          title: "Gửi yêu cầu chờ kiểm tra?",
          message: `${preview.student.code}: ${STATUS_REQUEST_KINDS[input.kind]}. Căn cứ: ${input.reason}`,
          confirmLabel: "Xác nhận gửi yêu cầu",
        });
        if (!decision.confirmed) return;
        await api("/student-status", {
          method: "POST",
          body: {
            ...input,
            requestId,
            confirm: true,
            reviewHash: preview.reviewHash,
          },
        });
        d.close();
        notify("Đã gửi yêu cầu. Trạng thái học chưa thay đổi.");
        await refresh();
      } catch (e) {
        showError(form, e);
      } finally {
        panel?.remove();
        controls.forEach(([e, disabled]) => (e.disabled = disabled));
        if (d.isConnected && d.open)
          form.querySelector("[type=submit]").focus();
      }
    };
  }
  function detail(row) {
    const actions = statusRequestActions(actor, row),
      d = openEditor(
        STATUS_REQUEST_KINDS[row.kind] + " · " + row.preview.student.code,
        `${errorBox()}${previewMarkup(row.preview)}<p><b>Căn cứ đề nghị:</b> ${esc(row.payload.reason)}</p><p>Người gửi: ${esc(row.requesterName)}<br>Người kiểm tra: ${esc(row.reviewerName || "Chưa kiểm tra")}<br>Người phê duyệt: ${esc(row.deciderName || "Chưa có quyết định")}</p><p><span class="badge">${STATUS_REQUEST_STATES[row.status]}</span>${row.result?.appliedAt ? " · " + esc(appliedTime(row)) : ""}</p>${row.decisionReason ? `<p>Lý do xử lý gần nhất: ${esc(row.decisionReason)}</p>` : ""}${table(
          ["Bước", "Người xử lý", "Thời điểm", "Lý do"],
          (row.payload.history || []).map(
            (h) =>
              `<tr><td>${STATUS_REQUEST_STATES[h.status]}</td><td>${esc(h.actorName)}</td><td>${esc(formatVietnamTime(h.at))}</td><td>${esc(h.reason)}</td></tr>`,
          ),
        )}${actions.length ? '<label>Lý do xử lý<textarea id="ss-reason" maxlength="1000" rows="3"></textarea></label>' : ""}<div class="dialog-actions">${actions.map((a) => `<button data-ss-action="${a}">${STATUS_ACTION_LABELS[a]}</button>`).join("")}</div>`,
      );
    tables(d);
    for (const b of d.querySelectorAll("[data-ss-action]"))
      b.onclick = async () => {
        showError(d, { message: "" });
        const reason = d.querySelector("#ss-reason").value.trim();
        if (!reason) return showError(d, new Error("Nhập lý do xử lý."));
        const controls = [...d.querySelectorAll("button,input,textarea")];
        controls.forEach((e) => (e.disabled = true));
        try {
          const decision = await confirmAction(d, {
            title: STATUS_ACTION_LABELS[b.dataset.ssAction] + "?",
            message: `${row.preview.student.code}: ${STATUS_REQUEST_KINDS[row.kind]}. ${reason}`,
            confirmLabel:
              "Xác nhận " +
              STATUS_ACTION_LABELS[b.dataset.ssAction].toLowerCase(),
          });
          if (!decision.confirmed) return;
          await api("/student-status/" + row.id + "/" + b.dataset.ssAction, {
            method: "POST",
            body: { version: row.version, confirm: true, reason },
          });
          d.close();
          notify("Đã cập nhật hồ sơ học vụ.");
          await refresh();
        } catch (e) {
          showError(d, e);
        } finally {
          controls.forEach((e) => (e.disabled = false));
          if (d.isConnected && d.open) b.focus();
        }
      };
  }
  await refresh();
}
