import { json, readJson } from "../../core/http.js";
import {
  workflowOverview,
  createTask,
  updateTask,
  proposeTransfer,
  decideApproval,
  applyApproval,
} from "./workflow.service.js";
export async function workflowController({
  request,
  response,
  url,
  store,
  actor,
}) {
  const tail = url.pathname.slice("/api/v1/workflows".length);
  if (request.method === "GET" && tail === "")
    return json(response, await workflowOverview(store, actor));
  if (request.method === "POST" && tail === "/tasks")
    return json(
      response,
      { row: await createTask(store, await readJson(request), actor) },
      201,
    );
  const task = tail.match(/^\/tasks\/([^/]+)$/);
  if (request.method === "PATCH" && task)
    return json(response, {
      row: await updateTask(store, task[1], await readJson(request), actor),
    });
  if (request.method === "POST" && tail === "/transfers")
    return json(
      response,
      await proposeTransfer(store, await readJson(request), actor),
      201,
    );
  const action = tail.match(/^\/approvals\/([^/]+)\/(decide|apply)$/);
  if (request.method === "POST" && action)
    return json(
      response,
      await (action[2] === "decide" ? decideApproval : applyApproval)(
        store,
        action[1],
        await readJson(request),
        actor,
      ),
    );
  return json(response, { error: "Không tìm thấy thao tác công việc." }, 404);
}
