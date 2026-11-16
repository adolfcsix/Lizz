import { randomUUID } from "node:crypto";
import { publicAccount } from "../accounts/account.service.js";
import {
  hashPassword,
  verifyPassword,
  newToken,
  tokenHash,
} from "../../core/password.js";
import { requireValue, AppError } from "../../core/errors.js";

const sessionDuration = 8 * 60 * 60 * 1000;

async function resolveAccount(store, identifier, lock = false) {
  const key = identifier.trim().toLowerCase();
  const accounts = await store.list("accounts", lock);
  const students = await store.list("students", lock);
  const ids = new Set(
    students
      .filter((row) => row.code?.toLowerCase() === key && row.accountId)
      .map((row) => row.accountId),
  );
  const matches = accounts.filter(
    (row) =>
      row.username.toLowerCase() === key ||
      row.email.toLowerCase() === key ||
      (row.role === "STUDENT" && ids.has(row.id)),
  );
  return matches.length === 1 ? matches[0] : null;
}

export class AuthService {
  constructor(store) {
    this.store = store;
    this.attempts = new Map();
    this.dummyHash = hashPassword(newToken());
  }

  async login(identifier, password, ip = "local") {
    requireValue(
      typeof identifier === "string" &&
        identifier.length <= 254 &&
        typeof password === "string" &&
        password.length <= 128,
      "Thông tin đăng nhập không hợp lệ.",
    );
    const account = await resolveAccount(this.store, identifier);
    // Mọi bí danh của cùng tài khoản dùng chung giới hạn, không ghi thông tin đăng nhập.
    const key = tokenHash(
      (account?.id || identifier.trim().toLowerCase()) + "|" + ip,
    );
    const ipKey = tokenHash("ip|" + ip);
    for (const [k, value] of this.attempts)
      if (value.until < Date.now()) this.attempts.delete(k);
    const prior = this.attempts.get(key) || {
      count: 0,
      until: Date.now() + 900_000,
    };
    const ipPrior = this.attempts.get(ipKey) || {
      count: 0,
      until: Date.now() + 900_000,
    };
    if (prior.count >= 5 || ipPrior.count >= 30)
      throw new AppError(429, "Đã thử nhiều lần. Vui lòng đợi 15 phút.");
    // Giữ chỗ trước khi băm để các yêu cầu đồng thời không vượt giới hạn.
    prior.count++;
    ipPrior.count++;
    this.attempts.set(key, prior);
    this.attempts.set(ipKey, ipPrior);
    const valid = await verifyPassword(
      password,
      account?.passwordHash || (await this.dummyHash),
    );
    const failure = () => {
      throw new AppError(401, "Tài khoản hoặc mật khẩu chưa đúng.");
    };
    if (!account?.active || !valid) return failure();
    const token = newToken();
    const current = await this.store.transaction(async (tx) => {
      const fresh = await resolveAccount(tx, identifier, true);
      if (
        !fresh?.active ||
        fresh.id !== account.id ||
        fresh.version !== account.version ||
        fresh.passwordHash !== account.passwordHash ||
        fresh.role !== account.role
      )
        return failure();
      await tx.insert("sessions", {
        tokenHash: tokenHash(token),
        accountVersion: fresh.version,
        accountId: fresh.id,
        expiresAt: Date.now() + sessionDuration,
      });
      return publicAccount(fresh);
    });
    this.attempts.delete(key);
    ipPrior.count = Math.max(0, ipPrior.count - 1);
    return { token, account: current };
  }

  async current(token) {
    if (!/^[a-f0-9]{64}$/.test(token || "")) return null;
    const session = (await this.store.list("sessions")).find(
      (row) => row.tokenHash === tokenHash(token) && row.expiresAt > Date.now(),
    );
    if (!session) return null;
    const account = (await this.store.list("accounts")).find(
      (row) =>
        row.id === session.accountId &&
        row.active &&
        row.version === session.accountVersion,
    );
    return account ? publicAccount(account) : null;
  }

  logout(token) {
    return this.store.removeSession(tokenHash(token || ""));
  }

  async changePassword(actor, input) {
    requireValue(
      typeof input.currentPassword === "string" &&
        input.currentPassword.length <= 128,
      "Nhập mật khẩu hiện tại.",
    );
    requireValue(
      typeof input.password === "string" &&
        input.password.length >= 12 &&
        input.password.length <= 128 &&
        input.password === input.passwordConfirm,
      "Mật khẩu mới cần 12–128 ký tự và hai lần nhập trùng nhau.",
    );
    requireValue(
      input.password !== input.currentPassword,
      "Mật khẩu mới cần khác mật khẩu hiện tại.",
    );
    const hash = await hashPassword(input.password);
    await this.store.transaction(async (tx) => {
      const account = (await tx.list("accounts", true)).find(
        (row) => row.id === actor.id,
      );
      requireValue(
        account?.active &&
          account.version === actor.version &&
          account.role === actor.role &&
          (await verifyPassword(input.currentPassword, account.passwordHash)),
        "Mật khẩu hiện tại chưa đúng.",
        400,
      );
      await tx.update(
        "accounts",
        actor.id,
        { passwordHash: hash, mustChangePassword: false },
        account.version,
      );
      for (const session of await tx.list("sessions")) {
        if (session.accountId === actor.id)
          await tx.removeSession(session.tokenHash);
      }
      await tx.insert("events", {
        id: randomUUID(),
        actorId: actor.id,
        action: "ACCOUNT_PASSWORD_CHANGED",
        entityId: actor.id,
        detail: { sessionsRevoked: true },
      });
    });
  }
}
