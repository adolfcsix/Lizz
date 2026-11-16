// Mỗi vai trò chạy trong tiến trình riêng để không chia sẻ session/DOM.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script = fileURLToPath(new URL('./qa-interface.js', import.meta.url));
let failed = false;
const exportCheck = spawnSync(process.execPath, [fileURLToPath(new URL('./qa-exam-export.js', import.meta.url))], { encoding: 'utf8', timeout: 30000 });
failed ||= exportCheck.status !== 0;
console.log(exportCheck.stdout || exportCheck.stderr);
for (const blocked of [false, true]) {
  for (const role of ['MANAGER', 'STAFF', 'LECTURER', 'STUDENT']) {
    const result = spawnSync(process.execPath, [script, role, ...(blocked ? ['--blocked'] : [])], {
      encoding: 'utf8', timeout: 60000,
    });
    const ok = result.status === 0;
    failed ||= !ok;
    console.log(`${role} · storage ${blocked ? 'bị chặn' : 'bình thường'}: ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) console.error(result.error?.message || result.stderr || result.stdout);
  }
}
process.exitCode = failed ? 1 : 0;
