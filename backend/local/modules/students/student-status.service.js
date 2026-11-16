import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { staffStore, integrityStore } from "../access/staff-store.js";
import { statusRequestActions } from "../../../../shared/student-status.js";
const roles = ["MANAGER", "STAFF", "STUDENT"];
const uuid = (s) =>
  typeof s === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
const reason = (s) => typeof s === "string" && s.trim() && s.length <= 1000;
export async function currentStudyState(store, studentId) {
  const rows = (await store.list("statusRequests"))
    .filter((r) => r.studentId === studentId && r.status === "APPLIED")
    .sort((a, b) => b.result.sequence - a.result.sequence);
  const last = rows[0];
  return {
    state: last?.result.state || "ACTIVE",
    sequence: last?.result.sequence || 0,
    requestId: last?.id || null,
    appliedAt: last?.result.appliedAt || null,
    hasDecision: !!last,
  };
}
export async function assertStudyRegistration(store, studentId) {
  const state = await currentStudyState(store, studentId);
  requireValue(
    state.state !== "ON_LEAVE",
    "Bạn đang bảo lưu theo quyết định đã áp dụng. Cần quyết định quay lại học trước khi đăng ký lớp mới.",
    409,
  );
  return state;
}
async function locked(source, actor, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    await lockAcademic(tx);
    for (const k of ["majors", "cohorts", "classes", "students"])
      await tx.list(k, true);
    return work(tx);
  });
}
async function studentFor(tx, actor, id) {
  const s = (await tx.list("students")).find((s) =>
    actor.role === "STUDENT"
      ? s.accountId === actor.id && (!id || s.id === id)
      : s.id === id,
  );
  requireValue(s, "Không tìm thấy hồ sơ sinh viên trong quyền.", 404);
  return s;
}
async function review(tx, input, actor) {
  requireValue(
    ["LEAVE", "RETURN"].includes(input.kind),
    "Chọn bảo lưu hoặc quay lại học.",
  );
  const s = await studentFor(tx, actor, input.studentId),
    term = (await tx.list("terms")).find((t) => t.id === input.termId),
    current = await currentStudyState(tx, s.id);
  requireValue(term, "Chọn học kỳ đã được cấu hình.", 404);
  const after = input.kind === "LEAVE" ? "ON_LEAVE" : "ACTIVE";
  requireValue(
    current.state !== after,
    input.kind === "LEAVE"
      ? "Sinh viên đã đang bảo lưu."
      : "Chưa có quyết định bảo lưu đang hiệu lực để quay lại học.",
    409,
  );
  const raw = integrityStore(tx),
    enrollments = (await raw.list("enrollments"))
      .filter((e) => e.studentId === s.id && e.status === "ACTIVE")
      .sort((a, b) => a.id.localeCompare(b.id)),
    sectionIds = new Set(enrollments.map((e) => e.sectionId)),
    sections = (await raw.list("sections"))
      .filter((c) => sectionIds.has(c.id))
      .sort((a, b) => a.id.localeCompare(b.id)),
    group = (await tx.list("classes")).find((c) => c.id === s.classId);
  const basis = {
    student: [s.id, s.version, s.classId],
    group: group ? [group.id, group.version] : null,
    current,
    term,
    enrollments,
    sections,
  };
  return {
    student: { id: s.id, code: s.code, fullName: s.fullName },
    kind: input.kind,
    term: { id: term.id, code: term.code },
    before: current.state,
    after,
    sequence: current.sequence,
    registrations: enrollments.map((e) => ({
      code:
        sections.find((c) => c.id === e.sectionId)?.code || "Lớp chưa xác định",
      term: sections.find((c) => c.id === e.sectionId)?.term || "",
    })),
    reviewHash: tokenHash(JSON.stringify(basis)),
    note: "Quyết định có hiệu lực từ lúc áp dụng, không tự hẹn ngày hoặc tự kết thúc bảo lưu. Giữ nguyên lớp đã đăng ký, điểm, học phí và chương trình. Bảo lưu chặn đăng ký lớp mới; quay lại học vẫn phải đáp ứng đợt, chỗ, lịch, tín chỉ và điều kiện hiện hành.",
  };
}
export async function previewStudyStatus(source, input, actor) {
  return locked(source, actor, (tx) => review(tx, input, actor));
}
export async function submitStudyStatus(source, input, actor) {
  requireValue(
    uuid(input.requestId) &&
      input.confirm === true &&
      reason(input.reason) &&
      typeof input.reviewHash === "string",
    "Cần căn cứ, đối chiếu và xác nhận gửi yêu cầu.",
  );
  const hash = tokenHash(
    JSON.stringify({
      actorId: actor.id,
      studentId: input.studentId || null,
      kind: input.kind,
      termId: input.termId,
      reviewHash: input.reviewHash,
      reason: input.reason.trim(),
    }),
  );
  return locked(source, actor, async (tx) => {
    const rows = await tx.list("statusRequests"),
      old = rows.find((r) => r.id === input.requestId);
    if (old) {
      requireValue(
        old.requestedBy === actor.id && old.requestHash === hash,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      await studentFor(tx, actor, old.studentId);
      return { row: old, replayed: true };
    }
    const all = await integrityStore(tx).list("statusRequests");
    requireValue(
      !all.some((r) => r.id === input.requestId),
      "Mã yêu cầu đã được sử dụng.",
      409,
    );
    const preview = await review(tx, input, actor);
    requireValue(
      preview.reviewHash === input.reviewHash,
      "Dữ liệu đã thay đổi. Đối chiếu lại trước khi gửi.",
      409,
    );
    requireValue(
      !all.some(
        (r) =>
          r.studentId === preview.student.id &&
          ["SUBMITTED", "REVIEWED", "APPROVED"].includes(r.status),
      ),
      "Sinh viên còn yêu cầu trạng thái học chưa kết thúc.",
      409,
    );
    const row = {
      id: input.requestId,
      studentId: preview.student.id,
      termId: input.termId,
      kind: input.kind,
      requestedBy: actor.id,
      requestHash: hash,
      status: "SUBMITTED",
      payload: {
        reason: input.reason.trim(),
        reviewHash: input.reviewHash,
        history: [
          {
            status: "SUBMITTED",
            actorId: actor.id,
            actorName:
              (await tx.list("accounts")).find((a) => a.id === actor.id)
                ?.fullName || "",
            reason: input.reason.trim(),
            at: Date.now(),
          },
        ],
      },
      preview,
      reviewedBy: null,
      decidedBy: null,
      decisionReason: null,
      result: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    await tx.insert("statusRequests", row);
    await audit(tx, actor, "STUDY_STATUS_SUBMITTED", row.id, {
      studentId: row.studentId,
      kind: row.kind,
    });
    return { row, replayed: false };
  });
}
export async function changeStudyStatus(source, id, input, actor, action) {
  requireValue(
    input.confirm === true &&
      Number.isSafeInteger(input.version) &&
      reason(input.reason),
    "Cần lý do, phiên bản và xác nhận thao tác.",
  );
  requireValue(
    ["review", "approve", "reject", "cancel", "apply"].includes(action),
    "Thao tác không hợp lệ.",
  );
  return locked(source, actor, async (tx) => {
    const row = (await tx.list("statusRequests")).find((r) => r.id === id);
    requireValue(row, "Không tìm thấy yêu cầu trong quyền.", 404);
    await studentFor(tx, actor, row.studentId);
    if (action === "apply") {
      authorize(actor, ["MANAGER", "STAFF"]);
      requireValue(
        actor.role === "MANAGER" || row.reviewedBy === actor.id,
        "Chỉ người kiểm tra hoặc Quản lý áp dụng quyết định.",
        403,
      );
      if (row.status === "APPLIED") return { row, replayed: true };
    }
    requireValue(
      statusRequestActions(actor, row).includes(action),
      "Không có quyền xử lý ở trạng thái này.",
      403,
    );
    requireValue(
      row.version === input.version,
      "Yêu cầu đã thay đổi. Tải lại trước khi xử lý.",
      409,
    );
    if (["review", "approve", "apply"].includes(action)) {
      const current = await review(tx, row, actor);
      requireValue(
        current.reviewHash === row.payload.reviewHash,
        "Căn cứ đã thay đổi. Giữ nguyên trạng thái học; hủy yêu cầu chưa áp dụng và lập lại sau đối chiếu.",
        409,
      );
    }
    const states = {
        review: "REVIEWED",
        approve: "APPROVED",
        reject: "REJECTED",
        cancel: "CANCELLED",
        apply: "APPLIED",
      },
      changes = {
        status: states[action],
        updatedAt: Date.now(),
        decisionReason: input.reason.trim(),
      };
    if (action === "review") changes.reviewedBy = actor.id;
    if (["approve", "reject"].includes(action)) changes.decidedBy = actor.id;
    if (action === "apply") {
      requireValue(
        row.decidedBy &&
          row.decidedBy !== row.requestedBy &&
          row.decidedBy !== row.reviewedBy,
        "Quyết định chưa đủ phân tách người kiểm tra và phê duyệt.",
        409,
      );
      changes.result = {
        state: row.preview.after,
        sequence: row.preview.sequence + 1,
        appliedBy: actor.id,
        appliedAt: Date.now(),
      };
    }
    changes.payload = {
      ...row.payload,
      history: [
        ...(row.payload.history || []),
        {
          status: changes.status,
          actorId: actor.id,
          actorName:
            (await tx.list("accounts")).find((a) => a.id === actor.id)
              ?.fullName || "",
          reason: input.reason.trim(),
          at: changes.updatedAt,
        },
      ],
    };
    await tx.update("statusRequests", id, changes, row.version);
    const after = { ...row, ...changes, version: row.version + 1 };
    await audit(tx, actor, "STUDY_STATUS_" + after.status, row.id, {
      beforeStatus: row.status,
      afterStatus: after.status,
      kind: row.kind,
      reason: input.reason.trim(),
      result: changes.result || null,
    });
    return { row: after, replayed: false };
  });
}
export async function studyStatusOverview(source, actor) {
  return locked(source, actor, async (tx) => {
    const students = (await tx.list("students")).filter(
        (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
      ),
      ids = new Set(students.map((s) => s.id)),
      names = new Map(
        (await tx.list("accounts")).map((a) => [a.id, a.fullName]),
      );
    const rows = (await tx.list("statusRequests"))
      .filter((r) => ids.has(r.studentId))
      .sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
      .map((r) => {
        const name = (id) =>
          names.get(id) ||
          (r.payload.history || []).find((h) => h.actorId === id)?.actorName ||
          "";
        return {
          ...r,
          requesterName: name(r.requestedBy),
          reviewerName: name(r.reviewedBy),
          deciderName: name(r.decidedBy),
        };
      });
    const profiles = [];
    for (const s of students)
      profiles.push({
        id: s.id,
        code: s.code,
        fullName: s.fullName,
        ...(await currentStudyState(tx, s.id)),
      });
    return {
      rows,
      students: profiles,
      terms: (await tx.list("terms")).map(({ id, code, name }) => ({
        id,
        code,
        name,
      })),
      note: "Trạng thái học thay đổi khi quyết định được áp dụng. Các lớp đã đăng ký, điểm và học phí đang có được giữ nguyên.",
    };
  });
}
