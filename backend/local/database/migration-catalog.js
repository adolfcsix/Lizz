import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function migrationCatalog(folder = new URL("./migrations/", import.meta.url)) {
  const names = (await readdir(folder)).filter((n) => /^\d+_[a-z0-9_]+\.sql$/.test(n)).sort();
  if (!names.length || names.some((n, i) => Number(n.split("_")[0]) !== i + 1))
    throw Error("Gói migration thiếu hoặc trùng số thứ tự. Giải nén lại mã nguồn đầy đủ.");
  return Promise.all(names.map(async (filename) => {
    const source = await readFile(new URL(filename, folder), "utf8");
    return { filename, source, checksum: createHash("sha256").update(source).digest("hex") };
  }));
}

// Các migration của Lizz không chứa procedure. Giữ dấu phân cách trong chuỗi SQL.
export function sqlParts(source, separator = ",") {
  const parts = []; let start = 0, depth = 0, quote = null;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (c === "\\") { i++; continue; }
      if (c === quote) { if (source[i + 1] === quote) i++; else quote = null; }
    } else if (["'", '"', "`"].includes(c)) quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === separator && (separator === ";" || depth === 0)) { parts.push(source.slice(start, i).trim()); start = i + 1; }
    if (depth < 0) throw Error("Cấu trúc SQL migration chưa hợp lệ.");
  }
  if (quote || depth !== 0) throw Error("Cấu trúc SQL migration chưa hoàn chỉnh.");
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}
export function migrationStatements(source) {
  return sqlParts(source.replace(/^\s*--.*$/gm, ""), ";");
}
