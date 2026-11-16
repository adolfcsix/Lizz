import { json, readJson } from "../../core/http.js";
import { timetableOverview, saveTimetable } from "./timetable.service.js";
import { saveRoom } from "../exams/exam.service.js";
export async function timetableController({
  request,
  response,
  url,
  store,
  actor,
}) {
  const tail = url.pathname.slice("/api/v1/timetable".length);
  if (request.method === "GET" && tail === "")
    return json(
      response,
      await timetableOverview(
        store,
        actor,
        Object.fromEntries(url.searchParams),
      ),
    );
  const section = tail.match(/^\/sections\/([^/]+)$/);
  if (request.method === "POST" && section)
    return json(
      response,
      await saveTimetable(store, section[1], await readJson(request), actor),
    );
  const room = tail.match(/^\/rooms(?:\/([^/]+))?$/);
  if (
    room &&
    ((request.method === "POST" && !room[1]) ||
      (request.method === "PATCH" && room[1]))
  )
    return json(
      response,
      {
        row: await saveRoom(
          store,
          await readJson(request),
          actor,
          room[1] || null,
        ),
      },
      room[1] ? 200 : 201,
    );
  return json(
    response,
    { error: "Không tìm thấy thao tác thời khóa biểu." },
    404,
  );
}
