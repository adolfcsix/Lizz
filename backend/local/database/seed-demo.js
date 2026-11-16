import {
  saveTerm,
  savePeriod,
} from "../modules/academic/registration-policy.service.js";
import { randomUUID } from "node:crypto";
import { importStudents } from "../modules/students/student.service.js";
import {
  saveSubject,
  saveSection,
} from "../modules/academic/academic.service.js";
import { createAccount } from "../modules/accounts/account.service.js";
import { saveCatalog } from "../modules/catalog/catalog.service.js";

// Mật khẩu công khai CHỈ cho chế độ --demo; không chạy trong npm start.
export async function seedDemo(store) {
  const password = "LizzDemo2026!";
  const admin = await createAccount(store, {
    username: "minh.anh",
    fullName: "Lê Minh Anh",
    email: "minh.anh@lizz.example",
    role: "MANAGER",
    password,
    passwordConfirm: password,
  });
  for (const [username, fullName, role] of [
    ["mai.lan", "Mai Lan", "STUDENT"],
    ["quang.minh", "Minh Anh", "STUDENT"],
    ["hoang.nam", "Nguyễn Hoàng Nam", "LECTURER"],
    ["thu.ha", "Trần Thu Hà", "STAFF"],
  ]) {
    const created = await createAccount(
      store,
      {
        username,
        fullName,
        email: username + "@example.test",
        role,
        password,
        passwordConfirm: password,
      },
      admin,
    );
    if (role === "STAFF")
      await store.insert("staffScopes", {
        id: randomUUID(),
        accountId: created.id,
        scopeType: "ALL",
        facultyId: null,
        cohortId: null,
        active: true,
        version: 1,
      });
  }
  const faculty = await saveCatalog(
    store,
    "faculties",
    { code: "CNTT", name: "Khoa Công nghệ thông tin" },
    admin,
  );
  const cohort = await saveCatalog(
    store,
    "cohorts",
    { code: "K70", name: "Khóa 70", startYear: 2026 },
    admin,
  );
  const major = await saveCatalog(
    store,
    "majors",
    { code: "IT", name: "Công nghệ thông tin", facultyId: faculty.id },
    admin,
  );
  const group = await saveCatalog(
    store,
    "classes",
    {
      code: "IT01",
      name: "Công nghệ thông tin 01",
      majorId: major.id,
      cohortId: cohort.id,
      capacity: 40,
    },
    admin,
  );

  const accounts = await store.list("accounts");
  const mai = accounts.find((r) => r.username === "mai.lan");
  await importStudents(
    store,
    {
      batchId: randomUUID(),
      rows: [
        {
          accountId: mai.id,
          email: mai.email,
          code: "SV001",
          fullName: mai.fullName,
          classId: group.id,
        },
      ],
    },
    admin,
  );
  const term = await saveTerm(
      store,
      {
        code: "2026-2027.1",
        name: "Học kỳ I · 2026–2027",
        maxCredits: 24,
        passScore: 5,
      },
      admin,
    ),
    now = Date.now();
  await savePeriod(
    store,
    {
      termId: term.id,
      title: "Đợt đăng ký minh họa",
      opensAt: now - 86400000,
      closesAt: now + 7 * 86400000,
      withdrawUntil: now + 14 * 86400000,
      status: "OPEN",
    },
    admin,
  );
  const teacher = accounts.find((r) => r.role === "LECTURER");
  for (const [index, code, name, weekday, startTime, endTime] of [
    [1, "CSDL", "Cơ sở dữ liệu", 1, "08:00", "10:00"],
    [2, "LTWEB", "Lập trình web", 3, "08:00", "10:00"],
    [3, "CTDL", "Cấu trúc dữ liệu và giải thuật", 5, "13:00", "15:00"],
  ]) {
    const subject = await saveSubject(store, { code, name, credits: 3 }, admin);
    await saveSection(
      store,
      {
        code: code + "01",
        subjectId: subject.id,
        lecturerId: teacher.id,
        term: "2026-2027.1",
        capacity: 40,
        startDate: "2026-11-02",
        endDate: "2027-05-30",
        weekday,
        startTime,
        endTime,
        status: "OPEN",
      },
      admin,
    );
  }
}
