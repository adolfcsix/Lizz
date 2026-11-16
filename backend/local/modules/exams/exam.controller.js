import { examReportDetail, mutateExamReport } from "./report.service.js";
import { reviewSeating, confirmSeating } from "./seating.service.js";
import { json, readJson } from "../../core/http.js";
import {
  examOverview,
  saveRoom,
  saveExam,
  reviewExam,
  publishExam,
  cancelExam,
  examRoster,
} from "./exam.service.js";
export async function examController({ store, actor, url, request, response }) {
  const tail = url.pathname.slice("/api/v1/exams".length);
  if (request.method === "GET" && tail === "")
    return json(
      response,
      await examOverview(store, actor, Object.fromEntries(url.searchParams)),
    );
  const report = tail.match(
    /^\/([a-f0-9-]{36})\/report(?:\/(save|submit|confirm|return|reopen))?$/,
  );
  if (report && request.method === "GET" && !report[2])
    return json(
      response,
      await examReportDetail(
        store,
        report[1],
        actor,
        Object.fromEntries(url.searchParams),
      ),
    );
  if (report && request.method === "POST" && report[2])
    return json(
      response,
      await mutateExamReport(
        store,
        report[1],
        report[2],
        await readJson(request),
        actor,
      ),
    );
  const seating = tail.match(/^\/([a-f0-9-]{36})\/seating\/(review|confirm)$/);
  if (seating && request.method === "POST")
    return json(
      response,
      await (seating[2] === "review" ? reviewSeating : confirmSeating)(
        store,
        seating[1],
        await readJson(request),
        actor,
      ),
    );
  const room = tail.match(/^\/rooms(?:\/([a-f0-9-]{36}))?$/);
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
  if (request.method === "POST" && tail === "")
    return json(
      response,
      { row: await saveExam(store, await readJson(request), actor) },
      201,
    );
  const exam = tail.match(
    /^\/([a-f0-9-]{36})(?:\/(review|publish|cancel|students))?$/,
  );
  if (exam) {
    const [_, id, action] = exam;
    if (request.method === "PATCH" && !action)
      return json(response, {
        row: await saveExam(store, await readJson(request), actor, id),
      });
    if (request.method === "GET" && action === "review")
      return json(response, await reviewExam(store, id, actor));
    if (request.method === "GET" && action === "students")
      return json(response, await examRoster(store, id, actor));
    if (
      request.method === "POST" &&
      (action === "publish" || action === "cancel")
    )
      return json(response, {
        row: await (action === "publish" ? publishExam : cancelExam)(
          store,
          id,
          await readJson(request),
          actor,
        ),
      });
  }
  return json(response, { error: "Không tìm thấy thao tác lịch thi." }, 404);
}
