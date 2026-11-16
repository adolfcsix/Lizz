import { randomUUID } from "node:crypto";
import { serviceFixture } from "./student-services-fixture.js";
import {
  saveCurriculum,
  publishCurriculum,
  assignCurriculum,
} from "../../backend/local/modules/curriculum/curriculum.service.js";
import {
  previewCurriculumTransfer,
  submitCurriculumTransfer,
  changeCurriculumTransfer,
} from "../../backend/local/modules/curriculum/curriculum-transfer.service.js";
export async function transferFixture() {
  const f = await serviceFixture();
  f.facultyId = randomUUID();
  f.majorId = randomUUID();
  f.cohortId = randomUUID();
  await f.store.insert("faculties", {
    id: f.facultyId,
    name: "Khoa Công nghệ thông tin",
    version: 1,
  });
  await f.store.insert("majors", {
    id: f.majorId,
    facultyId: f.facultyId,
    name: "Công nghệ thông tin",
    version: 1,
  });
  await f.store.insert("cohorts", {
    id: f.cohortId,
    name: "Khóa 2020",
    version: 1,
  });
  for (const p of f.profiles)
    await f.store.insert("classes", {
      id: p.classId,
      code: "CNTT-" + p.code,
      majorId: f.majorId,
      cohortId: f.cohortId,
      version: 1,
    });
  f.grantId = randomUUID();
  await f.store.insert("staffScopes", {
    id: f.grantId,
    accountId: f.staff.id,
    scopeType: "ALL",
    active: true,
    version: 1,
  });
  f.definition = {
    code: "CNTT",
    name: "Công nghệ thông tin",
    edition: 1,
    majorId: f.majorId,
    cohortId: f.cohortId,
    groups: [
      {
        code: "BB",
        name: "Kiến thức ngành",
        kind: "REQUIRED",
        subjects: [{ subjectId: f.section.subjectId, semester: 1 }],
      },
    ],
  };
  const d = await saveCurriculum(f.store, f.definition, f.manager);
  f.before = await publishCurriculum(
    f.store,
    d.id,
    { version: 1, confirm: true },
    f.manager,
  );
  const next = await saveCurriculum(
    f.store,
    {
      ...f.definition,
      edition: 2,
      groups: [
        {
          ...f.definition.groups[0],
          subjects: [{ subjectId: f.section.subjectId, semester: 2 }],
        },
      ],
    },
    f.manager,
  );
  f.after = await publishCurriculum(
    f.store,
    next.id,
    { version: 1, confirm: true },
    f.manager,
  );
  f.assignmentInput = {
    requestId: randomUUID(),
    curriculumId: f.before.id,
    version: f.before.version,
    studentId: f.profiles[0].id,
    studentVersion: 1,
    reason: "Theo chương trình ban đầu",
    confirm: true,
  };
  f.assignment = await assignCurriculum(f.store, f.assignmentInput, f.staff);
  f.input = { studentId: f.profiles[0].id, curriculumId: f.after.id };
  f.preview = (actor = f.staff) =>
    previewCurriculumTransfer(f.store, f.input, actor);
  f.body = async (actor = f.staff) => ({
    ...f.input,
    requestId: randomUUID(),
    reviewHash: (await f.preview(actor)).reviewHash,
    reason: "Cập nhật chương trình theo quyết định đào tạo",
    confirm: true,
  });
  f.submit = (body, actor = f.staff) =>
    submitCurriculumTransfer(f.store, body, actor);
  f.change = (
    row,
    action,
    actor = action === "apply" ? f.staff : f.manager,
    extra = {},
  ) =>
    changeCurriculumTransfer(
      f.store,
      row.id,
      {
        version: row.version,
        reason: "Đã đối chiếu và đồng ý xử lý",
        confirm: true,
        ...extra,
      },
      actor,
      action,
    );
  return f;
}
