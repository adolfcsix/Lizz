import { CatalogRepository } from "./catalog.repository.js";
import { saveCatalog } from "./catalog.service.js";
import { authorize } from "../../middlewares/authorize.js";
import { json, readJson } from "../../core/http.js";

export async function catalogController(context) {
  const { request, response, store, actor, url } = context;
  if (request.method === "GET" && url.pathname === "/api/v1/catalog") {
    authorize(actor, ["MANAGER", "STAFF", "LECTURER", "STUDENT"]);
    return json(response, await new CatalogRepository(store).all());
  }
  authorize(actor, ["MANAGER", "STAFF"]);
  const [, , , , kind, id] = url.pathname.split("/");
  if (request.method === "POST" && kind && !id)
    return json(
      response,
      { row: await saveCatalog(store, kind, await readJson(request), actor) },
      201,
    );
  if (request.method === "PATCH" && id)
    return json(response, {
      row: await saveCatalog(store, kind, await readJson(request), actor, id),
    });
  json(response, { error: "Không tìm thấy thao tác danh mục." }, 404);
}
