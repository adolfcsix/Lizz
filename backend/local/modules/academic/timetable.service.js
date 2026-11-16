import { randomUUID } from "node:crypto";
import { requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { tokenHash } from "../../core/password.js";
import { freshActor, lockAcademic, audit } from "./academic.common.js";
import { integrityStore } from "../access/staff-store.js";
import {
  validDate,
  validTime,
  occurs,
  lessons,
  planFor,
  intersects,
  scheduleDescription,
} from "./timetable.rules.js";
const managers = ["MANAGER", "STAFF"],
  all = [...managers, "LECTURER", "STUDENT"];
const note = (v) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= 1000;
const idValid = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v);
const uuid = (v) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
const timeRange = (r) =>
  validTime(r.startTime) && validTime(r.endTime) && r.startTime < r.endTime;
export async function timetableData(store) {
  const keys = [
    "sections",
    "timetablePlans",
    "rooms",
    "enrollments",
    "exams",
    "accounts",
    "subjects",
    "students",
    "attendanceSessions",
  ];
  return Object.fromEntries(
    await Promise.all(keys.map(async (k) => [k, await store.list(k)])),
  );
}
export function validatePlan(section, input) {
  requireValue(
    Array.isArray(input.meetings) &&
      input.meetings.length >= 1 &&
      input.meetings.length <= 16,
    "Mỗi lớp cần từ 1 đến 16 buổi định kỳ mỗi tuần.",
  );
  requireValue(
    (Date.parse(section.endDate) - Date.parse(section.startDate)) / 86400000 <=
      1096,
    "Khoảng ngày của lịch nhiều buổi tối đa ba năm. Rà lại lớp học phần trước khi lập lịch.",
  );
  requireValue(
    Array.isArray(input.exceptions) && input.exceptions.length <= 64,
    "Mỗi lịch có tối đa 64 ngoại lệ.",
  );
  const meetings = input.meetings.map((m) => {
    requireValue(
      m &&
        idValid(m.id) &&
        Number.isInteger(m.weekday) &&
        m.weekday >= 1 &&
        m.weekday <= 7 &&
        timeRange(m),
      "Buổi học cần mã riêng, ngày trong tuần và giờ hợp lệ.",
    );
    requireValue(
      typeof m.roomId === "string" && uuid(m.roomId),
      "Chọn phòng cho từng buổi học.",
    );
    const r = {
      id: m.id,
      weekday: m.weekday,
      startTime: m.startTime,
      endTime: m.endTime,
      roomId: m.roomId,
    };
    requireValue(
      lessons(section, [
        { sectionId: section.id, meetings: [r], exceptions: [] },
      ]).length > 0,
      "Khoảng ngày của lớp không có buổi học vào thứ đã chọn.",
    );
    return r;
  });
  requireValue(
    new Set(meetings.map((m) => m.id)).size === meetings.length,
    "Mã buổi học bị trùng.",
  );
  const exceptions = input.exceptions.map((e) => {
    requireValue(
      e && ["CANCEL", "MOVE"].includes(e.kind) && note(e.reason),
      "Ngoại lệ cần loại và lý do tối đa 1000 ký tự.",
    );
    const m = meetings.find((m) => m.id === e.meetingId);
    requireValue(
      m && occurs(section, m, e.date),
      "Ngày gốc của ngoại lệ phải thuộc buổi định kỳ còn tồn tại.",
    );
    const r = {
      meetingId: m.id,
      date: e.date,
      kind: e.kind,
      reason: e.reason.trim(),
    };
    if (e.kind === "MOVE") {
      requireValue(
        validDate(e.targetDate) &&
          section.startDate <= e.targetDate &&
          e.targetDate <= section.endDate &&
          timeRange(e) &&
          uuid(e.roomId),
        "Buổi học bù cần ngày trong khoảng học phần, giờ hợp lệ và phòng.",
      );
      Object.assign(r, {
        targetDate: e.targetDate,
        startTime: e.startTime,
        endTime: e.endTime,
        roomId: e.roomId,
      });
      requireValue(
        e.targetDate !== e.date ||
          e.startTime !== m.startTime ||
          e.endTime !== m.endTime ||
          e.roomId !== m.roomId,
        "Buổi học bù phải thay đổi ngày, giờ hoặc phòng so với lịch gốc.",
      );
    }
    return r;
  });
  requireValue(
    new Set(exceptions.map((e) => e.meetingId + ":" + e.date)).size ===
      exceptions.length,
    "Một buổi vào một ngày chỉ được có một ngoại lệ.",
  );
  return { meetings, exceptions };
}
export function assertTimetable(d, section, plans = d.timetablePlans) {
  const own = lessons(section, plans);
  for (let i = 0; i < own.length; i++) {
    const slot = own[i];
    requireValue(
      !own
        .slice(i + 1)
        .some((s) => s.date === slot.date && s.meetingId === slot.meetingId),
      "Hai buổi của cùng mục lịch rơi vào một ngày. Chọn ngày học bù khác.",
      409,
    );
    const room = d.rooms.find((r) => r.id === slot.roomId);
    // Lịch cũ chưa có phòng vẫn đọc/đăng ký được; lịch mới luôn bắt buộc phân phòng.
    if (slot.roomId)
      requireValue(
        room?.active && room.capacity >= section.capacity,
        "Phòng học ngừng sử dụng hoặc sức chứa nhỏ hơn sĩ số tối đa của lớp.",
        409,
      );
    for (let j = i + 1; j < own.length && own[j].date === slot.date; j++)
      requireValue(
        !intersects(slot, own[j]),
        "Hai buổi của cùng lớp bị trùng giờ, kể cả buổi học bù.",
        409,
      );
  }
  const ids = new Set(
    d.enrollments
      .filter((e) => e.sectionId === section.id && e.status === "ACTIVE")
      .map((e) => e.studentId),
  );
  for (const other of d.sections.filter((s) => s.id !== section.id)) {
    const sharedStudent = d.enrollments.some(
      (e) =>
        e.sectionId === other.id &&
        e.status === "ACTIVE" &&
        ids.has(e.studentId),
    );
    const otherSlots = lessons(
      other,
      plans,
      section.startDate,
      section.endDate,
    );
    const byDate = new Map();
    for (const s of otherSlots) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    for (const slot of own)
      for (const s of byDate.get(slot.date) || [])
        if (intersects(slot, s)) {
          requireValue(
            section.lecturerId !== other.lecturerId,
            "Giảng viên đã có lớp trùng lịch.",
            409,
          );
          requireValue(
            !slot.roomId || slot.roomId !== s.roomId,
            "Phòng học đã có lớp trong khoảng thời gian này.",
            409,
          );
          requireValue(
            !sharedStudent,
            "Lịch mới trùng với lớp đang đăng ký của sinh viên.",
            409,
          );
        }
  }
  for (const e of d.exams.filter((e) => e.status === "PUBLISHED"))
    for (const slot of own)
      if (intersects(slot, { ...e, date: e.examDate })) {
        requireValue(
          !slot.roomId || slot.roomId !== e.roomId,
          "Phòng đã có lịch thi công bố trong giờ học.",
          409,
        );
        requireValue(
          section.lecturerId !== e.invigilatorId,
          "Lịch học trùng với lịch coi thi đã công bố.",
          409,
        );
        const sameStudents =
          e.sectionId === section.id ||
          d.enrollments.some(
            (r) =>
              r.sectionId === e.sectionId &&
              r.status === "ACTIVE" &&
              ids.has(r.studentId),
          );
        requireValue(
          !sameStudents,
          "Lịch học trùng với lịch thi đã công bố của sinh viên.",
          409,
        );
      }
}
function snapshotSlots(section, plans, date) {
  return JSON.stringify(
    lessons(section, plans, date, date)
      .map(({ meetingId, startTime, endTime, roomId }) => ({
        meetingId,
        startTime,
        endTime,
        roomId,
      }))
      .sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          a.endTime.localeCompare(b.endTime) ||
          String(a.roomId).localeCompare(String(b.roomId)),
      ),
  );
}
export async function saveTimetable(store, sectionId, input, actor) {
  authorize(actor, managers);
  requireValue(
    input &&
      input.confirm === true &&
      uuid(input.requestId) &&
      note(input.reason),
    "Nhập lý do, kiểm tra lịch và xác nhận lưu.",
  );
  const digest = tokenHash(JSON.stringify({ sectionId, ...input }));
  return store.transaction(async (tx) => {
    await freshActor(tx, actor, managers);
    await lockAcademic(tx);
    const replay = (await tx.list("academicRequests", true)).find(
      (r) => r.id === input.requestId,
    );
    if (replay) {
      requireValue(
        replay.actorId === actor.id && replay.requestHash === digest,
        "Mã yêu cầu đã dùng cho nội dung khác.",
        409,
      );
      return { ...replay.result, replayed: true };
    }
    const section = (await tx.list("sections")).find((s) => s.id === sectionId);
    requireValue(
      section,
      "Không tìm thấy lớp học phần trong phạm vi được giao.",
      404,
    );
    const raw = integrityStore(tx),
      d = await timetableData(raw),
      prior = d.timetablePlans.find((p) => p.sectionId === sectionId);
    requireValue(
      section.version === input.sectionVersion &&
        (prior?.version || 0) === input.version,
      "Lớp hoặc lịch đã thay đổi. Tải lại trước khi lưu.",
      409,
    );
    const clean = validatePlan(section, input),
      row = {
        id: prior?.id || randomUUID(),
        sectionId,
        ...clean,
        reason: input.reason.trim(),
        updatedBy: actor.id,
        updatedAt: Date.now(),
        version: (prior?.version || 0) + 1,
      };
    const plans = [
      ...d.timetablePlans.filter((p) => p.sectionId !== sectionId),
      row,
    ];
    requireValue(
      d.accounts.some(
        (a) => a.id === section.lecturerId && a.role === "LECTURER" && a.active,
      ),
      "Giảng viên phụ trách không còn hoạt động.",
      409,
    );
    assertTimetable(d, section, plans);
    for (const s of d.attendanceSessions.filter(
      (s) => s.sectionId === sectionId && s.kind === "CLASS",
    ))
      requireValue(
        snapshotSlots(section, d.timetablePlans, s.sessionDate) ===
          snapshotSlots(section, plans, s.sessionDate),
        "Buổi đã mở điểm danh không được đổi lịch hoặc phòng. Xử lý hồ sơ điểm danh trước khi thay lịch.",
        409,
      );
    if (prior)
      await tx.update(
        "timetablePlans",
        prior.id,
        {
          ...clean,
          reason: row.reason,
          updatedBy: actor.id,
          updatedAt: row.updatedAt,
        },
        prior.version,
      );
    else await tx.insert("timetablePlans", row);
    // Làm mất hiệu lực các bản xem trước đăng ký/AI/điểm đang giữ lớp phiên bản cũ.
    await tx.update(
      "sections",
      sectionId,
      { code: section.code },
      section.version,
    );
    await audit(tx, actor, "TIMETABLE_SAVED", sectionId, {
      before: prior || planFor(section, []),
      after: row,
      reason: row.reason,
    });
    const result = { row, sectionVersion: section.version + 1 };
    await tx.insert("academicRequests", {
      id: input.requestId,
      actorId: actor.id,
      requestHash: digest,
      result,
    });
    return result;
  });
}
export async function timetableOverview(store, actor, query = {}) {
  authorize(actor, all);
  const d = await timetableData(store),
    manage = managers.includes(actor.role);
  const student = d.students.find((s) => s.accountId === actor.id);
  const ids = new Set(
    d.enrollments
      .filter((e) => e.studentId === student?.id && e.status === "ACTIVE")
      .map((e) => e.sectionId),
  );
  const sections = d.sections.filter(
    (s) =>
      manage ||
      (actor.role === "LECTURER" ? s.lecturerId === actor.id : ids.has(s.id)),
  );
  const from =
      query.from ||
      new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10),
    to = query.to || from;
  requireValue(
    validDate(from) &&
      validDate(to) &&
      from <= to &&
      (Date.parse(to) - Date.parse(from)) / 86400000 <= 62,
    "Chọn khoảng xem tối đa 63 ngày, ngày kết thúc không trước ngày bắt đầu.",
  );
  const decorate = (s) => ({
    id: s.id,
    code: s.code,
    term: s.term,
    subjectName: d.subjects.find((r) => r.id === s.subjectId)?.name || "",
    lecturerName: d.accounts.find((r) => r.id === s.lecturerId)?.fullName || "",
    startDate: s.startDate,
    endDate: s.endDate,
    capacity: s.capacity,
    version: s.version,
    weekday: s.weekday,
    startTime: s.startTime,
    endTime: s.endTime,
    scheduleSummary: scheduleDescription(s, d.timetablePlans, d.rooms),
  });
  const entries = sections
    .flatMap((s) =>
      lessons(s, d.timetablePlans, from, to).map((slot) => ({
        ...slot,
        sectionCode: s.code,
        subjectName: d.subjects.find((r) => r.id === s.subjectId)?.name || "",
        lecturerName:
          d.accounts.find((r) => r.id === s.lecturerId)?.fullName || "",
        term: s.term,
        roomCode: d.rooms.find((r) => r.id === slot.roomId)?.code || "",
        roomName: d.rooms.find((r) => r.id === slot.roomId)?.name || "",
      })),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime.localeCompare(b.startTime) ||
        a.sectionCode.localeCompare(b.sectionCode),
    );
  const visibleIds = new Set(sections.map((s) => s.id));
  return {
    from,
    to,
    manage,
    manageRooms:
      actor.role === "MANAGER" ||
      (actor.role === "STAFF" && (await store.access?.())?.all === true) ||
      (actor.role === "STAFF" && !store.staffScoped),
    sections: sections.map(decorate),
    rows: entries,
    plans: manage
      ? d.timetablePlans.filter((p) => visibleIds.has(p.sectionId))
      : [],
    rooms: manage ? d.rooms : [],
    exceptions: sections.flatMap((s) =>
      planFor(s, d.timetablePlans)
        .exceptions.filter(
          (e) =>
            (from <= e.date && e.date <= to) ||
            (e.kind === "MOVE" && from <= e.targetDate && e.targetDate <= to),
        )
        .map((e) => ({ ...e, sectionId: s.id, sectionCode: s.code })),
    ),
  };
}
