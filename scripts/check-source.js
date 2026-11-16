// Kiểm tra nguồn mà không khởi động server hoặc đọc .env.
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
const folders = [
  "frontend/app",
  "backend/local",
  "shared",
  "scripts",
  "tests/local",
];
async function files(folder) {
  const output = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else if (entry.name.endsWith(".js")) output.push(path);
  }
  return output;
}
let total = 0,
  links = 0,
  failures = 0;
for (const folder of folders)
  for (const path of await files(folder)) {
    total++;
    const result = spawnSync(process.execPath, ["--check", path], {
      encoding: "utf8",
    });
    if (result.status !== 0) {
      console.error(result.stderr);
      failures++;
    }
    const source = await readFile(path, "utf8");
    // Chỉ các import/export tĩnh tương đối. Không khẳng định kiểm tra được đường dẫn tạo động.
    for (const match of source.matchAll(
      /(?:from\s*|import\s*)["'](\.[^"']+)["']/g,
    )) {
      links++;
      try {
        if (!(await stat(resolve(dirname(path), match[1]))).isFile())
          throw Error();
      } catch {
        console.error("Thiếu module:", path, match[1]);
        failures++;
      }
    }
  }
console.log(
  `${total} file JavaScript · ${links} import tương đối · ${failures} lỗi`,
);
process.exitCode = failures ? 1 : 0;
