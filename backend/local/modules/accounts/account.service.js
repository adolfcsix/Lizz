import { randomUUID } from "node:crypto";
import { AccountRepository } from "./account.repository.js";
import {
  accountIssues,
  normalizeEmail,
} from "../../../../shared/local-validation.js";
import { hashPassword } from "../../core/password.js";
import { requireValue } from "../../core/errors.js";
import { freshActor } from "../academic/academic.common.js";

export function publicAccount(account) {
  const { id, username, email, fullName, role, active, version } = account;
  return {
    id,
    username,
    email,
    fullName,
    role,
    affiliationFacultyId: account.affiliationFacultyId || null,
    affiliationCohortId: account.affiliationCohortId || null,
    active: Boolean(active),
    mustChangePassword: Boolean(account.mustChangePassword),
    version,
  };
}

export async function createAccount(store, input, actor) {
  requireValue(!actor || actor.role === "MANAGER", "Chỉ Quản lý được cấp tài khoản.", 403);
  const issues = accountIssues(input);
  requireValue(!issues.length, issues.join(" "));
  const account = {
    id: randomUUID(),
    username: input.username.trim(),
    email: normalizeEmail(input.email),
    fullName: input.fullName.trim(),
    role: input.role,
    passwordHash: await hashPassword(input.password),
    active: true,
    mustChangePassword: Boolean(actor),
    version: 1,
  };
  return store.transaction(async (tx) => {
    if (actor) await freshActor(tx, actor, ["MANAGER"]);
    const repo = new AccountRepository(tx);
    const all = await repo.list(true);
    requireValue(
      !all.some(
        (row) =>
          row.username.toLowerCase() === account.username.toLowerCase() ||
          row.email === account.email,
      ),
      "Tên đăng nhập hoặc email đã tồn tại.",
      409,
    );
    // Không cho API tự tạo quản trị viên đầu tiên; lệnh admin:create làm việc này.
    requireValue(
      actor || all.length === 0,
      "Cần quản trị viên cấp tài khoản.",
      403,
    );
    requireValue(actor || input.role === "MANAGER", "Tài khoản đầu tiên phải là Quản lý.", 403);
    await repo.create(account);
    await tx.insert("events", {
      id: randomUUID(),
      actorId: actor?.id || account.id,
      action: "ACCOUNT_CREATED",
      entityId: account.id,
      detail: {
        username: account.username,
        email: account.email,
        role: account.role,
      },
    });
    return publicAccount(account);
  });
}

export async function setAccountActive(store, id, input, actor) {
  requireValue(actor?.role === "MANAGER", "Chỉ Quản lý được thay đổi trạng thái tài khoản.", 403);
  requireValue(typeof input.active === "boolean", "Chọn trạng thái tài khoản.");
  requireValue(id !== actor.id, "Không tự khóa tài khoản đang sử dụng.");
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, ["MANAGER"]);
    const accounts = await tx.list("accounts", true), account = accounts.find((a) => a.id === id);
    requireValue(account, "Không tìm thấy tài khoản.", 404);
    requireValue(account.version === input.version, "Tài khoản đã thay đổi. Tải lại trước khi tiếp tục.", 409);
    requireValue(input.active || account.role !== "MANAGER" || accounts.filter((a) => a.role === "MANAGER" && a.active).length > 1,
      "Không khóa Quản lý đang hoạt động cuối cùng.", 409);
    await tx.update("accounts", id, { active: input.active }, input.version);
    if (!input.active)
      for (const session of await tx.list("sessions")) if (session.accountId === id) await tx.removeSession(session.tokenHash);
    await tx.insert("events", { id: randomUUID(), actorId: actor.id,
      action: input.active ? "ACCOUNT_ENABLED" : "ACCOUNT_DISABLED", entityId: id,
      detail: { username: account.username, before: { active: account.active }, after: { active: input.active } } });
    return { ok: true };
  });
}

export async function resetAccountPassword(store, id, input, actor) {
  requireValue(
    actor?.role === "MANAGER",
    "Chỉ quản lý được cấp lại mật khẩu.",
    403,
  );
  requireValue(
    id !== actor.id,
    "Dùng chức năng đổi mật khẩu cho tài khoản của bạn.",
  );
  requireValue(
    typeof input.password === "string" &&
      input.password.length >= 12 &&
      input.password.length <= 128 &&
      input.password === input.passwordConfirm,
    "Mật khẩu cần 12–128 ký tự và hai lần nhập trùng nhau.",
  );
  requireValue(
    input.confirm === true &&
      typeof input.reason === "string" &&
      input.reason.trim().length >= 5 &&
      input.reason.trim().length <= 1000,
    "Xác nhận cấp lại và ghi lý do 5–1000 ký tự.",
  );
  requireValue(
    Number.isInteger(input.version) && input.version > 0,
    "Tải lại tài khoản trước khi cấp lại mật khẩu.",
  );
  const passwordHash = await hashPassword(input.password);
  return store.transaction(async (tx) => {
    const accounts = await tx.list("accounts", true);
    const manager = accounts.find((row) => row.id === actor.id);
    requireValue(
      manager?.active &&
        manager.role === "MANAGER" &&
        manager.version === actor.version &&
        !manager.mustChangePassword,
      "Phiên quản lý đã thay đổi. Đăng nhập lại.",
      403,
    );
    const target = accounts.find((row) => row.id === id);
    requireValue(target, "Không tìm thấy tài khoản.", 404);
    requireValue(
      target.active,
      "Mở khóa tài khoản trước khi cấp lại mật khẩu.",
      409,
    );
    await tx.update(
      "accounts",
      id,
      { passwordHash, mustChangePassword: true },
      input.version,
    );
    for (const session of await tx.list("sessions"))
      if (session.accountId === id) await tx.removeSession(session.tokenHash);
    await tx.insert("events", {
      id: randomUUID(),
      actorId: actor.id,
      action: "ACCOUNT_PASSWORD_RESET",
      entityId: id,
      detail: {
        reason: input.reason.trim(),
        sessionsRevoked: true,
        requiresPasswordChange: true,
      },
    });
    return { ok: true };
  });
}
