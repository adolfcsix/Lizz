import { randomUUID } from "node:crypto";
import { MemoryStore } from "../../backend/local/database/memory-store.js";
import {
  saveTerm,
  savePeriod,
} from "../../backend/local/modules/academic/registration-policy.service.js";
import {
  saveSubject,
  saveSection,
  registerSection,
} from "../../backend/local/modules/academic/academic.service.js";
import {
  saveCharge,
  changeCharge,
} from "../../backend/local/modules/finance/finance.service.js";
export const request = (input) => ({ ...input, requestId: randomUUID() });
export async function serviceFixture() {
  const store = new MemoryStore(),
    accounts = {};
  for (const [key, role] of Object.entries({
    manager: "MANAGER",
    staff: "STAFF",
    teacher: "LECTURER",
    teacher2: "LECTURER",
    student: "STUDENT",
    student2: "STUDENT",
  })) {
    const row = {
      id: randomUUID(),
      role,
      username: key,
      email: key + "@example.test",
      fullName: key,
      active: true,
      version: 1,
    };
    await store.insert("accounts", row);
    accounts[key] = row;
  }
  const profiles = [];
  for (const a of [accounts.student, accounts.student2]) {
    const p = {
      id: randomUUID(),
      accountId: a.id,
      code: "SV" + profiles.length,
      fullName: a.fullName,
      classId: randomUUID(),
      version: 1,
    };
    await store.insert("students", p);
    profiles.push(p);
  }
  const term = await saveTerm(
    store,
    { code: "2020.1", name: "Học kỳ", maxCredits: 30, passScore: 5 },
    accounts.manager,
  );
  await savePeriod(
    store,
    {
      termId: term.id,
      title: "Đợt",
      opensAt: Date.now() - 10000,
      closesAt: Date.now() + 1000000,
      withdrawUntil: Date.now() + 2000000,
      status: "OPEN",
    },
    accounts.manager,
  );
  const subject = await saveSubject(
    store,
    { code: "CSDL", name: "Cơ sở dữ liệu", credits: 3 },
    accounts.manager,
  );
  const section = await saveSection(
    store,
    {
      code: "CSDL01",
      subjectId: subject.id,
      lecturerId: accounts.teacher.id,
      term: term.code,
      capacity: 40,
      startDate: "2020-01-06",
      endDate: "2020-03-30",
      weekday: 1,
      startTime: "08:00",
      endTime: "10:00",
      status: "OPEN",
    },
    accounts.manager,
  );
  const enroll = async (actor = accounts.student) =>
    registerSection(
      store,
      { sectionId: section.id, requestId: randomUUID() },
      actor,
    );
  const bill = async (studentId = profiles[0].id, amount = 1000000) => {
    const { row } = await saveCharge(
      store,
      request({
        studentId,
        term: term.code,
        title: "Học phí",
        amount,
        dueDate: "2020-06-01",
      }),
      accounts.staff,
    );
    return (
      await changeCharge(
        store,
        row.id,
        request({ version: row.version, confirm: true }),
        accounts.staff,
        "issue",
      )
    ).row;
  };
  return { store, ...accounts, profiles, term, section, enroll, bill };
}
