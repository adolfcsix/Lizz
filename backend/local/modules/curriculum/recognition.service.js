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
import { vietnamDate } from "./recognition.rules.js";
const editors = ["MANAGER", "STAFF"],
  readers = [...editors, "STUDENT"];
const text = (v, n) =>
  typeof v === "string" && v.trim().length >= 2 && v.length <= n;
const uuid = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(v);
function clean(input) {
  requireValue(
    input && uuid(input.studentId) && uuid(input.subjectId),
    "Chọn sinh viên và học phần trong quyền.",
  );
  requireValue(
    text(input.institution, 200) &&
      text(input.sourceCourse, 200) &&
      text(input.evidenceReference, 500) &&
      text(input.reason, 1000),
    "Nhập nơi đào tạo, học phần đã học, căn cứ minh chứng và lý do.",
  );
  requireValue(
    Number.isInteger(input.sourceCredits) &&
      input.sourceCredits >= 1 &&
      input.sourceCredits <= 60,
    "Tín chỉ học phần nguồn từ 1–60.",
  );
  requireValue(
    typeof input.satisfiesPrerequisite === "boolean",
    "Chọn rõ có công nhận điều kiện tiên quyết hay không.",
  );
  requireValue(
    typeof input.effectiveDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) &&
      Number.isFinite(Date.parse(input.effectiveDate + "T00:00:00Z")) &&
      new Date(input.effectiveDate + "T00:00:00Z")
        .toISOString()
        .slice(0, 10) === input.effectiveDate &&
      input.effectiveDate <= vietnamDate(),
    "Ngày hiệu lực hợp lệ, không ở tương lai.",
  );
  return Object.fromEntries(
    [
      "studentId",
      "subjectId",
      "institution",
      "sourceCourse",
      "sourceCredits",
      "evidenceReference",
      "reason",
      "effectiveDate",
      "satisfiesPrerequisite",
    ].map((k) => [
      k,
      typeof input[k] === "string" ? input[k].trim() : input[k],
    ]),
  );
}
async function locked(source, actor, roles, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    await lockAcademic(tx);
    for (const k of ["majors", "cohorts", "classes", "students"])
      await tx.list(k, true);
    return work(tx);
  });
}
async function review(tx, input, except = null) {
  const data = Object.fromEntries(
    await Promise.all(
      [
        "students",
        "classes",
        "curriculumAssignments",
        "curricula",
        "subjects",
        "creditRecognitions",
        "enrollments",
        "sections",
        "grades",
      ].map(async (k) => [k, await tx.list(k)]),
    ),
  );
  const student = data.students.find((s) => s.id === input.studentId),
    assignment = data.curriculumAssignments.find(
      (a) => a.studentId === student?.id,
    ),
    program = data.curricula.find((p) => p.id === assignment?.curriculumId),
    cl = data.classes.find((c) => c.id === student?.classId);
  requireValue(
    student && assignment && program?.status === "PUBLISHED" && cl,
    "Sinh viên chưa có chương trình công bố trong quyền.",
    404,
  );
  requireValue(
    cl.majorId === program.majorId && cl.cohortId === program.cohortId,
    "Ngành/khóa không còn khớp chương trình đang áp dụng.",
    409,
  );
  const item = program.groups
      .flatMap((g) => g.subjects)
      .find((s) => s.subjectId === input.subjectId),
    subject = data.subjects.find((s) => s.id === input.subjectId);
  requireValue(
    item && subject,
    "Học phần phải thuộc chương trình đang áp dụng.",
    409,
  );
  requireValue(
    input.sourceCredits >= item.credits,
    "Tín chỉ nguồn chưa đủ học phần đích.",
    409,
  );
  const existing = await integrityStore(tx).list("creditRecognitions");
  requireValue(
    !existing.some(
      (r) =>
        r.id !== except &&
        r.studentId === student.id &&
        r.subjectId === item.subjectId &&
        ["PENDING", "APPROVED", "APPLIED"].includes(r.status),
    ),
    "Đã có hồ sơ đang xử lý hoặc quyết định đang áp dụng cho học phần này.",
    409,
  );
  const active = data.enrollments.filter(
    (e) =>
      e.studentId === student.id &&
      e.status === "ACTIVE" &&
      data.sections.some(
        (s) =>
          s.id === e.sectionId &&
          s.subjectId === item.subjectId &&
          s.endDate >= vietnamDate(),
      ),
  );
  requireValue(
    !active.length,
    "Sinh viên đang có lớp học phần đích chưa kết thúc. Xử lý đăng ký theo quy trình trước, hệ thống không tự rút lớp.",
    409,
  );
  const preview = {
    student: {
      id: student.id,
      code: student.code,
      fullName: student.fullName,
      version: student.version,
    },
    program: {
      id: program.id,
      code: program.code,
      name: program.name,
      edition: program.edition,
      majorId: program.majorId,
      cohortId: program.cohortId,
      version: program.version,
    },
    subject: {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      credits: item.credits,
    },
    assignmentVersion: assignment.version,
  };
  return {
    ...preview,
    sourceHash: tokenHash(JSON.stringify({ preview, assignment, cl, input })),
  };
}
export async function previewRecognition(source, input, actor) {
  const payload = clean(input);
  return locked(source, actor, editors, (tx) => review(tx, payload));
}
export async function submitRecognition(source, input, actor) {
  const payload = clean(input);
  requireValue(
    uuid(input.requestId) &&
      input.confirm === true &&
      typeof input.sourceHash === "string",
    "Xem trước và xác nhận hồ sơ công nhận.",
  );
  const requestHash = tokenHash(JSON.stringify(payload));
  return locked(source, actor, editors, async (tx) => {
    const retry = (await tx.list("creditRecognitions")).find(
      (r) => r.id === input.requestId,
    );
    if (retry) {
      requireValue(
        retry.requestedBy === actor.id && retry.requestHash === requestHash,
        "Mã yêu cầu đã được dùng cho hồ sơ khác.",
        409,
      );
      return { id: retry.id, status: retry.status, version: retry.version };
    }
    const preview = await review(tx, payload);
    requireValue(
      preview.sourceHash === input.sourceHash,
      "Hồ sơ hoặc chương trình đã thay đổi. Xem trước lại.",
      409,
    );
    const row = {
      id: input.requestId,
      studentId: payload.studentId,
      subjectId: payload.subjectId,
      requestedBy: actor.id,
      requestHash,
      status: "PENDING",
      payload: { ...payload, ...preview, sourceHash: preview.sourceHash },
      decidedBy: null,
      decisionReason: null,
      result: null,
      history: [
        {
          action: "SUBMIT",
          actorId: actor.id,
          actorName: actor.fullName || "Cán bộ",
          at: Date.now(),
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    };
    await tx.insert("creditRecognitions", row);
    await audit(tx, actor, "CREDIT_RECOGNITION_PENDING", row.id, {
      studentId: row.studentId,
      subjectId: row.subjectId,
    });
    return { id: row.id, status: row.status, version: 1 };
  });
}
export async function changeRecognition(source, id, action, input, actor) {
  requireValue(
    input &&
      input.confirm === true &&
      Number.isInteger(input.version) &&
      text(input.reason, 1000),
    "Nhập lý do và xác nhận đúng phiên bản hồ sơ.",
  );
  authorize(
    actor,
    ["approve", "reject", "revoke"].includes(action) ? ["MANAGER"] : editors,
  );
  return locked(source, actor, editors, async (tx) => {
    const row = (await tx.list("creditRecognitions")).find((r) => r.id === id);
    requireValue(row, "Không tìm thấy hồ sơ trong quyền.", 404);
    const target = {
      approve: "APPROVED",
      reject: "REJECTED",
      cancel: "CANCELLED",
      apply: "APPLIED",
      revoke: "REVOKED",
    }[action];
    requireValue(target, "Thao tác chưa hợp lệ.");
    if (
      row.status === target &&
      row.version === input.version + 1 &&
      row.history.at(-1).actorId === actor.id &&
      row.history.at(-1).reason === input.reason.trim()
    )
      return { id: row.id, status: row.status, version: row.version };
    requireValue(
      row.version === input.version,
      "Hồ sơ đã thay đổi. Tải lại trước khi xử lý.",
      409,
    );
    if (action === "approve" || action === "reject") {
      requireValue(
        row.status === "PENDING" && row.requestedBy !== actor.id,
        "Chỉ Quản lý khác người lập được quyết định hồ sơ đang chờ.",
        403,
      );
    } else if (action === "apply")
      requireValue(
        row.status === "APPROVED" &&
          (actor.role === "MANAGER" || row.requestedBy === actor.id),
        "Hồ sơ chưa duyệt hoặc không phải việc được giao.",
        403,
      );
    else if (action === "cancel")
      requireValue(
        row.status === "PENDING" &&
          (actor.role === "MANAGER" || row.requestedBy === actor.id),
        "Chỉ hủy hồ sơ đang chờ thuộc quyền.",
        403,
      );
    else
      requireValue(
        row.status === "APPLIED",
        "Chỉ thu hồi quyết định đang áp dụng.",
        409,
      );
    if (["approve", "apply"].includes(action)) {
      const current = await review(tx, clean(row.payload), row.id);
      requireValue(
        current.sourceHash === row.payload.sourceHash,
        "Nguồn sinh viên, chương trình hoặc lớp đã thay đổi; hủy/trả hồ sơ để lập lại.",
        409,
      );
    }
    if (action === "revoke") {
      const [requirements, enrollments, sections] = await Promise.all(
        ["requirements", "enrollments", "sections"].map((k) => tx.list(k)),
      );
      const dependent = new Set(
        requirements
          .filter((r) => r.active && r.requiredSubjectId === row.subjectId)
          .map((r) => r.subjectId),
      );
      requireValue(
        !enrollments.some(
          (e) =>
            e.studentId === row.studentId &&
            e.status === "ACTIVE" &&
            sections.some(
              (s) =>
                s.id === e.sectionId &&
                s.endDate >= vietnamDate() &&
                (e.studySnapshot?.recognizedPrerequisites?.some(
                  (b) => b.id === row.id,
                ) ||
                  s.subjectId === row.subjectId ||
                  (row.payload.satisfiesPrerequisite &&
                    dependent.has(s.subjectId))),
            ),
        ),
        "Còn lớp đang học có thể phụ thuộc quyết định này. Cần xử lý đăng ký trước khi thu hồi.",
        409,
      );
    }
    const at = Date.now(),
      history = [
        ...row.history,
        {
          action: action.toUpperCase(),
          actorId: actor.id,
          actorName: actor.fullName || "Cán bộ",
          at,
          reason: input.reason.trim(),
        },
      ];
    const changes = { status: target, updatedAt: at, history };
    if (["approve", "reject"].includes(action))
      Object.assign(changes, {
        decidedBy: actor.id,
        decisionReason: input.reason.trim(),
      });
    if (action === "apply")
      changes.result = {
        appliedBy: actor.id,
        appliedAt: at,
        credits: row.payload.subject.credits,
        gpaIncluded: false,
      };
    if (action === "revoke")
      changes.result = { ...row.result, revokedBy: actor.id, revokedAt: at };
    await tx.update("creditRecognitions", id, changes, row.version);
    await audit(tx, actor, "CREDIT_RECOGNITION_" + target, id, {
      studentId: row.studentId,
      subjectId: row.subjectId,
      reason: input.reason.trim(),
    });
    return { id, status: target, version: row.version + 1 };
  });
}
export async function recognitionOverview(source, actor) {
  return locked(source, actor, readers, async (tx) => {
    const students = (await tx.list("students")).filter(
        (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
      ),
      ids = new Set(students.map((s) => s.id));
    const rows = (await tx.list("creditRecognitions"))
      .filter(
        (r) =>
          ids.has(r.studentId) &&
          (actor.role !== "STUDENT" ||
            ["APPLIED", "REVOKED"].includes(r.status)),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) =>
        actor.role === "STUDENT"
          ? {
              id: r.id,
              studentId: r.studentId,
              subjectId: r.subjectId,
              status: r.status,
              subject: r.payload.subject,
              program: r.payload.program,
              effectiveDate: r.payload.effectiveDate,
              satisfiesPrerequisite: r.payload.satisfiesPrerequisite,
              result: r.result
                ? {
                    appliedAt: r.result.appliedAt,
                    revokedAt: r.result.revokedAt,
                    credits: r.result.credits,
                    gpaIncluded: false,
                  }
                : null,
              version: r.version,
            }
          : { ...r, requestHash: undefined },
      );
    return {
      rows,
      students: students.map(({ id, code, fullName }) => ({
        id,
        code,
        fullName,
      })),
      canPropose: editors.includes(actor.role),
      note: "Công nhận tín chỉ riêng, không tạo điểm và không cộng vào GPA. Chỉ có hiệu lực sau phê duyệt và xác nhận áp dụng.",
    };
  });
}
