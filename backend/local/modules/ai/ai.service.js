import { recognitionOverview } from "../curriculum/recognition.service.js";
import { studentServicesOverview } from "../students/student-services.service.js";
import { examReportDetail } from "../exams/report.service.js";
import { standingOverview } from "../grades/standing.service.js";
import { studyStatusOverview } from "../students/student-status.service.js";
import { curriculumTransferOverview } from "../curriculum/curriculum-transfer.service.js";
import { profileRequestOverview } from "../students/profile-request.service.js";
import { studyHistory } from "../academic/study-attempts.service.js";
import { notificationOverview } from "../notifications/notification.service.js";
import { curriculumProgress } from "../curriculum/curriculum.service.js";
import { compareCurricula } from "../curriculum/curriculum-batch.service.js";
import { timetableOverview } from "../academic/timetable.service.js";
import { gradeReviewOverview } from "../grades/grade-review.service.js";
import { staffStore } from "../access/staff-store.js";
import { financeOverview } from "../finance/finance.service.js";
import {
  attendanceOverview,
  sectionEligibility,
} from "../attendance/attendance.service.js";
import { examOverview } from "../exams/exam.service.js";
import { policyOverview } from "../academic/registration-policy.service.js";
import { gradeOverview } from "../grades/grade.service.js";
import {
  academicOverview,
  sectionRoster,
} from "../academic/academic.service.js";
import { randomUUID } from "node:crypto";
import { AppError, requireValue } from "../../core/errors.js";
import { authorize } from "../../middlewares/authorize.js";
import { foldText } from "../../../../shared/local-validation.js";
import { suggestAccounts, listStudents } from "../students/student.service.js";
import { AiRepository } from "./ai.repository.js";
import {
  TOOL_REGISTRY,
  toolsFor,
  validateArguments,
  systemInstruction,
} from "./ai.tools.js";
import {
  planAction,
  executeAction,
  fingerprint,
  actionRoles,
} from "./ai.actions.js";

const uuid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const now = () => new Date().toISOString();
export function publicProposal(row) {
  const { id, title, action, preview, status, version, expiresAt, result } =
    row;
  return {
    id,
    title:
      title ||
      {
        CREATE_SUBJECT: "Thêm môn học",
        CREATE_SECTION: "Mở lớp học phần",
        REGISTER_SECTION: "Đăng ký lớp học phần",
        WITHDRAW_SECTION: "Rút đăng ký lớp học phần",
        CREATE_STUDENTS: "Tạo hồ sơ sinh viên",
        CREATE_CATALOG: "Thêm danh mục",
        UPDATE_STUDENT: "Cập nhật hồ sơ",
      }[action],
    action,
    preview,
    status,
    version,
    expiresAt,
    result,
  };
}

export class AiService {
  constructor(store, provider) {
    this.store = store;
    this.provider = provider;
    this.busy = new Set();
    this.usage = new Map();
  }

