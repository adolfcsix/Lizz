import { api } from "../services/api.js";
import { CATALOGS, catalogIssues } from "../../../shared/local-validation.js";
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

export async function catalogPage(container, actor, kind = "cohorts") {
  const all = await api("/catalog");
  const canEdit =
    ["MANAGER", "STAFF"].includes(actor.role) &&
    (actor.access?.canManageShared !== false ||
      kind === "classes" ||
      (kind === "majors" && actor.access?.canManageMajors));
  const rows = all[kind];
  const nameOf = (type, id) =>
    all[type].find((row) => row.id === id)?.name || "";
  container.innerHTML =
    heading(
      "Danh mục đào tạo",
      canEdit
        ? '<button class="primary" id="add-catalog">Thêm ' +
            CATALOGS[kind].label.toLowerCase() +
            "</button>"
        : "",
    ) +
    /* HTML */ `<nav class="tabs" aria-label="Danh mục">
        ${Object.entries(CATALOGS)
          .map(
            ([id, meta]) =>
              /* HTML */ `<button
                data-kind="${id}"
                aria-pressed="${kind === id}"
              >
                ${meta.label}
              </button>`,
          )
          .join("")}
      </nav>
      <section class="panel">
        ${table(
          ["Mã", "Tên", "Thông tin liên kết", ...(canEdit ? [""] : [])],
          rows.map(
            (row) =>
              /* HTML */ `<tr>
                <td>${esc(row.code)}</td>
                <td>${esc(row.name)}</td>
                <td>
                  ${esc(
                    kind === "cohorts"
                      ? row.startYear
                      : kind === "majors"
                        ? nameOf("faculties", row.facultyId)
                        : kind === "classes"
                          ? `${nameOf("majors", row.majorId)} · ${nameOf("cohorts", row.cohortId)} · Tối đa ${row.capacity} SV`
                          : "Khoa chuyên môn",
                  )}
                </td>
                ${canEdit
                  ? /* HTML */ `<td>
                      <button data-edit="${row.id}">Chỉnh sửa</button>
                    </td>`
                  : ""}
              </tr>`,
          ),
        )}
      </section> `;
  for (const button of container.querySelectorAll("[data-kind]"))
    button.onclick = () => catalogPage(container, actor, button.dataset.kind);
  container
    .querySelector("#add-catalog")
    ?.addEventListener("click", () => editCatalog());
  for (const button of container.querySelectorAll("[data-edit]"))
    button.onclick = () =>
      editCatalog(rows.find((row) => row.id === button.dataset.edit));

  function editCatalog(prior = {}) {
    const meta = CATALOGS[kind];
    let extra = "";
    if (kind === "cohorts")
      extra = field(
        "Năm bắt đầu",
        "startYear",
        "number",
        prior.startYear || new Date().getFullYear(),
      );
    if (kind === "majors")
      extra = select("Khoa", "facultyId", all.faculties, prior.facultyId);
    if (kind === "classes")
      extra =
        select("Ngành", "majorId", all.majors, prior.majorId) +
        select("Khóa", "cohortId", all.cohorts, prior.cohortId) +
        field("Sĩ số tối đa", "capacity", "number", prior.capacity || 40);
    const dialog = openEditor(
      (prior.id ? "Chỉnh sửa " : "Thêm ") + meta.label.toLowerCase(),
      /* HTML */ `<form>
        ${errorBox()}
        <div class="form-grid">
          ${field(
            "Mã " + meta.label.toLowerCase(),
            "code",
            "text",
            prior.code,
          )}${field(
            "Tên " + meta.label.toLowerCase(),
            "name",
            "text",
            prior.name,
          )}${extra}
        </div>
        <button class="primary">Lưu ${meta.label.toLowerCase()}</button>
      </form>`,
    );
    dialog.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const input = {
        ...Object.fromEntries(new FormData(form)),
        version: prior.version,
      };
      const issues = catalogIssues(kind, input);
      if (issues.length) return showError(form, new Error(issues.join(" ")));
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        await api("/catalog/" + kind + (prior.id ? "/" + prior.id : ""), {
          method: prior.id ? "PATCH" : "POST",
          body: input,
        });
        dialog.close();
        notify("Đã lưu danh mục.");
        await catalogPage(container, actor, kind);
      } catch (error) {
        showError(form, error);
        button.disabled = false;
      }
    };
  }
}
