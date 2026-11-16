import test from "node:test";
import assert from "node:assert/strict";
import { auditDetails } from "../../frontend/app/components/audit-details.js";
test("Nhật ký hiển thị đủ bằng chứng trước/sau, giữ 0/false và không thực thi nội dung người dùng", () => {
  const html = auditDetails({
    before: { score: 0, active: false },
    after: { score: 8.5, notes: "<img src=x onerror=alert(1)>" },
    rows: [{ code: "SV001" }, {}],
    ["<script>"]: "__proto__",
    unknown: "constructor",
  });
  assert.match(html, /Trước thay đổi/);
  assert.match(html, /Sau thay đổi/);
  assert.match(html, />0</);
  assert.match(html, />Không</);
  assert.match(html, /8\.5/);
  assert.match(html, /SV001/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /__proto__/);
  assert.match(html, /constructor/);
  assert.doesNotMatch(html, /<img|<script|\[object Object\]|function Object/);
});
