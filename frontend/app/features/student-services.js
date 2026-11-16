import { api } from "../services/api.js";
import { heading, table, escapeHtml as esc, field, select, openEditor, errorBox, bindForm } from "../components/ui.js";
import { downloadCsv } from "../components/csv-export.js";
import { foldText } from "../../../shared/local-validation.js";
import { formatVietnamTime } from "../../../shared/academic-format.js";
import { SERVICE_STATES, SERVICE_ACTIONS, DELIVERY_METHODS, serviceMoney } from "../../../shared/student-services.js";

const definitionStates = { DRAFT: "Bản nháp", PUBLISHED: "Đang nhận hồ sơ", CLOSED: "Đã đóng" };
const area = (label, name, value = "", max = 1000, required = false) => `<label>${label}<textarea name="${name}" rows="3" maxlength="${max}" ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
const date = (at) => formatVietnamTime(at);
function accessible(root) {
  for (const node of root.querySelectorAll(".table-scroll")) {
    node.tabIndex = 0; node.setAttribute("role", "region"); node.setAttribute("aria-label", "Thủ tục sinh viên");
  }
}
function serviceSummary(service, details = null) {
  return `<dl class="record-summary"><dt>Thủ tục</dt><dd>${esc(service.code)} · ${esc(service.name)} · Phiên bản ${service.edition}</dd><dt>Hướng dẫn</dt><dd class="ss-multiline">${esc(service.payload.instructions)}</dd><dt>Giấy tờ cần chuẩn bị</dt><dd class="ss-multiline">${esc(service.payload.requiredDocuments || "Theo hướng dẫn của thủ tục")}</dd><dt>Đơn giá</dt><dd>${serviceMoney(service.payload.unitPrice)} / bản</dd>${details ? `<dt>Số lượng và phí dự kiến</dt><dd>${details.quantity} bản · ${serviceMoney(details.estimatedAmount)}</dd><dt>Hình thức nhận</dt><dd>${esc(DELIVERY_METHODS[details.deliveryMethod])}</dd><dt>Mục đích</dt><dd class="ss-multiline">${esc(details.purpose || "Chưa nhập")}</dd><dt>Giấy tờ đã chuẩn bị</dt><dd class="ss-multiline">${esc(details.documentsNote || "Chưa nhập")}</dd>` : ""}</dl><p class="hint">Phí dự kiến theo thủ tục; khoản phải thu và thanh toán được theo dõi tại Học phí và công nợ.</p>`;
}
export async function studentServicesPage(container, actor) {
  let data, mode = actor.role === "STUDENT" ? "catalog" : "requests", q = "", state = "", page = 1, filtered = [];
  const refresh = async () => {
    const next = await api("/student-services");
    if (!container.isConnected) return;
    data = next; shell();
  };
  function shell() {
    container.innerHTML = heading("Thủ tục sinh viên", data.canEditDefinitions ? '<button id="ss-add" class="primary">Thêm thủ tục</button>' : "") +
      (actor.role === "STUDENT" && !data.ownProfile ? '<p class="inline-note">Tài khoản chưa liên kết hồ sơ sinh viên. Liên hệ cán bộ để hoàn tất trước khi lập yêu cầu.</p>' : "") +
      `<section class="panel"><div class="toolbar"><label>Tìm kiếm<input id="ss-query" type="search" value="${esc(q)}" placeholder="Mã thủ tục, hồ sơ hoặc sinh viên"></label><label>Trạng thái<select id="ss-state"><option value="">Tất cả trạng thái</option>${Object.entries(mode === "catalog" ? definitionStates : SERVICE_STATES).map(([id, name]) => `<option value="${id}" ${state === id ? "selected" : ""}>${name}</option>`).join("")}</select></label><button id="ss-export">Xuất CSV</button><button id="ss-refresh">Làm mới</button></div><div class="academic-tabs"><button id="ss-catalog" aria-pressed="${mode === "catalog"}">Danh mục thủ tục</button><button id="ss-requests" aria-pressed="${mode === "requests"}">${actor.role === "STUDENT" ? "Hồ sơ của tôi" : "Quản lý hồ sơ"}</button></div><div id="ss-table"></div></section>`;
    container.querySelector("#ss-query").oninput = (e) => { q = e.target.value; page = 1; paint(); };
    container.querySelector("#ss-state").onchange = (e) => { state = e.target.value; page = 1; paint(); };
    container.querySelector("#ss-refresh").onclick = refresh;
    for (const tab of ["catalog", "requests"])
      container.querySelector("#ss-" + tab).onclick = () => { mode = tab; state = ""; page = 1; shell(); };
    container.querySelector("#ss-add")?.addEventListener("click", () => definitionForm(null));
    container.querySelector("#ss-export").onclick = () => mode === "catalog"
      ? downloadCsv("LIZZ_DANH_MUC_THU_TUC.csv", ["Mã", "Tên", "Phiên bản", "Trạng thái", "Đơn giá", "Số lượng tối đa", "Hướng dẫn", "Giấy tờ"], filtered.map((r) => [r.code, r.name, r.edition, definitionStates[r.status], r.payload.unitPrice, r.payload.maxQuantity, r.payload.instructions, r.payload.requiredDocuments]))
      : downloadCsv("LIZZ_HO_SO_THU_TUC.csv", ["Mã hồ sơ", "Mã sinh viên", "Họ tên", "Thủ tục", "Phiên bản", "Trạng thái", "Số lượng", "Đơn giá", "Phí dự kiến - chưa xác nhận thu", "Khoản thu liên kết", "Đã xác nhận theo sổ thu", "Còn theo sổ thu", "Hình thức nhận", "Người phụ trách", "Số kết quả", "Cập nhật"], filtered.map((r) => [r.id, r.studentCode, r.studentName, r.payload.service.name, r.payload.service.edition, SERVICE_STATES[r.status], r.payload.details.quantity, r.payload.service.payload.unitPrice, r.payload.details.estimatedAmount, r.finance?.code || "", r.finance?.paid ?? "", r.finance?.remaining ?? "", DELIVERY_METHODS[r.payload.details.deliveryMethod], r.assignedName, r.result?.reference || "", date(r.updatedAt)]));
    paint();
  }
  function paint() {
    filtered = (mode === "catalog" ? data.definitions : data.rows).filter((r) => (!state || r.status === state) &&
      foldText(mode === "catalog" ? `${r.code} ${r.name}` : `${r.id} ${r.studentCode} ${r.studentName} ${r.payload.service.code} ${r.payload.service.name}`).includes(foldText(q)));
    const max = Math.max(1, Math.ceil(filtered.length / 10)); page = Math.max(1, Math.min(page, max));
    const target = container.querySelector("#ss-table");
    target.innerHTML = mode === "catalog" ? table(["Thủ tục", "Phí và số lượng", "Trạng thái", "Thao tác"], filtered.slice((page - 1) * 10, page * 10).map((r) => `<tr><td><b>${esc(r.code)}</b><small>${esc(r.name)} · Phiên bản ${r.edition}</small></td><td>${serviceMoney(r.payload.unitPrice)} / bản<small>Tối đa ${r.payload.maxQuantity} bản</small></td><td>${definitionStates[r.status]}</td><td><button data-ss-definition="${r.id}">Xem hướng dẫn</button>${actor.role === "STUDENT" ? `<button data-ss-create="${r.id}" ${!data.ownProfile ? "disabled" : ""}>Lập yêu cầu</button>` : `${data.canEditDefinitions && r.status === "DRAFT" ? `<button data-ss-edit="${r.id}">Chỉnh sửa</button>` : ""}${data.canEditDefinitions && r.status !== "DRAFT" ? `<button data-ss-copy="${r.id}">Tạo phiên bản mới</button>` : ""}${data.canPublish && ["DRAFT", "PUBLISHED"].includes(r.status) ? `<button data-ss-publish="${r.id}" data-action="${r.status === "DRAFT" ? "publish" : "close"}">${r.status === "DRAFT" ? "Công bố" : "Đóng nhận hồ sơ"}</button>` : ""}`}</td></tr>`), "Chưa có thủ tục phù hợp. Đơn vị phụ trách cần công bố thủ tục trước khi sinh viên gửi hồ sơ.")
      : table(["Hồ sơ", "Thủ tục", "Trạng thái", "Thao tác"], filtered.slice((page - 1) * 10, page * 10).map((r) => `<tr><td><b>${esc(r.studentCode)} · ${esc(r.studentName)}</b><small>${esc(r.id)}</small><small>${esc(date(r.updatedAt))}</small></td><td>${esc(r.payload.service.name)}<small>${r.payload.details.quantity} bản · Dự kiến ${serviceMoney(r.payload.details.estimatedAmount)}</small></td><td><span class="badge">${SERVICE_STATES[r.status]}</span><small>${esc(r.assignedName || "Chưa có người phụ trách")}</small></td><td><button data-ss-request="${r.id}">Mở hồ sơ</button></td></tr>`), "Chưa có hồ sơ phù hợp.");
    target.innerHTML += `<div class="pagination"><span>${filtered.length} ${mode === "catalog" ? "thủ tục" : "hồ sơ"} · Trang ${page}/${max}</span><button id="ss-prev" ${page <= 1 ? "disabled" : ""}>Trước</button><button id="ss-next" ${page >= max ? "disabled" : ""}>Sau</button></div>`;
    target.querySelector("#ss-prev").onclick = () => { page--; paint(); };
    target.querySelector("#ss-next").onclick = () => { page++; paint(); };
    for (const button of target.querySelectorAll("[data-ss-definition]")) button.onclick = () => openEditor("Hướng dẫn thủ tục", serviceSummary(data.definitions.find((r) => r.id === button.dataset.ssDefinition)));
    for (const button of target.querySelectorAll("[data-ss-create]")) button.onclick = () => requestForm(data.definitions.find((r) => r.id === button.dataset.ssCreate));
    for (const button of target.querySelectorAll("[data-ss-edit]")) button.onclick = () => definitionForm(data.definitions.find((r) => r.id === button.dataset.ssEdit));
    for (const button of target.querySelectorAll("[data-ss-copy]")) button.onclick = () => definitionForm(data.definitions.find((r) => r.id === button.dataset.ssCopy), true);
    for (const button of target.querySelectorAll("[data-ss-publish]")) button.onclick = () => definitionAction(data.definitions.find((r) => r.id === button.dataset.ssPublish), button.dataset.action);
    for (const button of target.querySelectorAll("[data-ss-request]")) button.onclick = () => openRequest(data.rows.find((r) => r.id === button.dataset.ssRequest));
    accessible(target);
  }
  function definitionForm(row, copy = false) {
    const payload = row?.payload, nextEdition = row ? Math.max(...data.definitions.filter((r) => r.code === row.code).map((r) => r.edition)) + 1 : 1,
      dialog = openEditor(copy ? "Phiên bản thủ tục mới" : row ? "Chỉnh sửa thủ tục" : "Thêm thủ tục", `<form>${errorBox()}<div class="form-grid">${field("Mã thủ tục", "code", "text", row?.code || "")}${field("Tên thủ tục", "name", "text", row?.name || "")}${field("Phiên bản", "edition", "number", copy ? nextEdition : row?.edition || 1)}${field("Đơn giá mỗi bản (đồng)", "unitPrice", "number", payload?.unitPrice ?? 0)}${field("Số lượng tối đa", "maxQuantity", "number", payload?.maxQuantity || 10)}</div>${area("Hướng dẫn thực hiện", "instructions", payload?.instructions || "", 2000, true)}${area("Giấy tờ cần chuẩn bị", "requiredDocuments", payload?.requiredDocuments || "")}<fieldset class="ss-methods"><legend>Hình thức nhận kết quả</legend>${Object.entries(DELIVERY_METHODS).map(([key, name]) => `<label><input type="checkbox" name="delivery-${key}" ${payload?.deliveryMethods.includes(key) || !payload && key === "COUNTER" ? "checked" : ""}>${name}</label>`).join("")}</fieldset><button class="primary">Lưu bản nháp thủ tục</button></form>`);
    bindForm(dialog, (input) => api("/student-services/definitions" + (row && !copy ? "/" + row.id : ""), { method: row && !copy ? "PATCH" : "POST", body: { code: input.code, name: input.name, edition: Number(input.edition), confirm: true, version: row && !copy ? row.version : undefined, payload: { unitPrice: Number(input.unitPrice), maxQuantity: Number(input.maxQuantity), instructions: input.instructions, requiredDocuments: input.requiredDocuments, deliveryMethods: Object.keys(DELIVERY_METHODS).filter((key) => dialog.querySelector(`[name="delivery-${key}"]`).checked) } } }), async () => { mode = "catalog"; await refresh(); });
  }
  function definitionAction(row, action) {
    const dialog = openEditor(action === "publish" ? "Công bố thủ tục" : "Đóng nhận hồ sơ", serviceSummary(row) + `<form>${errorBox()}${area("Căn cứ thay đổi", "reason", "", 1000, true)}<p>${action === "publish" ? "Sinh viên sẽ có thể lập và gửi hồ sơ theo phiên bản này." : "Không nhận hồ sơ mới. Hồ sơ đã gửi tiếp tục dùng nội dung và đơn giá được lưu trước đó."}</p><button class="primary">Xác nhận ${action === "publish" ? "công bố" : "đóng"}</button></form>`);
    bindForm(dialog, (input) => api(`/student-services/definitions/${row.id}/${action}`, { method: "POST", body: { ...input, version: row.version, confirm: true } }), refresh);
  }
  function requestForm(service, row = null) {
    const old = row?.payload.details, requestId = crypto.randomUUID(); let saved;
    const dialog = openEditor(row ? "Bổ sung hồ sơ thủ tục" : "Lập yêu cầu thủ tục", serviceSummary(service) + `<form>${errorBox()}<div class="form-grid">${field("Số lượng bản", "quantity", "number", old?.quantity || 1)}${select("Hình thức nhận", "deliveryMethod", service.payload.deliveryMethods.map((id) => ({ id, name: DELIVERY_METHODS[id] })), old?.deliveryMethod || service.payload.deliveryMethods[0])}</div>${area("Mục đích sử dụng", "purpose", old?.purpose || "")}${area("Giấy tờ đã chuẩn bị / mã tham chiếu", "documentsNote", old?.documentsNote || "")}<p class="hint">Giấy tờ ghi ở đây là thông tin kê khai. Cán bộ sẽ đối chiếu bản gốc hoặc yêu cầu bổ sung.</p><p id="ss-estimate" role="status"></p><button class="primary">${row ? "Lưu bổ sung" : "Lưu bản nháp"}</button></form>`);
    const input = dialog.querySelector('[name="quantity"]'); input.min = 1; input.max = service.payload.maxQuantity;
    const estimate = () => { const n = Number(input.value); dialog.querySelector("#ss-estimate").textContent = Number.isInteger(n) && n >= 1 && n <= service.payload.maxQuantity ? "Phí dự kiến: " + serviceMoney(n * service.payload.unitPrice) : "Nhập số lượng trong giới hạn của thủ tục."; };
    input.oninput = estimate; estimate();
    bindForm(dialog, async (input) => { saved = (await api("/student-services/requests" + (row ? "/" + row.id + "/edit" : ""), { method: "POST", body: { requestId, version: row?.version, serviceId: service.id, serviceVersion: service.version, studentVersion: data.ownProfile.version, confirm: true, details: { quantity: Number(input.quantity), deliveryMethod: input.deliveryMethod, purpose: input.purpose, documentsNote: input.documentsNote } } })).row; }, async () => { mode = "requests"; state = ""; q = ""; await refresh(); const next = data.rows.find((r) => r.id === saved.id); if (next) openRequest(next); });
  }
  function openRequest(row) {
    const dialog = openEditor("Hồ sơ thủ tục", `<p><b>${esc(row.studentCode)} · ${esc(row.studentName)}</b><br>${esc(row.id)} · ${SERVICE_STATES[row.status]}</p>` +
      (row.payload.student.code !== row.studentCode || row.payload.student.fullName !== row.studentName ? `<p class="inline-note">Hồ sơ lúc lập: ${esc(row.payload.student.code)} · ${esc(row.payload.student.fullName)}. Thông tin hiện tại đã thay đổi.</p>` : "") + serviceSummary(row.payload.service, row.payload.details) +
      (row.finance ? `<section><h3>Khoản thu liên kết</h3>${row.finance.status === "NEEDS_REVIEW" ? "<p>Cần đối chiếu lại khoản thu liên kết.</p>" : `<p>${esc(row.finance.code)} · ${esc(row.finance.title)}</p><p>${row.finance.status === "ISSUED" ? "Đang phát hành" : "Đã hủy khoản thu"} · Phải nộp: ${serviceMoney(row.finance.total)} · Đã xác nhận: ${serviceMoney(row.finance.paid)} · Còn: ${serviceMoney(row.finance.remaining)}</p>`}<a href="#finance" data-ss-finance>Xem tại Học phí và công nợ</a></section>` : "") +
      (row.payload.details.deliveryMethod === "EMAIL" ? `<p>Email nhận kết quả theo hồ sơ: ${esc(row.payload.student.email)}</p>` : "") +
      (row.result ? `<section><h3>Kết quả</h3><p><b>${esc(row.result.reference)}</b></p><p class="ss-multiline">${esc(row.result.message)}</p>${row.result.deliveredAt ? `<p>Đã trả lúc ${esc(date(row.result.deliveredAt))} · ${esc(row.result.deliveryReference)}</p>` : ""}</section>` : "") +
      `<p>Người phụ trách: ${esc(row.assignedName || "Chưa tiếp nhận")}</p><div class="actions">${row.actions.map((action) => `<button data-ss-action="${action}">${SERVICE_ACTIONS[action]}</button>`).join("")}</div><h3>Lịch sử xử lý</h3>` + table(["Thời điểm", "Thao tác", "Người thực hiện", "Nội dung"], row.history.map((h) => `<tr><td>${esc(date(h.at))}</td><td>${esc(SERVICE_ACTIONS[h.action] || "Lưu bản nháp")}<small>${esc(SERVICE_STATES[h.to])}</small></td><td>${esc(h.actorName)}</td><td class="ss-multiline">${esc(h.reason || "")}</td></tr>`)));
    for (const button of dialog.querySelectorAll("[data-ss-action]")) button.onclick = () => {
      const action = button.dataset.ssAction;
      if (action === "edit") requestForm(row.status === "DRAFT" ? data.definitions.find((s) => s.id === row.serviceId) || row.payload.service : row.payload.service, row);
      else requestAction(row, action);
    };
    dialog.querySelector("[data-ss-finance]")?.addEventListener("click", () => dialog.close());
    accessible(dialog);
  }
  function requestAction(row, action) {
    const requestId = crypto.randomUUID();
    const dialog = openEditor(SERVICE_ACTIONS[action], `<p>${esc(row.id)} · ${esc(row.payload.service.name)} · ${SERVICE_STATES[row.status]}</p>` +
      (action === "submit" ? serviceSummary(row.payload.service, row.payload.details) + '<p>Gửi hồ sơ để đơn vị phụ trách tiếp nhận và kiểm tra giấy tờ?</p>' : "") +
      `<form>${errorBox()}${action === "reassign" ? select("Người phụ trách mới", "assignedTo", data.processors, row.assignedTo) : ""}${action === "link-charge" ? select("Khoản thu đã phát hành", "chargeId", data.charges.filter((c) => c.studentId === row.studentId && c.amount === row.payload.details.estimatedAmount && !data.rows.some((other) => other.chargeId === c.id)).map((c) => ({ id: c.id, name: c.code + " · " + c.title + " · " + serviceMoney(c.amount) }))) + '<p class="hint">Chọn khoản thu tương ứng với hồ sơ này. Nếu chưa có, lập khoản thu tại Học phí và công nợ rồi làm mới hồ sơ.</p>' : ""}${action === "unlink-charge" ? '<p>Gỡ liên kết để đối chiếu lại hồ sơ. Khoản thu và các phiếu đã ghi vẫn được giữ trong sổ tài chính.</p>' : ""}${["ready", "deliver"].includes(action) ? field(action === "ready" ? "Số văn bản / mã kết quả" : "Căn cứ đã trả kết quả", "reference", "text", "") : ""}${action === "ready" ? area("Nội dung và hướng dẫn nhận kết quả", "message", "", 2000, true) : ""}${!["submit", "take"].includes(action) ? area("Nội dung xử lý / lý do", "reason", "", 1000, true) : ""}${action === "deliver" ? '<p>Chỉ xác nhận sau khi đã bàn giao thực tế hoặc gửi kết quả tới email trường của sinh viên.</p>' : ""}<button class="primary">Xác nhận ${SERVICE_ACTIONS[action].toLowerCase()}</button></form>`);
    if (action === "link-charge" && dialog.querySelector('[name="chargeId"]').options.length <= 1) {
      dialog.querySelector("button.primary").disabled = true;
      dialog.querySelector("form").insertAdjacentHTML("afterbegin", '<p class="inline-note">Chưa có khoản thu phù hợp để liên kết. <a href="#finance" data-ss-create-charge>Lập hoặc kiểm tra khoản thu</a></p>');
      dialog.querySelector("[data-ss-create-charge]").onclick = () => dialog.close();
    }
    bindForm(dialog, (input) => api(`/student-services/requests/${row.id}/${action}`, { method: "POST", body: { ...input, requestId, version: row.version, confirm: true } }), async () => { await refresh(); const next = data.rows.find((r) => r.id === row.id); if (next) openRequest(next); });
  }
  await refresh();
}
