import { readConfig } from "../backend/local/config/env.js";
import { checkGemini } from "../backend/local/integrations/gemini-check.js";
try {
  await checkGemini(readConfig().ai);
  console.log("LizzChat: PASS — đã kết nối Gemini và hoàn tất vòng gọi công cụ bằng dữ liệu thăm dò.");
  console.log("Chưa thay thế nghiệm thu bốn vai trò với MySQL và các câu hỏi nghiệp vụ.");
} catch (error) {
  console.error("LizzChat chưa nghiệm thu:", error.status ? error.message : error.code || error.name);
  process.exitCode = 1;
}
