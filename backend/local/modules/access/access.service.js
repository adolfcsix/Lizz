import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import { freshActor, audit } from "../academic/academic.common.js";
import { publicAccount } from "../accounts/account.service.js";
export async function accountAccess(store, id, actor) {
  authorize(actor, ["MANAGER"]);
  const account = (await store.list("accounts")).find((a) => a.id === id);
  requireValue(account, "Không tìm thấy tài khoản.", 404);
  const [faculties, cohorts, scopes] = await Promise.all(
    ["faculties", "cohorts", "staffScopes"].map((k) => store.list(k)),
  );
  return {
    account: publicAccount(account),
    faculties,
    cohorts,
    scopes: scopes.filter((s) => s.accountId === id),
  };
}
export async function saveAccountAccess(store, id, input, actor) {
  authorize(actor, ["MANAGER"]);
  requireValue(
    input?.confirm === true &&
      /^[a-f0-9-]{36}$/.test(input.requestId || "") &&
      typeof input.reason === "string" &&
      input.reason.trim() &&
      input.reason.length <= 1000,
    "Cần xác nhận, lý do và mã yêu cầu hợp lệ.",
  );
  const hash = tokenHash(JSON.stringify({ id, input }));
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, ["MANAGER"]);
    const prior = (await tx.list("academicRequests", true)).find(
      (r) => r.id === input.requestId,
    );
    if (prior) {
      requireValue(
        prior.actorId === actor.id && prior.requestHash === hash,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { ...prior.result, replayed: true };
    }
    const account = (await tx.list("accounts")).find((a) => a.id === id);
    requireValue(
      account && ["STAFF", "STUDENT", "LECTURER"].includes(account.role),
      "Chỉ phân phạm vi cho Nhân viên, Sinh viên hoặc Giảng viên.",
      404,
    );
    requireValue(
      account.version === input.version,
      "Tài khoản đã thay đổi. Tải lại trước khi phân phạm vi.",
      409,
    );
    const faculties = await tx.list("faculties"),
      cohorts = await tx.list("cohorts");
    const valid = (f, c) =>
      faculties.some((r) => r.id === f) &&
      (!c || cohorts.some((r) => r.id === c));
    let result;
    if (account.role === "STAFF") {
      requireValue(
        typeof input.allSchools === "boolean" &&
          Array.isArray(input.scopes) &&
          input.scopes.length <= 30,
        "Chọn phạm vi toàn trường hoặc danh sách khoa/khóa.",
      );
      requireValue(
        !input.allSchools || input.scopes.length === 0,
        "Không trộn phạm vi toàn trường với khoa/khóa.",
      );
      requireValue(
        input.scopes.every((s) => s && valid(s.facultyId, s.cohortId)),
        "Khoa hoặc khóa không hợp lệ.",
      );
      const keys = input.scopes.map(
        (s) => s.facultyId + ":" + (s.cohortId || ""),
      );
      requireValue(new Set(keys).size === keys.length, "Phạm vi bị trùng.");
      requireValue(
        !input.scopes.some(
          (s) =>
            s.cohortId &&
            input.scopes.some(
              (t) => t.facultyId === s.facultyId && !t.cohortId,
            ),
        ),
        "Đã chọn toàn khoa thì không thêm lại khóa trong khoa đó.",
      );
      const old = (await tx.list("staffScopes", true)).filter(
        (s) => s.accountId === id && s.active,
      );
      for (const s of old)
        await tx.update("staffScopes", s.id, { active: false }, s.version);
      const scopes = (
        input.allSchools
          ? [{ scopeType: "ALL", facultyId: null, cohortId: null }]
          : input.scopes.map((s) => ({
              scopeType: "FACULTY",
              facultyId: s.facultyId,
              cohortId: s.cohortId || null,
            }))
      ).map((s) => ({
        id: randomUUID(),
        accountId: id,
        ...s,
        active: true,
        version: 1,
      }));
      for (const s of scopes) await tx.insert("staffScopes", s);
      await tx.update(
        "accounts",
        id,
        { active: account.active },
        account.version,
      );
      await audit(tx, actor, "STAFF_SCOPES_CHANGED", id, {
        before: old,
        after: scopes,
        reason: input.reason.trim(),
      });
      result = { accountId: id, version: account.version + 1, scopes };
    } else {
      const facultyId = input.facultyId || null,
        cohortId = input.cohortId || null;
      requireValue(
        (!facultyId && !cohortId) || valid(facultyId, cohortId),
        "Chọn khoa trước, khóa phải tồn tại.",
      );
      requireValue(
        account.role !== "LECTURER" || !cohortId,
        "Giảng viên phân theo khoa, không gắn một khóa sinh viên.",
      );
      const changes = {
        affiliationFacultyId: facultyId,
        affiliationCohortId: cohortId,
      };
      await tx.update("accounts", id, changes, account.version);
      await audit(tx, actor, "ACCOUNT_AFFILIATION_CHANGED", id, {
        before: {
          affiliationFacultyId: account.affiliationFacultyId || null,
          affiliationCohortId: account.affiliationCohortId || null,
        },
        after: changes,
        reason: input.reason.trim(),
      });
      result = { accountId: id, version: account.version + 1, ...changes };
    }
    for (const s of await tx.list("sessions"))
      if (s.accountId === id) await tx.removeSession(s.tokenHash);
    await tx.insert("academicRequests", {
      id: input.requestId,
      actorId: actor.id,
      requestHash: hash,
      result,
    });
    return result;
  });
}
