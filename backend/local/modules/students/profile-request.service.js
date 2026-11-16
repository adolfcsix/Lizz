import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { freshActor, audit } from "../academic/academic.common.js";
import { staffStore } from "../access/staff-store.js";
import { tokenHash } from "../../core/password.js";
import { foldText } from "../../../../shared/local-validation.js";
import {
  CONTACT_FIELDS,
  CONTACT_ROLES,
  contactValues,
  profileActions,
} from "../../../../shared/profile-workflow.js";
const pending = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "RECOMMENDED"];
const uuid = (v) => typeof v === "string" && /^[a-f0-9-]{36}$/.test(v);
const reasonOK = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
const equal = (a, b) =>
  JSON.stringify(contactValues(a)) === JSON.stringify(contactValues(b));
export function cleanContact(input) {
  requireValue(
    input && typeof input === "object" && !Array.isArray(input),
    "Thông tin liên hệ không hợp lệ.",
  );
  requireValue(
    Object.keys(input).every((k) => CONTACT_FIELDS.some((f) => f.key === k)),
    "Chỉ được đề nghị sửa các trường liên hệ.",
  );
  const data = {};
  for (const f of CONTACT_FIELDS) {
    const v = input[f.key] ?? "";
    requireValue(
      typeof v === "string" &&
        v.length <= f.max &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v),
      "Trường " + f.label + " chưa hợp lệ.",
    );
    data[f.key] = v.trim();
  }
  for (const key of ["phone", "emergencyPhone"])
    if (data[key]) {
      const compact = data[key].replace(/[\s().-]/g, "");
      requireValue(
        /^\+?\d{8,15}$/.test(compact),
        "Số điện thoại cần 8–15 chữ số, có thể bắt đầu bằng +.",
      );
      data[key] = compact;
    }
  if (data.personalEmail) {
    requireValue(
      /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(
        data.personalEmail,
      ),
      "Email cá nhân chưa hợp lệ.",
    );
    data.personalEmail = data.personalEmail.toLowerCase();
  }
  requireValue(
    Boolean(data.emergencyName) === Boolean(data.emergencyPhone),
    "Người liên hệ khi cần phải có cả họ tên và số điện thoại.",
  );
  return data;
}
function publicRow(row, students, accounts) {
  const student = students.find((s) => s.id === row.studentId);
  return {
    ...row,
    requestHash: undefined,
    reviewHistory: row.reviewHistory.map(
      ({ hash, requestId, ...event }) => event,
    ),
    studentCode: student?.code || "",
    studentName: student?.fullName || "",
    assignedName:
      accounts.find((a) => a.id === row.assignedTo)?.fullName ||
      (row.assignedTo ? "Cán bộ phụ trách" : ""),
    requesterName:
      accounts.find((a) => a.id === row.requestedBy)?.fullName || "",
    actions: undefined,
  };
}
async function locked(source, actor, work) {
  authorize(actor, CONTACT_ROLES);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, CONTACT_ROLES);
    for (const key of ["classes", "students", "profileRequests"])
      await tx.list(key, true);
    return work(tx);
  });
}
async function ownStudent(tx, actor, id = null) {
  const row = (await tx.list("students")).find((s) =>
    actor.role === "STUDENT" ? s.accountId === actor.id : s.id === id,
  );
  requireValue(row, "Không tìm thấy hồ sơ trong quyền.", 404);
  return row;
}
export async function profileRequestOverview(
  source,
  actor,
  { query = "", status = "" } = {},
) {
  authorize(actor, CONTACT_ROLES);
  const store = staffStore(source, actor),
    students = (await store.list("students")).filter(
      (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
    ),
    ids = new Set(students.map((s) => s.id)),
    accounts = await store.list("accounts");
  const rows = (await store.list("profileRequests"))
    .filter(
      (r) =>
        ids.has(r.studentId) &&
        (actor.role !== "STUDENT" || r.requestedBy === actor.id),
    )
    .map((r) => ({
      ...publicRow(r, students, accounts),
      actions: profileActions(actor, r),
    }))
    .filter(
      (r) =>
        (!status || r.status === status) &&
        foldText(r.studentCode + " " + r.studentName + " " + r.id).includes(
          foldText(query),
        ),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  return {
    rows,
    students: students.map(
      ({ id, code, fullName, version, contactDetails }) => ({
        id,
        code,
        fullName,
        version,
        contactDetails: contactValues(contactDetails),
      }),
    ),
    canRequest: actor.role === "STUDENT",
  };
}
export async function createProfileRequest(source, input, actor) {
  authorize(actor, ["STUDENT"]);
  requireValue(
    uuid(input.requestId) && input.confirm === true && reasonOK(input.reason),
    "Cần xác nhận, lý do và mã yêu cầu hợp lệ.",
  );
  const proposed = cleanContact(input.proposedContact);
  return locked(source, actor, async (tx) => {
    const student = await ownStudent(tx, actor),
      rows = await tx.list("profileRequests"),
      hash = tokenHash(
        JSON.stringify({
          actorId: actor.id,
          baseProfileVersion: input.baseProfileVersion,
          proposed,
          reason: input.reason,
        }),
      ),
      retry = rows.find((r) => r.id === input.requestId);
    if (retry) {
      requireValue(
        retry.requestedBy === actor.id && retry.requestHash === hash,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { id: retry.id, status: retry.status, version: retry.version };
    }
    requireValue(
      student.version === input.baseProfileVersion,
      "Hồ sơ đã thay đổi. Tải lại trước khi gửi.",
      409,
    );
    requireValue(
      !rows.some(
        (r) => r.studentId === student.id && pending.includes(r.status),
      ),
      "Bạn đang có yêu cầu chưa xử lý xong. Mở yêu cầu đó để theo dõi hoặc bổ sung.",
      409,
    );
    requireValue(
      !equal(student.contactDetails, proposed),
      "Thông tin đề nghị chưa khác hồ sơ hiện tại.",
    );
    const at = Date.now(),
      row = {
        id: input.requestId,
        studentId: student.id,
        requestedBy: actor.id,
        assignedTo: null,
        baseProfileVersion: student.version,
        beforeContact: contactValues(student.contactDetails),
        proposedContact: proposed,
        status: "SUBMITTED",
        reason: input.reason.trim(),
        reviewHistory: [
          {
            action: "submit",
            actorId: actor.id,
            actorName: actor.fullName,
            at,
            reason: input.reason.trim(),
            to: "SUBMITTED",
            proposal: proposed,
          },
        ],
        createdAt: at,
        updatedAt: at,
        updatedBy: actor.id,
        requestHash: hash,
        version: 1,
      };
    await tx.insert("profileRequests", row);
    await audit(tx, actor, "PROFILE_CHANGE_REQUESTED", row.id, { after: row });
    return { id: row.id, status: row.status, version: row.version };
  });
}
export async function changeProfileRequest(source, id, input, actor, action) {
  authorize(actor, CONTACT_ROLES);
  requireValue(
    uuid(input.requestId) && input.confirm === true && reasonOK(input.reason),
    "Cần xác nhận, lý do và mã thao tác hợp lệ.",
  );
  return locked(source, actor, async (tx) => {
    const row = (await tx.list("profileRequests")).find((r) => r.id === id);
    requireValue(row, "Không tìm thấy yêu cầu trong quyền.", 404);
    const student = await ownStudent(tx, actor, row.studentId);
    requireValue(
      student.id === row.studentId &&
        (actor.role !== "STUDENT" || row.requestedBy === actor.id),
      "Không tìm thấy yêu cầu trong quyền.",
      404,
    );
    const hash = tokenHash(
        JSON.stringify({
          actorId: actor.id,
          action,
          version: input.version,
          reason: input.reason,
          proposedContact: input.proposedContact,
          baseProfileVersion: input.baseProfileVersion,
        }),
      ),
      retry = row.reviewHistory.find((h) => h.requestId === input.requestId);
    if (retry) {
      requireValue(
        retry.actorId === actor.id && retry.hash === hash,
        "Mã thao tác đã dùng cho nội dung khác.",
        409,
      );
      return { id: row.id, status: row.status, version: row.version };
    }
    requireValue(
      row.version === input.version,
      "Yêu cầu đã thay đổi. Tải lại trước khi xử lý.",
      409,
    );
    requireValue(
      profileActions(actor, row).includes(action),
      "Vai trò, người phụ trách hoặc trạng thái không cho phép thao tác này.",
      403,
    );
    requireValue(
      row.reviewHistory.length < 100,
      "Yêu cầu có quá nhiều lượt xử lý. Liên hệ Quản lý để đối chiếu.",
    );
    const at = Date.now(),
      changes = { updatedAt: at, updatedBy: actor.id },
      event = {
        action,
        actorId: actor.id,
        actorName: actor.fullName,
        at,
        reason: input.reason.trim(),
        from: row.status,
        requestId: input.requestId,
        hash,
      };
    switch (action) {
      case "receive":
      case "takeover":
        changes.status = "IN_REVIEW";
        changes.assignedTo = actor.id;
        break;
      case "request-info":
        changes.status = "NEEDS_INFO";
        break;
      case "recommend":
        changes.status = "RECOMMENDED";
        break;
      case "reject":
        changes.status = "REJECTED";
        break;
      case "cancel":
        changes.status = "CANCELLED";
        break;
      case "resubmit": {
        requireValue(
          student.version === input.baseProfileVersion,
          "Hồ sơ đã thay đổi. Tải lại trước khi bổ sung.",
          409,
        );
        const proposed = cleanContact(input.proposedContact);
        requireValue(
          !equal(student.contactDetails, proposed),
          "Nội dung bổ sung chưa khác hồ sơ hiện tại.",
        );
        Object.assign(changes, {
          status: "SUBMITTED",
          assignedTo: null,
          baseProfileVersion: student.version,
          beforeContact: contactValues(student.contactDetails),
          proposedContact: proposed,
          reason: input.reason.trim(),
        });
        event.previousProposal = row.proposedContact;
        event.proposal = proposed;
        break;
      }
      case "approve": {
        requireValue(
          student.version === row.baseProfileVersion &&
            equal(student.contactDetails, row.beforeContact),
          "Hồ sơ gốc đã thay đổi. Trả yêu cầu bổ sung để sinh viên kiểm tra và gửi lại; không tự áp dụng lên bản mới.",
          409,
        );
        const contactDetails = cleanContact(row.proposedContact);
        await tx.update(
          "students",
          student.id,
          { contactDetails },
          student.version,
        );
        changes.status = "APPLIED";
        await audit(tx, actor, "STUDENT_CONTACT_APPLIED", student.id, {
          requestId: row.id,
          before: student,
          after: { ...student, contactDetails, version: student.version + 1 },
        });
        break;
      }
      default:
        requireValue(false, "Thao tác không hợp lệ.");
    }
    event.to = changes.status;
    changes.reviewHistory = [...row.reviewHistory, event];
    await tx.update("profileRequests", id, changes, input.version);
    await audit(
      tx,
      actor,
      "PROFILE_CHANGE_" + action.toUpperCase().replaceAll("-", "_"),
      id,
      { before: row, after: { ...row, ...changes, version: row.version + 1 } },
    );
    return { id, status: changes.status, version: row.version + 1 };
  });
}
