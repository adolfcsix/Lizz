import { createHash } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { freshActor, audit } from "../academic/academic.common.js";
import { staffStore } from "../access/staff-store.js";

const readers = ["MANAGER", "STAFF", "STUDENT"];
const editors = ["MANAGER", "STAFF"];
const digest = (value) => createHash("sha256").update(value).digest("hex");
export const photoUrl = (student) =>
  student.photoId
    ? `/api/v1/students/${encodeURIComponent(student.id)}/photo?v=${encodeURIComponent(student.photoId)}`
    : null;

// Chỉ nhận JPEG; không phục vụ SVG, HTML hay đường dẫn do người dùng cung cấp.
// Kiểm tra cấu trúc marker, kích thước và giới hạn; đây không phải bộ giải mã ảnh.
export function inspectPortrait(value) {
  requireValue(
    typeof value === "string" &&
      value.length <= 128000 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(value),
    "Ảnh hồ sơ chưa hợp lệ.",
  );
  const bytes = Buffer.from(value, "base64");
  requireValue(
    bytes.toString("base64") === value &&
      bytes.length <= 96000 &&
      bytes.length >= 100,
    "Ảnh JPEG tối đa 96 KB.",
  );
  requireValue(
    bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes.at(-2) === 255 &&
      bytes.at(-1) === 217,
    "Chỉ chấp nhận ảnh JPEG hợp lệ.",
  );
  let offset = 2,
    width = 0,
    height = 0,
    scanned = false;
  while (offset < bytes.length - 2) {
    requireValue(bytes[offset++] === 255, "Cấu trúc ảnh JPEG không hợp lệ.");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    requireValue(
      offset + 2 <= bytes.length && ![0, 216, 217].includes(marker),
      "Cấu trúc ảnh JPEG không hợp lệ.",
    );
    const length = bytes.readUInt16BE(offset);
    requireValue(
      length >= 2 && offset + length <= bytes.length - 2,
      "Ảnh JPEG bị thiếu dữ liệu.",
    );
    if ([192, 194].includes(marker)) {
      requireValue(
        !width && length >= 8 && bytes[offset + 2] === 8,
        "Ảnh JPEG không được hỗ trợ.",
      );
      height = bytes.readUInt16BE(offset + 3);
      width = bytes.readUInt16BE(offset + 5);
      const channels = bytes[offset + 7];
      requireValue(
        [1, 3].includes(channels) && length === 8 + 3 * channels,
        "Cấu trúc màu JPEG không hợp lệ.",
      );
    }
    if (marker === 218) {
      scanned = true;
      break;
    }
    offset += length;
  }
  requireValue(
    scanned && width >= 64 && height >= 64 && width <= 1024 && height <= 1024,
    "Ảnh cần kích thước từ 64 đến 1024 pixel mỗi chiều.",
  );
  return { bytes, width, height };
}

async function inProfile(source, actor, id, roles, work) {
  authorize(actor, roles);
  return staffStore(source, actor).transaction(async (tx) => {
    await freshActor(tx, actor, roles);
    await tx.list("classes", true);
    const student = (await tx.list("students", true)).find(
      (s) =>
        s.id === id && (actor.role !== "STUDENT" || s.accountId === actor.id),
    );
    requireValue(student, "Không tìm thấy hồ sơ trong quyền.", 404);
    return work(tx, student);
  });
}

export async function studentDocument(source, actor, id) {
  return inProfile(source, actor, id, readers, async (tx, student) => {
    const group = (await tx.list("classes")).find(
      (r) => r.id === student.classId,
    );
    const major = (await tx.list("majors")).find(
      (r) => r.id === group?.majorId,
    );
    const faculty = (await tx.list("faculties")).find(
      (r) => r.id === major?.facultyId,
    );
    const cohort = (await tx.list("cohorts")).find(
      (r) => r.id === group?.cohortId,
    );
    const account = (await tx.list("accounts")).find(
      (r) => r.id === student.accountId,
    );
    return {
      student: {
        id: student.id,
        code: student.code,
        fullName: student.fullName,
        email: account?.email || "",
        className: group?.name || "",
        majorName: major?.name || "",
        facultyName: faculty?.name || "",
        cohortName: cohort?.name || "",
        contactDetails: student.contactDetails || {},
        photoId: student.photoId || null,
        photoUrl: photoUrl(student),
        version: student.version,
      },
      generatedAt: Date.now(),
    };
  });
}

