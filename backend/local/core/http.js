import { AppError } from "./errors.js";

export function json(response, data, status = 200, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(data));
}

export async function readJson(request) {
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    throw new AppError(415, "Yêu cầu cần dữ liệu JSON.");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 150_000) throw new AppError(413, "Dữ liệu vượt giới hạn.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw Error("Invalid object");
    return value;
  } catch {
    throw new AppError(400, "JSON không hợp lệ.");
  }
}

export function readCookie(request, name) {
  const part = (request.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + "="));
  return part ? part.slice(name.length + 1) : "";
}
