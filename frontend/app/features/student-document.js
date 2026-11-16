import { api } from "../services/api.js";
import { brand } from "../components/brand.js";
import { CONTACT_FIELDS } from "../../../shared/profile-workflow.js";
import {
  openEditor,
  escapeHtml as esc,
  errorBox,
  showError,
  confirmAction,
  notify,
} from "../components/ui.js";

export function portraitMarkup(student) {
  const url =
    student.photoUrl ||
    (student.photoId
      ? `/api/v1/students/${encodeURIComponent(student.id)}/photo?v=${encodeURIComponent(student.photoId)}`
      : null);
  return `<div class="student-portrait">${url ? `<img src="${esc(url)}" alt="Ảnh hồ sơ ${esc(student.fullName)}" width="120" height="160">` : "<span>Chưa cập nhật<br>ảnh hồ sơ</span>"}</div>`;
}
export function guardPortrait(container) {
  for (const image of container.querySelectorAll(".student-portrait img")) {
    const fail = () => {
      image.replaceWith(
        Object.assign(document.createElement("span"), {
          textContent: "Không tải được ảnh. Vui lòng tải lại hồ sơ.",
        }),
      );
      const print = container.querySelector("#print-student");
      if (print) print.disabled = true;
    };
    image.addEventListener("error", fail, { once: true });
    if (image.complete && !image.naturalWidth) fail();
  }
}
function details(pairs) {
  return `<dl class="record-summary">${pairs.map(([label, value]) => `<dt>${esc(label)}</dt><dd>${esc(value || "Chưa cập nhật")}</dd>`).join("")}</dl>`;
}
export async function openStudentDocument(id, actor, refresh = async () => {}) {
  let dialog = openEditor(
    "Hồ sơ sinh viên",
    '<p role="status">Đang tải hồ sơ…</p>',
  );
  try {
    const { student: s, generatedAt } = await api(`/students/${id}/profile`);
    if (!dialog.open || !dialog.isConnected) return;
    dialog = openEditor(
      "Hồ sơ · " + s.code,
      `<article class="student-document">${brand()}<header class="student-document-title"><p>THÔNG TIN SINH VIÊN</p><h2>${esc(s.fullName)}</h2><span>${esc(s.code)}</span></header><div class="student-document-main">${portraitMarkup(s)}<section aria-label="Thông tin đào tạo">${details(
        [
          ["Email trường", s.email],
          ["Lớp hành chính", s.className],
          ["Khóa", s.cohortName],
          ["Khoa", s.facultyName],
          ["Ngành", s.majorName],
        ],
      )}</section></div><section class="student-document-contact"><h3>Thông tin liên hệ</h3>${details(CONTACT_FIELDS.map((f) => [f.label, s.contactDetails[f.key]]))}</section><footer><p>Trích xuất lúc ${esc(new Date(generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))} · Phiên bản hồ sơ ${esc(s.version)}</p><p>Bản thông tin trích xuất từ hệ thống; không thay thế giấy xác nhận có chữ ký của nhà trường.</p></footer></article>${errorBox()}<div class="actions no-print"><button id="reload-student">Tải lại hồ sơ</button>${["MANAGER", "STAFF"].includes(actor.role) ? '<button id="change-portrait">Cập nhật ảnh</button>' : ""}<button id="print-student" class="primary">In thông tin</button></div>`,
    );
    dialog.classList.add("student-document-dialog");
    dialog.addEventListener(
      "close",
      () => {
        dialog.classList.remove("student-document-dialog");
        document.body.classList.remove("printing-student");
      },
      { once: true },
    );
    guardPortrait(dialog);
    dialog.querySelector("#reload-student").onclick = () =>
      openStudentDocument(id, actor, refresh);
    dialog
      .querySelector("#change-portrait")
      ?.addEventListener("click", () => portraitEditor(s, actor, refresh));
    dialog.querySelector("#print-student").onclick = async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await document.fonts.ready;
        for (const image of dialog.querySelectorAll("img"))
          await image.decode();
        document.body.classList.add("printing-student");
        const clean = () => document.body.classList.remove("printing-student");
        window.addEventListener("afterprint", clean, { once: true });
        dialog.addEventListener("close", clean, { once: true });
        window.print();
      } catch {
        showError(
          dialog,
          Error("Chưa tải đủ hình ảnh. Tải lại hồ sơ trước khi in."),
        );
      } finally {
        button.disabled = false;
      }
    };
  } catch (error) {
    if (dialog.isConnected && dialog.open)
      dialog.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p><button data-dismiss>Đóng</button>`;
    dialog
      .querySelector("[data-dismiss]")
      ?.addEventListener("click", () => dialog.close());
  }
}

async function preparePortrait(file) {
  if (
    !file ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10000000
  )
    throw Error("Chọn ảnh JPEG, PNG hoặc WebP, tối đa 10 MB.");
  if (typeof createImageBitmap !== "function")
    throw Error(
      "Trình duyệt chưa hỗ trợ xử lý ảnh. Vui lòng dùng phiên bản trình duyệt mới hơn.",
    );
  let image;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw Error("Không đọc được ảnh. Chọn lại tệp ảnh còn nguyên vẹn.");
  }
  try {
    if (
      image.width < 64 ||
      image.height < 64 ||
      image.width * image.height > 40000000
    )
      throw Error(
        "Ảnh cần ít nhất 64 pixel mỗi chiều và không quá 40 triệu điểm ảnh.",
      );
    const scale = Math.min(1, 720 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    if (canvas.width < 64 || canvas.height < 64)
      throw Error("Ảnh quá dài hoặc quá hẹp. Chọn lại ảnh chân dung.");
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let content;
    for (const quality of [0.88, 0.76, 0.62, 0.48]) {
      content = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (atob(content).length <= 96000) return { content, canvas };
    }
    throw Error("Ảnh còn quá lớn sau khi xử lý. Chọn ảnh nhẹ hơn.");
  } finally {
    image.close();
  }
}
async function portraitEditor(student, actor, refresh) {
  const dialog = openEditor(
    "Ảnh hồ sơ · " + student.code,
    `<form>${errorBox()}<div class="portrait-comparison"><section><h3>Ảnh hiện tại</h3>${portraitMarkup(student)}</section><section><h3>Ảnh mới</h3><div id="portrait-preview" class="student-portrait"><span>Chọn ảnh để xem trước</span></div></section></div><input id="portrait-file" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Tệp ảnh hồ sơ" hidden><div class="portrait-file-control"><button type="button" id="portrait-pick">Chọn ảnh</button><span id="portrait-filename">Chưa chọn tệp</span></div><p class="hint">Ảnh được thu gọn và chuyển sang JPEG; giữ nguyên tỷ lệ, không cắt khuôn mặt.</p><label>Lý do cập nhật<textarea name="reason" rows="2" maxlength="1000" required></textarea></label><div class="actions"><button type="button" id="portrait-back">Quay lại hồ sơ</button>${student.photoId ? '<button type="button" id="portrait-remove">Gỡ ảnh hiện tại</button>' : ""}<button id="portrait-save" class="primary" disabled>Kiểm tra và lưu ảnh</button></div></form><details id="portrait-history"><summary>Lịch sử cập nhật ảnh</summary><p role="status">Đang tải lịch sử…</p></details>`,
  );
  // openEditor thay dialog cũ; không kế thừa tên trang in từ bản xem trước.
  dialog.classList.remove("student-document-dialog");
  guardPortrait(dialog);
  let prepared = null,
    sequence = 0,
    operation = null,
    busy = false;
  const file = dialog.querySelector("#portrait-file"),
    save = dialog.querySelector("#portrait-save");
  dialog.querySelector("#portrait-pick").onclick = () => file.click();
  file.onchange = async () => {
    dialog.querySelector("#portrait-filename").textContent =
      file.files[0]?.name || "Chưa chọn tệp";
    const turn = ++sequence;
    prepared = null;
    operation = null;
    save.disabled = true;
    const preview = dialog.querySelector("#portrait-preview");
    preview.textContent = "Đang xử lý ảnh…";
    showError(dialog, Error(""));
    try {
      const result = await preparePortrait(file.files[0]);
      if (turn !== sequence || !dialog.isConnected) return;
      prepared = result.content;
      result.canvas.setAttribute("aria-label", "Xem trước ảnh hồ sơ mới");
      result.canvas.setAttribute("role", "img");
      preview.replaceChildren(result.canvas);
      save.disabled = false;
    } catch (error) {
      if (turn !== sequence) return;
      preview.textContent = "Chưa có ảnh mới";
      showError(dialog, error);
    }
  };
  dialog.querySelector("#portrait-back").onclick = () =>
    openStudentDocument(student.id, actor, refresh);
  async function submit(action) {
    if (busy) return;
    const reason = dialog.querySelector("textarea").value.trim();
    if (!reason)
      return showError(dialog, Error("Nhập lý do cập nhật ảnh hồ sơ."));
    if (action === "REPLACE" && !prepared) return;
    busy = true;
    file.disabled = true;
    dialog.querySelector("textarea").disabled = true;
    for (const b of dialog.querySelectorAll("form button")) b.disabled = true;
    try {
      const decision = await confirmAction(dialog, {
        title: action === "REMOVE" ? "Gỡ ảnh hồ sơ?" : "Lưu ảnh đã đối chiếu?",
        message: `${student.fullName} · ${student.code}. ${action === "REMOVE" ? "Hồ sơ sẽ hiển thị chưa cập nhật ảnh." : "Ảnh mới sẽ thay ảnh đang hiển thị."} Lịch sử cũ được giữ lại.`,
        confirmLabel: "Xác nhận cập nhật",
      });
      if (!decision.confirmed) return;
      const payload = {
        version: student.version,
        action,
        reason,
        confirm: true,
        ...(action === "REPLACE" ? { photoContent: prepared } : {}),
      };
      const key = JSON.stringify(payload);
      if (!operation || operation.key !== key)
        operation = { key, requestId: crypto.randomUUID() };
      await api(`/students/${student.id}/photo`, {
        method: "POST",
        body: { ...payload, requestId: operation.requestId },
      });
      notify("Đã cập nhật ảnh hồ sơ.");
      await refresh();
      await openStudentDocument(student.id, actor, refresh);
    } catch (error) {
      showError(dialog, error);
    } finally {
      busy = false;
      file.disabled = false;
      dialog.querySelector("textarea").disabled = false;
      for (const b of dialog.querySelectorAll("form button"))
        b.disabled = false;
      save.disabled = !prepared;
    }
  }
  dialog.querySelector("form").onsubmit = (event) => {
    event.preventDefault();
    submit("REPLACE");
  };
  dialog
    .querySelector("#portrait-remove")
    ?.addEventListener("click", () => submit("REMOVE"));
  try {
    const { rows } = await api(`/students/${student.id}/photo-history`);
    if (!dialog.isConnected || !dialog.open) return;
    dialog.querySelector("#portrait-history p").outerHTML = rows.length
      ? `<ol class="portrait-history">${rows.map((r) => `<li><b>${r.action === "REMOVE" ? "Gỡ ảnh" : "Cập nhật ảnh"}</b><span>${esc(r.actorName)} · ${esc(new Date(r.createdAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }))}</span><p>${esc(r.reason)}</p></li>`).join("")}</ol>`
      : "<p>Chưa có lần cập nhật ảnh.</p>";
  } catch (error) {
    const message = dialog.querySelector("#portrait-history p");
    if (message && dialog.isConnected) message.textContent = error.message;
  }
}
