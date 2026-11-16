import test from "node:test";
import assert from "node:assert/strict";
import { serializeCsv } from "../../frontend/app/components/csv-export.js";
test("CSV bàn giao giữ Unicode/dấu nháy, ngắt dòng, số và chặn formula injection", () => {
  const csv = serializeCsv(
    ["Họ tên", "Tiền"],
    [
      ['Nguyễn "An", lớp A', 100000],
      ['=HYPERLINK("bad")', -100],
      ["  +SUM(1,2)", 0],
      ["@x", "\t=1"],
      ["dòng\nmới", "\r=2"],
    ],
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('Nguyễn ""An"", lớp A'));
  assert.ok(csv.includes('"-100"'));
  assert.ok(csv.includes("\"'=HYPERLINK"));
  assert.ok(csv.includes("\"'  +SUM"));
  assert.ok(csv.includes('"\'@x"'));
  assert.ok(csv.includes("'\t=1"));
  assert.ok(csv.includes("dòng\nmới"));
});
