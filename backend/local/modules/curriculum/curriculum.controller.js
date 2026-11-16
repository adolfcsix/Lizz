import {
  previewRecognition,
  submitRecognition,
  changeRecognition,
  recognitionOverview,
} from "./recognition.service.js";
import {
  previewCurriculumTransfer,
  submitCurriculumTransfer,
  changeCurriculumTransfer,
  curriculumTransferOverview,
} from "./curriculum-transfer.service.js";
import { json, readJson } from "../../core/http.js";
import {
  previewCurriculumBatch,
  applyCurriculumBatch,
  compareCurricula,
} from "./curriculum-batch.service.js";
import {
  curriculumOverview,
  saveCurriculum,
  publishCurriculum,
  assignCurriculum,
  curriculumProgress,
} from "./curriculum.service.js";
export async function curriculumController({
  store,
  actor,
  url,
  request,
  response,
}) {
  const tail = url.pathname.slice("/api/v1/curricula".length);
  if (request.method === "GET" && tail === "/recognitions")
    return json(response, await recognitionOverview(store, actor));
  if (request.method === "POST" && tail === "/recognitions/preview")
    return json(
      response,
      await previewRecognition(store, await readJson(request), actor),
    );
  if (request.method === "POST" && tail === "/recognitions")
    return json(
      response,
      await submitRecognition(store, await readJson(request), actor),
      201,
    );
  const recognitionAction = tail.match(
    /^\/recognitions\/([^/]+)\/(approve|reject|cancel|apply|revoke)$/,
  );
  if (recognitionAction && request.method === "POST")
    return json(
      response,
      await changeRecognition(
        store,
        recognitionAction[1],
        recognitionAction[2],
        await readJson(request),
        actor,
      ),
    );
  if (request.method === "GET" && tail === "/transfers")
    return json(response, await curriculumTransferOverview(store, actor));
  if (request.method === "POST" && tail === "/transfers/preview")
    return json(
      response,
      await previewCurriculumTransfer(store, await readJson(request), actor),
    );
  if (request.method === "POST" && tail === "/transfers")
    return json(
      response,
      await submitCurriculumTransfer(store, await readJson(request), actor),
      201,
    );
  const transferAction = tail.match(
    /^\/transfers\/([^/]+)\/(approve|reject|cancel|apply)$/,
  );
  if (request.method === "POST" && transferAction)
    return json(
      response,
      await changeCurriculumTransfer(
        store,
        transferAction[1],
        await readJson(request),
        actor,
        transferAction[2],
      ),
    );
  if (request.method === "GET" && tail === "/compare")
    return json(
      response,
      await compareCurricula(
        store,
        actor,
        url.searchParams.get("before"),
        url.searchParams.get("after"),
      ),
    );
  if (request.method === "POST" && tail === "/assignment-batches/preview")
    return json(
      response,
      await previewCurriculumBatch(store, await readJson(request), actor),
    );
  if (request.method === "POST" && tail === "/assignment-batches")
    return json(
      response,
      await applyCurriculumBatch(store, await readJson(request), actor),
      201,
    );
  if (request.method === "GET" && tail === "")
    return json(response, await curriculumOverview(store, actor));
  const progress = tail.match(/^\/students\/([^/]+)\/progress$/);
  if (request.method === "GET" && progress)
    return json(response, await curriculumProgress(store, actor, progress[1]));
  if (request.method === "POST" && tail === "/assignments")
    return json(
      response,
      { row: await assignCurriculum(store, await readJson(request), actor) },
      201,
    );
  const publish = tail.match(/^\/([^/]+)\/publish$/);
  if (request.method === "POST" && publish)
    return json(response, {
      row: await publishCurriculum(
        store,
        publish[1],
        await readJson(request),
        actor,
      ),
    });
  const edit = tail.match(/^\/([^/]+)$/);
  if (
    (request.method === "POST" && tail === "") ||
    (request.method === "PATCH" && edit)
  )
    return json(
      response,
      {
        row: await saveCurriculum(
          store,
          await readJson(request),
          actor,
          edit?.[1] || null,
        ),
      },
      edit ? 200 : 201,
    );
  return json(
    response,
    { error: "Không tìm thấy thao tác chương trình." },
    404,
  );
}
