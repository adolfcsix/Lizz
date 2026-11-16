import { requireValue } from "../../core/errors.js";
export const validScore = (n, max = 10) =>
  Number.isFinite(n) &&
  n >= 0 &&
  n <= max &&
  Math.abs(n * 100 - Math.round(n * 100)) < 0.000001;
export function cleanComponents(rows) {
  requireValue(
    Array.isArray(rows) && rows.length >= 1 && rows.length <= 10,
    "Cần từ 1 đến 10 thành phần điểm.",
  );
  requireValue(
    rows.every(
      (r) =>
        r &&
        /^[A-Z][A-Z0-9_]{0,19}$/.test(r.code || "") &&
        typeof r.name === "string" &&
        r.name.trim().length > 0 &&
        r.name.length <= 80 &&
        Number.isInteger(r.weight) &&
        r.weight >= 1 &&
        r.weight <= 100,
    ),
    "Nhập mã thành phần chữ in hoa, tên và trọng số nguyên từ 1–100%.",
  );
  requireValue(
    new Set(rows.map((r) => r.code)).size === rows.length &&
      rows.reduce((n, r) => n + r.weight, 0) === 100,
    "Mã thành phần không được trùng; tổng trọng số phải bằng 100%.",
  );
  return rows.map(({ code, name, weight }) => ({
    code,
    name: name.trim(),
    weight,
  }));
}
export function weightedScore(scheme, values) {
  requireValue(
    values &&
      typeof values === "object" &&
      !Array.isArray(values) &&
      Object.keys(values).length === scheme.components.length &&
      scheme.components.every(
        (c) => Object.hasOwn(values, c.code) && validScore(values[c.code]),
      ),
    "Nhập đầy đủ điểm thành phần từ 0–10, tối đa hai số lẻ; không thêm thành phần ngoài cấu hình.",
  );
  return (
    Math.round(
      scheme.components.reduce(
        (n, c) => n + Math.round(values[c.code] * 100) * c.weight,
        0,
      ) / 100,
    ) / 100
  );
}
export function cleanBands(rows) {
  requireValue(
    Array.isArray(rows) &&
      rows.length >= 2 &&
      rows.length <= 20 &&
      rows.every(
        (r) =>
          r &&
          validScore(r.minScore) &&
          validScore(r.points, 4) &&
          typeof r.letter === "string" &&
          /^[A-Z][A-Z0-9+\-]{0,7}$/.test(r.letter),
      ),
    "Nhập từ 2–20 mức quy đổi: ngưỡng 0–10, điểm hệ 4 từ 0–4, điểm chữ hợp lệ.",
  );
  const bands = rows
    .map(({ minScore, points, letter }) => ({ minScore, points, letter }))
    .sort((a, b) => a.minScore - b.minScore);
  requireValue(
    bands[0].minScore === 0 &&
      new Set(bands.map((r) => r.minScore)).size === bands.length &&
      new Set(bands.map((r) => r.letter)).size === bands.length &&
      bands.every((r, i) => !i || r.points >= bands[i - 1].points),
    "Quy đổi phải bắt đầu từ ngưỡng 0, không trùng ngưỡng/điểm chữ, điểm hệ 4 không giảm khi ngưỡng tăng.",
  );
  return bands;
}
export function convertScore(score, policy) {
  if (!policy) return { letter: null, points: null };
  const band = [...policy.bands].reverse().find((r) => score >= r.minScore);
  requireValue(band, "Quy định quy đổi chưa bao phủ điểm này.", 409);
  return { letter: band.letter, points: band.points };
}
const rounded = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
function aggregate(rows) {
  const valid = rows.filter(
      (r) =>
        r.resultSnapshot &&
        Number.isInteger(r.resultSnapshot.credits) &&
        r.resultSnapshot.credits > 0,
    ),
    missing = rows.length - valid.length;
  const modes = new Set(
    valid.map((r) => r.resultSnapshot.gpaPolicy?.repeatRule).filter(Boolean),
  );
  const rulesKnown = valid.every(
    (r) => r.resultSnapshot.gpaPolicy && validScore(r.resultSnapshot.points, 4),
  );
  const verified =
    rows.length > 0 && !missing && rulesKnown && modes.size === 1;
  if (!verified)
    return {
      status: "NOT_VERIFIED",
      count: rows.length,
      selectedCount: null,
      creditsAttempted: null,
      creditsEarned: null,
      gpa10: null,
      gpa4: null,
      reason: !rows.length
        ? "Chưa có điểm được công bố."
        : missing
          ? "Có kết quả cũ chưa chốt số tín chỉ và quy định quy đổi."
          : !rulesKnown
            ? "Có kết quả chưa có quy định quy đổi tại thời điểm công bố."
            : "Các học kỳ dùng quy tắc học lại khác nhau; chưa có căn cứ tính tích lũy thống nhất.",
    };
  const mode = [...modes][0],
    bySubject = new Map();
  for (const r of valid) {
    const key = r.resultSnapshot.subjectId,
      old = bySubject.get(key);
    // Quy tắc muộn nhất dựa trên ngày kết thúc lớp, không dựa ngày người quản lý bấm công bố.
    const later =
      !old ||
      r.resultSnapshot.endDate > old.resultSnapshot.endDate ||
      (r.resultSnapshot.endDate === old.resultSnapshot.endDate &&
        (r.publishedAt > old.publishedAt ||
          (r.publishedAt === old.publishedAt && r.id > old.id)));
    if (
      !old ||
      (mode === "HIGHEST"
        ? r.score > old.score || (r.score === old.score && later)
        : later)
    )
      bySubject.set(key, r);
  }
  const selected = [...bySubject.values()],
    credits = selected.reduce((n, r) => n + r.resultSnapshot.credits, 0);
  return {
    status: "VERIFIED",
    count: rows.length,
    selectedCount: selected.length,
    creditsAttempted: credits,
    creditsEarned: selected
      .filter((r) => r.score >= r.passScore)
      .reduce((n, r) => n + r.resultSnapshot.credits, 0),
    gpa10: rounded(
      selected.reduce((n, r) => n + r.score * r.resultSnapshot.credits, 0) /
        credits,
    ),
    gpa4: rounded(
      selected.reduce(
        (n, r) => n + r.resultSnapshot.points * r.resultSnapshot.credits,
        0,
      ) / credits,
    ),
    repeatRule: mode,
    selectedIds: selected.map((r) => r.id),
    reason:
      "Tính từ các kết quả công bố có đủ ảnh chụp dữ liệu; chưa dùng để xét tốt nghiệp.",
  };
}
export function transcriptSummaries(rows) {
  const published = rows.filter((r) => r.status === "PUBLISHED"),
    ids = [...new Set(published.map((r) => r.studentId))];
  return ids.map((id) => {
    const own = published.filter((r) => r.studentId === id);
    return {
      studentId: id,
      studentCode: own[0].studentCode,
      studentName: own[0].studentName,
      terms: [...new Set(own.map((r) => r.term))].sort().map((term) => ({
        term,
        ...aggregate(own.filter((r) => r.term === term)),
      })),
      cumulative: aggregate(own),
    };
  });
}
