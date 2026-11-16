import {
  standingSettings,
  saveStandingPolicy,
  standingOverview,
} from "./standing.service.js";
import {
  gradeSettings,
  saveGradeScheme,
  saveGpaPolicy,
} from "./grade-settings.service.js";
import { json, readJson } from "../../core/http.js";
import {
  gradeOverview,
  gradeRoster,
  saveGradeDrafts,
  transitionGrades,
} from "./grade.service.js";
export async function gradeController({
  request,
  response,
  url,
  store,
  actor,
}) {
  const tail = url.pathname.slice("/api/v1/grades".length);
  if (request.method === "GET" && tail === "/standing/settings")
    return json(response, await standingSettings(store, actor));
  if (request.method === "POST" && tail === "/standing/policies")
    return json(response, {
      row: await saveStandingPolicy(store, await readJson(request), actor),
    });
  if (request.method === "GET" && tail === "/standing")
    return json(
      response,
      await standingOverview(
        store,
        actor,
        Object.fromEntries(url.searchParams),
      ),
    );

  if (request.method === "GET" && tail === "")
    return json(response, await gradeOverview(store, actor));
  if (request.method === "GET" && tail === "/settings")
    return json(response, await gradeSettings(store, actor));
  if (request.method === "POST" && tail === "/gpa-policies")
    return json(
      response,
      await saveGpaPolicy(store, await readJson(request), actor),
    );
  const scheme = tail.match(/^\/sections\/([^/]+)\/scheme$/);
  if (request.method === "POST" && scheme)
    return json(
      response,
      await saveGradeScheme(store, scheme[1], await readJson(request), actor),
    );
  const match = tail.match(
    /^\/sections\/([^/]+)(?:\/(submit|publish|return))?$/,
  );
  if (match) {
    if (request.method === "GET" && !match[2])
      return json(response, await gradeRoster(store, match[1], actor));
    if (request.method === "PUT" && !match[2])
      return json(
        response,
        await saveGradeDrafts(store, match[1], await readJson(request), actor),
      );
    if (request.method === "POST" && match[2])
      return json(
        response,
        await transitionGrades(
          store,
          match[1],
          await readJson(request),
          actor,
          match[2].toUpperCase(),
        ),
      );
  }
  return json(response, { error: "Không tìm thấy thao tác điểm." }, 404);
}
