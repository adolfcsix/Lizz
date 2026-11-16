import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { tokenHash } from "../../core/password.js";
import { assignCurriculum } from "./curriculum.service.js";
import { compareCurriculumContents } from "../../../../shared/curriculum-comparison.js";
const editors = ["MANAGER", "STAFF"];
const uuid = (s) =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const positive = (v) => Number.isSafeInteger(v) && v > 0;
async function locked(source, actor, work, roles = editors) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    await lockAcademic(tx);
    for (const k of ["majors", "cohorts", "classes", "students"])
      await tx.list(k, true);
    return work(tx);
  });
}
function cleanInput(input) {
  requireValue(
    uuid(input.curriculumId) && positive(input.version),
    "Chọn chương trình và phiên bản hợp lệ.",
  );
  requireValue(
    typeof input.reason === "string" &&
      input.reason.trim() &&
      input.reason.length <= 1000,
    "Nhập căn cứ áp dụng, tối đa 1000 ký tự.",
  );
  requireValue(
    Array.isArray(input.students) &&
      input.students.length > 0 &&
      input.students.length <= 50,
    "Chọn từ 1 đến 50 sinh viên trong một đợt.",
  );
  const seen = new Set();
  const students = input.students
    .map((s) => {
      requireValue(
        s && uuid(s.studentId) && positive(s.studentVersion),
        "Mỗi sinh viên cần mã hồ sơ và phiên bản hợp lệ.",
      );
      requireValue(!seen.has(s.studentId), "Danh sách sinh viên bị trùng.");
      seen.add(s.studentId);
      return { studentId: s.studentId, studentVersion: s.studentVersion };
    })
    .sort((a, b) => a.studentId.localeCompare(b.studentId));
  return {
    curriculumId: input.curriculumId,
    version: input.version,
    students,
    reason: input.reason.trim(),
  };
}
async function scopeToken(tx, actor) {
  return actor.role === "STAFF" ? (await tx.access()).token : null;
}
async function preview(tx, actor, input) {
  const programs = await tx.list("curricula"),
    program = programs.find((p) => p.id === input.curriculumId);
  requireValue(program, "Không tìm thấy chương trình trong quyền.", 404);
  requireValue(
    program.status === "PUBLISHED" && program.version === input.version,
    "Chương trình chưa công bố hoặc đã thay đổi. Tải lại trước khi áp dụng.",
    409,
  );
  const students = await tx.list("students"),
    classes = await tx.list("classes"),
    assignments = await tx.list("curriculumAssignments");
  const majors = await tx.list("majors"),
    cohorts = await tx.list("cohorts");
  const rows = [],
    snapshots = [];
  for (const chosen of input.students) {
    const s = students.find((r) => r.id === chosen.studentId),
      c = classes.find((r) => r.id === s?.classId),
      a = assignments.find((r) => r.studentId === s?.id);
    const status = !s
      ? "UNAVAILABLE"
      : s.version !== chosen.studentVersion
        ? "STALE"
        : a
          ? "ASSIGNED"
          : c?.majorId !== program.majorId || c?.cohortId !== program.cohortId
            ? "WRONG_AUDIENCE"
            : "ELIGIBLE";
    rows.push({
      studentId: chosen.studentId,
      studentCode: s?.code || "",
      studentName: s?.fullName || "",
      className: c?.name || "",
      status,
    });
    snapshots.push({
      selected: chosen,
      student: s ? [s.id, s.version, s.code, s.fullName, s.classId] : null,
      class: c || null,
      assignment: a ? [a.id, a.curriculumId, a.version] : null,
    });
  }
  const major = majors.find((r) => r.id === program.majorId),
    cohort = cohorts.find((r) => r.id === program.cohortId);
  rows.sort(
    (a, b) =>
      a.studentCode.localeCompare(b.studentCode, "vi") ||
      a.studentId.localeCompare(b.studentId),
  );
  const previewHash = tokenHash(
    JSON.stringify({
      input,
      actorId: actor.id,
      actorVersion: actor.version,
      scope: await scopeToken(tx, actor),
      program,
      major,
      cohort,
      snapshots,
    }),
  );
  return {
    program: {
      id: program.id,
      code: program.code,
      name: program.name,
      edition: program.edition,
      version: program.version,
      majorName: major?.name || "",
      cohortName: cohort?.name || "",
    },
    reason: input.reason,
    rows,
    eligibleCount: rows.filter((r) => r.status === "ELIGIBLE").length,
    canApply: rows.every((r) => r.status === "ELIGIBLE"),
    previewHash,
  };
}
export async function previewCurriculumBatch(source, input, actor) {
  authorize(actor, editors);
  const clean = cleanInput(input);
  return locked(source, actor, (tx) => preview(tx, actor, clean));
}
export async function applyCurriculumBatch(source, input, actor) {
  authorize(actor, editors);
  const clean = cleanInput(input);
  requireValue(
    input.confirm === true &&
      uuid(input.requestId) &&
      typeof input.previewHash === "string" &&
      /^[a-f0-9]{64}$/.test(input.previewHash),
    "Cần đối chiếu và xác nhận đợt áp dụng.",
  );
  const hash = tokenHash(
    JSON.stringify({ ...clean, previewHash: input.previewHash }),
  );
  return locked(source, actor, async (tx) => {
    const batches = await integrityStore(tx).list("curriculumBatches", true),
      previous = batches.find((r) => r.id === input.requestId);
    if (previous) {
      requireValue(
        previous.actorId === actor.id && previous.requestHash === hash,
        "Mã đợt đã được dùng cho nội dung khác.",
        409,
      );
      const visible = new Set((await tx.list("students")).map((s) => s.id));
      requireValue(
        previous.staffScopeToken === (await scopeToken(tx, actor)) &&
          clean.students.every((s) => visible.has(s.studentId)) &&
          (await tx.list("curricula")).some((p) => p.id === clean.curriculumId),
        "Phạm vi đợt áp dụng đã thay đổi. Tải lại để đối chiếu.",
        403,
      );
      return { ...previous.result, replayed: true };
    }
    const checked = await preview(tx, actor, clean);
    requireValue(
      checked.previewHash === input.previewHash,
      "Dữ liệu đã thay đổi sau khi đối chiếu. Kiểm tra lại danh sách trước khi xác nhận.",
      409,
    );
    requireValue(
      checked.canApply,
      "Có hồ sơ chưa đủ điều kiện. Đợt này chưa được ghi; kiểm tra lại toàn bộ danh sách.",
      409,
    );
    const created = [];
    for (const s of clean.students) {
      const assigned = await assignCurriculum(
        tx,
        {
          ...s,
          curriculumId: clean.curriculumId,
          version: clean.version,
          reason: clean.reason,
          confirm: true,
          requestId: randomUUID(),
        },
        actor,
      );
      const row = checked.rows.find((r) => r.studentId === s.studentId);
      created.push({ ...row, assignmentId: assigned.id });
    }
    created.sort((a, b) => a.studentCode.localeCompare(b.studentCode, "vi"));
    const result = {
      batchId: input.requestId,
      program: checked.program,
      reason: clean.reason,
      createdAt: Date.now(),
      rows: created,
      count: created.length,
    };
    await tx.insert("curriculumBatches", {
      id: input.requestId,
      actorId: actor.id,
      curriculumId: clean.curriculumId,
      requestHash: hash,
      staffScopeToken: await scopeToken(tx, actor),
      result,
      createdAt: result.createdAt,
    });
    await audit(tx, actor, "CURRICULUM_BATCH_ASSIGNED", input.requestId, {
      curriculumId: clean.curriculumId,
      studentIds: clean.students.map((s) => s.studentId),
      count: created.length,
      reason: clean.reason,
    });
    return { ...result, replayed: false };
  });
}
export async function compareCurricula(source, actor, beforeId, afterId) {
  return locked(
    source,
    actor,
    async (tx) => {
      const rows = (await tx.list("curricula")).filter(
        (p) => actor.role !== "LECTURER" || p.status === "PUBLISHED",
      );
      const before = rows.find((p) => p.id === beforeId),
        after = rows.find((p) => p.id === afterId);
      requireValue(
        before && after,
        "Không tìm thấy hai phiên bản trong quyền.",
        404,
      );
      requireValue(
        before.id !== after.id &&
          before.code === after.code &&
          before.majorId === after.majorId &&
          before.cohortId === after.cohortId,
        "Chọn hai phiên bản khác nhau của cùng chương trình, ngành và khóa.",
        409,
      );
      const meta = ({ id, code, name, edition, status, version }) => ({
        id,
        code,
        name,
        edition,
        status,
        version,
      });
      return {
        before: meta(before),
        after: meta(after),
        ...compareCurriculumContents(before, after),
      };
    },
    [...editors, "LECTURER"],
  );
}
