import { json, readJson } from "../../core/http.js";
import {
  gradeReviewOverview,
  gradeReviewDetail,
  saveGradeReviewPeriod,
  createGradeReview,
  proposeGradeReview,
  decideGradeReview,
} from "./grade-review.service.js";
export async function gradeReviewController({
  store,
  actor,
  url,
  request,
  response,
}) {
  const tail = url.pathname.slice("/api/v1/grade-reviews".length);
  if (request.method === "GET" && tail === "")
    return json(response, await gradeReviewOverview(store, actor));
  if (request.method === "POST" && tail === "/periods")
    return json(
      response,
      await saveGradeReviewPeriod(store, await readJson(request), actor),
    );
  if (request.method === "POST" && tail === "/requests")
    return json(
      response,
      await createGradeReview(store, await readJson(request), actor),
      201,
    );
  const match = tail.match(
    /^\/requests\/([a-f0-9-]{36})(?:\/(propose|approve|reject|return|cancel|apply))?$/,
  );
  if (match) {
    if (request.method === "GET" && !match[2])
      return json(response, await gradeReviewDetail(store, match[1], actor));
    if (request.method === "POST" && match[2])
      return json(
        response,
        await (match[2] === "propose"
          ? proposeGradeReview(store, match[1], await readJson(request), actor)
          : decideGradeReview(
              store,
              match[1],
              await readJson(request),
              actor,
              match[2],
            )),
      );
  }
  return json(response, { error: "Không tìm thấy thao tác phúc khảo." }, 404);
}
