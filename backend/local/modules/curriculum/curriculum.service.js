import {
  applicableRecognitions,
  recognitionContext,
} from "./recognition.rules.js";
import { integrityStore } from "../access/staff-store.js";
import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { passedGrade } from "../academic/registration-policy.service.js";
import { foldText } from "../../../../shared/local-validation.js";
import { tokenHash } from "../../core/password.js";
const editors = ["MANAGER", "STAFF"];
const roles = [...editors, "STUDENT", "LECTURER"];
const text = (v, n) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= n;
const requestId = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
async function lock(tx, actor, allowed = editors) {
  await freshActor(tx, actor, allowed);
  await lockAcademic(tx);
  for (const kind of ["majors", "cohorts", "classes", "students"])
    await tx.list(kind, true);
}
async function audience(store, p, student) {
  const c = (await store.list("classes")).find((c) => c.id === student.classId);
  return c?.majorId === p.majorId && c?.cohortId === p.cohortId;
}
function groupsFrom(input, subjects) {
  requireValue(
    Array.isArray(input) && input.length > 0 && input.length <= 40,
    "Cần từ 1 đến 40 nhóm học phần.",
  );
  const used = new Set(),
    codes = new Set();
  let count = 0;
  return input.map((g) => {
    requireValue(
      g && typeof g === "object" && !Array.isArray(g),
      "Nhóm học phần chưa hợp lệ.",
    );
    requireValue(
      text(g.code, 30) &&
        /^[A-Za-z0-9._-]+$/.test(g.code) &&
        text(g.name, 160) &&
        ["REQUIRED", "ELECTIVE"].includes(g.kind),
      "Nhập mã, tên và loại nhóm học phần hợp lệ.",
    );
    requireValue(!codes.has(foldText(g.code)), "Mã nhóm học phần bị trùng.");
    codes.add(foldText(g.code));
    requireValue(
      Array.isArray(g.subjects) &&
        g.subjects.length > 0 &&
        g.subjects.length <= 100,
      "Mỗi nhóm cần từ 1 đến 100 học phần.",
    );
    const items = g.subjects.map((item) => {
      requireValue(
        item && typeof item === "object" && !Array.isArray(item),
        "Học phần trong nhóm chưa hợp lệ.",
      );
      const s = subjects.find((s) => s.id === item.subjectId);
      requireValue(
        s && Number.isInteger(s.credits) && s.credits > 0,
        "Học phần không tồn tại hoặc chưa có số tín chỉ hợp lệ.",
      );
      requireValue(
        !used.has(s.id),
        "Một học phần chỉ thuộc một nhóm trong cùng chương trình.",
      );
      used.add(s.id);
      requireValue(
        Number.isInteger(item.semester) &&
          item.semester >= 1 &&
          item.semester <= 20,
        "Học kỳ dự kiến từ 1 đến 20.",
      );
      return {
        subjectId: s.id,
        subjectCode: s.code,
        subjectName: s.name,
        credits: s.credits,
        semester: item.semester,
      };
    });
    count += items.length;
    requireValue(count <= 300, "Chương trình tối đa 300 học phần.");
    const sum = items.reduce((n, s) => n + s.credits, 0),
      minimum = g.kind === "REQUIRED" ? sum : g.minCredits;
    requireValue(
      Number.isInteger(minimum) && minimum > 0 && minimum <= sum,
      "Tín chỉ tối thiểu nhóm tự chọn phải lớn hơn 0 và không vượt tổng tín chỉ của nhóm.",
    );
    return {
      code: g.code.trim().toUpperCase(),
      name: g.name.trim(),
      kind: g.kind,
      minCredits: minimum,
      subjects: items,
    };
  });
}
export async function curriculumOverview(store, actor) {
  authorize(actor, roles);
  let curricula = await store.list("curricula");
  const students = await store.list("students"),
    assignments = await store.list("curriculumAssignments");
  if (actor.role === "STUDENT") {
    const own = students.find((s) => s.accountId === actor.id),
      ids = new Set(
        assignments
          .filter((a) => a.studentId === own?.id)
          .map((a) => a.curriculumId),
      );
    curricula = curricula.filter(
      (p) => p.status === "PUBLISHED" && ids.has(p.id),
    );
  }
  if (actor.role === "LECTURER")
    curricula = curricula.filter((p) => p.status === "PUBLISHED");
  const visibleStudents = editors.includes(actor.role)
    ? students
    : actor.role === "STUDENT"
      ? students.filter((s) => s.accountId === actor.id)
      : [];
  const allowed = new Set(visibleStudents.map((s) => s.id));
  return {
    curricula,
    subjects: await store.list("subjects"),
    majors: await store.list("majors"),
    cohorts: await store.list("cohorts"),
    classes: await store.list("classes"),
    students: visibleStudents.map(
      ({ id, code, fullName, classId, version }) => ({
        id,
        code,
        fullName,
        classId,
        version,
      }),
    ),
    assignments: assignments.filter((a) => allowed.has(a.studentId)),
    canEdit: editors.includes(actor.role),
    canPublish: actor.role === "MANAGER",
  };
}
export async function saveCurriculum(store, input, actor, id = null) {
  return store.transaction(async (tx) => {
    await lock(tx, actor);
    requireValue(
      typeof input.code === "string" &&
        /^[A-Za-z0-9._-]{1,40}$/.test(input.code) &&
        text(input.name, 180),
      "Nhập mã và tên chương trình hợp lệ.",
    );
    requireValue(
      Number.isInteger(input.edition) &&
        input.edition >= 1 &&
        input.edition <= 999,
      "Phiên bản từ 1 đến 999.",
    );
    const rows = await tx.list("curricula"),
      old = rows.find((p) => p.id === id);
    if (id) requireValue(old, "Không tìm thấy chương trình trong quyền.", 404);
    requireValue(
      !old || old.status === "DRAFT",
      "Bản đã công bố được giữ nguyên. Hãy tạo phiên bản mới.",
      409,
    );
    requireValue(
      !old || old.version === input.version,
      "Chương trình đã thay đổi. Tải lại trước khi sửa.",
      409,
    );
    requireValue(
      (await tx.list("majors")).some((m) => m.id === input.majorId) &&
        (await tx.list("cohorts")).some((c) => c.id === input.cohortId),
      "Chọn ngành và khóa hợp lệ.",
    );
    requireValue(
      !rows.some(
        (p) =>
          p.id !== id &&
          foldText(p.code) === foldText(input.code) &&
          p.edition === input.edition &&
          p.majorId === input.majorId &&
          p.cohortId === input.cohortId,
      ),
      "Mã và phiên bản đã tồn tại cho ngành/khóa này.",
      409,
    );
    const groups = groupsFrom(input.groups, await tx.list("subjects"));
    const fields = {
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      edition: input.edition,
      majorId: input.majorId,
      cohortId: input.cohortId,
      groups,
      updatedBy: actor.id,
      updatedAt: Date.now(),
    };
    const row = {
      id: id || randomUUID(),
      ...fields,
      status: "DRAFT",
      version: (old?.version || 0) + 1,
    };
    if (old) await tx.update("curricula", id, fields, input.version);
    else await tx.insert("curricula", row);
    await audit(
      tx,
      actor,
      old ? "CURRICULUM_UPDATED" : "CURRICULUM_CREATED",
      row.id,
      { before: old || null, after: row },
    );
    return row;
  });
}
export async function publishCurriculum(store, id, input, actor) {
  return store.transaction(async (tx) => {
    await lock(tx, actor, ["MANAGER"]);
    requireValue(input.confirm === true, "Cần xác nhận công bố chương trình.");
    const row = (await tx.list("curricula")).find((p) => p.id === id);
    requireValue(row, "Không tìm thấy chương trình.", 404);
    requireValue(
      row.status === "DRAFT" && row.version === input.version,
      "Chương trình đã công bố hoặc đã thay đổi. Tải lại trước khi tiếp tục.",
      409,
    );
    const groups = groupsFrom(row.groups, await tx.list("subjects"));
    // Không âm thầm công bố tín chỉ/tên môn khác bản người dùng vừa kiểm tra.
    requireValue(
      JSON.stringify(groups) === JSON.stringify(row.groups),
      "Danh mục học phần đã thay đổi. Mở và lưu lại bản nháp trước khi công bố.",
      409,
    );
    const after = {
      ...row,
      status: "PUBLISHED",
      publishedBy: actor.id,
      publishedAt: Date.now(),
      version: row.version + 1,
    };
    await tx.update(
      "curricula",
      id,
      {
        status: after.status,
        publishedBy: after.publishedBy,
        publishedAt: after.publishedAt,
      },
      input.version,
    );
    await audit(tx, actor, "CURRICULUM_PUBLISHED", id, { before: row, after });
    return after;
  });
}
export async function assignCurriculum(store, input, actor) {
  requireValue(
    input.confirm === true && requestId(input.requestId),
    "Cần xác nhận và mã yêu cầu hợp lệ.",
  );
  requireValue(text(input.reason, 1000), "Nhập căn cứ áp dụng chương trình.");
  return store.transaction(async (tx) => {
    await lock(tx, actor);
    const hash = tokenHash(
      JSON.stringify({
        actorId: actor.id,
        curriculumId: input.curriculumId,
        version: input.version,
        studentId: input.studentId,
        studentVersion: input.studentVersion,
        reason: input.reason,
      }),
    );
    const all = await tx.list("curriculumAssignments"),
      retry = all.find((a) => a.id === input.requestId);
    if (retry) {
      requireValue(
        retry.createdBy === actor.id && retry.requestHash === hash,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      const original = (await integrityStore(tx).list("curriculumTransfers"))
        .filter(
          (r) =>
            r.status === "APPLIED" && r.payload?.assignment?.id === retry.id,
        )
        .sort(
          (a, b) => a.payload.assignment.version - b.payload.assignment.version,
        )[0]?.payload.assignment;
      return original || retry;
    }
    const p = (await tx.list("curricula")).find(
        (p) => p.id === input.curriculumId,
      ),
      s = (await tx.list("students")).find((s) => s.id === input.studentId);
    requireValue(
      p && s,
      "Không tìm thấy chương trình hoặc sinh viên trong quyền.",
      404,
    );
    requireValue(
      p.status === "PUBLISHED" &&
        p.version === input.version &&
        s.version === input.studentVersion,
      "Chương trình/hồ sơ đã thay đổi hoặc chưa công bố. Tải lại trước khi áp dụng.",
      409,
    );
    requireValue(
      await audience(tx, p, s),
      "Ngành/khóa của sinh viên không khớp chương trình.",
      409,
    );
    requireValue(
      !all.some((a) => a.studentId === s.id),
      "Sinh viên đã có chương trình. Không tự ghi đè; cần quy trình chuyển chương trình riêng.",
      409,
    );
    const row = {
      id: input.requestId,
      curriculumId: p.id,
      studentId: s.id,
      reason: input.reason.trim(),
      createdBy: actor.id,
      createdAt: Date.now(),
      requestHash: hash,
      version: 1,
    };
    await tx.insert("curriculumAssignments", row);
    await audit(tx, actor, "CURRICULUM_ASSIGNED", row.id, { after: row });
    return row;
  });
}
export async function curriculumForRegistration(store, student, section) {
  const a = (await store.list("curriculumAssignments")).find(
    (a) => a.studentId === student.id,
  );
  if (!a) return null; // Chưa gán: giữ quy định cũ, không tự thay chính sách của sinh viên hiện có.
  const p = (await store.list("curricula")).find(
    (p) => p.id === a.curriculumId,
  );
  requireValue(
    p?.status === "PUBLISHED",
    "Chưa xác minh được chương trình đang áp dụng. Liên hệ cán bộ.",
    409,
  );
  requireValue(
    await audience(store, p, student),
    "Hồ sơ đã đổi ngành/khóa. Cần xét lại chương trình trước khi đăng ký.",
    409,
  );
  requireValue(
    p.groups.some((g) =>
      g.subjects.some((s) => s.subjectId === section.subjectId),
    ),
    "Học phần nằm ngoài chương trình đang áp dụng. Liên hệ cán bộ để xử lý học ngoài chương trình.",
    409,
  );
  return { id: p.id, code: p.code, name: p.name, edition: p.edition };
}
export async function curriculumProgress(store, actor, studentId) {
  return store.transaction(async (tx) => {
    await lock(tx, actor, [...editors, "STUDENT"]);
    return readProgress(tx, actor, studentId);
  });
}
async function readProgress(store, actor, studentId) {
  authorize(actor, [...editors, "STUDENT"]);
  const student = (await store.list("students")).find(
    (s) => s.id === studentId,
  );
  requireValue(
    student && (actor.role !== "STUDENT" || student.accountId === actor.id),
    "Không tìm thấy hồ sơ trong quyền.",
    404,
  );
  const assignment = (await store.list("curriculumAssignments")).find(
    (a) => a.studentId === student.id,
  );
  const limited = store.staffScoped && !(await store.access()).all;
  if (!assignment)
    return {
      student: {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
      },
      status: "UNASSIGNED",
      note: "Chưa được áp dụng chương trình đào tạo.",
    };
  const p = (await store.list("curricula")).find(
    (p) => p.id === assignment.curriculumId,
  );
  requireValue(
    p?.status === "PUBLISHED",
    "Chưa xác minh được chương trình đã áp dụng.",
    409,
  );
  const sameAudience = await audience(store, p, student);
  const own = (await store.list("enrollments")).filter(
      (e) => e.studentId === student.id && e.status === "ACTIVE",
    ),
    ids = new Map(own.map((e) => [e.id, e]));
  const grades = (await store.list("grades")).filter(
    (g) =>
      ids.has(g.enrollmentId) &&
      (g.enrollmentVersion === ids.get(g.enrollmentId).version ||
        !Number.isInteger(g.enrollmentVersion)) &&
      g.status === "PUBLISHED",
  );
  const sections = await store.list("sections");
  const recognized = applicableRecognitions(
    await recognitionContext(store),
    student.id,
  );
  let uncertain = 0;
  const groups = p.groups.map((group) => {
    const subjects = group.subjects.map((item) => {
      const relevant = grades.filter(
        (g) =>
          (g.resultSnapshot?.subjectId ||
            sections.find((s) => s.id === ids.get(g.enrollmentId).sectionId)
              ?.subjectId) === item.subjectId,
      );
      const sufficient = relevant.filter(
        (g) =>
          passedGrade(g) &&
          g.enrollmentVersion === ids.get(g.enrollmentId).version &&
          g.score <= 10 &&
          g.passScore <= 10 &&
          g.resultSnapshot?.subjectId === item.subjectId &&
          Number.isInteger(g.resultSnapshot?.credits) &&
          g.resultSnapshot.credits >= item.credits,
      );
      const unknown = relevant.some(
        (g) =>
          !Number.isInteger(g.enrollmentVersion) ||
          !g.resultSnapshot ||
          !Number.isInteger(g.resultSnapshot?.credits) ||
          g.resultSnapshot.credits <= 0 ||
          !Number.isFinite(g.passScore) ||
          g.passScore <= 0 ||
          g.passScore > 10 ||
          !Number.isFinite(g.score) ||
          g.score < 0 ||
          g.score > 10,
      );
      const recognition = recognized.find(
        (r) =>
          r.subjectId === item.subjectId &&
          r.payload.subject.credits >= item.credits,
      );
      if (unknown && !sufficient.length && !recognition) uncertain++;
      const enrolled = own.some((e) =>
        sections.some(
          (s) => s.id === e.sectionId && s.subjectId === item.subjectId,
        ),
      );
      return {
        ...item,
        recognitionId: recognition?.id || null,
        status: sufficient.length
          ? "PASSED"
          : recognition
            ? "RECOGNIZED"
            : unknown
              ? "UNVERIFIED"
              : relevant.some(passedGrade)
                ? "CREDIT_SHORTFALL"
                : relevant.length
                  ? "NOT_PASSED"
                  : enrolled
                    ? "IN_PROGRESS"
                    : "NOT_TAKEN",
        score: sufficient.length
          ? Math.max(...sufficient.map((g) => g.score))
          : null,
      };
    });
    const earned = subjects
        .filter((s) => ["PASSED", "RECOGNIZED"].includes(s.status))
        .reduce((n, s) => n + s.credits, 0),
      counted = Math.min(earned, group.minCredits);
    return {
      ...group,
      subjects,
      earnedCredits: earned,
      countedCredits: counted,
      remainingCredits: Math.max(0, group.minCredits - counted),
    };
  });
  const required = groups.reduce((n, g) => n + g.minCredits, 0),
    earned = groups.reduce((n, g) => n + g.countedCredits, 0),
    verified = !limited && sameAudience && uncertain === 0;
  return {
    student: { id: student.id, code: student.code, fullName: student.fullName },
    curriculum: { id: p.id, code: p.code, name: p.name, edition: p.edition },
    assignment,
    groups,
    requiredCredits: required,
    earnedCredits: earned,
    remainingCredits: verified ? Math.max(0, required - earned) : null,
    status: verified ? "VERIFIED" : "NEEDS_REVIEW",
    note: !sameAudience
      ? "Hồ sơ đã đổi ngành/khóa; cần xét lại chương trình."
      : limited
        ? "Dữ liệu bị giới hạn theo phạm vi được giao; chưa xác minh tín chỉ còn thiếu."
        : uncertain
          ? "Có kết quả chưa đủ căn cứ tín chỉ/ngưỡng đạt; cần đối chiếu."
          : "Tiến độ từ điểm đạt công bố và tín chỉ công nhận đã áp dụng; công nhận không tạo điểm/GPA và không phải quyết định xét tốt nghiệp.",
  };
}
