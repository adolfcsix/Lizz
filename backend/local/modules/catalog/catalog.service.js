import { randomUUID } from "node:crypto";
import {
  CATALOGS,
  catalogIssues,
} from "../../../../shared/local-validation.js";
import { CatalogRepository } from "./catalog.repository.js";
import { requireValue } from "../../core/errors.js";

export async function saveCatalog(store, kind, input, actor, id = null) {
  const issues = catalogIssues(kind, input);
  requireValue(!issues.length, issues.join(" "));
  const changes = Object.fromEntries(
    CATALOGS[kind].fields.map((key) => [
      key,
      ["capacity", "startYear"].includes(key)
        ? Number(input[key])
        : String(input[key]).trim(),
    ]),
  );
  return store.transaction(async (tx) => {
    const repo = new CatalogRepository(tx);
    const all = await repo.all(true);
    const prior = id ? all[kind].find((row) => row.id === id) : null;
    if (id) requireValue(prior, "Không tìm thấy bản ghi.", 404);
    requireValue(
      !all[kind].some(
        (row) =>
          row.id !== id &&
          row.code.toLowerCase() === changes.code.toLowerCase(),
      ),
      "Mã danh mục đã tồn tại.",
      409,
    );
    if (kind === "cohorts")
      requireValue(
        !all.cohorts.some(
          (row) => row.id !== id && row.startYear === changes.startYear,
        ),
        "Mỗi năm chỉ tạo một khóa.",
        409,
      );
    if (kind === "majors")
      requireValue(
        all.faculties.some((row) => row.id === changes.facultyId),
        "Chọn khoa đã tồn tại.",
      );
    if (kind === "classes") {
      requireValue(
        all.majors.some((row) => row.id === changes.majorId) &&
          all.cohorts.some((row) => row.id === changes.cohortId),
        "Chọn ngành và khóa đã tồn tại.",
      );
      const enrolled = (await tx.list("students")).filter(
        (row) => row.classId === id,
      ).length;
      requireValue(
        changes.capacity >= enrolled,
        "Sĩ số tối đa thấp hơn số sinh viên hiện tại.",
      );
      if (prior && enrolled)
        requireValue(
          prior.majorId === changes.majorId &&
            prior.cohortId === changes.cohortId,
          "Lớp đã có sinh viên. Chuyển sinh viên trước khi đổi ngành hoặc khóa.",
        );
    }
    const record = {
      id: id || randomUUID(),
      ...changes,
      version: prior ? prior.version + 1 : 1,
    };
    if (prior) await repo.update(kind, id, changes, input.version);
    else await repo.create(kind, record);
    await tx.insert("events", {
      id: randomUUID(),
      actorId: actor.id,
      action: prior ? "CATALOG_UPDATED" : "CATALOG_CREATED",
      entityId: record.id,
      detail: { kind, before: prior, after: record },
    });
    return record;
  });
}
