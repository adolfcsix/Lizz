import { json, readJson } from "../../core/http.js";
import {
  attendanceOverview,
  sessionDetail,
  sectionEligibility,
  saveAttendancePolicy,
  createSession,
  saveAttendance,
  changeSession,
} from "./attendance.service.js";
export async function attendanceController({
  store,
  actor,
  url,
  request,
  response,
}) {
  const tail = url.pathname.slice("/api/v1/attendance".length);
  if (request.method === "GET" && tail === "")
    return json(response, await attendanceOverview(store, actor));
  if (request.method === "POST" && tail === "/policies")
    return json(response, {
      row: await saveAttendancePolicy(store, await readJson(request), actor),
    });
  if (request.method === "POST" && tail === "/sessions")
    return json(
      response,
      { row: await createSession(store, await readJson(request), actor) },
      201,
    );
  const eligibility = tail.match(/^\/sections\/([a-f0-9-]{36})\/eligibility$/);
  if (request.method === "GET" && eligibility)
    return json(
      response,
      await sectionEligibility(store, eligibility[1], actor),
    );
  const session = tail.match(
    /^\/sessions\/([a-f0-9-]{36})(?:\/(marks|sync|close|reopen))?$/,
  );
  if (session) {
    if (request.method === "GET" && !session[2])
      return json(response, await sessionDetail(store, session[1], actor));
    if (request.method === "POST" && session[2])
      return json(response, {
        row: await (session[2] === "marks"
          ? saveAttendance(store, session[1], await readJson(request), actor)
          : changeSession(
              store,
              session[1],
              await readJson(request),
              actor,
              session[2],
            )),
      });
  }
  return json(response, { error: "Không tìm thấy thao tác điểm danh." }, 404);
}