export async function readPortrait(source, actor, id, version) {
  return inProfile(source, actor, id, readers, async (tx, student) => {
    requireValue(
      student.photoId && student.photoId === version,
      "Ảnh đã thay đổi hoặc chưa được cập nhật.",
      404,
    );
    const record = (await tx.list("studentPhotos")).find(
      (r) => r.id === student.photoId && r.studentId === student.id,
    );
    requireValue(record?.photoContent, "Không tìm thấy ảnh hồ sơ.", 404);
    return Buffer.from(record.photoContent, "base64");
  });
}

export async function portraitHistory(source, actor, id) {
  return inProfile(source, actor, id, editors, async (tx) => {
    const accounts = await tx.list("accounts");
    return {
      rows: (await tx.list("studentPhotos"))
        .filter((r) => r.studentId === id)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => ({
          id: r.id,
          action: r.action,
          reason: r.reason,
          createdAt: r.createdAt,
          actorName:
            accounts.find((a) => a.id === r.actorId)?.fullName ||
            "Cán bộ phụ trách",
        })),
    };
  });
}

export async function changePortrait(source, actor, id, input) {
  authorize(actor, editors);
  requireValue(input.confirm === true, "Cần xác nhận cập nhật ảnh hồ sơ.");
  requireValue(
    typeof input.requestId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        input.requestId,
      ),
    "Mã thao tác chưa hợp lệ.",
  );
  requireValue(
    typeof input.reason === "string" &&
      input.reason.trim() &&
      input.reason.length <= 1000,
    "Nhập lý do cập nhật, tối đa 1000 ký tự.",
  );
  requireValue(
    Number.isSafeInteger(input.version) &&
      input.version > 0 &&
      ["REPLACE", "REMOVE"].includes(input.action),
    "Thao tác hoặc phiên bản hồ sơ chưa hợp lệ.",
  );
  const image =
    input.action === "REPLACE" ? inspectPortrait(input.photoContent) : null;
  requireValue(
    input.action !== "REMOVE" || input.photoContent == null,
    "Gỡ ảnh không nhận dữ liệu ảnh mới.",
  );
  const hash = digest(
    JSON.stringify([
      id,
      input.version,
      input.action,
      input.reason.trim(),
      input.photoContent || null,
    ]),
  );
  return inProfile(source, actor, id, editors, async (tx, student) => {
    const prior = (await tx.list("studentPhotos", true)).find(
      (r) => r.id === input.requestId,
    );
    if (prior) {
      requireValue(
        prior.studentId === id &&
          prior.actorId === actor.id &&
          prior.requestHash === hash,
        "Mã thao tác đã được sử dụng cho dữ liệu khác.",
        409,
      );
      return {
        version: student.version,
        photoId: student.photoId || null,
        photoUrl: photoUrl(student),
        replayed: true,
      };
    }
    requireValue(
      student.version === input.version,
      "Hồ sơ đã thay đổi. Tải lại trước khi cập nhật ảnh.",
      409,
    );
    requireValue(image || student.photoId, "Hồ sơ chưa có ảnh để gỡ.", 409);
    if (image && student.photoId) {
      const current = (await tx.list("studentPhotos")).find(
        (r) => r.id === student.photoId,
      );
      requireValue(
        current?.photoContent !== input.photoContent,
        "Ảnh này đã được sử dụng cho hồ sơ.",
        409,
      );
    }
    const photoId = image ? input.requestId : null;
    await tx.insert("studentPhotos", {
      id: input.requestId,
      studentId: id,
      actorId: actor.id,
      action: input.action,
      reason: input.reason.trim(),
      requestHash: hash,
      priorPhotoId: student.photoId || null,
      photoContent: image ? input.photoContent : null,
      width: image?.width || null,
      height: image?.height || null,
      byteLength: image?.bytes.length || 0,
      createdAt: Date.now(),
    });
    await tx.update("students", id, { photoId }, input.version);
    await audit(tx, actor, "STUDENT_PHOTO_" + input.action, id, {
      beforePhotoId: student.photoId || null,
      afterPhotoId: photoId,
      reason: input.reason.trim(),
      byteLength: image?.bytes.length || 0,
    });
    const after = { ...student, photoId, version: student.version + 1 };
    return {
      version: after.version,
      photoId,
      photoUrl: photoUrl(after),
      replayed: false,
    };
  });
}
