import { json, readJson } from "../../core/http.js";
import {
  notificationOverview,
  markNotifications,
} from "./notification.service.js";
export async function notificationController({
  store,
  actor,
  request,
  response,
  url,
}) {
  if (request.method === "GET" && url.pathname === "/api/v1/notifications")
    return json(
      response,
      await notificationOverview(store, actor, url.searchParams),
    );
  if (
    request.method === "POST" &&
    url.pathname === "/api/v1/notifications/read"
  )
    return json(
      response,
      await markNotifications(store, actor, await readJson(request)),
    );
  return json(response, { error: "Không tìm thấy thao tác thông báo." }, 404);
}
