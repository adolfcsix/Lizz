import { myCoursePlan } from "./course-plan.service.js";
import {
  policyOverview,
  saveTerm,
  savePeriod,
  saveRequirement,
} from "./registration-policy.service.js";
import { json, readJson } from "../../core/http.js";
import {
  studyPolicyOverview,
  saveStudyPolicy,
  studyHistory,
} from "./study-attempts.service.js";
import {
  checkRegistration,
  checkWithdrawal,
  academicOverview,
  sectionRoster,
  saveSubject,
  saveSection,
  registerSection,
  withdrawSection,
} from "./academic.service.js";
export async function academicController({
  request,
  response,
  url,
  store,
  actor,
}) {
  const tail = url.pathname.slice("/api/v1/academics".length);
  if (request.method === "GET" && tail === "/my-course-plan")
    return json(response, await myCoursePlan(store, actor));
  if (request.method === "GET" && tail === "/study-policies")
    return json(response, await studyPolicyOverview(store, actor));
  const studyPolicy = tail.match(/^\/study-policies(?:\/([^/]+))?$/);
  if (
    studyPolicy &&
    ((request.method === "POST" && !studyPolicy[1]) ||
      (request.method === "PATCH" && studyPolicy[1]))
  )
    return json(
      response,
      {
        row: await saveStudyPolicy(
          store,
          await readJson(request),
          actor,
          studyPolicy[1] || null,
        ),
      },
      studyPolicy[1] ? 200 : 201,
    );
  if (request.method === "GET" && tail === "/my-study-history")
    return json(
      response,
      await studyHistory(store, actor, null, url.searchParams.get("subjectId")),
    );
  const history = tail.match(/^\/students\/([^/]+)\/study-history$/);
  if (request.method === "GET" && history)
    return json(
      response,
      await studyHistory(
        store,
        actor,
        history[1],
        url.searchParams.get("subjectId"),
      ),
    );
  if (request.method === "GET" && tail === "")
    return json(response, await academicOverview(store, actor));
  if (request.method === "GET" && tail === "/policies")
    return json(response, await policyOverview(store, actor));
  const policy = tail.match(/^\/(terms|periods|requirements)(?:\/([^/]+))?$/);
  if (
    policy &&
    ((request.method === "POST" && !policy[2]) ||
      (request.method === "PATCH" && policy[2]))
  ) {
    const save = {
      terms: saveTerm,
      periods: savePeriod,
      requirements: saveRequirement,
    }[policy[1]];
    return json(
      response,
      {
        row: await save(
          store,
          await readJson(request),
          actor,
          policy[2] || null,
        ),
      },
      request.method === "POST" ? 201 : 200,
    );
  }
  const eligibility = tail.match(/^\/sections\/([^/]+)\/eligibility$/);
  if (request.method === "GET" && eligibility) {
    const { studyRules } = await checkRegistration(
      store,
      eligibility[1],
      actor,
    );
    return json(response, {
      allowed: studyRules.studyAttempt.allowed,
      ...studyRules,
    });
  }
  const withdrawalEligibility = tail.match(
    /^\/registrations\/([^/]+)\/eligibility$/,
  );
  if (request.method === "GET" && withdrawalEligibility) {
    const { period } = await checkWithdrawal(
      store,
      withdrawalEligibility[1],
      actor,
    );
    return json(response, {
      allowed: true,
      periodTitle: period.title,
      withdrawalDeadline: period.withdrawUntil,
    });
  }
  const roster = tail.match(/^\/sections\/([^/]+)\/students$/);
  if (request.method === "GET" && roster)
    return json(response, await sectionRoster(store, roster[1], actor));
  const resource = tail.match(/^\/(subjects|sections)(?:\/([^/]+))?$/);
  if (
    resource &&
    ((request.method === "POST" && !resource[2]) ||
      (request.method === "PATCH" && resource[2]))
  ) {
    const save = resource[1] === "subjects" ? saveSubject : saveSection;
    return json(
      response,
      {
        row: await save(
          store,
          await readJson(request),
          actor,
          resource[2] || null,
        ),
      },
      request.method === "POST" ? 201 : 200,
    );
  }
  if (request.method === "POST" && tail === "/registrations")
    return json(
      response,
      await registerSection(store, await readJson(request), actor),
      201,
    );
  const withdrawal = tail.match(/^\/registrations\/([^/]+)\/withdraw$/);
  if (request.method === "POST" && withdrawal)
    return json(
      response,
      await withdrawSection(
        store,
        withdrawal[1],
        await readJson(request),
        actor,
      ),
    );
  return json(response, { error: "Không tìm thấy thao tác học phần." }, 404);
}
