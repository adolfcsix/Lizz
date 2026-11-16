import { subjectText, groupText } from "./curriculum-tools.js";
import { api } from "../services/api.js";
import {
  escapeHtml as esc,
  table,
  select,
  openEditor,
  errorBox,
  showError,
  confirmAction,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { foldText } from "../../../shared/local-validation.js";
const labels = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt · Chưa áp dụng",
  APPLIED: "Đã áp dụng",
  REJECTED: "Đã từ chối",
  CANCELLED: "Đã hủy",
};
const program = (p) => `${p.code} · Phiên bản ${p.edition}`;
const diffLabels = {
  ADDED: "Bổ sung",
  REMOVED: "Lược khỏi chương trình",
  CHANGED: "Điều chỉnh",
};
function previewMarkup(p) {
  return `<div class="study-review"><h3>${esc(p.student.code)} · ${esc(p.student.fullName)}</h3><p>${esc(program(p.before))} → ${esc(program(p.after))}</p>${p.before.name !== p.after.name ? `<p>Tên chương trình: ${esc(p.before.name)} → ${esc(p.after.name)}</p>` : ""}<p>${esc(p.note)}</p><p>Tín chỉ tối thiểu: <b>${p.comparison.minimumCredits.before} → ${p.comparison.minimumCredits.after}</b></p>${table(
    ["Học phần", "Thay đổi", "Trước", "Sau"],
    p.comparison.subjects.map(
      (r) =>
        `<tr><td>${esc((r.after || r.before).subjectCode)}<small>${esc((r.after || r.before).subjectName)}</small></td><td>${diffLabels[r.change]}</td><td>${esc(subjectText(r.before))}</td><td>${esc(subjectText(r.after))}</td></tr>`,
    ),
    "Danh mục học phần không đổi.",
  )}${
    p.comparison.groups.length
      ? table(
          ["Nhóm", "Thay đổi", "Trước", "Sau"],
          p.comparison.groups.map(
            (g) =>
              `<tr><td>${esc(g.code)}</td><td>${diffLabels[g.change]}</td><td>${g.before ? `${esc(g.before.name)} · ${g.before.minCredits} TC · ${g.before.kind === "REQUIRED" ? "Bắt buộc" : "Tự chọn"}` : "—"}</td><td>${g.after ? `${esc(g.after.name)} · ${g.after.minCredits} TC · ${g.after.kind === "REQUIRED" ? "Bắt buộc" : "Tự chọn"}` : "—"}</td></tr>`,
          ),
          "Yêu cầu nhóm không đổi.",
        )
      : ""
  }${
    p.outside.length
      ? `<p class="study-blocked">${p.outside.length} đăng ký đang hiệu lực nằm ngoài chương trình đích; được giữ nguyên và cần cán bộ đối chiếu.</p>${table(
          ["Lớp học phần", "Học kỳ"],
          p.outside.map(
            (r) =>
              `<tr><td>${esc(r.sectionCode)}</td><td>${esc(r.term)}</td></tr>`,
          ),
        )}`
      : ""
  }</div>`;
}
function accessible(root) {
  for (const e of root.querySelectorAll(".table-scroll")) {
    e.tabIndex = 0;
    e.setAttribute("role", "region");
    e.setAttribute("aria-label", "Đối chiếu chuyển chương trình");
  }
}
export async function openCurriculumTransfers(
  actor,
  data,
  onChanged = async () => {},
) {
  const dialog = openEditor(
    actor.role === "STUDENT"
      ? "Lịch sử chuyển chương trình"
      : "Hồ sơ chuyển chương trình",
    '<p class="loading">Đang tải hồ sơ…</p>',
  );
  async function refresh() {
    try {
      const [view, latest] = await Promise.all([
        api("/curricula/transfers"),
        api("/curricula"),
      ]);
      data = latest;
      if (!dialog.isConnected || !dialog.open) return;
      dialog.querySelector(".loading")?.remove();
      let body = dialog.querySelector("#ct-body");
      if (!body) {
        body = document.createElement("div");
        body.id = "ct-body";
        dialog.append(body);
      }
      let page = 1;
      const size = 10;
      body.innerHTML = `${errorBox()}<p class="hint">${esc(view.note)}</p>${view.canPropose ? '<button id="ct-new" class="primary">Lập hồ sơ chuyển phiên bản</button>' : ""}<div class="toolbar"><label>Tìm hồ sơ<input id="ct-search" type="search" placeholder="Mã sinh viên, chương trình"></label><label>Trạng thái<select id="ct-state"><option value="">Tất cả</option>${Object.entries(
        labels,
      )
        .map(([k, v]) => `<option value="${k}">${v}</option>`)
        .join("")}</select></label></div><div id="ct-list"></div>`;
      if (actor.role === "STUDENT") {
        body.querySelector("#ct-state").closest("label").remove();
        body.insertAdjacentHTML(
          "afterbegin",
          `<button id="ct-history-export" ${view.rows.length ? "" : "disabled"}>Xuất lịch sử CSV</button>`,
        );
        body.querySelector("#ct-history-export").onclick = () =>
          downloadCsv(
            "Lizz_Lich_su_chuyen_chuong_trinh.csv",
            [
              "Chương trình",
              "Tên chương trình",
              "Phiên bản trước",
              "Phiên bản sau",
              "Thời điểm áp dụng",
            ],
            view.rows.map((r) => [
              r.after.code,
              r.after.name,
              r.before.edition,
              r.after.edition,
              new Date(r.appliedAt).toISOString(),
            ]),
          );
      }
      function paint() {
        const q = foldText(body.querySelector("#ct-search").value),
          state = body.querySelector("#ct-state")?.value || "";
        const rows = view.rows.filter(
          (r) =>
            (!state || r.status === state) &&
            foldText(
              [
                r.preview?.student.code,
                r.preview?.student.fullName,
                (r.preview?.after || r.after).code,
              ].join(" "),
            ).includes(q),
        );
        page = Math.max(1, Math.min(page, Math.ceil(rows.length / size) || 1));
        body.querySelector("#ct-list").innerHTML =
          table(
            [
              actor.role === "STUDENT"
                ? "Chương trình"
                : "Sinh viên / chương trình",
              "Chuyển phiên bản",
              "Trạng thái",
              "",
            ],
            rows.slice((page - 1) * size, page * size).map((r) => {
              const p = r.preview || r;
              return `<tr><td>${r.preview ? `<b>${esc(p.student.code)} · ${esc(p.student.fullName)}</b>` : esc(p.after.code)}<small>${esc(p.after.name)}</small></td><td>${p.before.edition} → ${p.after.edition}</td><td><span class="badge">${labels[r.status]}</span></td><td>${r.preview ? `<button data-ct="${esc(r.id)}">Xem và xử lý</button>` : "Đã cập nhật liên kết"}</td></tr>`;
            }),
            "Chưa có hồ sơ phù hợp.",
          ) +
          `<div class="pagination"><span>Trang ${page}/${Math.ceil(rows.length / size) || 1} · ${rows.length} hồ sơ</span><button id="ct-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="ct-next" ${page * size >= rows.length ? "disabled" : ""}>Sau</button></div>`;
        accessible(body);
        body.querySelector("#ct-prev").onclick = () => {
          page--;
          paint();
        };
        body.querySelector("#ct-next").onclick = () => {
          page++;
          paint();
        };
        for (const b of body.querySelectorAll("[data-ct]"))
          b.onclick = () =>
            detail(view.rows.find((r) => r.id === b.dataset.ct));
      }
      const filtered = () => {
        page = 1;
        paint();
      };
      body.querySelector("#ct-search").oninput = filtered;
      if (body.querySelector("#ct-state"))
        body.querySelector("#ct-state").onchange = filtered;
      paint();
      body.querySelector("#ct-new")?.addEventListener("click", () => editor());
    } catch (e) {
      if (dialog.isConnected && dialog.open) {
        dialog.querySelector(".loading")?.remove();
        if (!dialog.querySelector(".form-error"))
          dialog.insertAdjacentHTML("beforeend", errorBox());
        showError(dialog, e);
      }
    }
  }
  function detail(row) {
    const p = row.preview,
      actions = [];
    if (
      actor.role === "MANAGER" &&
      row.status === "PENDING" &&
      row.requestedBy !== actor.id
    )
      actions.push(["approve", "Phê duyệt"], ["reject", "Từ chối"]);
    if (
      row.status === "PENDING" ||
      (actor.role === "MANAGER" && row.status === "APPROVED")
    )
      actions.push(["cancel", "Hủy hồ sơ"]);
    if (
      row.status === "APPROVED" &&
      (actor.role === "MANAGER" || row.requestedBy === actor.id)
    )
      actions.push(["apply", "Áp dụng quyết định"]);
    const d = openEditor(
      "Đối chiếu chuyển chương trình",
      `${errorBox()}${previewMarkup(p)}<p><b>Căn cứ đề nghị:</b> ${esc(row.payload.reason)}</p><p>Người lập: ${esc(row.requesterName)} · ${labels[row.status]}</p>${row.decisionReason ? `<p>Quyết định / lý do: ${esc(row.decisionReason)} · ${esc(row.deciderName)}</p>` : ""}${row.result ? `<p>Đã áp dụng. Phiên bản liên kết: ${row.result.version}</p>` : ""}<button id="ct-export">Xuất đối chiếu CSV</button>${actions.length ? '<label>Lý do xử lý<textarea id="ct-reason" maxlength="1000" rows="3"></textarea></label>' : ""}<div class="dialog-actions">${actions.map(([key, label]) => `<button data-ct-action="${key}">${label}</button>`).join("")}</div><button id="ct-back">Về danh sách hồ sơ</button>`,
    );
    accessible(d);
    d.querySelector("#ct-export").onclick = () =>
      downloadCsv(
        "Lizz_Doi_chieu_chuong_trinh_" + p.student.code + ".csv",
        [
          "Sinh viên",
          "Chương trình",
          "Phiên bản trước",
          "Phiên bản sau",
          "Loại",
          "Mục",
          "Thay đổi",
          "Trước",
          "Sau",
        ],
        [
          [
            p.student.code,
            p.after.code,
            p.before.edition,
            p.after.edition,
            "Tín chỉ",
            "Tối thiểu",
            "",
            p.comparison.minimumCredits.before,
            p.comparison.minimumCredits.after,
          ],
          ...p.comparison.groups.map((g) => [
            p.student.code,
            p.after.code,
            p.before.edition,
            p.after.edition,
            "Nhóm",
            g.code,
            diffLabels[g.change],
            groupText(g.before),
            groupText(g.after),
          ]),
          ...p.comparison.subjects.map((r) => [
            p.student.code,
            p.after.code,
            p.before.edition,
            p.after.edition,
            "Học phần",
            (r.after || r.before).subjectCode,
            diffLabels[r.change],
            subjectText(r.before),
            subjectText(r.after),
          ]),
          ...p.outside.map((r) => [
            p.student.code,
            p.after.code,
            p.before.edition,
            p.after.edition,
            "Đăng ký ngoài chương trình",
            r.sectionCode,
            "Giữ nguyên",
            r.term,
            r.term,
          ]),
        ],
      );
    d.querySelector("#ct-back").onclick = () =>
      openCurriculumTransfers(actor, data, onChanged);
    for (const b of d.querySelectorAll("[data-ct-action]"))
      b.onclick = async () => {
        showError(d, { message: "" });
        const reason = d.querySelector("#ct-reason").value.trim();
        if (!reason) return showError(d, new Error("Nhập lý do xử lý."));
        const buttons = [...d.querySelectorAll("button")];
        buttons.forEach((x) => (x.disabled = true));
        d.querySelector("#ct-reason").disabled = true;
        try {
          const decision = await confirmAction(d, {
            title: b.textContent + "?",
            message: `${p.student.code}: ${program(p.before)} → ${program(p.after)}. ${reason}`,
            confirmLabel: "Xác nhận " + b.textContent.toLowerCase(),
          });
          if (!decision.confirmed) return;
          await api(
            "/curricula/transfers/" + row.id + "/" + b.dataset.ctAction,
            {
              method: "POST",
              body: { version: row.version, confirm: true, reason },
            },
          );
          await onChanged();
          notify("Đã cập nhật hồ sơ chuyển chương trình.");
          openCurriculumTransfers(actor, data, onChanged);
        } catch (e) {
          showError(d, e);
        } finally {
          buttons.forEach((x) => (x.disabled = false));
          const field = d.querySelector("#ct-reason");
          if (field) field.disabled = false;
          if (d.isConnected && d.open) b.focus();
        }
      };
  }
  function editor() {
    const assigned = new Set(data.assignments.map((a) => a.studentId)),
      students = data.students.filter((s) => assigned.has(s.id));
    const d = openEditor(
      "Lập hồ sơ chuyển phiên bản",
      `<form>${errorBox()}<label>Tìm sinh viên<input id="ct-student-query" type="search" placeholder="Mã hoặc tên sinh viên"></label>${select(
        "Sinh viên",
        "studentId",
        students.map((s) => ({ id: s.id, name: s.code + " · " + s.fullName })),
      )}${select("Phiên bản đích", "curriculumId", [])}<label>Căn cứ chuyển<textarea name="reason" required maxlength="1000" rows="3"></textarea></label><button type="submit" class="primary">Đối chiếu trước khi gửi</button></form>`,
    );
    const form = d.querySelector("form"),
      studentSelect = form.elements.studentId,
      target = form.elements.curriculumId;
    function targets() {
      const a = data.assignments.find(
          (a) => a.studentId === studentSelect.value,
        ),
        before = data.curricula.find((p) => p.id === a?.curriculumId);
      target.innerHTML =
        '<option value="">Chọn phiên bản đích</option>' +
        data.curricula
          .filter(
            (p) =>
              before &&
              p.status === "PUBLISHED" &&
              p.code === before.code &&
              p.majorId === before.majorId &&
              p.cohortId === before.cohortId &&
              p.edition > before.edition,
          )
          .map(
            (p) => `<option value="${esc(p.id)}">${esc(program(p))}</option>`,
          )
          .join("");
    }
    studentSelect.onchange = targets;
    form.querySelector("#ct-student-query").oninput = (e) => {
      const q = foldText(e.target.value);
      studentSelect.innerHTML =
        '<option value="">Chọn sinh viên</option>' +
        students
          .filter((s) => foldText(s.code + " " + s.fullName).includes(q))
          .map(
            (s) =>
              `<option value="${esc(s.id)}">${esc(s.code + " · " + s.fullName)}</option>`,
          )
          .join("");
      targets();
    };
    const requestId = crypto.randomUUID();
    form.onsubmit = async (e) => {
      e.preventDefault();
      showError(form, { message: "" });
      const values = Object.fromEntries(new FormData(form)),
        controls = [...form.elements];
      controls.forEach((x) => (x.disabled = true));
      let panel;
      try {
        const p = await api("/curricula/transfers/preview", {
          method: "POST",
          body: values,
        });
        if (!d.isConnected || !d.open) return;
        panel = document.createElement("div");
        panel.innerHTML = previewMarkup(p);
        d.append(panel);
        accessible(panel);
        const decision = await confirmAction(d, {
          title: "Gửi hồ sơ chờ phê duyệt?",
          message: `${p.student.code}: ${program(p.before)} → ${program(p.after)}. ${values.reason}
Chưa đổi chương trình ở bước này.`,
          confirmLabel: "Xác nhận gửi hồ sơ",
        });
        if (!decision.confirmed) return;
        await api("/curricula/transfers", {
          method: "POST",
          body: {
            ...values,
            requestId,
            reviewHash: p.reviewHash,
            confirm: true,
          },
        });
        notify("Đã gửi hồ sơ chờ Quản lý phê duyệt.");
        openCurriculumTransfers(actor, data, onChanged);
      } catch (e) {
        showError(form, e);
      } finally {
        panel?.remove();
        controls.forEach((x) => (x.disabled = false));
        if (d.isConnected && d.open)
          form.querySelector("[type=submit]").focus();
      }
    };
  }
  await refresh();
}
