import { json, readJson } from "../../core/http.js";
import { studentServicesOverview, saveServiceDefinition, changeServiceDefinition, createServiceRequest, changeServiceRequest } from "./student-services.service.js";
export async function studentServicesController({ store, actor, url, request, response }) {
  const tail = url.pathname.slice("/api/v1/student-services".length);
  if (request.method === "GET" && tail === "")
    return json(response, await studentServicesOverview(store, actor, Object.fromEntries(url.searchParams)));
  if (request.method === "POST" && tail === "/definitions")
    return json(response, { row: await saveServiceDefinition(store, await readJson(request), actor) }, 201);
  const definition = tail.match(/^\/definitions\/([^/]+)(?:\/(publish|close))?$/);
  if (definition && request.method === "PATCH" && !definition[2])
    return json(response, { row: await saveServiceDefinition(store, await readJson(request), actor, definition[1]) });
  if (definition && request.method === "POST" && definition[2])
    return json(response, { row: await changeServiceDefinition(store, definition[1], definition[2], await readJson(request), actor) });
  if (request.method === "POST" && tail === "/requests")
    return json(response, { row: await createServiceRequest(store, await readJson(request), actor) }, 201);
  const action = tail.match(/^\/requests\/([^/]+)\/(edit|submit|take|reassign|request-info|ready|deliver|reject|cancel|link-charge|unlink-charge)$/);
  if (action && request.method === "POST")
    return json(response, { row: await changeServiceRequest(store, action[1], action[2], await readJson(request), actor) });
  return json(response, { error: "Không tìm thấy thao tác thủ tục sinh viên." }, 404);
}
