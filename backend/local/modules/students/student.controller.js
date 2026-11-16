import {
  importStudents,
  listStudents,
  suggestAccounts,
  updateStudent,
} from "./student.service.js";
import { authorize } from "../../middlewares/authorize.js";
import { json, readJson } from "../../core/http.js";
import {
  studentDocument,
  readPortrait,
  changePortrait,
  portraitHistory,
} from "./profile-document.service.js";

export async function studentController(context) {
  const { request, response, store, actor, url } = context;
  const profileRoute = url.pathname.match(
    /^\/api\/v1\/students\/([a-f0-9-]{36})\/(profile|photo|photo-history)$/,
  );
  if (profileRoute) {
    const [, id, action] = profileRoute;
    if (request.method === "GET" && action === "profile")
      return json(response, await studentDocument(store, actor, id));
    if (request.method === "GET" && action === "photo-history")
      return json(response, await portraitHistory(store, actor, id));
    if (request.method === "GET" && action === "photo") {
      const bytes = await readPortrait(
        store,
        actor,
        id,
        url.searchParams.get("v"),
      );
      response.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Content-Length": bytes.length,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      return response.end(bytes);
    }
    if (request.method === "POST" && action === "photo")
      return json(
        response,
        await changePortrait(store, actor, id, await readJson(request)),
      );
    return json(response, { error: "Phương thức không hợp lệ." }, 405);
  }
  if (request.method === "GET" && url.pathname === "/api/v1/students") {
    authorize(actor, ["MANAGER", "STAFF", "STUDENT"]);
    return json(response, await listStudents(store, actor, url.searchParams));
  }
  authorize(actor, ["MANAGER", "STAFF"]);
  if (
    request.method === "GET" &&
    url.pathname === "/api/v1/students/account-options"
  )
    return json(response, {
      rows: await suggestAccounts(store, url.searchParams.get("q") || ""),
    });
  if (request.method === "POST" && url.pathname === "/api/v1/students/batches")
    return json(
      response,
      await importStudents(store, await readJson(request), actor),
      201,
    );
  const id = url.pathname.split("/").pop();
  if (request.method === "PATCH" && id)
    return json(response, {
      row: await updateStudent(store, id, await readJson(request), actor),
    });
  json(response, { error: "Không tìm thấy thao tác sinh viên." }, 404);
}
