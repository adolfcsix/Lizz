import { foldText } from "../../../../shared/local-validation.js";
import { requireValue } from "../../core/errors.js";
export const financeManagers = ["MANAGER", "STAFF"];
export const money = (value) =>
  Number.isSafeInteger(value) && value > 0 && value <= 2000000000;
export function chargeTotals(charge, receipts, adjustments) {
  const adjustment = adjustments
    .filter((r) => r.chargeId === charge.id)
    .reduce((n, r) => n + r.delta, 0);
  const paid = receipts
    .filter((r) => r.chargeId === charge.id && r.status === "CONFIRMED")
    .reduce((n, r) => n + r.amount, 0);
  const total = charge.amount + adjustment,
    remaining = total - paid;
  requireValue(
    [adjustment, paid, total, remaining].every(Number.isSafeInteger) &&
      total >= 0 &&
      remaining >= 0,
    "Số liệu khoản thu cần được đối chiếu lại.",
    409,
  );
  return { adjustment, total, paid, remaining };
}
export function financialStanding(data, studentId, term) {
  const charges = data.charges.filter(
    (r) =>
      r.studentId === studentId &&
      foldText(r.term) === foldText(term) &&
      r.status === "ISSUED",
  );
  if (!charges.length)
    return {
      status: "NOT_VERIFIED",
      remaining: 0,
      reason: "Chưa có khoản thu học kỳ được xác lập.",
    };
  const remaining = charges.reduce(
    (n, c) => n + chargeTotals(c, data.receipts, data.adjustments).remaining,
    0,
  );
  return {
    status: remaining ? "UNPAID" : "CLEAR",
    remaining,
    reason: remaining
      ? "Còn khoản thu chưa hoàn tất."
      : "Các khoản thu đã được xác nhận đủ hoặc điều chỉnh miễn giảm.",
  };
}
