import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { tokenHash } from "../../core/password.js";
import { updateStudent } from "../students/student.service.js";
import { audit } from "../academic/academic.common.js";

const uuid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const text = (value, max = 180) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
async function currentActor(tx, actor, roles) {
  authorize(actor, roles);
  const current = (await tx.list("accounts", true)).find(
    (row) => row.id === actor.id,
  );
  requireValue(
    current?.active &&
      current.version === actor.version &&
      current.role === actor.role,
    "Phiên hoặc quyền đã thay đổi. Đăng nhập lại.",
    401,
  );
  return current;
}
export async function workflowOverview(store, actor) {
  authorize(actor, ["MANAGER", "STAFF"]);
  const tasks = (await store.list("tasks")).filter(
    (row) => actor.role === "MANAGER" || row.assignedTo === actor.id,
  );
  const approvals = (await store.list("approvals")).filter(
    (row) => actor.role === "MANAGER" || row.requestedBy === actor.id,
  );
  const accounts = await store.list("accounts");
  const names = new Map(accounts.map((row) => [row.id, row.fullName]));
  return {
    tasks: tasks.map((row) => ({
      ...row,
      assigneeName: names.get(row.assignedTo),
    })),
    approvals: approvals.map((row) => ({
      ...row,
      requesterName: names.get(row.requestedBy),
      deciderName: names.get(row.decidedBy),
    })),
    staff:
      actor.role === "MANAGER"
        ? accounts
            .filter((row) => row.active && row.role === "STAFF")
            .map(({ id, fullName }) => ({ id, name: fullName }))
        : [],
  };
}
export async function createTask(store, input, actor) {
  requireValue(
    text(input.title) && uuid(input.assignedTo),
    "Nhập tên việc và chọn người nhận.",
  );
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate || "") &&
      Number.isFinite(Date.parse(input.dueDate)) &&
      new Date(input.dueDate).toISOString().slice(0, 10) === input.dueDate,
    "Hạn xử lý không hợp lệ.",
  );
  requireValue(
    ["NORMAL", "HIGH"].includes(input.priority),
    "Chọn mức ưu tiên hợp lệ.",
  );
  requireValue(
    typeof (input.notes ?? "") === "string" &&
      (input.notes ?? "").length <= 3000,
    "Ghi chú tối đa 3.000 ký tự.",
  );
  return store.transaction(async (tx) => {
    await currentActor(tx, actor, ["MANAGER"]);
    const staff = (await tx.list("accounts", true)).find(
      (a) => a.id === input.assignedTo,
    );
    requireValue(
      staff?.active && staff.role === "STAFF",
      "Chọn Nhân viên đang hoạt động.",
    );
    const row = {
      id: randomUUID(),
      title: input.title.trim(),
      assignedTo: staff.id,
      assignedBy: actor.id,
      dueDate: input.dueDate,
      priority: input.priority,
      status: "NEW",
      notes: input.notes || "",
      version: 1,
    };
    await tx.insert("tasks", row);
    await audit(tx, actor, "TASK_CREATED", row.id, { after: row });
    return row;
  });
}
export async function updateTask(store, id, input, actor) {
  return store.transaction(async (tx) => {
    await currentActor(tx, actor, ["MANAGER", "STAFF"]);
    const row = (await tx.list("tasks", true)).find((t) => t.id === id);
    requireValue(
      row && (actor.role === "MANAGER" || row.assignedTo === actor.id),
      "Không tìm thấy công việc trong quyền.",
      404,
    );
    requireValue(
      Number.isInteger(input.version) && input.version === row.version,
      "Công việc đã thay đổi. Tải lại trước khi sửa.",
      409,
    );
    const changes = {};
    if (input.assignedTo !== undefined) {
      authorize(actor, ["MANAGER"]);
      const staff = (await tx.list("accounts", true)).find(
        (a) => a.id === input.assignedTo,
      );
      requireValue(
        staff?.active && staff.role === "STAFF",
        "Người nhận không hợp lệ.",
      );
      changes.assignedTo = staff.id;
      requireValue(text(input.reason, 1000), "Nhập lý do bàn giao.");
    }
    if (input.status !== undefined) {
      requireValue(
        ["IN_PROGRESS", "WAITING", "COMPLETED"].includes(input.status),
        "Trạng thái không hợp lệ.",
      );
      changes.status = input.status;
      if (input.status === "COMPLETED") {
        const open = (await tx.list("approvals", true)).some(
          (a) =>
            a.workId === row.id && ["PENDING", "APPROVED"].includes(a.status),
        );
        requireValue(
          !open,
          "Công việc còn hồ sơ chưa được quyết định hoặc áp dụng.",
          409,
        );
      }
    }
    if (input.notes !== undefined) {
      requireValue(
        typeof input.notes === "string" && input.notes.length <= 3000,
        "Ghi chú tối đa 3.000 ký tự.",
      );
      changes.notes = input.notes;
    }
    requireValue(Object.keys(changes).length, "Chưa có nội dung cập nhật.");
    await tx.update("tasks", id, changes, row.version);
    const after = { ...row, ...changes, version: row.version + 1 };
    await audit(
      tx,
      actor,
      changes.assignedTo ? "TASK_REASSIGNED" : "TASK_UPDATED",
      id,
      { before: row, after, reason: input.reason || "" },
    );
    return after;
  });
}
export async function proposeTransfer(store, input, actor) {
  requireValue(
    uuid(input.requestId) &&
      uuid(input.studentId) &&
      uuid(input.classId) &&
      Number.isInteger(input.studentVersion),
    "Thiếu mã hồ sơ, lớp hoặc phiên bản.",
  );
  requireValue(text(input.reason, 1000), "Nhập lý do và căn cứ chuyển lớp.");
  const digest = tokenHash(
    JSON.stringify({
      studentId: input.studentId,
      classId: input.classId,
      version: input.studentVersion,
      reason: input.reason,
      workId: input.workId || null,
    }),
  );
  return store.transaction(async (tx) => {
    await currentActor(tx, actor, ["MANAGER", "STAFF"]);
    const old = (await tx.list("approvals", true)).find(
      (a) => a.id === input.requestId,
    );
    if (old) {
      requireValue(
        old.requestedBy === actor.id && old.requestHash === digest,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { row: old, replayed: true };
    }
    if (input.workId) {
      const task = (await tx.list("tasks", true)).find(
        (t) => t.id === input.workId,
      );
      requireValue(
        task && (actor.role === "MANAGER" || task.assignedTo === actor.id),
        "Công việc không thuộc quyền xử lý.",
        403,
      );
    }
    const students = await tx.list("students", true),
      student = students.find((s) => s.id === input.studentId);
    const classes = await tx.list("classes", true),
      target = classes.find((c) => c.id === input.classId),
      source = classes.find((c) => c.id === student?.classId);
    requireValue(
      student && target && source,
      "Hồ sơ hoặc lớp không tồn tại.",
      404,
    );
    requireValue(
      student.version === input.studentVersion,
      "Hồ sơ đã thay đổi. Xem lại dữ liệu.",
      409,
    );
    requireValue(target.id !== source.id, "Sinh viên đã ở lớp này.");
    const occupied = students.filter((s) => s.classId === target.id).length;
    requireValue(occupied < target.capacity, "Lớp đích đã đủ sĩ số.", 409);
    const row = {
      id: input.requestId,
      requestHash: digest,
      requestedBy: actor.id,
      workId: input.workId || null,
      title: "Chuyển lớp " + student.code,
      payload: {
        studentId: student.id,
        studentVersion: student.version,
        accountId: student.accountId,
        code: student.code,
        fullName: student.fullName,
        classId: target.id,
        reason: input.reason.trim(),
      },
      preview: [
        {
          label: "Sinh viên",
          before: student.code + " · " + student.fullName,
          after: student.code + " · " + student.fullName,
        },
        { label: "Lớp hành chính", before: source.code, after: target.code },
        {
          label: "Sĩ số lớp đích",
          before: occupied + " / " + target.capacity,
          after: occupied + 1 + " / " + target.capacity,
        },
      ],
      status: "PENDING",
      decidedBy: null,
      decisionReason: null,
      result: null,
      version: 1,
    };
    await tx.insert("approvals", row);
    await audit(tx, actor, "APPROVAL_SUBMITTED", row.id, {
      title: row.title,
      preview: row.preview,
    });
    return { row, replayed: false };
  });
}
export async function decideApproval(store, id, input, actor) {
  requireValue(
    ["APPROVED", "REJECTED"].includes(input.decision) &&
      text(input.reason, 1000),
    "Chọn quyết định và nhập lý do.",
  );
  return store.transaction(async (tx) => {
    await currentActor(tx, actor, ["MANAGER"]);
    const row = (await tx.list("approvals", true)).find((a) => a.id === id);
    requireValue(row, "Không tìm thấy hồ sơ.", 404);
    requireValue(
      row.requestedBy !== actor.id,
      "Người đề nghị không tự phê duyệt hồ sơ của mình.",
      403,
    );
    requireValue(
      row.status === "PENDING" && row.version === input.version,
      "Hồ sơ đã có quyết định hoặc thay đổi. Tải lại để xem.",
      409,
    );
    const changes = {
      status: input.decision,
      decidedBy: actor.id,
      decisionReason: input.reason.trim(),
    };
    await tx.update("approvals", id, changes, row.version);
    await audit(tx, actor, "APPROVAL_DECIDED", id, {
      before: row.status,
      after: input.decision,
      reason: input.reason,
      version: input.version,
    });
    return { ...row, ...changes, version: row.version + 1 };
  });
}
export async function applyApproval(store, id, input, actor) {
  requireValue(input.confirm === true, "Cần xác nhận áp dụng đúng quyết định.");
  return store.transaction(async (tx) => {
    await currentActor(tx, actor, ["MANAGER", "STAFF"]);
    const row = (await tx.list("approvals", true)).find((a) => a.id === id);
    requireValue(
      row && (actor.role === "MANAGER" || row.requestedBy === actor.id),
      "Không tìm thấy hồ sơ trong quyền.",
      404,
    );
    if (row.status === "APPLIED") return { row, replayed: true };
    requireValue(
      row.status === "APPROVED" && row.version === input.version,
      "Chỉ áp dụng hồ sơ đã được duyệt đúng phiên bản.",
      409,
    );
    const p = row.payload;
    const student = (await tx.list("students", true)).find(
      (s) => s.id === p.studentId,
    );
    requireValue(
      student?.version === p.studentVersion,
      "Dữ liệu sinh viên đã thay đổi. Giữ nguyên quyết định; cần lập hồ sơ mới.",
      409,
    );
    const result = await updateStudent(
      tx,
      p.studentId,
      {
        accountId: p.accountId,
        code: p.code,
        fullName: p.fullName,
        classId: p.classId,
        version: p.studentVersion,
      },
      actor,
      { approvedRequestId: row.id },
    );
    await tx.update(
      "approvals",
      id,
      {
        status: "APPLIED",
        result: {
          studentId: result.id,
          classId: result.classId,
          version: result.version,
        },
      },
      row.version,
    );
    await audit(tx, actor, "APPROVAL_APPLIED", id, {
      result: {
        studentId: result.id,
        classId: result.classId,
        version: result.version,
      },
      decisionBy: row.decidedBy,
    });
    return {
      row: {
        ...row,
        status: "APPLIED",
        result: {
          studentId: result.id,
          classId: result.classId,
          version: result.version,
        },
        version: row.version + 1,
      },
      replayed: false,
    };
  });
}
