export function brand({ light = false, compact = false } = {}) {
  return `<span class="brand-lockup${light ? " brand-light" : ""}${compact ? " brand-compact" : ""}"><img src="/assets/brand/logo.png" alt="Lizz" width="176" height="58"><span class="brand-university" aria-label="University">UNIVERSITY</span></span>`;
}

// Cắt vùng biểu trưng từ chính ảnh gốc bằng CSS; không thay tài nguyên nhận diện.
export function brandSymbol() {
  return '<span class="brand-symbol" aria-hidden="true"><img src="/assets/brand/logo.png" alt="" width="2172" height="724"></span>';
}
