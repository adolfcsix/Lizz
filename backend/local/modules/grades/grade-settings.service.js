import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { cleanComponents, cleanBands } from "./grade.rules.js";
const managers = ["MANAGER", "STAFF"];
export async function gradeSettings(store, actor) {
  authorize(actor, managers);
  const [terms, policies] = await Promise.all([
    store.list("terms"),
    store.list("gpaPolicies"),
  ]);
  const grades = await store.list("grades");
  return {
    terms,
    policies: policies.map((p) => ({
      ...p,
      locked: grades.some(
        (g) =>
          g.status === "PUBLISHED" && g.resultSnapshot?.gpaPolicy?.id === p.id,
      ),
    })),
  };
}
export async function saveGradeScheme(store, sectionId, input, actor) {
  authorize(actor, managers);
  const components = cleanComponents(input.components);
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const section = (await tx.list("sections")).find((s) => s.id === sectionId);
    requireValue(section, "Không tìm thấy lớp học phần.", 404);
    requireValue(
      section.version === input.sectionVersion,
      "Thông tin lớp đã thay đổi. Tải lại trước khi cấu hình.",
      409,
    );
    const enrollments = (await tx.list("enrollments")).filter(
        (e) => e.sectionId === sectionId,
      ),
      ids = new Set(enrollments.map((e) => e.id));
    requireValue(
      !(await tx.list("grades")).some((g) => ids.has(g.enrollmentId)),
      "Lớp đã có điểm, không được đổi cách tính. Giữ cấu hình để bảo toàn kết quả.",
      409,
    );
    const old = (await tx.list("gradeSchemes", true)).find(
      (s) => s.sectionId === sectionId,
    );
    requireValue(
      (old?.version || 0) === input.version,
      "Cấu hình điểm đã thay đổi. Tải lại trước khi sửa.",
      409,
    );
    const row = {
      id: old?.id || randomUUID(),
      sectionId,
      components,
      version: (old?.version || 0) + 1,
    };
    if (old)
      await tx.update("gradeSchemes", old.id, { components }, old.version);
    else await tx.insert("gradeSchemes", row);
    await audit(tx, actor, "GRADE_SCHEME_SAVED", sectionId, {
      before: old || null,
      after: row,
    });
    return { row };
  });
}
export async function saveGpaPolicy(store, input, actor) {
  authorize(actor, managers);
  const bands = cleanBands(input.bands);
  requireValue(
    ["LATEST", "HIGHEST"].includes(input.repeatRule),
    "Chọn quy tắc tính học lại/cải thiện.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const term = (await tx.list("terms")).find((t) => t.id === input.termId);
    requireValue(term, "Chọn học kỳ đã thiết lập.", 404);
    const old = (await tx.list("gpaPolicies", true)).find(
      (p) => p.termId === term.id,
    );
    requireValue(
      (old?.version || 0) === input.version,
      "Quy định GPA đã thay đổi. Tải lại trước khi sửa.",
      409,
    );
    requireValue(
      !(await tx.list("grades")).some(
        (g) =>
          g.status === "PUBLISHED" &&
          g.resultSnapshot?.gpaPolicy?.id === old?.id &&
          old,
      ),
      "Quy định đã dùng khi công bố điểm, không sửa hồi tố. Tạo quy định cho học kỳ tiếp theo.",
      409,
    );
    const row = {
      id: old?.id || randomUUID(),
      termId: term.id,
      bands,
      repeatRule: input.repeatRule,
      version: (old?.version || 0) + 1,
    };
    if (old)
      await tx.update(
        "gpaPolicies",
        old.id,
        { bands, repeatRule: input.repeatRule },
        old.version,
      );
    else await tx.insert("gpaPolicies", row);
    await audit(tx, actor, "GPA_POLICY_SAVED", row.id, {
      before: old || null,
      after: row,
    });
    return { row };
  });
}
