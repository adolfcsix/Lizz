import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { compareCurriculumContents } from "../../../../shared/curriculum-comparison.js";
const editors = ["MANAGER", "STAFF"],
  readers = [...editors, "STUDENT"];
const text = (s) => typeof s === "string" && s.trim() && s.length <= 1000;
const uuid = (s) =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
async function locked(source, actor, roles, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    await lockAcademic(tx);
    for (const k of [
      "majors",
      "cohorts",
      "classes",
      "students",
      "curriculumTransfers",
    ])
      await tx.list(k, true);
    return work(tx);
  });
}
const meta = ({ id, code, name, edition, version }) => ({
  id,
  code,
  name,
  edition,
  version,
});
async function review(tx, input) {
  const s = (await tx.list("students")).find((r) => r.id === input.studentId),
    assignment = (await tx.list("curriculumAssignments")).find(
      (r) => r.studentId === s?.id,
    ),
    programs = await tx.list("curricula"),
    before = programs.find((r) => r.id === assignment?.curriculumId),
    after = programs.find((r) => r.id === input.curriculumId),
    group = (await tx.list("classes")).find((r) => r.id === s?.classId);
  requireValue(
    s && assignment && before && after && group,
    "Chọn sinh viên đã có chương trình và phiên bản đích trong quyền.",
    404,
  );
  requireValue(
    before.status === "PUBLISHED" &&
      after.status === "PUBLISHED" &&
      before.code === after.code &&
      after.edition > before.edition &&
      before.majorId === after.majorId &&
      before.cohortId === after.cohortId &&
      group.majorId === after.majorId &&
      group.cohortId === after.cohortId,
    "Chỉ chuyển sang phiên bản đã công bố mới hơn của cùng chương trình, ngành và khóa; hồ sơ phải còn khớp ngành/khóa.",
    409,
  );
  const raw = integrityStore(tx),
    enrollments = (await raw.list("enrollments"))
      .filter((e) => e.studentId === s.id)
      .sort((a, b) => a.id.localeCompare(b.id)),
    ids = new Set(enrollments.map((e) => e.id)),
    sectionIds = new Set(enrollments.map((e) => e.sectionId)),
    grades = (await raw.list("grades"))
      .filter((g) => ids.has(g.enrollmentId))
      .sort((a, b) => a.id.localeCompare(b.id)),
    sections = (await raw.list("sections"))
      .filter((c) => sectionIds.has(c.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    allowed = new Set(
      after.groups.flatMap((g) => g.subjects.map((x) => x.subjectId)),
    ),
    outside = enrollments
      .filter((e) => e.status === "ACTIVE")
      .map((e) => ({ e, c: sections.find((c) => c.id === e.sectionId) }))
      .filter(({ c }) => !c || !allowed.has(c.subjectId));
  const snapshot = {
    student: [s.id, s.version, s.classId],
    group: [group.id, group.version, group.majorId, group.cohortId],
    assignment,
    before,
    after,
    enrollments,
    grades,
    sections,
  };
  return {
    student: { id: s.id, code: s.code, fullName: s.fullName },
    before: meta(before),
    after: meta(after),
    assignment,
    comparison: compareCurriculumContents(before, after),
    outside: outside.map(({ e, c }) => ({
      enrollmentId: e.id,
      sectionCode: c?.code || "Lớp chưa xác định",
      term: c?.term || "",
    })),
    reviewHash: tokenHash(JSON.stringify(snapshot)),
    note: "Giữ nguyên hồ sơ, lớp hành chính, đăng ký và điểm cũ. Tiến độ và điều kiện đăng ký mới dùng chương trình đích sau khi áp dụng; học phần ngoài chương trình cần cán bộ đối chiếu riêng, không tự công nhận hoặc xóa.",
  };
}
export async function previewCurriculumTransfer(source, input, actor) {
  return locked(source, actor, editors, (tx) => review(tx, input));
}
export async function submitCurriculumTransfer(source, input, actor) {
  requireValue(
    uuid(input.requestId) &&
      text(input.reason) &&
      input.confirm === true &&
      typeof input.reviewHash === "string",
    "Cần đối chiếu, căn cứ và xác nhận gửi hồ sơ.",
  );
  const hash = tokenHash(
    JSON.stringify({
      actorId: actor.id,
      studentId: input.studentId,
      curriculumId: input.curriculumId,
      reviewHash: input.reviewHash,
      reason: input.reason.trim(),
    }),
  );
  return locked(source, actor, editors, async (tx) => {
    const all = await tx.list("curriculumTransfers"),
      old = all.find((r) => r.id === input.requestId);
    if (old) {
      requireValue(
        old.requestedBy === actor.id && old.requestHash === hash,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { row: old, replayed: true };
    }
    requireValue(
      !(await integrityStore(tx).list("curriculumTransfers")).some(
        (r) => r.id === input.requestId,
      ),
      "Mã yêu cầu đã được sử dụng.",
      409,
    );
    const preview = await review(tx, input);
    requireValue(
      preview.reviewHash === input.reviewHash,
      "Dữ liệu đã thay đổi. Đối chiếu lại trước khi gửi hồ sơ.",
      409,
    );
    requireValue(
      !(await integrityStore(tx).list("curriculumTransfers")).some(
        (r) =>
          r.studentId === input.studentId &&
          ["PENDING", "APPROVED"].includes(r.status),
      ),
      "Sinh viên còn hồ sơ chuyển chương trình chưa kết thúc.",
      409,
    );
    const row = {
      id: input.requestId,
      studentId: input.studentId,
      requestedBy: actor.id,
      requestHash: hash,
      status: "PENDING",
      payload: {
        curriculumId: input.curriculumId,
        reviewHash: input.reviewHash,
        reason: input.reason.trim(),
        assignment: preview.assignment,
      },
      preview,
      decidedBy: null,
      decisionReason: null,
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    await tx.insert("curriculumTransfers", row);
    await audit(tx, actor, "PROGRAM_CHANGE_SUBMITTED", row.id, {
      studentId: row.studentId,
    });
    return { row, replayed: false };
  });
}
export async function changeCurriculumTransfer(
  source,
  id,
  input,
  actor,
  action,
) {
  requireValue(
    input.confirm === true &&
      Number.isSafeInteger(input.version) &&
      text(input.reason),
    "Cần phiên bản, lý do và xác nhận thao tác.",
  );
  requireValue(
    ["approve", "reject", "cancel", "apply"].includes(action),
    "Thao tác không hợp lệ.",
  );
  return locked(source, actor, editors, async (tx) => {
    const row = (await tx.list("curriculumTransfers")).find((r) => r.id === id);
    requireValue(
      row && (actor.role === "MANAGER" || row.requestedBy === actor.id),
      "Không tìm thấy hồ sơ trong quyền.",
      404,
    );
    if (action === "apply" && row.status === "APPLIED")
      return { row, replayed: true };
    requireValue(
      row.version === input.version,
      "Hồ sơ đã thay đổi. Tải lại trước khi xử lý.",
      409,
    );
    const changes = { updatedAt: Date.now() };
    if (["approve", "reject"].includes(action)) {
      authorize(actor, ["MANAGER"]);
      requireValue(
        row.requestedBy !== actor.id,
        "Người đề nghị không tự duyệt hồ sơ của mình.",
        403,
      );
      requireValue(
        row.status === "PENDING",
        "Chỉ quyết định hồ sơ đang chờ duyệt.",
        409,
      );
      if (action === "approve") {
        const current = await review(tx, {
          studentId: row.studentId,
          curriculumId: row.payload.curriculumId,
        });
        requireValue(
          current.reviewHash === row.payload.reviewHash,
          "Căn cứ đã thay đổi. Hủy hồ sơ và lập lại sau khi đối chiếu.",
          409,
        );
      }
      Object.assign(changes, {
        status: action === "approve" ? "APPROVED" : "REJECTED",
        decidedBy: actor.id,
        decisionReason: input.reason.trim(),
      });
    } else if (action === "cancel") {
      requireValue(
        row.status === "PENDING" ||
          (row.status === "APPROVED" && actor.role === "MANAGER"),
        "Không thể hủy hồ sơ ở trạng thái này.",
        409,
      );
      Object.assign(changes, {
        status: "CANCELLED",
        decisionReason: input.reason.trim(),
      });
    } else {
      requireValue(
        row.status === "APPROVED" &&
          row.decidedBy &&
          row.decidedBy !== row.requestedBy,
        "Chỉ áp dụng quyết định hợp lệ đã được duyệt.",
        409,
      );
      const current = await review(tx, {
        studentId: row.studentId,
        curriculumId: row.payload.curriculumId,
      });
      requireValue(
        current.reviewHash === row.payload.reviewHash,
        "Dữ liệu đã thay đổi sau đối chiếu. Giữ nguyên liên kết; Quản lý cần hủy và lập hồ sơ mới.",
        409,
      );
      const a = current.assignment,
        updated = {
          curriculumId: row.payload.curriculumId,
          reason: row.payload.reason,
        };
      await tx.update("curriculumAssignments", a.id, updated, a.version);
      Object.assign(changes, {
        status: "APPLIED",
        result: {
          assignmentId: a.id,
          beforeCurriculumId: a.curriculumId,
          curriculumId: row.payload.curriculumId,
          version: a.version + 1,
          appliedBy: actor.id,
          appliedAt: Date.now(),
          reason: input.reason.trim(),
        },
      });
    }
    await tx.update("curriculumTransfers", id, changes, row.version);
    const after = { ...row, ...changes, version: row.version + 1 };
    await audit(tx, actor, "PROGRAM_CHANGE_" + after.status, id, {
      beforeStatus: row.status,
      afterStatus: after.status,
      reason: input.reason.trim(),
      result: changes.result || null,
    });
    return { row: after, replayed: false };
  });
}
export async function curriculumTransferOverview(source, actor) {
  return locked(source, actor, readers, async (tx) => {
    const students = (await tx.list("students")).filter(
        (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
      ),
      ids = new Set(students.map((s) => s.id)),
      accounts = await tx.list("accounts"),
      names = new Map(accounts.map((a) => [a.id, a.fullName]));
    const rows = (await tx.list("curriculumTransfers"))
      .filter(
        (r) =>
          ids.has(r.studentId) &&
          (actor.role === "MANAGER" ||
            (actor.role === "STAFF" && r.requestedBy === actor.id) ||
            (actor.role === "STUDENT" && r.status === "APPLIED")),
      )
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map((r) =>
        actor.role === "STUDENT"
          ? {
              id: r.id,
              studentId: r.studentId,
              status: r.status,
              before: r.preview.before,
              after: r.preview.after,
              appliedAt: r.result.appliedAt,
              version: r.version,
            }
          : {
              ...r,
              requesterName: names.get(r.requestedBy) || "",
              deciderName: names.get(r.decidedBy) || "",
            },
      );
    return {
      rows,
      canPropose: editors.includes(actor.role),
      note: "Chuyển phiên bản cùng chương trình/ngành/khóa. Giữ nguyên đăng ký và điểm cũ; không tự công nhận học phần tương đương.",
    };
  });
}
