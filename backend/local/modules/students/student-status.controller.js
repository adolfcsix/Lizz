import { json, readJson } from "../../core/http.js";
import {
  studyStatusOverview,
  previewStudyStatus,
  submitStudyStatus,
  changeStudyStatus,
} from "./student-status.service.js";
export async function studentStatusController({
  store,
  actor,
  request,
  response,
  url,
}) {
  const tail = url.pathname.slice("/api/v1/student-status".length);
  if (request.method === "GET" && tail === "")
    return json(response, await studyStatusOverview(store, actor));
  if (request.method === "POST" && tail === "/preview")
    return json(
      response,
      await previewStudyStatus(store, await readJson(request), actor),
    );
  if (request.method === "POST" && tail === "")
    return json(
      response,
      await submitStudyStatus(store, await readJson(request), actor),
      201,
    );
  const m = tail.match(/^\/([^/]+)\/(review|approve|reject|cancel|apply)$/);
  if (request.method === "POST" && m)
    return json(
      response,
      await changeStudyStatus(
        store,
        m[1],
        await readJson(request),
        actor,
        m[2],
      ),
    );
  return json(
    response,
    { error: "Không tìm thấy thao tác bảo lưu/quay lại học." },
    404,
  );
}