  forActor(actor) {
    if (actor?.role !== "STAFF" || this.store.staffScoped) return this;
    const scoped = Object.create(this);
    scoped.store = staffStore(this.store, actor);
    return scoped;
  }
  async history(actor, query = "") {
    const scoped = this.forActor(actor);
    if (scoped !== this) return scoped.history(actor, query);
    authorize(actor, ["MANAGER", "STAFF", "LECTURER", "STUDENT"]);
    requireValue(
      typeof query === "string" && query.length <= 160,
      "Từ khóa lịch sử quá dài.",
    );
    const q = foldText(query);
    const proposals = await this.store.list("proposals");
    const rows = (await this.store.list("conversations"))
      .filter(
        (row) =>
          row.actorId === actor.id && row.accountVersion === actor.version,
      )
      .map((row) => {
        const title = (
          row.messages.find((m) => m.role === "user")?.text || "Cuộc trò chuyện"
        ).slice(0, 80);
        const timestamp = Date.parse(row.messages.at(-1)?.at || "");
        return {
          id: row.id,
          title,
          updatedAt: Number.isFinite(timestamp) ? timestamp : 0,
          pendingCount: proposals.filter(
            (p) =>
              p.conversationId === row.id &&
              p.actorId === actor.id &&
              p.status === "PREPARED" &&
              p.expiresAt > Date.now(),
          ).length,
        };
      })
      .filter((row) => foldText(row.title).includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
    return { rows: rows.slice(0, 20), total: rows.length, limit: 20 };
  }

  async conversation(id, actor) {
    const scoped = this.forActor(actor);
    if (scoped !== this) return scoped.conversation(id, actor);
    const repo = new AiRepository(this.store);
    const row = await repo.ownedConversation(id, actor);
    requireValue(
      row,
      "Không tìm thấy cuộc hội thoại trong quyền của bạn.",
      404,
    );
    const proposals = await repo.proposals(id, actor);
    return {
      id: row.id,
      version: row.version,
      messages: row.messages,
      proposals: proposals.map(publicProposal),
    };
  }

  async message(input, actor) {
    const scoped = this.forActor(actor);
    if (scoped !== this) return scoped.message(input, actor);
    requireValue(
      this.provider.ready,
      "LizzChat hiện chưa khả dụng. Bạn vẫn có thể sử dụng các chức năng khác.",
      503,
    );
    requireValue(
      uuid(input.conversationId) && uuid(input.requestId),
      "Thiếu mã hội thoại hoặc mã yêu cầu.",
    );
    requireValue(
      typeof input.message === "string" &&
        input.message.trim().length >= 1 &&
        input.message.length <= 3000,
      "Tin nhắn cần 1–3000 ký tự.",
    );
    // Chặn thông tin xác thực phổ biến trước khi gửi nhà cung cấp. UI cũng nhắc không nhập bí mật.
    requireValue(
      !/(?:AIza[\w-]{25,}|-----BEGIN[^-]*PRIVATE KEY|(?:mật khẩu|password|api[_ -]?key|cookie|token)\s*[:=]\s*\S+)/i.test(
        input.message,
      ),
      "Không gửi mật khẩu, token hoặc khóa API trong hội thoại.",
    );
    const all = await this.store.list("conversations");
    const existing = all.find((row) => row.id === input.conversationId);
    if (existing) {
      requireValue(
        existing.actorId === actor.id &&
          existing.accountVersion === actor.version,
        "Không tìm thấy cuộc hội thoại trong quyền của bạn.",
        404,
      );
      if (
        existing.messages.some(
          (message) => message.requestId === input.requestId,
        )
      )
        return this.conversation(existing.id, actor);
      requireValue(
        existing.version === input.version,
        "Hội thoại đã thay đổi. Tải lại trước khi gửi tiếp.",
        409,
      );
    }
    requireValue(
      !this.busy.has(input.conversationId),
      "LizzChat đang xử lý lượt trước. Vui lòng chờ.",
      409,
    );
    const rate = this.usage.get(actor.id) || {
      count: 0,
      until: Date.now() + 60_000,
    };
    if (rate.until < Date.now()) {
      rate.count = 0;
      rate.until = Date.now() + 60_000;
    }
    requireValue(
      rate.count < 8,
      "Bạn đang gửi quá nhanh. Vui lòng đợi một phút.",
      429,
    );
    rate.count++;
    this.usage.set(actor.id, rate);
    const history = structuredClone(existing?.history || []);
    requireValue(
      (existing?.messages.length || 0) < 40,
      "Hội thoại đã dài. Mở cuộc trò chuyện mới để tiếp tục.",
    );
    history.push({
      type: "user_input",
      content: [{ type: "text", text: input.message.trim() }],
    });
    const drafts = [],
      sources = [];
    const signal = AbortSignal.timeout(35_000);
    let answer = "";
    this.busy.add(input.conversationId);
    try {
      for (let round = 0; round < 4; round++) {
        const response = await this.provider.generate({
          history,
          tools: toolsFor(actor),
          instruction: systemInstruction(actor),
          signal,
        });
        requireValue(
          Array.isArray(response.steps) &&
            Array.isArray(response.calls) &&
            response.calls.length <= 5,
          "Phản hồi công cụ AI không hợp lệ.",
          502,
        );
        history.push(...response.steps);
        requireValue(
          JSON.stringify(history).length < 220_000,
          "Hội thoại vượt giới hạn ngữ cảnh. Mở cuộc trò chuyện mới.",
        );
        if (!response.calls.length) {
          answer = String(response.text || "").slice(0, 8000);
          break;
        }
        for (const call of response.calls) {
          requireValue(
            typeof call.id === "string" && call.id.length <= 200,
            "Thiếu mã công cụ AI.",
            502,
          );
          let result;
          try {
            result = await this.runTool(
              call.name,
              call.arguments,
              actor,
              drafts,
              sources,
              input.conversationId,
            );
          } catch (error) {
            result = {
              error: error.status || 400,
              message: error.status
                ? error.message
                : "Tham số công cụ không hợp lệ. Hỏi lại người dùng.",
            };
          }
          history.push({
            type: "function_result",
            name: call.name,
            call_id: call.id,
            result: [{ type: "text", text: JSON.stringify(result) }],
          });
        }
        requireValue(
          JSON.stringify(history).length < 220_000,
          "Hội thoại vượt giới hạn ngữ cảnh. Mở cuộc trò chuyện mới.",
        );
      }
      requireValue(
        answer,
        "AI chưa hoàn thành câu trả lời trong giới hạn lượt xử lý. Chưa thực hiện thao tác nghiệp vụ.",
        502,
      );
      // Thẻ xác nhận và kết quả server là nguồn trạng thái, không lấy lời mô hình làm bằng chứng đã ghi.
      if (drafts.length)
        answer =
          "Đã chuẩn bị bản xem trước bên dưới. Chưa ghi dữ liệu nghiệp vụ. Bạn hãy kiểm tra rồi chọn Xác nhận thực hiện hoặc Hủy đề xuất.";
      await this.store.transaction(async (tx) => {
        const currentActor = (await tx.list("accounts", true)).find(
          (row) => row.id === actor.id,
        );
        requireValue(
          currentActor?.active &&
            currentActor.version === actor.version &&
            currentActor.role === actor.role,
          "Phiên hoặc quyền đã thay đổi. Đăng nhập lại.",
          401,
        );
        const repo = new AiRepository(tx);
        const current = (await tx.list("conversations", true)).find(
          (row) => row.id === input.conversationId,
        );
        requireValue(
          existing ? current?.version === existing.version : !current,
          "Hội thoại đã thay đổi. Tải lại để kiểm tra.",
          409,
        );
        const messages = [
          ...(existing?.messages || []),
          {
            role: "user",
            text: input.message.trim(),
            at: now(),
            requestId: input.requestId,
          },
          {
            role: "assistant",
            text: answer,
            at: now(),
            requestId: input.requestId,
            sources,
          },
        ];
        if (existing)
          await repo.updateConversation(
            existing.id,
            { messages, history },
            existing.version,
          );
        else
          await repo.createConversation({
            id: input.conversationId,
            actorId: actor.id,
            accountVersion: actor.version,
            messages,
            history,
            version: 1,
          });
        if (drafts.length) {
          for (const old of await repo.proposals(
            input.conversationId,
            actor,
            true,
          ))
            if (old.status === "PREPARED")
              await repo.updateProposal(
                old.id,
                { status: "CANCELLED" },
                old.version,
              );
          for (const { title, ...draft } of drafts)
            await repo.createProposal(draft);
        }
      });
      return await this.conversation(input.conversationId, actor);
    } finally {
      this.busy.delete(input.conversationId);
    }
  }

  async runTool(name, args, actor, drafts, sources, conversationId) {
    const scoped = this.forActor(actor);
    if (scoped !== this)
      return scoped.runTool(name, args, actor, drafts, sources, conversationId);
    const definition = TOOL_REGISTRY.find(
      (tool) => tool.name === name && tool.roles.includes(actor.role),
    );
    requireValue(
      definition,
      "Công cụ này không thuộc quyền của tài khoản.",
      403,
    );
    validateArguments(definition.parameters, args);
    if (this.store.staffScoped && !(await this.store.access()).all) {
      requireValue(
        !(
          name === "prepare_subject" ||
          (name === "prepare_catalog_entry" &&
            ["cohorts", "faculties"].includes(args.kind))
        ),
        "Danh mục dùng chung do Quản lý hoặc Nhân viên toàn trường cập nhật.",
        403,
      );
    }
    const asOf = now();
    if (name === "lookup_academic_standing") {
      const students = (await this.store.list("students")).filter(
          (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
        ),
        student = students.find((s) =>
          actor.role === "STUDENT" && !args.studentCode
            ? true
            : foldText(s.code) === foldText(args.studentCode || ""),
        ),
        term = (await this.store.list("terms")).find(
          (t) => foldText(t.code) === foldText(args.termCode || ""),
        );
      if (!student || !term)
        return {
          needsInformation: [
            ...(!student ? ["Mã sinh viên chính xác trong quyền"] : []),
            ...(!term ? ["Mã học kỳ chính xác"] : []),
          ],
        };
      const data = await standingOverview(this.store, actor, {
          termId: term.id,
          studentId: student.id,
        }),
        source = "Đối chiếu học vụ theo điểm công bố và quy chế học kỳ";
      sources.push({ name: source, asOf: data.asOf });
      return { ...data, source };
    }
    if (name === "lookup_study_status") {
      const data = await studyStatusOverview(this.store, actor),
        student = data.students.find((s) =>
          actor.role === "STUDENT" && !args.studentCode
            ? true
            : foldText(s.code) === foldText(args.studentCode || ""),
        );
      if (!student)
        return {
          needsInformation: ["Mã sinh viên chính xác trong quyền tra cứu"],
        };
      const rows = data.rows
          .filter((r) => r.studentId === student.id)
          .map((r) => ({
            id: r.id,
            kind: r.kind,
            status: r.status,
            term: r.preview.term.code,
            appliedAt: r.result?.appliedAt || null,
          })),
        source = "Quyết định trạng thái học trong hệ thống";
      sources.push({ name: source, asOf });
      return {
        student,
        rows: rows.slice(0, 50),
        total: rows.length,
        limit: 50,
        note: data.note,
        source,
        asOf,
      };
    }
    if (name === "lookup_curriculum_transfers") {
      const students = (await this.store.list("students")).filter(
        (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
      );
      const student = students.find((s) =>
        actor.role === "STUDENT" && !args.studentCode
          ? s.accountId === actor.id
          : foldText(s.code) === foldText(args.studentCode || ""),
      );
      if (!student)
        return {
          needsInformation: ["Mã sinh viên chính xác trong quyền tra cứu"],
        };
      const data = await curriculumTransferOverview(this.store, actor),
        rows = data.rows
          .filter((r) => r.studentId === student.id)
          .map((r) => ({
            id: r.id,
            status: r.status,
            before: r.preview?.before || r.before,
            after: r.preview?.after || r.after,
            appliedAt: r.result?.appliedAt || r.appliedAt || null,
          }));
      const source = "Hồ sơ chuyển chương trình trong quyền hiện tại";
      sources.push({ name: source, asOf });
      return {
        studentCode: student.code,
        rows: rows.slice(0, 50),
        total: rows.length,
        limit: 50,
        source,
        asOf,
        note: data.note,
      };
    }
    if (name === "lookup_study_history") {
      const students = (await this.store.list("students")).filter(
        (s) => actor.role !== "STUDENT" || s.accountId === actor.id,
      );
      const student = students.find((s) =>
        actor.role === "STUDENT" && !args.studentCode
          ? s.accountId === actor.id
          : foldText(s.code) === foldText(args.studentCode || ""),
      );
      if (!student)
        return {
          needsInformation: ["Mã sinh viên chính xác trong quyền tra cứu"],
        };
      const subject = args.subjectCode
        ? (await this.store.list("subjects")).find(
            (s) => foldText(s.code) === foldText(args.subjectCode),
          )
        : null;
      if (args.subjectCode && !subject)
        return { needsInformation: ["Mã học phần đã tồn tại trong quyền"] };
      const data = await studyHistory(
        this.store,
        actor,
        student.id,
        subject?.id || null,
      );
      const source = "Lịch sử học phần trong quyền hiện tại";
      sources.push({ name: source, asOf });
      return {
        ...data,
        rows: data.rows.slice(0, 50),
        total: data.rows.length,
        limit: 50,
        source,
        asOf,
      };
    }
    if (name === "lookup_my_notifications") {
      const data = await notificationOverview(
        this.store,
        actor,
        new URLSearchParams({
          q: args.query || "",
          status: args.status || "all",
        }),
      );
      const source = "Thông báo cá nhân trong quyền hiện tại";
      sources.push({ name: source, asOf });
      return {
        ...data,
        source,
        asOf,
        note: "Chỉ thông báo cá nhân còn đọc được trong quyền; tối đa 20 mục/trang. Chưa tự đánh dấu đã đọc.",
      };
    }
    if (name === "compare_curriculum_versions") {
      const missing = [];
      if (!args.programCode?.trim()) missing.push("Mã chương trình");
      for (const [key, label] of [
        ["beforeEdition", "Phiên bản gốc"],
        ["afterEdition", "Phiên bản đối chiếu"],
      ])
        if (!Number.isInteger(args[key]) || args[key] < 1 || args[key] > 999)
          missing.push(label + " từ 1 đến 999");
      if (missing.length) return { needsInformation: missing };
      const majors = await this.store.list("majors"),
        cohorts = await this.store.list("cohorts");
      const programs = (await this.store.list("curricula")).filter(
        (p) =>
          foldText(p.code) === foldText(args.programCode.trim()) &&
          (actor.role !== "LECTURER" || p.status === "PUBLISHED") &&
          (!args.majorCode ||
            foldText(majors.find((m) => m.id === p.majorId)?.code || "") ===
              foldText(args.majorCode)) &&
          (!args.cohortCode ||
            foldText(cohorts.find((c) => c.id === p.cohortId)?.code || "") ===
              foldText(args.cohortCode)),
      );
      const pairs = programs
        .filter((p) => p.edition === args.beforeEdition)
        .map((before) => ({
          before,
          after: programs.find(
            (p) =>
              p.edition === args.afterEdition &&
              p.majorId === before.majorId &&
              p.cohortId === before.cohortId,
          ),
        }))
        .filter((p) => p.after);
      if (pairs.length !== 1)
        return {
          needsInformation: [
            pairs.length
              ? "Mã ngành và khóa để chọn đúng cặp phiên bản"
              : "Kiểm tra mã chương trình, ngành/khóa và hai phiên bản trong quyền",
          ],
          choices: pairs.slice(0, 20).map(({ before }) => ({
            programCode: before.code,
            majorCode: majors.find((m) => m.id === before.majorId)?.code || "",
            majorName: majors.find((m) => m.id === before.majorId)?.name || "",
            cohortCode:
              cohorts.find((c) => c.id === before.cohortId)?.code || "",
            cohortName:
              cohorts.find((c) => c.id === before.cohortId)?.name || "",
          })),
        };
      const result = await compareCurricula(
        this.store,
        actor,
        pairs[0].before.id,
        pairs[0].after.id,
      );
      const source = "Đối chiếu phiên bản chương trình trong quyền";
      sources.push({ name: source, asOf });
      return {
        ...result,
        subjects: result.subjects.slice(0, 50),
        totalChangedSubjects: result.subjects.length,
        truncated: result.subjects.length > 50,
        source,
        asOf,
      };
    }
    if (name === "lookup_profile_requests") {
      const result = await profileRequestOverview(this.store, actor, {
        query: actor.role === "STUDENT" ? "" : args.query || "",
        status: args.status || "",
      });
      sources.push({ name: "Trạng thái yêu cầu hồ sơ trong quyền", asOf });
      return {
        total: result.rows.length,
        rows: result.rows.slice(0, 30).map((r) => ({
          id: r.id,
          studentCode: r.studentCode,
          studentName: r.studentName,
          status: r.status,
          assignedName: r.assignedName,
          updatedAt: r.updatedAt,
        })),
        limit: 30,
      };
    }

    if (name === "lookup_curriculum_progress") {
      const students = await this.store.list("students");
      const query = foldText(args.query || "");
      const exact = students.filter((s) => foldText(s.code) === query);
      const matches =
        actor.role === "STUDENT"
          ? students.filter((s) => s.accountId === actor.id)
          : !query
            ? []
            : exact.length
              ? exact
              : students.filter((s) => foldText(s.fullName).includes(query));
      if (matches.length !== 1)
        return {
          needsInformation: ["Mã sinh viên chính xác trong phạm vi được giao"],
          note: "Chưa xác định một hồ sơ; không tự chọn người đầu tiên.",
        };
      const data = await curriculumProgress(this.store, actor, matches[0].id);
      sources.push({
        name: "Chương trình được áp dụng và điểm đã công bố trong quyền",
        asOf,
      });
      return data;
    }

    if (name === "lookup_timetable") {
      if (!args.from || !args.to)
        return {
          needsInformation: [
            "Khoảng ngày cần tra thời khóa biểu (ngày đầu và ngày cuối)",
          ],
        };
      const data = await timetableOverview(this.store, actor, {
        from: args.from,
        to: args.to,
      });
      const q = foldText(args.query || ""),
        rows = data.rows.filter((r) =>
          foldText(
            r.sectionCode + " " + r.subjectName + " " + r.roomCode,
          ).includes(q),
        );
      const ids = new Set(
        data.sections
          .filter((s) => foldText(s.code + " " + s.subjectName).includes(q))
          .map((s) => s.id),
      );
      const exceptions = data.exceptions.filter((e) => ids.has(e.sectionId));
      sources.push({
        name: "Thời khóa biểu theo ngày và ngoại lệ trong quyền",
        asOf,
      });
      return {
        rows: rows.slice(0, 50),
        total: rows.length,
        exceptions: exceptions.slice(0, 50),
        exceptionTotal: exceptions.length,
        from: data.from,
        to: data.to,
        source: sources.at(-1).name,
        asOf,
      };
    }
    if (name === "lookup_grade_reviews") {
      const data = await gradeReviewOverview(this.store, actor),
        q = foldText(args.query || "");
      const rows = data.rows
        .filter(
          (r) =>
            (!args.status || r.status === args.status) &&
            foldText(
              [
                r.id,
                r.reference,
                r.studentCode,
                r.studentName,
                r.subjectName,
                r.sectionCode,
                r.reason,
              ].join(" "),
            ).includes(q),
        )
        .map((r) => ({
          id: r.id,
          reference: r.reference,
          studentCode: r.studentCode,
          studentName: r.studentName,
          subjectName: r.subjectName,
          sectionCode: r.sectionCode,
          status: r.status,
          originalScore: r.baseGrade.score,
          proposedScore: r.proposal?.score ?? null,
          currentScore: r.currentScore,
          createdAt: r.createdAt,
        }));
      const source = "Hồ sơ phúc khảo và rà soát điểm trong quyền";
      sources.push({ name: source, asOf });
      return {
        rows: rows.slice(0, 50),
        total: rows.length,
        source,
        asOf,
        note: "APPROVED chưa thay đổi điểm; APPLIED mới là hồ sơ đã áp dụng kết quả. Không tự ghi, duyệt hoặc áp dụng qua chat.",
      };
    }
    if (name === "lookup_finance") {
      const data = await financeOverview(this.store, actor),
        q = foldText(args.query || "");
      const charges = data.charges.filter(
        (c) =>
          (!args.term || foldText(c.term) === foldText(args.term)) &&
          foldText(
            c.code + " " + c.title + " " + c.studentCode + " " + c.studentName,
          ).includes(q),
      );
      const ids = new Set(charges.slice(0, 50).map((c) => c.id)),
        source = "Khoản thu và phiếu xác nhận trong quyền";
      sources.push({ name: source, asOf });
      return {
        charges: charges.slice(0, 50),
        receipts: data.receipts
          .filter((r) => ids.has(r.chargeId))
          .slice(0, 100),
        adjustments: data.adjustments
          .filter((r) => ids.has(r.chargeId))
          .slice(0, 100),
        total: charges.length,
        limit: 50,
        source,
        asOf,
        currency: "VND",
        note: "Chỉ CONFIRMED được tính là đã nộp. PENDING là chờ xác minh; không phải giao dịch ngân hàng được xác nhận tự động.",
      };
    }
    if (name === "lookup_exam_eligibility") {
      const overview = await attendanceOverview(this.store, actor);
      const sections = overview.sections.filter(
        (s) =>
          (!args.sectionCode ||
            foldText(s.code) === foldText(args.sectionCode)) &&
          (!args.term || foldText(s.term) === foldText(args.term)),
      );
      if (!args.sectionCode || sections.length !== 1)
        return {
          needsInformation: ["Mã lớp và học kỳ chính xác"],
          options: sections
            .slice(0, 50)
            .map(({ code, term }) => ({ code, term })),
        };
      const data = await sectionEligibility(this.store, sections[0].id, actor),
        source = "Điểm danh đã chốt và điều kiện dự thi";
      sources.push({ name: source, asOf });
      return {
        ...data,
        rows: data.rows.slice(0, 50),
        total: data.rows.length,
        limit: 50,
        source,
        asOf,
      };
    }
    if (name === "lookup_student_services") {
      const data = await studentServicesOverview(this.store, actor),
        own = actor.role === "STUDENT",
        code = (args.studentCode || "").trim().toLowerCase();
      let rows = own ? data.rows : code ? data.rows.filter((r) => r.studentCode.toLowerCase() === code) : [];
      if (args.requestId) rows = rows.filter((r) => r.id === args.requestId);
      const source = "Thủ tục sinh viên và hồ sơ trong quyền hiện tại";
      sources.push({ name: source, asOf });
      return { source, asOf, definitions: data.definitions.filter((d) => d.status === "PUBLISHED").slice(0, 50).map((d) => ({ id: d.id, code: d.code, name: d.name, edition: d.edition, unitPrice: d.payload.unitPrice, maxQuantity: d.payload.maxQuantity, deliveryMethods: d.payload.deliveryMethods, instructions: d.payload.instructions, requiredDocuments: d.payload.requiredDocuments })),
        total: rows.length, rows: rows.slice(0, 50).map((r) => ({ id: r.id, studentCode: r.studentCode, service: r.payload.service.name, status: r.status, quantity: r.payload.details.quantity, estimatedAmount: r.payload.details.estimatedAmount, updatedAt: r.updatedAt })),
        note: "Đơn giá và số tiền dự kiến không xác nhận khoản phải thu hay đã thanh toán. Cần mở hồ sơ để xem hướng dẫn bổ sung hoặc nhận kết quả.",
        ...(!own && !code ? { needsInformation: ["Mã sinh viên chính xác để tra tiến trình hồ sơ"] } : {}) };
    }
    if (name === "lookup_credit_recognitions") {
      const data = await recognitionOverview(this.store, actor),
        student =
          actor.role === "STUDENT"
            ? data.students[0]
            : data.students.find(
                (s) =>
                  s.code.toLowerCase() ===
                  (args.studentCode || "").trim().toLowerCase(),
              );
      requireValue(
        student,
        "Cần mã sinh viên chính xác trong quyền để tra cứu.",
        404,
      );
      sources.push({ name: "Hồ sơ công nhận học phần trong quyền", asOf });
      const rows = data.rows.filter((r) => r.studentId === student.id);
      return {
        studentCode: student.code,
        total: rows.length,
        rows: rows
          .slice(0, 30)
          .map((r) => ({
            subject: r.payload?.subject || r.subject,
            status: r.status,
            effectiveDate: r.payload?.effectiveDate || r.effectiveDate,
            satisfiesPrerequisite:
              r.payload?.satisfiesPrerequisite ?? r.satisfiesPrerequisite,
            appliedAt: r.result?.appliedAt || null,
            gpaIncluded: false,
          })),
        note: data.note,
        asOf,
      };
    }
    if (name === "lookup_exam_report") {
      const data = await examReportDetail(this.store, args.examId, actor);
      sources.push({ name: "Biên bản ca thi trong quyền hiện tại", asOf });
      const report = data.report,
        snapshot = report?.payload.snapshot || data.live;
      return {
        hasReport: Boolean(report),
        status: report?.status || "NOT_CREATED",
        version: report?.version || 0,
        sourceCurrent: data.sourceCurrent,
        sectionCode: snapshot.sectionCode,
        examDate: snapshot.examDate,
        total: snapshot.total,
        attended: snapshot.attended,
        absent: snapshot.absent,
        papers: report?.payload.papers ?? null,
        notes: report?.payload.notes || "",
        reason: report?.payload.reason || "",
        issues: data.live.issues,
        asOf,
      };
    }
    if (name === "lookup_exam_schedule") {
      const result = await examOverview(this.store, actor, {
        q: args.query || "",
        term: args.term || "",
      });
      const source = "Lịch thi trong quyền của bạn";
      sources.push({ name: source, asOf });
      return {
        rows: result.rows.slice(0, 50),
        total: result.rows.length,
        limit: 50,
        source,
        asOf,
        timeZone: "Asia/Ho_Chi_Minh",
      };
    }
    if (name === "lookup_my_account") {
      let access = null;
      if (this.store.staffScoped) {
        const a = await this.store.access();
        const faculties = await this.store.list("faculties"),
          cohorts = await this.store.list("cohorts");
        access = {
          allSchools: a.all,
          scopes: a.scopes.map((s) => ({
            faculty: faculties.find((f) => f.id === s.facultyId)?.name || null,
            cohort: cohorts.find((c) => c.id === s.cohortId)?.name || null,
          })),
        };
      }
      return {
        account: {
          fullName: actor.fullName,
          email: actor.email,
          role: actor.role,
        },
        access,
        source: "Tài khoản đang đăng nhập",
        asOf,
      };
    }
    if (name === "lookup_registration_rules") {
      const data = await policyOverview(this.store, actor),
        terms = data.terms.filter(
          (t) => !args.term || foldText(t.code) === foldText(args.term),
        );
      const source = "Đợt đăng ký và điều kiện học phần";
      sources.push({ name: source, asOf });
      return {
        terms: terms.slice(0, 50),
        studyPolicies: data.studyPolicies
          .filter((p) => terms.some((t) => t.id === p.termId))
          .slice(0, 50),
        periods: data.periods
          .filter((p) => terms.some((t) => t.id === p.termId))
          .slice(0, 50),
        requirements: data.requirements
          .filter((r) => r.active)
          .slice(0, 50)
          .map((r) => ({
            subject: data.subjects.find((s) => s.id === r.subjectId)?.code,
            requiredSubject: data.subjects.find(
              (s) => s.id === r.requiredSubjectId,
            )?.code,
          })),
        serverTime: data.serverTime,
        source,
        asOf,
        timeZone: "Asia/Ho_Chi_Minh",
        limit: 50,
      };
    }
    if (name === "lookup_academic_summary") {
      const data = await gradeOverview(this.store, actor),
        q = foldText(args.query || "");
      const summaries = data.summaries
        .filter((s) =>
          foldText(s.studentCode + " " + s.studentName).includes(q),
        )
        .slice(0, 50)
        .map((s) => ({
          ...s,
          terms: s.terms.filter(
            (t) => !args.term || foldText(t.term) === foldText(args.term),
          ),
        }));
      const source = "Kết quả công bố và quy định quy đổi đã chốt";
      sources.push({ name: source, asOf });
      return {
        summaries,
        source,
        asOf,
        limit: 50,
        note: "NOT_VERIFIED không có GPA đủ căn cứ; không tự suy ra xếp loại hoặc đủ điều kiện tốt nghiệp.",
      };
    }
    if (name === "lookup_learning_results") {
      const data = await gradeOverview(this.store, actor),
        q = foldText(args.query || "");
      const rows = data.rows.filter(
        (r) =>
          (!args.term || foldText(r.term) === foldText(args.term)) &&
          foldText(
            r.studentCode +
              " " +
              r.studentName +
              " " +
              r.subjectName +
              " " +
              r.subjectCode +
              " " +
              r.sectionCode,
          ).includes(q),
      );
      const source =
        actor.role === "STUDENT"
          ? "Điểm đã công bố của bạn"
          : "Điểm trong phạm vi phân công/quyền";
      sources.push({ name: source, asOf });
      return { rows: rows.slice(0, 50), total: rows.length, source, asOf };
    }
    if (name === "lookup_catalog") {
      if (!args.kind)
        return { needsInformation: ["Loại danh mục cần tra cứu"] };
      const query = foldText(args.query || "");
      const rows = (await this.store.list(args.kind))
        .filter((row) => foldText(row.code + " " + row.name).includes(query))
        .slice(0, 50);
      if (args.kind === "classes") {
        const profiles = await this.store.list("students");
        for (const row of rows) {
          row.enrolled = profiles.filter(
            (profile) => profile.classId === row.id,
          ).length;
          row.available = Math.max(0, row.capacity - row.enrolled);
        }
      }
      sources.push({ name: "Danh mục đào tạo", asOf });
      return { rows, source: "Danh mục đào tạo", asOf, limit: 50 };
    }
    if (name === "lookup_students") {
      const result = await listStudents(
        this.store,
        actor,
        new URLSearchParams({ q: args.query || "" }),
      );
      sources.push({
        name:
          actor.role === "STUDENT"
            ? "Hồ sơ của bạn"
            : "Danh sách sinh viên trong quyền",
        asOf,
      });
      return {
        ...result,
        rows: result.rows.map(({ contactDetails, ...row }) => row),
        source: sources.at(-1).name,
        asOf,
      };
    }
    if (name === "find_unlinked_accounts") {
      const rows = await suggestAccounts(this.store, args.query || "");
      sources.push({ name: "Tài khoản sinh viên chưa liên kết", asOf });
      return { rows, source: "Tài khoản sinh viên chưa liên kết", asOf };
    }
    if (
      [
        "lookup_course_sections",
        "lookup_my_registrations",
        "lookup_section_students",
      ].includes(name)
    ) {
      const data = await academicOverview(this.store, actor);
      let rows = data.sections;
      if (name === "lookup_section_students") {
        if (!args.sectionCode) return { needsInformation: ["Mã lớp học phần"] };
        const matches = rows.filter(
          (r) =>
            foldText(r.code) === foldText(args.sectionCode) &&
            (!args.term || foldText(r.term) === foldText(args.term)),
        );
        if (matches.length > 1)
          return { needsInformation: ["Học kỳ cần tra cứu"] };
        requireValue(
          matches.length === 1,
          "Không tìm thấy lớp học phần trong quyền của bạn.",
          404,
        );
        const roster = await sectionRoster(this.store, matches[0].id, actor);
        sources.push({ name: "Danh sách lớp " + matches[0].code, asOf });
        return {
          rows: roster.rows.slice(0, 50),
          total: roster.rows.length,
          source: sources.at(-1).name,
          asOf,
        };
      }
      if (name === "lookup_my_registrations")
        rows = rows.filter((r) => r.registration?.status === "ACTIVE");
      else
        rows = rows.filter(
          (r) =>
            foldText(r.code + " " + r.subjectName).includes(
              foldText(args.query || ""),
            ) &&
            (!args.term || foldText(r.term) === foldText(args.term)),
        );
      sources.push({
        name:
          name === "lookup_my_registrations"
            ? "Đăng ký học phần của bạn"
            : "Lớp học phần trong quyền",
        asOf,
      });
      return {
        rows: rows.slice(0, 50),
        total: rows.length,
        profileLinked: data.profileLinked,
        source: sources.at(-1).name,
        asOf,
      };
    }
    requireValue(drafts.length === 0, "Mỗi lượt chỉ chuẩn bị một đề xuất.");
    const draft = await this.store.transaction(async (tx) => {
      for (const kind of [
        "accounts",
        "cohorts",
        "faculties",
        "majors",
        "classes",
      ])
        await tx.list(kind, true);
      const plan = await planAction(tx, name, args, actor);
      if (plan.needsInformation) return plan;
      return {
        id: randomUUID(),
        actorId: actor.id,
        accountVersion: actor.version,
        conversationId,
        ...plan,
        contextHash: await fingerprint(tx),
        expiresAt: Date.now() + 600_000,
        status: "PREPARED",
        result: {},
        version: 1,
      };
    });
    if (draft.needsInformation) return draft;
    drafts.push(draft);
    return {
      needsConfirmation: true,
      preview: draft.preview,
      note: "Chưa ghi hồ sơ. Không có công cụ xác nhận; người dùng phải bấm nút trong UI.",
    };
  }

  async decide(id, input, actor, cancel = false) {
    const scoped = this.forActor(actor);
    if (scoped !== this) return scoped.decide(id, input, actor, cancel);
    requireValue(
      uuid(id) && Number.isInteger(input.version),
      "Đề xuất hoặc phiên bản không hợp lệ.",
    );
    if (!cancel)
      requireValue(
        input.confirm === true,
        "Cần xác nhận thực hiện từ người dùng.",
      );
    const result = await this.store.transaction(async (tx) => {
      for (const kind of [
        "accounts",
        "cohorts",
        "faculties",
        "majors",
        "classes",
      ])
        await tx.list(kind, true);
      const current = (await tx.list("accounts")).find(
        (row) => row.id === actor.id,
      );
      requireValue(
        current?.active && current.version === actor.version,
        "Phiên hoặc quyền đã thay đổi.",
        401,
      );
      const proposal = (await tx.list("proposals", true)).find(
        (row) => row.id === id && row.actorId === actor.id,
      );
      requireValue(
        proposal,
        "Không tìm thấy đề xuất trong quyền của bạn.",
        404,
      );
      authorize(current, actionRoles[proposal.action] || []);
      requireValue(
        proposal.accountVersion === current.version,
        "Quyền đã thay đổi. Chuẩn bị đề xuất mới.",
        409,
      );
      // Retry sau commit luôn trả kết quả đã lưu, không chạy lại service.
      if (proposal.status === "EXECUTED" && !cancel)
        return { proposal: publicProposal(proposal), replayed: true };
      requireValue(
        proposal.status === "PREPARED" && proposal.version === input.version,
        "Đề xuất không còn chờ xác nhận.",
        409,
      );
      const repo = new AiRepository(tx);
      const status = cancel
        ? "CANCELLED"
        : proposal.expiresAt <= Date.now()
          ? "EXPIRED"
          : proposal.contextHash !== (await fingerprint(tx))
            ? "STALE"
            : null;
      if (status) {
        await repo.updateProposal(id, { status }, proposal.version);
        return {
          proposal: publicProposal({
            ...proposal,
            status,
            version: proposal.version + 1,
          }),
          blocked: ["EXPIRED", "STALE"].includes(status),
        };
      }
      const executed = await executeAction(tx, proposal, current);
      await repo.updateProposal(
        id,
        { status: "EXECUTED", result: executed },
        proposal.version,
      );
      await tx.insert("events", {
        id: randomUUID(),
        actorId: actor.id,
        action: "LIZZCHAT_CONFIRMED",
        entityId: id,
        detail: { action: proposal.action, preview: proposal.preview },
      });
      return {
        proposal: publicProposal({
          ...proposal,
          status: "EXECUTED",
          result: executed,
          version: proposal.version + 1,
        }),
      };
    });
    return result;
  }
}
