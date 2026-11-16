import { accountAccess, saveAccountAccess } from "../access/access.service.js";
import {
  createAccount,
  publicAccount,
  resetAccountPassword,
  setAccountActive,
} from "./account.service.js";
import { authorize } from "../../middlewares/authorize.js";
import { json, readJson } from "../../core/http.js";

export async function accountController(context) {
  const { request, response, store, actor, url } = context;
  authorize(actor, ["MANAGER"]);
  const reset = url.pathname.match(
    /^\/api\/v1\/accounts\/([a-f0-9-]{36})\/password-reset$/,
  );
  if (reset && request.method === "POST")
    return json(
      response,
      await resetAccountPassword(
        store,
        reset[1],
        await readJson(request),
        actor,
      ),
    );
  const access = url.pathname.match(
    /^\/api\/v1\/accounts\/([a-f0-9-]{36})\/access$/,
  );
  if (access && request.method === "GET")
    return json(response, await accountAccess(store, access[1], actor));
  if (access && request.method === "POST")
    return json(
      response,
      await saveAccountAccess(store, access[1], await readJson(request), actor),
    );
  if (request.method === "GET" && url.pathname === "/api/v1/accounts") {
    return json(response, {
      rows: (await store.list("accounts")).map(publicAccount),
    });
  }
  if (request.method === "POST" && url.pathname === "/api/v1/accounts") {
    return json(
      response,
      { account: await createAccount(store, await readJson(request), actor) },
      201,
    );
  }
  if (
    request.method === "PATCH" &&
    /^\/api\/v1\/accounts\/[^/]+$/.test(url.pathname)
  ) {
    const id = url.pathname.split("/").pop();
    return json(response, await setAccountActive(store, id, await readJson(request), actor));
  }
  json(response, { error: "Không tìm thấy thao tác tài khoản." }, 404);
}
