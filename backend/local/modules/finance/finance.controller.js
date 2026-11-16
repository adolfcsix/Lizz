import { json, readJson } from "../../core/http.js";
import {
  financeOverview,
  saveCharge,
  changeCharge,
  adjustCharge,
  createReceipt,
  receiptDetail,
  decideReceipt,
} from "./finance.service.js";
export async function financeController({
  store,
  actor,
  url,
  request,
  response,
}) {
  const tail = url.pathname.slice("/api/v1/finance".length);
  if (request.method === "GET" && tail === "")
    return json(response, await financeOverview(store, actor));
  if (request.method === "POST" && tail === "/charges")
    return json(
      response,
      await saveCharge(store, await readJson(request), actor),
      201,
    );
  if (request.method === "POST" && tail === "/receipts")
    return json(
      response,
      await createReceipt(store, await readJson(request), actor),
      201,
    );
  const charge = tail.match(
    /^\/charges\/([a-f0-9-]{36})(?:\/(issue|cancel|adjust))?$/,
  );
  if (charge) {
    if (request.method === "PATCH" && !charge[2])
      return json(
        response,
        await saveCharge(store, await readJson(request), actor, charge[1]),
      );
    if (request.method === "POST" && charge[2])
      return json(
        response,
        await (charge[2] === "adjust"
          ? adjustCharge(store, charge[1], await readJson(request), actor)
          : changeCharge(
              store,
              charge[1],
              await readJson(request),
              actor,
              charge[2],
            )),
      );
  }
  const receipt = tail.match(
    /^\/receipts\/([a-f0-9-]{36})(?:\/(confirm|reject|reverse|reopen))?$/,
  );
  if (receipt) {
    if (request.method === "GET" && !receipt[2])
      return json(response, await receiptDetail(store, receipt[1], actor));
    if (request.method === "POST" && receipt[2])
      return json(
        response,
        await decideReceipt(
          store,
          receipt[1],
          await readJson(request),
          actor,
          receipt[2],
        ),
      );
  }
  return json(response, { error: "Không tìm thấy thao tác học phí." }, 404);
}
