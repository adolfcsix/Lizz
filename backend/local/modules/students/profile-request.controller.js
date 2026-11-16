import { json, readJson } from "../../core/http.js";
import {
  profileRequestOverview,
  createProfileRequest,
  changeProfileRequest,
} from "./profile-request.service.js";
export async function profileRequestController({
  store,
  actor,
  request,
  response,
  url,
}) {
  const tail = url.pathname.slice("/api/v1/profile-requests".length);
  if (request.method === "GET" && tail === "")
    return json(
      response,
      await profileRequestOverview(store, actor, {
        query: url.searchParams.get("q") || "",
        status: url.searchParams.get("status") || "",
      }),
    );
  if (request.method === "POST" && tail === "")
    return json(
      response,
      {
        row: await createProfileRequest(store, await readJson(request), actor),
      },
      201,
    );
  const change = tail.match(
    /^\/([^/]+)\/(receive|takeover|request-info|recommend|approve|reject|cancel|resubmit)$/,
  );
  if (request.method === "POST" && change)
    return json(response, {
      row: await changeProfileRequest(
        store,
        change[1],
        await readJson(request),
        actor,
        change[2],
      ),
    });
  return json(
    response,
    { error: "Không tìm thấy thao tác yêu cầu hồ sơ." },
    404,
  );
}
