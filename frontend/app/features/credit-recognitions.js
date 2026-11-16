import { api } from "../services/api.js";
import {
  openEditor,
  escapeHtml as esc,
  table,
  field,
  select,
  errorBox,
  showError,
  notify,
} from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
const labels = {
  PENDING: "Chờ phê duyệt",
  APPROVED: "Đã duyệt, chưa áp dụng",
  APPLIED: "Đã áp dụng",
  REJECTED: "Từ chối",
  CANCELLED: "Đã hủy",
  REVOKED: "Đã thu hồi",
};
const actions = {
  approve: "Phê duyệt",
  reject: "Từ chối",
  cancel: "Hủy hồ sơ",
  apply: "Áp dụng quyết định",
  revoke: "Thu hồi quyết định",
};
export async function openRecognitions(
  actor,
  catalog,
  refresh = async () => {},
) {
  const dialog = openEditor(
      "Công nhận học phần",
      '<p class="loading">Đang tải hồ sơ công nhận…</p>',
    ),
    loading = dialog.querySelector(".loading");
  try {
    const data = await api("/curricula/recognitions");
    if (!dialog.open || !loading.isConnected) return;
    loading.outerHTML = `${errorBox()}<p>${esc(data.note)}</p><div class="actions">${data.canPropose ? '<button class="primary" data-recognition-new>Lập hồ sơ công nhận</button>' : ""}<button data-recognition-csv>Xuất CSV</button></div><div class="toolbar"><label>Tìm hồ sơ<input type="search" data-recognition-query placeholder="Sinh viên hoặc học phần"></label>${select(
      "Trạng thái",
      "recognitionStatus",
      Object.entries(labels)
        .filter(
          ([id]) => data.canPropose || ["APPLIED", "REVOKED"].includes(id),
        )
        .map(([id, name]) => ({ id, name })),
    )}</div><div data-recognition-list></div>`;
    const filter = dialog.querySelector("[name=recognitionStatus]");
    filter.required = false;
    filter.options[0].textContent = "Tất cả trạng thái";
    let page = 1;
    const filtered = () =>
      data.rows.filter(
        (r) =>
          (!filter.value || r.status === filter.value) &&
          `${r.payload?.student.code || ""} ${r.payload?.student.fullName || ""} ${(r.payload?.subject || r.subject).name} ${(r.payload?.subject || r.subject).code}`
            .toLocaleLowerCase("vi")
            .includes(
              dialog
                .querySelector("[data-recognition-query]")
                .value.toLocaleLowerCase("vi"),
            ),
      );
    function paint() {
      const rows = filtered(),
        max = Math.max(1, Math.ceil(rows.length / 10));
      page = Math.min(page, max);
      const host = dialog.querySelector("[data-recognition-list]");
      host.innerHTML =
        table(
          [
            "Sinh viên / học phần",
            "Tín chỉ",
            "Trạng thái",
            ...(data.canPropose ? ["Thao tác"] : []),
          ],
          rows.slice((page - 1) * 10, page * 10).map((r) => {
            const subject = r.payload?.subject || r.subject;
            const allowed = [];
            if (r.status === "PENDING") {
              if (actor.role === "MANAGER" && r.requestedBy !== actor.id)
                allowed.push("approve", "reject");
              if (
                actor.role === "MANAGER" ||
                (actor.role === "STAFF" && r.requestedBy === actor.id)
              )
                allowed.push("cancel");
            }
            if (
              r.status === "APPROVED" &&
              (actor.role === "MANAGER" ||
                (actor.role === "STAFF" && r.requestedBy === actor.id))
            )
              allowed.push("apply");
            if (r.status === "APPLIED" && actor.role === "MANAGER")
              allowed.push("revoke");
            return `<tr><td>${r.payload ? `<small>${esc(r.payload.student.code)} · ${esc(r.payload.student.fullName)}</small>` : ""}<b>${esc(subject.code)} · ${esc(subject.name)}</b><small>${esc(r.payload?.program.name || r.program.name)}</small></td><td>${subject.credits}<small>Không tính GPA</small></td><td><span class="badge">${labels[r.status]}</span></td>${data.canPropose ? `<td><div class="actions">${r.payload ? `<button data-recognition-detail="${r.id}">Chi tiết</button>` : ""}${allowed.map((action) => `<button data-recognition-action="${action}" data-id="${r.id}">${actions[action]}</button>`).join("")}</div></td>` : ""}</tr>`;
          }),
          "Chưa có hồ sơ phù hợp.",
        ) +
        `<div class="pagination"><span>${rows.length} hồ sơ · Trang ${page}/${max}</span><button data-recognition-prev ${page === 1 ? "disabled" : ""}>Trước</button><button data-recognition-next ${page === max ? "disabled" : ""}>Sau</button></div>`;
      host.querySelector("[data-recognition-prev]").onclick = () => {
        page--;
        paint();
      };
      host.querySelector("[data-recognition-next]").onclick = () => {
        page++;
        paint();
      };
      for (const b of host.querySelectorAll("[data-recognition-action]"))
        b.onclick = () =>
          decision(
            data.rows.find((r) => r.id === b.dataset.id),
            b.dataset.recognitionAction,
            async () => {
              await refresh();
              await openRecognitions(actor, catalog, refresh);
            },
          );
      for (const b of host.querySelectorAll("[data-recognition-detail]"))
        b.onclick = () =>
          details(data.rows.find((r) => r.id === b.dataset.recognitionDetail));
    }
    dialog.querySelector("[data-recognition-query]").oninput = filter.onchange =
      () => {
        page = 1;
        paint();
      };
    dialog
      .querySelector("[data-recognition-new]")
      ?.addEventListener("click", () =>
        proposal(actor, catalog, async () => {
          await refresh();
          await openRecognitions(actor, catalog, refresh);
        }),
      );
    dialog.querySelector("[data-recognition-csv]").onclick = () =>
      downloadCsv(
        "cong-nhan-hoc-phan.csv",
        [
          "Mã sinh viên",
          "Học phần",
          "Tín chỉ",
          "Trạng thái",
          "Ngày hiệu lực",
          "Đủ điều kiện tiên quyết",
          "Tính GPA",
        ],
        filtered().map((r) => [
          r.payload?.student.code ||
            data.students.find((s) => s.id === r.studentId)?.code ||
            "",
          (r.payload?.subject || r.subject).code,
          (r.payload?.subject || r.subject).credits,
          labels[r.status],
          r.payload?.effectiveDate || r.effectiveDate,
          (r.payload?.satisfiesPrerequisite ?? r.satisfiesPrerequisite)
            ? "Có theo quyết định"
            : "Không",
          "Không",
        ]),
      );
    paint();
  } catch (error) {
    if (dialog.open && loading.isConnected) loading.textContent = error.message;
  }
}
function details(row) {
  const p = row.payload;
  openEditor(
    "Căn cứ công nhận học phần",
    `<p><b>${esc(p.student.code)} · ${esc(p.student.fullName)}</b></p><dl class="record-summary"><dt>Học phần đích</dt><dd>${esc(p.subject.code)} · ${p.subject.credits} tín chỉ</dd><dt>Nơi đào tạo nguồn</dt><dd>${esc(p.institution)}</dd><dt>Học phần nguồn</dt><dd>${esc(p.sourceCourse)} · ${p.sourceCredits} tín chỉ</dd><dt>Căn cứ minh chứng</dt><dd>${esc(p.evidenceReference)}</dd><dt>Ngày hiệu lực</dt><dd>${esc(p.effectiveDate)}</dd><dt>Điều kiện tiên quyết</dt><dd>${p.satisfiesPrerequisite ? "Được công nhận theo quyết định" : "Không dùng thay điểm tiên quyết"}</dd><dt>Lý do đề nghị</dt><dd>${esc(p.reason)}</dd></dl>${table(
      ["Thao tác", "Người xử lý", "Thời gian", "Lý do"],
      row.history.map(
        (h) =>
          `<tr><td>${esc({ SUBMIT: "Gửi hồ sơ", APPROVE: "Phê duyệt", REJECT: "Từ chối", CANCEL: "Hủy", APPLY: "Áp dụng", REVOKE: "Thu hồi" }[h.action] || h.action)}</td><td>${esc(h.actorName)}</td><td>${esc(new Date(h.at).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}</td><td>${esc(h.reason || "—")}</td></tr>`,
      ),
    )}`,
  );
}
function proposal(actor, data, refresh) {
  const dialog = openEditor(
    "Lập hồ sơ công nhận học phần",
    `<form>${errorBox()}<div class="form-grid">${select(
      "Sinh viên",
      "studentId",
      data.students.map((s) => ({
        id: s.id,
        name: s.code + " · " + s.fullName,
      })),
    )}${select("Học phần đích", "subjectId", [])}${field("Nơi đào tạo nguồn", "institution")}${field("Học phần đã học", "sourceCourse")}${field("Tín chỉ nguồn", "sourceCredits", "number", 3)}${field("Ngày hiệu lực", "effectiveDate", "date", new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10))}${select(
      "Dùng làm điều kiện tiên quyết",
      "satisfiesPrerequisite",
      [
        { id: "false", name: "Không" },
        { id: "true", name: "Có, theo căn cứ đã xét" },
      ],
      "false",
    )}</div><p class="hint" data-recognition-target-hint>Chọn sinh viên để xem học phần thuộc chương trình.</p>${field("Căn cứ minh chứng / số văn bản", "evidenceReference")}${field("Lý do đề nghị", "reason")}<p class="hint">Chỉ đề nghị học phần thuộc chương trình hiện tại. Không tự tạo điểm hoặc đổi GPA; quyết định chỉ có tác dụng sau phê duyệt và áp dụng.</p><button class="primary" type="submit">Xem trước hồ sơ</button></form>`,
  );
  const form = dialog.querySelector("form");
  form.elements.sourceCredits.min = 1;
  form.elements.sourceCredits.max = 60;
  form.elements.sourceCredits.step = 1;
  form.elements.studentId.onchange = () => {
    const assignment = data.assignments.find(
        (a) => a.studentId === form.elements.studentId.value,
      ),
      p = data.curricula.find((p) => p.id === assignment?.curriculumId);
    const items = p?.groups.flatMap((g) => g.subjects) || [];
    const hint = dialog.querySelector("[data-recognition-target-hint]");
    if (hint)
      hint.textContent = p
        ? "Chương trình đang áp dụng: " + p.name
        : "Sinh viên chưa có chương trình được áp dụng. Cần hoàn tất bước này trước khi đề nghị công nhận.";
    form.querySelector("button").disabled = !p;
    form.elements.subjectId.innerHTML =
      '<option value="">Chọn học phần</option>' +
      items
        .map(
          (item) =>
            `<option value="${esc(item.subjectId)}">${esc(item.subjectCode)} · ${esc(item.subjectName)} · ${item.credits} TC</option>`,
        )
        .join("");
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const b = form.querySelector("button");
    b.disabled = true;
    const input = Object.fromEntries(new FormData(form));
    input.sourceCredits = Number(input.sourceCredits);
    input.satisfiesPrerequisite = input.satisfiesPrerequisite === "true";
    try {
      const preview = await api("/curricula/recognitions/preview", {
        method: "POST",
        body: input,
      });
      if (!dialog.open || !form.isConnected) return;
      const confirm = openEditor(
          "Xác nhận gửi hồ sơ công nhận",
          `${errorBox()}<dl class="record-summary"><dt>Sinh viên</dt><dd>${esc(preview.student.code)} · ${esc(preview.student.fullName)}</dd><dt>Chương trình</dt><dd>${esc(preview.program.name)} · Bản ${preview.program.edition}</dd><dt>Học phần đích</dt><dd>${esc(preview.subject.code)} · ${preview.subject.credits} tín chỉ</dd><dt>Nguồn</dt><dd>${esc(input.institution)} · ${esc(input.sourceCourse)} · ${input.sourceCredits} tín chỉ</dd><dt>Căn cứ</dt><dd>${esc(input.evidenceReference)}</dd><dt>Điều kiện tiên quyết</dt><dd>${input.satisfiesPrerequisite ? "Đề nghị công nhận" : "Không thay điểm tiên quyết"}</dd></dl><p>Quản lý khác người lập sẽ kiểm tra. Gửi hồ sơ chưa làm tăng tín chỉ.</p><button class="primary" data-recognition-confirm>Xác nhận gửi hồ sơ</button>`,
        ),
        requestId = crypto.randomUUID();
      confirm.querySelector("[data-recognition-confirm]").onclick = async (
        event,
      ) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          await api("/curricula/recognitions", {
            method: "POST",
            body: {
              ...input,
              sourceHash: preview.sourceHash,
              requestId,
              confirm: true,
            },
          });
          confirm.close();
          notify("Đã gửi hồ sơ công nhận học phần.");
          await refresh();
        } catch (error) {
          showError(confirm, error);
          button.disabled = false;
        }
      };
    } catch (error) {
      showError(form, error);
      b.disabled = false;
    }
  };
}
function decision(row, action, refresh) {
  const dialog = openEditor(
    actions[action],
    `<p><b>${esc(row.payload.student.code)} · ${esc(row.payload.subject.code)}</b></p><p>${action === "apply" ? "Tín chỉ sẽ được ghi nhận vào tiến độ, không tạo điểm/GPA." : action === "revoke" ? "Ngừng dùng tín chỉ công nhận cho đối chiếu mới; giữ nguyên điểm và đăng ký đã có." : "Giữ nguyên hồ sơ và lịch sử xử lý."}</p><form>${errorBox()}${field("Lý do / số quyết định", "reason")}<button class="primary" type="submit">Xác nhận ${actions[action].toLocaleLowerCase("vi")}</button></form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target,
      b = form.querySelector("button");
    b.disabled = true;
    try {
      await api(`/curricula/recognitions/${row.id}/${action}`, {
        method: "POST",
        body: {
          version: row.version,
          reason: form.elements.reason.value,
          confirm: true,
        },
      });
      dialog.close();
      notify("Đã cập nhật hồ sơ công nhận.");
      await refresh();
    } catch (error) {
      showError(form, error);
      b.disabled = false;
    }
  };
}
