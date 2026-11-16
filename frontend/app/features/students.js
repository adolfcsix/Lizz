import { openStudyHistory } from "./study-attempts.js";
import {
  openStudentDocument,
  portraitMarkup,
  guardPortrait,
} from "./student-document.js";
import { openContactRequest, contactSummary } from "./profile-requests.js";
import { api } from "../services/api.js";
import { parseStudentCsv } from "./student-csv.js";
import {
  heading,
  table,
  escapeHtml as esc,
  field,
  select,
  openEditor,
  errorBox,
  showError,
  notify,
} from "../components/ui.js";

export async function studentsPage(
  container,
  actor,
  query = new URLSearchParams(),
) {
  const [catalog, data] = await Promise.all([
    api("/catalog"),
    api("/students?" + query),
  ]);
  if (actor.role === "STUDENT") {
    const student = data.rows[0];
    if (!student) {
      container.innerHTML =
        heading("Hồ sơ của tôi") +
        '<section class="panel prose"><h2>Hồ sơ đang được cập nhật</h2><p>Vui lòng liên hệ bộ phận quản lý sinh viên để hoàn tất thông tin hồ sơ.</p></section>';
      return;
    }
    const group = catalog.classes.find((row) => row.id === student.classId);
    const major = catalog.majors.find((row) => row.id === group?.majorId);
    const faculty = catalog.faculties.find(
      (row) => row.id === major?.facultyId,
    );
    const cohort = catalog.cohorts.find((row) => row.id === group?.cohortId);
    const fields = [
      ["Mã sinh viên", student.code],
      ["Họ và tên", student.fullName],
      ["Email trường", student.email],
      ["Lớp hành chính", group?.name],
      ["Khóa", cohort?.name],
      ["Ngành", major?.name],
      ["Khoa", faculty?.name],
    ];
    container.innerHTML =
      heading(
        "Hồ sơ của tôi",
        '<button id="view-student-document">Xem bản in</button><button id="request-contact" class="primary">Đề nghị cập nhật liên hệ</button>',
      ) +
      `<section class="panel profile-card student-profile-overview">${portraitMarkup(student)}<dl>${fields.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value || "Chưa cập nhật")}</dd></div>`).join("")}</dl></section><section class="panel prose"><h2>Thông tin liên hệ</h2>${contactSummary(student.contactDetails)}<a href="#profile-requests">Theo dõi yêu cầu cập nhật</a></section>`;
    guardPortrait(container);
    container.querySelector("#view-student-document").onclick = () =>
      openStudentDocument(student.id, actor);
    container.querySelector("#request-contact").onclick = () =>
      openContactRequest(student, () => studentsPage(container, actor, query));
    return;
  }
  const canEdit = ["MANAGER", "STAFF"].includes(actor.role);
  const className = (id) =>
    catalog.classes.find((row) => row.id === id)?.name || "";
  container.innerHTML =
    heading(
      actor.role === "STUDENT" ? "Hồ sơ của tôi" : "Hồ sơ sinh viên",
      canEdit
        ? '<button id="add-students" class="primary">Thêm sinh viên</button><button id="import-csv">Nhập CSV</button>'
        : "",
    ) +
    /* HTML */ `<section class="panel">
      <form id="student-search" class="toolbar">
        <label
          >Tìm sinh viên<input
            name="q"
            type="search"
            value="${esc(query.get("q"))}"
            placeholder="Mã, họ tên, email" /></label
        >${select(
          "Lớp",
          "classId",
          catalog.classes,
          query.get("classId"),
        )}<button>Tìm kiếm</button>
      </form>
      ${table(
        ["Mã sinh viên", "Họ tên / email", "Lớp", ...(canEdit ? [""] : [])],
        data.rows.map(
          (row) =>
            /* HTML */ `<tr>
              <td>${esc(row.code)}</td>
              <td>
                <b>${esc(row.fullName)}</b><small>${esc(row.email)}</small>
              </td>
              <td>${esc(className(row.classId))}</td>
              ${
                canEdit
                  ? /* HTML */ `<td>
                      <button data-edit-student="${row.id}">Chỉnh sửa</button
                      ><button data-student-document="${row.id}">
                        Hồ sơ / ảnh</button
                      ><button data-learning-history="${row.id}">
                        Lịch sử học
                      </button>
                    </td>`
                  : ""
              }
            </tr>`,
        ),
      )}
      <div class="pagination">
        <span
          >Trang
          ${data.page}/${Math.max(
            1,
            Math.ceil(data.total / data.pageSize),
          )}</span
        ><button id="prev" ${data.page <= 1 ? "disabled" : ""}>Trước</button
        ><button
          id="next"
          ${data.page * data.pageSize >= data.total ? "disabled" : ""}
        >
          Sau
        </button>
      </div>
    </section>`;
  for (const button of container.querySelectorAll("[data-learning-history]"))
    button.onclick = () =>
      openStudyHistory({ studentId: button.dataset.learningHistory });
  for (const button of container.querySelectorAll("[data-student-document]"))
    button.onclick = () =>
      openStudentDocument(button.dataset.studentDocument, actor, () =>
        studentsPage(container, actor, query),
      );
  const search = container.querySelector("#student-search");
  search.elements.classId.required = false;
  search.elements.classId.options[0].textContent = "Tất cả lớp";
  search.onsubmit = (event) => {
    event.preventDefault();
    studentsPage(container, actor, new URLSearchParams(new FormData(search)));
  };
  for (const [id, step] of [
    ["prev", -1],
    ["next", 1],
  ])
    container.querySelector("#" + id).onclick = () => {
      query.set("page", data.page + step);
      studentsPage(container, actor, query);
    };
  const refresh = () => studentsPage(container, actor, query);
  container
    .querySelector("#add-students")
    ?.addEventListener("click", () => batchEditor(catalog, refresh));
  container
    .querySelector("#import-csv")
    ?.addEventListener("click", () => csvEditor(catalog, refresh));
  for (const button of container.querySelectorAll("[data-edit-student]"))
    button.onclick = () =>
      editStudent(
        data.rows.find((row) => row.id === button.dataset.editStudent),
        catalog,
        refresh,
        actor,
      );
}

function studentFields(row, catalog, index) {
  return /* HTML */ `<fieldset data-row="${index}">
    <legend>Sinh viên ${index + 1}</legend>
    <div class="form-grid">
      <div class="email-field">
        <label for="email-${index}"
          >Email tài khoản sinh viên<input
            id="email-${index}"
            data-email
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-controls="options-${index}"
            value="${esc(row.email)}"
            required
        /></label>
        <div id="options-${index}" class="suggestions" role="listbox"></div>
        <p class="hint" data-selected>
          ${
            row.accountId
              ? "Đã chọn tài khoản"
              : "Gõ email hoặc tên rồi chọn tài khoản."
          }
        </p>
      </div>
      ${field("Mã sinh viên", "code", "text", row.code)}${field(
        "Họ và tên",
        "fullName",
        "text",
        row.fullName,
      )}${select("Lớp hành chính", "classId", catalog.classes, row.classId)}
    </div>
  </fieldset>`;
}

function batchEditor(catalog, refresh, initialRows = [{}]) {
  const rows = structuredClone(initialRows);
  const batchId = crypto.randomUUID();
  function paint() {
    const dialog = openEditor(
      "Thêm hồ sơ sinh viên",
      /* HTML */ `<p>
          Chọn tài khoản đã cấp. Mỗi tài khoản chỉ liên kết một hồ sơ.
        </p>
        <form>
          ${errorBox()}
          <div id="student-rows">
            ${rows
              .map((row, index) => studentFields(row, catalog, index))
              .join("")}
          </div>
          <div class="actions">
            <button
              type="button"
              id="add-row"
              ${rows.length >= 50 ? "disabled" : ""}
            >
              Thêm dòng</button
            ><button
              type="button"
              id="remove-row"
              ${rows.length <= 1 ? "disabled" : ""}
            >
              Bỏ dòng cuối</button
            ><button class="primary">Kiểm tra trước khi lưu</button>
          </div>
        </form>`,
    );
    const capture = () => {
      for (const element of dialog.querySelectorAll("fieldset")) {
        const row = rows[Number(element.dataset.row)];
        for (const key of ["code", "fullName", "classId"])
          row[key] = element.querySelector(`[name="${key}"]`).value;
      }
    };
    dialog.querySelector("#add-row").onclick = () => {
      capture();
      rows.push({});
      paint();
    };
    dialog.querySelector("#remove-row").onclick = () => {
      capture();
      rows.pop();
      paint();
    };
    for (const element of dialog.querySelectorAll("fieldset"))
      wireSuggestions(element, rows[Number(element.dataset.row)]);
    dialog.querySelector("form").onsubmit = (event) => {
      event.preventDefault();
      capture();
      if (rows.some((row) => !row.accountId))
        return showError(
          dialog,
          Error("Mỗi dòng cần chọn một email từ danh sách gợi ý."),
        );
      const review = openEditor(
        "Kiểm tra hồ sơ trước khi lưu",
        table(
          ["Mã", "Họ tên", "Email", "Lớp"],
          rows.map(
            (row) =>
              /* HTML */ `<tr>
                <td>${esc(row.code)}</td>
                <td>${esc(row.fullName)}</td>
                <td>${esc(row.email)}</td>
                <td>
                  ${esc(
                    catalog.classes.find((c) => c.id === row.classId)?.name,
                  )}
                </td>
              </tr>`,
          ),
        ) +
          `${errorBox()}<p class="hint">Toàn bộ đợt chỉ được lưu khi tất cả dòng hợp lệ, không trùng và lớp còn chỗ.</p><div class="actions"><button id="back">Quay lại</button><button id="confirm" class="primary">Xác nhận tạo ${rows.length} hồ sơ</button></div>`,
      );
      review.querySelector("#back").onclick = paint;
      review.querySelector("#confirm").onclick = async (event) => {
        const button = event.target;
        button.disabled = true;
        try {
          await api("/students/batches", {
            method: "POST",
            body: { batchId, rows },
          });
          review.close();
          notify("Đã lưu và liên kết hồ sơ sinh viên.");
          await refresh();
        } catch (error) {
          showError(review, error);
          button.disabled = false;
        }
      };
    };
  }
  paint();
}

function wireSuggestions(element, row) {
  const input = element.querySelector("[data-email]");
  const list = element.querySelector(".suggestions");
  let requestNumber = 0,
    options = [],
    selected = -1;
  const choose = (account) => {
    row.accountId = account.id;
    row.email = account.email;
    input.value = account.email;
    element.querySelector("[data-selected]").textContent =
      account.fullName + " · " + account.username;
    if (!element.querySelector("[name=fullName]").value)
      element.querySelector("[name=fullName]").value = account.fullName;
    list.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  };
  input.oninput = async () => {
    const current = ++requestNumber;
    row.accountId = "";
    row.email = input.value;
    element.querySelector("[data-selected]").textContent =
      "Chưa chọn tài khoản";
    selected = -1;
    try {
      const result = await api(
        "/students/account-options?q=" + encodeURIComponent(input.value),
      );
      if (current !== requestNumber || !input.isConnected) return;
      options = result.rows;
      list.innerHTML = options.length
        ? options
            .map(
              (account, index) =>
                /* HTML */ `<button
                  type="button"
                  role="option"
                  aria-selected="false"
                  id="option-${element.dataset.row}-${index}"
                  data-option="${index}"
                >
                  <b>${esc(account.email)}</b
                  ><small
                    >${esc(account.fullName)} · ${esc(account.username)}</small
                  >
                </button>`,
            )
            .join("")
        : "<p>Không có tài khoản phù hợp chưa liên kết.</p>";
      input.setAttribute("aria-expanded", "true");
      for (const button of list.querySelectorAll("button"))
        button.onclick = () => choose(options[Number(button.dataset.option)]);
    } catch (error) {
      element.querySelector("[data-selected]").textContent = error.message;
    }
  };
  input.onkeydown = (event) => {
    const buttons = [...list.querySelectorAll("button")];
    if (["ArrowDown", "ArrowUp"].includes(event.key) && buttons.length) {
      event.preventDefault();
      selected =
        (selected + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
        buttons.length;
      buttons.forEach((button, index) =>
        button.setAttribute("aria-selected", String(index === selected)),
      );
      input.setAttribute("aria-activedescendant", buttons[selected].id);
    }
    if (event.key === "Enter" && selected >= 0 && buttons[selected]) {
      event.preventDefault();
      choose(options[selected]);
    }
    if (event.key === "Escape" && list.innerHTML) {
      event.preventDefault();
      event.stopPropagation();
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
    }
  };
}

function csvEditor(catalog, refresh) {
  const dialog = openEditor(
    "Nhập danh sách từ CSV",
    /* HTML */ `<p>
        4 cột: email, mã sinh viên, họ tên, mã lớp. Tối đa 50 dòng.
      </p>
      <form>
        ${errorBox()}<label
          >Danh sách CSV<textarea
            name="csv"
            rows="9"
            required
            placeholder="email,mã sinh viên,họ tên,mã lớp"
          ></textarea></label
        ><button class="primary">Đối chiếu và mở bảng nhập</button>
      </form>`,
  );
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target,
      button = form.querySelector("button");
    button.disabled = true;
    try {
      const rows = parseStudentCsv(form.elements.csv.value);
      for (const [index, row] of rows.entries()) {
        const account = (
          await api(
            "/students/account-options?q=" + encodeURIComponent(row.email),
          )
        ).rows.find((a) => a.email.toLowerCase() === row.email.toLowerCase());
        const classRow = catalog.classes.find(
          (c) => c.code.toLowerCase() === row.classCode.toLowerCase(),
        );
        if (!account || !classRow)
          throw Error(
            `Dòng ${index + 1}: email chưa được cấp/đã liên kết hoặc mã lớp chưa tồn tại.`,
          );
        row.accountId = account.id;
        row.email = account.email;
        row.classId = classRow.id;
      }
      batchEditor(catalog, refresh, rows);
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    }
  };
}

function editStudent(prior, catalog, refresh, actor) {
  const dialog = openEditor(
    "Chỉnh sửa hồ sơ sinh viên",
    /* HTML */ `<p>${esc(prior.email)} · Tài khoản liên kết được giữ nguyên.</p>
      <form>
        ${errorBox()}${field(
          "Mã sinh viên",
          "code",
          "text",
          prior.code,
        )}${field("Họ và tên", "fullName", "text", prior.fullName)}${select(
          "Lớp hành chính",
          "classId",
          catalog.classes,
          prior.classId,
        )}${
          actor.role === "STAFF"
            ? '<p class="muted">Đổi lớp cần lập đề nghị tại mục Hồ sơ đã gửi duyệt.</p><a href="#approvals" id="transfer-link">Lập hồ sơ chuyển lớp</a>'
            : ""
        }<button class="primary">Lưu thay đổi</button>
      </form>`,
  );
  if (actor.role === "STAFF") {
    dialog.querySelector("[name=classId]").disabled = true;
    dialog.querySelector("#transfer-link").onclick = () => dialog.close();
  }
  dialog.querySelector("form").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.target,
      button = form.querySelector("button");
    if (!window.confirm("Xác nhận cập nhật hồ sơ " + prior.code + "?")) return;
    button.disabled = true;
    try {
      await api("/students/" + prior.id, {
        method: "PATCH",
        body: { ...prior, ...Object.fromEntries(new FormData(form)) },
      });
      dialog.close();
      notify("Đã cập nhật hồ sơ, giữ lịch sử thay đổi.");
      await refresh();
    } catch (error) {
      showError(form, error);
      button.disabled = false;
    }
  };
}
