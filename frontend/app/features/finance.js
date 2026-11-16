import { downloadCsv } from "../components/csv-export.js";
import { api } from "../services/api.js";
import { brand } from "../components/brand.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  errorBox,
  showError,
  openEditor,
  bindForm,
  confirmAction,
  notify,
} from "../components/ui.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";
const vnd = (n) => new Intl.NumberFormat("vi-VN").format(n) + " ₫";
const labels = {
  DRAFT: "Bản nháp",
  ISSUED: "Đang thu",
  CANCELLED: "Đã hủy",
  PENDING: "Chờ xác minh",
  CONFIRMED: "Đã xác nhận",
  REJECTED: "Không chấp nhận",
  REVERSED: "Đã hủy xác nhận",
};
const date = (v) => v.split("-").reverse().join("/");
export async function financePage(container, actor) {
  const data = await api("/finance"),
    manage = ["MANAGER", "STAFF"].includes(actor.role);
  let mode = "charges",
    page = 1;
  const refresh = () => financePage(container, actor);
  const current = data.charges.filter((c) => c.status === "ISSUED");
  container.innerHTML =
    heading(
      manage ? "Học phí và thu tiền" : "Học phí và công nợ",
      (manage
        ? '<button id="new-charge" class="primary">Lập khoản thu</button>'
        : "") + '<button id="finance-export">Xuất CSV</button>',
    ) +
    `<div class="stat-grid finance-stats"><article><span>Khoản thu đã xác lập</span><strong>${vnd(current.reduce((n, c) => n + c.total, 0))}</strong></article><article><span>Đã xác nhận thu</span><strong>${vnd(current.reduce((n, c) => n + c.paid, 0))}</strong></article><article><span>Còn phải nộp</span><strong>${vnd(current.reduce((n, c) => n + c.remaining, 0))}</strong></article></div><nav class="tabs" aria-label="Học phí"><button id="charge-tab" aria-pressed="true">Khoản thu</button><button id="receipt-tab" aria-pressed="false">Phiếu thu và chuyển khoản</button></nav><section class="panel"><div class="toolbar"><label>Tìm kiếm<input id="finance-query" type="search" placeholder="Mã khoản thu, nội dung hoặc sinh viên"></label></div><div id="finance-table"></div></section>`;
  container.querySelector("#finance-export").onclick = () => {
    const q = container
      .querySelector("#finance-query")
      .value.toLocaleLowerCase("vi");
    const rows = (mode === "charges" ? data.charges : data.receipts).filter(
      (r) =>
        `${r.code} ${r.title || ""} ${r.studentCode || ""} ${r.studentName || ""} ${r.reference || ""}`
          .toLocaleLowerCase("vi")
          .includes(q),
    );
    if (mode === "charges")
      downloadCsv(
        "LIZZ_KHOAN_THU.csv",
        [
          "Mã khoản thu",
          "Sinh viên",
          "Mã sinh viên",
          "Học kỳ",
          "Nội dung",
          "Phải nộp VND",
          "Đã xác nhận VND",
          "Còn phải nộp VND",
          "Trạng thái",
        ],
        rows.map((r) => [
          r.code,
          r.studentName,
          r.studentCode,
          r.term,
          r.title,
          r.total,
          r.paid,
          r.remaining,
          labels[r.status],
        ]),
      );
    else
      downloadCsv(
        "LIZZ_PHIEU_THU.csv",
        [
          "Mã phiếu",
          "Mã khoản thu",
          "Sinh viên",
          "Số tiền VND",
          "Hình thức",
          "Mã giao dịch",
          "Trạng thái",
        ],
        rows.map((r) => [
          r.code,
          r.chargeCode,
          r.studentName,
          r.amount,
          r.method === "CASH" ? "Tiền mặt" : "Chuyển khoản",
          r.reference,
          labels[r.status],
        ]),
      );
  };
  const paint = () => {
    const q = container
        .querySelector("#finance-query")
        .value.toLocaleLowerCase("vi"),
      rows = (mode === "charges" ? data.charges : data.receipts).filter((r) =>
        `${r.code} ${r.title || ""} ${r.studentCode || ""} ${r.studentName || ""} ${r.reference || ""}`
          .toLocaleLowerCase("vi")
          .includes(q),
      );
    const max = Math.max(1, Math.ceil(rows.length / 10));
    page = Math.min(page, max);
    const target = container.querySelector("#finance-table");
    target.innerHTML =
      table(
        mode === "charges"
          ? [
              "Khoản thu",
              ...(manage ? ["Sinh viên"] : []),
              "Số tiền / Đã nộp",
              "Hạn nộp / Trạng thái",
              "Thao tác",
            ]
          : [
              "Phiếu / Khoản thu",
              "Số tiền / Hình thức",
              "Trạng thái",
              "Thao tác",
            ],
        rows.slice((page - 1) * 10, page * 10).map((r) =>
          mode === "charges"
            ? `<tr><td><b>${esc(r.title)}</b><small>${esc(r.code)} · ${esc(r.term)}</small>${data.adjustments
                .filter((a) => a.chargeId === r.id)
                .map(
                  (a) =>
                    `<small>Điều chỉnh ${vnd(a.delta)} · ${esc(a.reason)}</small>`,
                )
                .join(
                  "",
                )}</td>${manage ? `<td>${esc(r.studentName)}<small>${esc(r.studentCode)}</small></td>` : ""}<td><b>${vnd(r.total)}</b><small>Đã nộp ${vnd(r.paid)}</small><small>Còn ${vnd(r.remaining)}</small></td><td>${date(r.dueDate)}<small>${labels[r.status]}</small></td><td><div class="actions">${manage && r.status === "DRAFT" ? `<button data-charge-edit="${r.id}">Chỉnh sửa</button><button data-charge-issue="${r.id}">Phát hành</button>` : ""}${r.status === "ISSUED" && r.remaining > 0 ? `<button data-receipt-new="${r.id}">${manage ? "Ghi nhận thu" : "Báo chuyển khoản"}</button>` : ""}${actor.role === "MANAGER" && r.status === "ISSUED" ? `<button data-charge-adjust="${r.id}">Điều chỉnh</button>` : ""}${manage && r.status !== "CANCELLED" ? `<button data-charge-cancel="${r.id}">Hủy khoản thu</button>` : ""}</div></td></tr>`
            : `<tr><td><b>${esc(r.code)}</b><small>${esc(r.chargeCode)}</small>${manage ? `<small>${esc(r.studentName)}</small>` : ""}</td><td>${vnd(r.amount)}<small>${r.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"}${r.reference ? " · " + esc(r.reference) : ""}</small></td><td><span class="badge">${labels[r.status]}</span>${r.reason ? `<small>${esc(r.reason)}</small>` : ""}</td><td><div class="actions"><button data-receipt-view="${r.id}">Chi tiết</button>${manage && r.status === "PENDING" ? `<button data-receipt-confirm="${r.id}">Xác minh và xác nhận</button><button data-receipt-reject="${r.id}">Không chấp nhận</button>` : ""}${actor.role === "MANAGER" && r.status === "CONFIRMED" ? `<button data-receipt-reverse="${r.id}">Hủy xác nhận</button>` : ""}${actor.role === "MANAGER" && ["REJECTED", "REVERSED"].includes(r.status) ? `<button data-receipt-reopen="${r.id}">Mở lại để xác minh</button>` : ""}</div></td></tr>`,
        ),
        mode === "charges"
          ? "Chưa có khoản thu phù hợp."
          : "Chưa có phiếu thu hoặc thông tin chuyển khoản.",
      ) +
      `<div class="pagination"><span>Trang ${page}/${max}</span><button id="finance-prev" ${page === 1 ? "disabled" : ""}>Trước</button><button id="finance-next" ${page === max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#finance-prev").onclick = () => {
      page--;
      paint();
    };
    target.querySelector("#finance-next").onclick = () => {
      page++;
      paint();
    };
    for (const b of target.querySelectorAll("[data-charge-edit]"))
      b.onclick = () =>
        chargeForm(
          data,
          data.charges.find((c) => c.id === b.dataset.chargeEdit),
          refresh,
        );
    for (const b of target.querySelectorAll(
      "[data-charge-issue],[data-charge-cancel]",
    ))
      b.onclick = () => {
        const id = b.dataset.chargeIssue || b.dataset.chargeCancel;
        chargeAction(
          data.charges.find((c) => c.id === id),
          b.dataset.chargeIssue ? "issue" : "cancel",
          refresh,
        );
      };
    for (const b of target.querySelectorAll("[data-charge-adjust]"))
      b.onclick = () =>
        adjustForm(
          data.charges.find((c) => c.id === b.dataset.chargeAdjust),
          refresh,
        );
    for (const b of target.querySelectorAll("[data-receipt-new]"))
      b.onclick = () =>
        receiptForm(
          data.charges.find((c) => c.id === b.dataset.receiptNew),
          manage,
          refresh,
        );
    for (const b of target.querySelectorAll("[data-receipt-view]"))
      b.onclick = () => receiptView(b.dataset.receiptView);
    for (const action of ["confirm", "reject", "reverse", "reopen"])
      for (const b of target.querySelectorAll("[data-receipt-" + action + "]"))
        b.onclick = () =>
          receiptAction(
            b.dataset["receipt" + action[0].toUpperCase() + action.slice(1)],
            action,
            refresh,
          );
  };
  container.querySelector("#finance-query").oninput = () => {
    page = 1;
    paint();
  };
  for (const [id, value] of [
    ["charge-tab", "charges"],
    ["receipt-tab", "receipts"],
  ])
    container.querySelector("#" + id).onclick = () => {
      mode = value;
      page = 1;
      for (const [key, v] of [
        ["charge-tab", "charges"],
        ["receipt-tab", "receipts"],
      ])
        container
          .querySelector("#" + key)
          .setAttribute("aria-pressed", String(v === mode));
      paint();
    };
  container
    .querySelector("#new-charge")
    ?.addEventListener("click", () => chargeForm(data, null, refresh));
  paint();
}
function chargeForm(data, row, refresh) {
  if (!data.students.length || !data.terms.length)
    return notify("Cần có hồ sơ sinh viên và học kỳ trước khi lập khoản thu.");
  const requestId = crypto.randomUUID(),
    dialog = openEditor(
      row ? "Chỉnh sửa khoản thu" : "Lập khoản thu",
      `<form>${errorBox()}<div class="form-grid">${select("Sinh viên", "studentId", data.students, row?.studentId)}${select(
        "Học kỳ",
        "term",
        data.terms.map((t) => ({ id: t.code, name: t.name })),
        row?.term,
      )}${field("Nội dung khoản thu", "title", "text", row?.title || "")}${field("Số tiền (VND)", "amount", "number", row?.amount || "")}${field("Hạn nộp", "dueDate", "date", row?.dueDate || "")}</div><p class="hint">Bản nháp chưa hiển thị cho sinh viên. Kiểm tra trước khi phát hành khoản thu.</p><button class="primary" type="submit">Lưu bản nháp</button></form>`,
    );
  bindForm(
    dialog,
    (input) =>
      api("/finance/charges" + (row ? "/" + row.id : ""), {
        method: row ? "PATCH" : "POST",
        body: {
          ...input,
          amount: Number(input.amount),
          requestId,
          ...(row ? { version: row.version } : {}),
        },
      }),
    refresh,
    "Đã lưu bản nháp khoản thu.",
  );
}
async function confirmed(title, message, url, body, refresh, options = {}) {
  const dialog = openEditor(title, errorBox()),
    requestId = crypto.randomUUID();
  const decision = await confirmAction(dialog, {
    title,
    message,
    confirmLabel: options.confirmLabel || "Xác nhận",
    requireReason: Boolean(options.reason),
    reasonLabel: "Lý do",
    reasonError: "Vui lòng nhập lý do.",
  });
  if (!decision.confirmed) {
    dialog.close();
    return;
  }
  try {
    await api(url, {
      method: "POST",
      body: {
        ...body,
        requestId,
        confirm: true,
        ...(options.reason ? { reason: decision.reason } : {}),
      },
    });
    dialog.close();
    notify("Đã ghi nhận thao tác.");
    await refresh();
  } catch (error) {
    showError(dialog, error);
    dialog.insertAdjacentHTML(
      "beforeend",
      '<button id="finance-reload">Tải lại danh sách</button>',
    );
    dialog.querySelector("#finance-reload").onclick = () => {
      dialog.close();
      refresh();
    };
  }
}
function chargeAction(row, action, refresh) {
  return confirmed(
    action === "issue" ? "Phát hành khoản thu" : "Hủy khoản thu",
    action === "issue"
      ? `${row.title} · ${vnd(row.total)} cho ${row.studentName}. Sinh viên sẽ xem được khoản thu này.`
      : "Khoản thu cũ vẫn được lưu. Không thể hủy nếu còn phiếu chờ xác minh hoặc tiền đã xác nhận.",
    `/finance/charges/${row.id}/${action}`,
    { version: row.version },
    refresh,
    { reason: action === "cancel" },
  );
}
function adjustForm(row, refresh) {
  const dialog = openEditor(
    "Điều chỉnh khoản thu",
    `<form>${errorBox()}<p>${esc(row.title)} · Còn phải nộp ${vnd(row.remaining)}</p>${field("Số tiền điều chỉnh (VND)", "delta", "number")}<p class="hint">Nhập số âm để miễn giảm, số dương để bổ sung. Không giảm dưới số tiền đã xác nhận thu.</p>${field("Lý do", "reason")}<button class="primary" type="submit">Kiểm tra điều chỉnh</button></form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.target));
    const decision = await confirmAction(dialog, {
      title: "Xác nhận điều chỉnh?",
      message: `Thay đổi ${vnd(Number(input.delta))} cho khoản ${row.title}. Nội dung và lý do sẽ được lưu trong nhật ký.`,
      confirmLabel: "Lưu điều chỉnh",
    });
    if (!decision.confirmed) return;
    try {
      await api("/finance/charges/" + row.id + "/adjust", {
        method: "POST",
        body: {
          delta: Number(input.delta),
          reason: input.reason,
          version: row.version,
          confirm: true,
          requestId: crypto.randomUUID(),
        },
      });
      dialog.close();
      notify("Đã điều chỉnh khoản thu.");
      refresh();
    } catch (error) {
      showError(dialog, error);
    }
  };
}
function receiptForm(charge, manage, refresh) {
  const requestId = crypto.randomUUID(),
    dialog = openEditor(
      manage ? "Ghi nhận thu" : "Gửi thông tin chuyển khoản",
      `<form>${errorBox()}<p>${esc(charge.title)} · Còn phải nộp ${vnd(charge.remaining)}</p>${field("Số tiền (VND)", "amount", "number")}${select(
        "Hình thức",
        "method",
        manage
          ? [
              { id: "CASH", name: "Tiền mặt" },
              { id: "TRANSFER", name: "Chuyển khoản" },
            ]
          : [{ id: "TRANSFER", name: "Chuyển khoản" }],
      )}<label>Mã giao dịch chuyển khoản<input name="reference" maxlength="100"></label><p class="hint">Phiếu chỉ được tính vào số đã nộp sau khi cán bộ xác minh và xác nhận. Thao tác này không thực hiện chuyển tiền.</p><button class="primary" type="submit">Gửi để xác minh</button></form>`,
    );
  bindForm(
    dialog,
    (input) =>
      api("/finance/receipts", {
        method: "POST",
        body: {
          ...input,
          chargeId: charge.id,
          amount: Number(input.amount),
          requestId,
        },
      }),
    refresh,
    "Đã gửi thông tin chờ xác minh.",
  );
}
async function receiptAction(id, action, refresh) {
  try {
    const data = await api("/finance/receipts/" + id),
      r = data.receipt;
    const title = {
      confirm: "Xác nhận đã thu",
      reject: "Không chấp nhận phiếu",
      reverse: "Hủy xác nhận thu",
      reopen: "Mở lại phiếu để xác minh",
    }[action];
    const message =
      action === "confirm"
        ? `${r.code} · ${vnd(r.amount)}. Chỉ xác nhận khi đã đối chiếu tiền mặt hoặc giao dịch thực nhận.`
        : action === "reverse"
          ? "Số đã nộp sẽ được giảm tương ứng; khoản phải nộp được tính lại. Thao tác này không chuyển tiền hoàn trả."
          : `Xử lý phiếu ${r.code} · ${vnd(r.amount)}. Phiếu và lịch sử cũ vẫn được giữ.`;
    await confirmed(
      title,
      message,
      `/finance/receipts/${id}/${action}`,
      { version: r.version, chargeVersion: data.charge.version },
      refresh,
      { reason: action !== "confirm", confirmLabel: title },
    );
  } catch (error) {
    notify(error.message);
  }
}
async function receiptView(id) {
  const dialog = openEditor(
    "Chi tiết phiếu thu",
    '<p class="loading">Đang tải phiếu thu…</p>',
  );
  try {
    const { receipt: r, charge: c } = await api("/finance/receipts/" + id);
    if (!dialog.isConnected || !dialog.open) return;
    dialog.querySelector(".loading").outerHTML =
      `<article class="receipt-document">${brand()}<h2>Phiếu xác nhận thu</h2><p><b>${esc(r.code)}</b> · ${labels[r.status]}</p><dl class="record-summary"><dt>Sinh viên</dt><dd>${esc(c.studentName)} · ${esc(c.studentCode)}</dd><dt>Khoản thu</dt><dd>${esc(c.title)} · ${esc(c.term)}</dd><dt>Số tiền</dt><dd>${vnd(r.amount)}</dd><dt>Hình thức</dt><dd>${r.method === "CASH" ? "Tiền mặt" : "Chuyển khoản"}</dd><dt>Mã giao dịch</dt><dd>${esc(r.reference || "—")}</dd><dt>Xác nhận lúc</dt><dd>${esc(formatVietnamTime(r.confirmedAt))}</dd></dl>${r.reason ? `<p>${esc(r.reason)}</p>` : ""}${r.status !== "CONFIRMED" ? "<p>Phiếu này chưa được tính là khoản thu đã xác nhận tại thời điểm xem.</p>" : ""}</article>${r.status === "CONFIRMED" ? '<button id="print-receipt" class="primary no-print">In phiếu</button>' : ""}`;
    dialog.querySelector("#print-receipt")?.addEventListener("click", () => {
      document.body.classList.add("printing-receipt");
      window.addEventListener(
        "afterprint",
        () => document.body.classList.remove("printing-receipt"),
        { once: true },
      );
      window.print();
    });
  } catch (error) {
    if (dialog.isConnected && dialog.open)
      dialog.querySelector(".loading").textContent = error.message;
  }
}
