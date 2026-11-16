import { authorize } from "../../middlewares/authorize.js";
import { randomUUID } from "node:crypto";
import { StudentRepository } from "./student.repository.js";
import { tokenHash } from "../../core/password.js";
import { requireValue } from "../../core/errors.js";
import {
  foldText,
  normalizeEmail,
} from "../../../../shared/local-validation.js";

export async function suggestAccounts(store, query) {
  const prefix = foldText(query).trim();
  const linked = new Set(
    (await store.list("students")).map((row) => row.accountId),
  );
  return (await store.list("accounts"))
    .filter(
      (row) => row.role === "STUDENT" && row.active && !linked.has(row.id),
    )
    .filter((row) =>
      [row.email, row.username, ...row.fullName.split(/\s+/)].some((value) =>
        foldText(value).startsWith(prefix),
      ),
    )
    .sort((a, b) => a.email.localeCompare(b.email))
    .slice(0, 10)
    .map(({ id, email, username, fullName }) => ({
      id,
      email,
      username,
      fullName,
    }));
}

export function validateStudentRow(
  input,
  accounts,
  classes,
  profiles,
  exceptId = null,
) {
  requireValue(input && typeof input === "object", "Dòng hồ sơ không hợp lệ.");
  const account = accounts.find((row) => row.id === input.accountId);
  const classRow = classes.find((row) => row.id === input.classId);
  requireValue(
    account?.active && account.role === "STUDENT",
    "Chọn tài khoản sinh viên đang hoạt động.",
  );
  requireValue(
    !input.email || normalizeEmail(input.email) === account.email,
    "Email không khớp tài khoản đã chọn.",
  );
  requireValue(classRow, "Chọn lớp đã tồn tại.");
  requireValue(
    typeof input.code === "string" &&
      /^[A-Za-z0-9._-]{1,40}$/.test(input.code || ""),
    "Mã sinh viên không hợp lệ.",
  );
  requireValue(
    typeof input.fullName === "string" &&
      input.fullName.trim() &&
      input.fullName.length <= 160,
    "Nhập họ tên sinh viên, tối đa 160 ký tự.",
  );
  const others = profiles.filter((row) => row.id !== exceptId);
  requireValue(
    !others.some((row) => row.accountId === input.accountId),
    "Tài khoản đã có hồ sơ sinh viên.",
    409,
  );
  requireValue(
    !others.some((row) => row.code.toLowerCase() === input.code.toLowerCase()),
    "Mã sinh viên đã tồn tại.",
    409,
  );
  requireValue(
    others.filter((row) => row.classId === input.classId).length <
      classRow.capacity,
    "Lớp đã đủ sĩ số.",
    409,
  );
  return {
    accountId: account.id,
    code: input.code.trim(),
    fullName: input.fullName.trim(),
    classId: classRow.id,
  };
}

export async function importStudents(store, input, actor) {
  authorize(actor, ["MANAGER", "STAFF"]);
  requireValue(
    /^[a-f0-9-]{36}$/.test(input.batchId || ""),
    "Mã đợt nhập không hợp lệ.",
  );
  requireValue(
    Array.isArray(input.rows) &&
      input.rows.length >= 1 &&
      input.rows.length <= 50,
    "Mỗi đợt từ 1 đến 50 hồ sơ.",
  );
  const digest = tokenHash(JSON.stringify(input.rows));
  return store.transaction(async (tx) => {
    // Khóa theo cùng thứ tự để hai đợt nhập không cùng chiếm chỗ cuối của lớp.
    const accounts = await tx.list("accounts", true);
    const classes = await tx.list("classes", true);
    const old = (await tx.list("batches")).find(
      (row) => row.id === input.batchId,
    );
    if (old) {
      requireValue(
        old.actorId === actor.id && old.requestHash === digest,
        "Mã đợt nhập đã được dùng cho dữ liệu khác.",
        409,
      );
      return { rows: old.result, replayed: true };
    }
    const repo = new StudentRepository(tx);
    const profiles = await repo.list();
    const created = [];
    for (const [index, row] of input.rows.entries()) {
      let clean;
      try {
        clean = validateStudentRow(row, accounts, classes, profiles);
      } catch (error) {
        error.message = `Dòng ${index + 1}: ${error.message}`;
        throw error;
      }
      const profile = { id: randomUUID(), ...clean, version: 1 };
      await repo.create(profile);
      profiles.push(profile);
      created.push(profile);
      await tx.insert("events", {
        id: randomUUID(),
        actorId: actor.id,
        action: "STUDENT_CREATED",
        entityId: profile.id,
        detail: {
          code: profile.code,
          email: accounts.find((a) => a.id === clean.accountId).email,
          classId: clean.classId,
        },
      });
    }
    await tx.insert("batches", {
      id: input.batchId,
      actorId: actor.id,
      requestHash: digest,
      result: created,
    });
    return { rows: created, replayed: false };
  });
}

export async function updateStudent(store, id, input, actor, options = {}) {
  authorize(actor, ["MANAGER", "STAFF"]);
  return store.transaction(async (tx) => {
    const accounts = await tx.list("accounts", true);
    const classes = await tx.list("classes", true);
    const repo = new StudentRepository(tx);
    const profiles = await repo.list();
    const prior = profiles.find((row) => row.id === id);
    requireValue(prior, "Không tìm thấy hồ sơ.", 404);
    if (actor.role === "STAFF" && input.classId !== prior.classId) {
      const approved = (await tx.list("approvals", true)).find(
        (row) => row.id === options.approvedRequestId,
      );
      requireValue(
        approved?.status === "APPROVED" &&
          approved.requestedBy === actor.id &&
          approved.payload.studentId === id &&
          approved.payload.studentVersion === prior.version &&
          approved.payload.classId === input.classId,
        "Chuyển lớp cần hồ sơ được Quản lý phê duyệt. Mở mục Phê duyệt để lập đề nghị.",
        403,
      );
    }
    // Đổi lớp giữ nguyên tài khoản; không cho tráo danh tính khi sửa hồ sơ.
    requireValue(
      input.accountId === prior.accountId,
      "Không đổi tài khoản liên kết khi sửa hồ sơ.",
    );
    const changes = validateStudentRow(input, accounts, classes, profiles, id);
    await repo.update(id, changes, input.version);
    const after = { ...prior, id, ...changes, version: prior.version + 1 };
    await tx.insert("events", {
      id: randomUUID(),
      actorId: actor.id,
      action: "STUDENT_UPDATED",
      entityId: id,
      detail: { before: prior, after },
    });
    return after;
  });
}

export async function listStudents(store, actor, query) {
  authorize(actor, ["MANAGER", "STAFF", "STUDENT"]);
  let rows = await store.list("students");
  if (actor.role === "STUDENT")
    rows = rows.filter((row) => row.accountId === actor.id);
  const accounts = await store.list("accounts");
  rows = rows.map((row) => ({
    ...row,
    email: accounts.find((a) => a.id === row.accountId)?.email || "",
  }));
  const text = foldText(query.get("q") || "");
  rows = rows.filter(
    (row) =>
      (!query.get("classId") || row.classId === query.get("classId")) &&
      foldText(`${row.code} ${row.fullName} ${row.email}`).includes(text),
  );
  rows.sort((a, b) => a.code.localeCompare(b.code, "vi"));
  const page = Math.max(1, Number.parseInt(query.get("page") || "1", 10) || 1);
  const pageSize = 10;
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
  };
}
