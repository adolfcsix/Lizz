import { randomUUID } from "node:crypto";
import { authorize } from "../../middlewares/authorize.js";
import { requireValue } from "../../core/errors.js";
import { tokenHash } from "../../core/password.js";
import {
  freshActor,
  lockAcademic,
  audit,
} from "../academic/academic.common.js";
import { integrityStore } from "../access/staff-store.js";
import { latestSeating, seatingSource } from "./seating.rules.js";
const managers = ["MANAGER", "STAFF"];
function settings(input) {
  requireValue(
    input &&
      typeof input.prefix === "string" &&
      /^[A-Za-z0-9._-]{0,16}$/.test(input.prefix),
    "Tiền tố số báo danh tối đa 16 ký tự: chữ, số, dấu chấm, gạch ngang hoặc gạch dưới.",
  );
  requireValue(
    Number.isInteger(input.startNumber) &&
      input.startNumber >= 1 &&
      input.startNumber <= 999000,
    "Số bắt đầu từ 1 đến 999000.",
  );
  requireValue(
    typeof input.reason === "string" &&
      input.reason.trim().length >= 5 &&
      input.reason.trim().length <= 1000,
    "Ghi lý do lập danh sách 5–1000 ký tự.",
  );
  return {
    prefix: input.prefix,
    startNumber: input.startNumber,
    reason: input.reason.trim(),
  };
}
async function reviewData(store, id, input, actor, lock = false) {
  const clean = settings(input);
  const data = Object.fromEntries(
    await Promise.all(
      ["exams", "rooms", "students", "enrollments", "examSeatings"].map(
        async (kind) => [kind, await store.list(kind, lock)],
      ),
    ),
  );
  const exam = data.exams.find((row) => row.id === id);
  requireValue(exam, "Không tìm thấy lịch thi trong quyền của bạn.", 404);
  requireValue(
    exam.status === "PUBLISHED",
    "Chỉ xếp chỗ cho lịch thi đã công bố.",
    409,
  );
  requireValue(
    Date.parse(exam.examDate + "T" + exam.startTime + ":00+07:00") > Date.now(),
    "Ca thi đã bắt đầu; không lập lại số báo danh hoặc chỗ ngồi.",
    409,
  );
  const source = seatingSource(data, exam),
    prior = latestSeating(data.examSeatings, id);
  const globalPrior = latestSeating(
    await integrityStore(store).list("examSeatings", lock),
    id,
  );
  requireValue(
    (prior?.version || 0) === (globalPrior?.version || 0),
    "Danh sách hoặc phạm vi đã thay đổi. Liên hệ Quản lý để kiểm tra.",
    409,
  );
  requireValue(
    source.room?.active &&
      source.rows.length > 0 &&
      source.rows.length <= source.room.capacity,
    "Phòng không hoạt động, chưa có thí sinh hoặc vượt sức chứa.",
    409,
  );
  requireValue(
    source.rows.every((row) => row.code && row.fullName) &&
      new Set(source.rows.map((row) => row.studentId)).size ===
        source.rows.length &&
      new Set(source.rows.map((row) => row.code.toUpperCase())).size ===
        source.rows.length,
    "Hồ sơ hoặc đăng ký của thí sinh chưa hợp lệ. Kiểm tra lại danh sách.",
    409,
  );
  const rows = source.rows.map((row, index) => ({
    ...row,
    candidateNumber:
      clean.prefix + String(clean.startNumber + index).padStart(3, "0"),
    seatNumber: index + 1,
  }));
  return {
    ...clean,
    rows,
    sourceHash: source.sourceHash,
    version: prior?.version || 0,
    examVersion: exam.version,
    reviewHash: tokenHash(
      JSON.stringify({
        id,
        sourceHash: source.sourceHash,
        version: prior?.version || 0,
        actorId: actor.id,
        actorVersion: actor.version,
        ...clean,
      }),
    ),
    exam,
  };
}
export async function reviewSeating(store, id, input, actor) {
  authorize(actor, managers);
  return reviewData(store, id, input, actor);
}
export async function confirmSeating(store, id, input, actor) {
  authorize(actor, managers);
  settings(input);
  requireValue(
    input.confirm === true &&
      Number.isInteger(input.version) &&
      input.version >= 0 &&
      typeof input.reviewHash === "string" &&
      /^[a-f0-9]{64}$/.test(input.reviewHash),
    "Xem trước và xác nhận danh sách trước khi lưu.",
  );
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    await tx.list("exams", true);
    await tx.list("rooms", true);
    const plans = await tx.list("examSeatings", true),
      prior = latestSeating(plans, id);
    if (
      prior &&
      prior.version === input.version + 1 &&
      prior.createdBy === actor.id &&
      prior.payload.reviewHash === input.reviewHash &&
      prior.payload.prefix === input.prefix &&
      prior.payload.startNumber === input.startNumber &&
      prior.payload.reason === input.reason.trim()
    )
      return { id: prior.id, version: prior.version };
    const review = await reviewData(tx, id, input, actor, true);
    requireValue(
      review.version === input.version &&
        review.reviewHash === input.reviewHash,
      "Lịch thi, phòng, thí sinh hoặc danh sách xếp chỗ đã thay đổi. Xem trước lại.",
      409,
    );
    const plan = {
      id: randomUUID(),
      examId: id,
      version: review.version + 1,
      createdBy: actor.id,
      createdAt: Date.now(),
      payload: {
        sourceHash: review.sourceHash,
        reviewHash: review.reviewHash,
        prefix: review.prefix,
        startNumber: review.startNumber,
        reason: review.reason,
        rows: review.rows,
      },
    };
    await tx.insert("examSeatings", plan);
    await audit(tx, actor, "EXAM_SEATING_CONFIRMED", plan.id, {
      examId: id,
      revision: plan.version,
      count: plan.payload.rows.length,
      reason: review.reason,
    });
    return { id: plan.id, version: plan.version };
  });
}
