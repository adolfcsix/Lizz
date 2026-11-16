# Bản đồ mã nguồn và phạm vi triển khai Lizz

**Mốc mới nhất hiện tại:** ưu tiên ổn định nền tảng theo ON_DINH_NEN_TANG.md. Server/doctor/bootstrap kiểm tra schema trước sử dụng; đã gia cố quyền tài khoản, API client và Gemini, không thêm phân hệ hay migration. Các mốc nghiệp vụ bên dưới giữ làm lịch sử.

Mốc hiện hành: hiện tại. Bảng đối chiếu đủ 16 phân hệ và các ưu tiên mới nhất ở DOI_CHIEU_MUC_TIEU_GOC.md; các mốc cũ bên dưới giữ làm lịch sử.

Nguồn đối chiếu: tài liệu LIZZ hiện hành với bốn vai trò, bản Figma và ảnh nhận diện người dùng chốt. Ảnh mới là chuẩn màu/logo khi khác bản vẽ trước. Figma đang chạm giới hạn lượt thao tác nên tinh chỉnh nhận diện mới chưa được ghi vào file Figma trong đợt này. Code đã áp dụng trực tiếp theo ảnh.

## Từ phân hệ tài liệu đến code

| Mã | Phân hệ | Mã hiện có | Phần còn thiếu |
| --- | --- | --- | --- |
| FM01 | Tổng quan và công việc | Tổng quan theo vai trò, số liệu từ API; giao việc, bàn giao, cập nhật tiến độ; hồ sơ chuyển lớp chờ duyệt | Hộp thông báo đã nối các luồng chính; còn lịch đến hạn tổng hợp/nhắc tự động và quy trình nhiều cấp |
| FM02 | Tổ chức đào tạo | Khóa, khoa, ngành, lớp hành chính; sĩ số, quan hệ tham chiếu và version | Cơ sở, đơn vị phân cấp, lịch sử chương trình |
| FM03 | Hồ sơ và liên hệ | Tài khoản liên kết, mã, tên, lớp; gợi ý email, CSV và nhập theo đợt, tìm/lọc/phân trang; liên hệ/người thân, đề nghị cập nhật qua Nhân viên–Quản lý, cũ–mới và lịch sử; ảnh có lịch sử/phân quyền, bản xem và in thông tin hồ sơ | Sơ yếu lý lịch đầy đủ, giấy tờ minh chứng, đề nghị thay đổi danh tính chính thức và xuất biểu mẫu có chữ ký |
| FM04 | Chương trình và quy chế | Môn/tín chỉ, học kỳ/hạn mức/ngưỡng đạt, điều kiện tiên quyết chặn vòng lặp; trọng số và quy đổi GPA có cấu hình; chương trình theo ngành/khóa/phiên bản, nhóm bắt buộc/tự chọn, nháp/công bố, gán một hoặc nhiều sinh viên có đối chiếu, so sánh phiên bản, tiến độ và CSV | Chuyển ngành/chương trình khác có phê duyệt, điều kiện đồng thời, công nhận/miễn tính và quy chế nhiều loại điểm |
| FM05 | Lớp và thời khóa biểu | Lớp học phần, kỳ/sĩ số, nhiều buổi mỗi tuần, phòng dùng chung với thi, ngoại lệ nghỉ/học bù; chặn trùng giảng viên/phòng/sinh viên/lịch thi, nối đăng ký và điểm danh; bảng tuần theo ngày, chi tiết, lọc lớp/phòng, CSV/.ics/xem trước in | Tiết học, nhiều giảng viên, kéo/thả lịch, xếp tự động và thông báo tự động trước giờ học |
| FM06 | Đăng ký và biến động học | Đăng ký/rút của chính sinh viên; kiểm tra đợt theo khoa/khóa, tín chỉ/tiên quyết/môn/lịch/chỗ; giữ đợt/hạn rút của đăng ký mới; chuyển lớp có hồ sơ duyệt; học lại/cải thiện theo quy chế học kỳ, snapshot và lịch sử/CSV/AI | Hồ sơ duyệt học vụ/học lại nhiều cấp, hẹn ngày/gia hạn bảo lưu, chuyển ngành/chương trình khác |
| FM07 | Thi và điểm danh | Phòng thi, lịch nháp/công bố/hủy, phân công một giảng viên coi thi, xem lịch/thí sinh theo quyền, kiểm tra trùng và sức chứa; tra cứu LizzChat; SBD/ghế có bản lưu; biên bản nháp/gửi/kiểm tra/xác nhận, CSV/xem trước in; điểm danh học/thi, chốt/mở lại, điều kiện chuyên cần và công nợ | Chia nhiều phòng, nhiều đợt thi/thi lại, sơ đồ vật lý, chữ ký số và nghiệm thu bản in/SQL thật |
| FM08 | Điểm và kết quả | Tổng kết trực tiếp hoặc thành phần có trọng số; lưu/gửi/trả/công bố; snapshot tín chỉ/quy đổi, GPA học kỳ/tích lũy, quy tắc học lại, CSV; phúc khảo/sửa sau công bố có duyệt/áp dụng riêng và lịch sử; LizzChat đọc theo quyền; đối chiếu cảnh báo/xếp loại học kỳ theo cấu hình, căn cứ và CSV | Hội đồng phúc khảo nhiều cấp, môn miễn tính/công nhận, quyết định cảnh báo chính thức/nhiều kỳ và xét tốt nghiệp |
| FM09 | Rèn luyện và quyết định | Chưa nối | Tiêu chí, tự đánh giá, duyệt, khen thưởng/kỷ luật |
| FM10 | Đề tài và tốt nghiệp | Chưa nối | Đề tài, tiến độ, xét tốt nghiệp, văn bằng |
| FM11 | Tài chính và hỗ trợ | Khoản thu nháp/phát hành, nộp từng phần, phiếu tiền mặt/chuyển khoản chờ xác minh, công nợ; Quản lý điều chỉnh/miễn giảm/hủy xác nhận có audit; CSV và in phiếu | Đối soát ngân hàng tự động, thanh toán/hoàn tiền thật, hóa đơn điện tử, học bổng |
| FM12 | Ký túc xá | Chưa nối | Cơ sở/phòng/giường, đăng ký, xe, công nợ, bảo trì |
| FM13 | Dịch vụ và đời sống | Chưa nối | Hồ sơ dịch vụ, ngoại trú, sức khỏe, khảo sát, sự kiện |
| FM14 | Cố vấn và nghề nghiệp | Chưa nối | Kế hoạch học tập, hẹn, thực tập, cơ hội |
| FM15 | Tài khoản và quản trị | Cấp tài khoản có password, bốn role, đăng nhập/đăng xuất/đổi password, khóa tài khoản, phiên và audit; phạm vi STAFF toàn trường/khoa/khóa, đơn vị tài khoản/lớp, API/AI lọc cùng phạm vi | Phân quyền từng thao tác/ủy quyền có hạn, SSO, khôi phục email, sao lưu/phục hồi qua UI |
| FM16 | Thông tin và liên thông | LizzChat adapter thật, hội thoại, công cụ trong quyền, nguồn dữ liệu/thời điểm, đề xuất và xác nhận | Thông báo cá nhân đã nối; còn soạn tin chung, email/push, liên thông LMS/thư viện/email, phụ huynh; AI cho phân hệ chưa code |

Không đưa menu dẫn tới trang giả để tạo cảm giác đã đủ chức năng. Các phần chưa nối vẫn nằm trong bảng này để triển khai tiếp. Không coi số màn hình Figma là số chức năng đã nghiệm thu.

## Route, component, API và dữ liệu

Các route frontend dùng hash, chạy cùng origin với API `/api/v1`. Quyền được kiểm tra ở backend; giấu menu không thay cho kiểm tra quyền.

| Route | File giao diện | API chính | Bảng dữ liệu | Quyền |
| --- | --- | --- | --- | --- |
| `/` chưa đăng nhập | features/auth.js | auth/login | accounts, sessions | Tài khoản đã cấp |
| `#home` | main.js/homePage | catalog, academics, workflows | Danh mục, lớp, đăng ký, công việc | Theo role; không dùng số liệu giả |
| `#tasks` | features/workflows.js | workflows/tasks | work_items, audit_events | Quản lý giao/bàn giao; Nhân viên chỉ việc được giao |
| `#approvals` | features/workflows.js | workflows/transfers, workflows/approvals/:id/decide, /apply | approval_requests, student_profiles, classes, audit_events | Quản lý duyệt; người gửi hoặc Quản lý áp dụng |
| `#students` | features/students.js | students, students/account-options, students/batches | student_profiles, accounts, classes, import_batches | Quản lý/Nhân viên; Sinh viên chỉ hồ sơ mình |
| `#catalog` | features/catalog.js | catalog/:kind | cohorts, faculties, majors, classes | Quản lý/Nhân viên ghi |
| `#academics` | features/academic.js | academics/subjects, /sections, /registrations | subjects, course_sections, enrollments, academic_requests | Quản lý/Nhân viên quản lý; Giảng viên lớp giao; Sinh viên tự đăng ký |
| `#profile-requests` | features/profile-requests.js; shared/profile-workflow.js | profile-requests và /:id/:action | profile_change_requests; student_profiles.contact_details_json | Sinh viên sở hữu gửi/bổ sung; Nhân viên phụ trách trong phạm vi; Quản lý duyệt/áp dụng; Giảng viên không truy cập |
| `#curriculum` | features/curriculum.js | curricula, /:id, /:id/publish, /assignments, /students/:id/progress | curriculum_versions (groups_json), student_curricula | Quản lý công bố; Nhân viên nháp/gán trong phạm vi; Giảng viên đọc bản công bố; Sinh viên tiến độ mình |
| `#policies` | features/registration-policies.js | academics/policies, /terms, /periods, /requirements | academic_terms, registration_periods (faculty_id/cohort_id), subject_requirements; enrollments giữ đợt/hạn nhận đăng ký | Quản lý/Nhân viên cấu hình |
| `#grades` | features/grades.js | grades, grades/sections/:id, /submit, /publish, /return | grade_records, grade_schemes, gpa_policies, enrollments, course_sections, academic_terms | Giảng viên lớp giao nhập/gửi; Quản lý công bố/trả; Nhân viên đọc; Sinh viên điểm công bố của mình |
| `#grade-reviews` | features/grade-reviews.js | grade-reviews, /periods, /requests, /requests/:id và propose/approve/apply/return/reject/cancel | grade_review_periods, grade_review_requests, grade_revisions | Sinh viên hồ sơ mình; Giảng viên lớp giao đề xuất; Nhân viên theo phạm vi lập/đọc; Quản lý duyệt/áp dụng tách bước |
| `#exams` | features/exams.js | exams, /rooms, /:id/review, /publish, /cancel | exam_rooms, exam_schedules | Quản lý/Nhân viên ghi; Giảng viên trong phân công; Sinh viên lịch lớp mình |
| `#attendance` | features/attendance.js | attendance, /policies, /sessions, /sessions/:id/marks, /sync, /close, /reopen, /sections/:id/eligibility | attendance_policies, attendance_sessions, attendance_marks | Quản lý/Nhân viên quản lý; Giảng viên đúng lớp/coi thi ghi; Sinh viên chỉ buổi chốt của mình |
| `#finance` | features/finance.js | finance, /charges, /receipts và thao tác xác nhận | student_charges, payment_receipts, charge_adjustments | Quản lý/Nhân viên thu; Quản lý điều chỉnh/hủy xác nhận; Sinh viên báo chuyển khoản của mình; Giảng viên không truy cập |
| `#schedule` | features/timetable.js, shared/timetable-view.js | timetable, timetable/sections/:id; timetable/rooms dùng cùng dịch vụ với exams/rooms | timetable_plans, course_sections, enrollments, exam_rooms, exam_schedules; attendance_sessions giữ mã/giờ/phòng buổi | Quản lý/Nhân viên phân lịch trong phạm vi; Sinh viên lịch đang đăng ký; Giảng viên lịch lớp được giao |
| `#accounts` | features/accounts.js, account-access.js | accounts, accounts/:id, accounts/:id/access; access/me | accounts, staff_access_scopes, sessions, audit_events | Quản lý cấp/thu hồi; access/me trả phạm vi chính mình |
| `#audit` | main.js/auditPage | audit | audit_events | Quản lý/Nhân viên ở mức role hiện tại |
| `#profile` | main.js/profilePage, features/auth.js | auth/me, auth/password, auth/logout | accounts, sessions | Chính tài khoản |
| Nút nổi | features/lizzchat.js | ai/status, /messages, /conversations/:id, /proposals/:id/confirm, /cancel | ai_conversations, ai_proposals + dịch vụ nghiệp vụ | Công cụ riêng theo role, đề xuất thuộc chủ sở hữu |

`backend/local/routes.js` → controller trong `modules/` → service → MysqlStore/repository. Tham số SQL dùng bind; tên bảng/cột chỉ lấy từ whitelist. Bộ nhớ tạm dùng cùng interface để kiểm thử, không chứng minh hành vi khóa SQL thực tế.

## Những điểm phải giữ khi mở rộng

- MANAGER / STAFF / LECTURER / STUDENT là mã role hiện hành. Migration 004 chuyển tài khoản cũ, không tạo lại người dùng.
- Nhân viên nhận phạm vi toàn trường hoặc khoa/khóa. Nhân viên cũ giữ ALL rõ ràng qua migration 010; nhân viên mới chưa cấp thì không mặc định toàn trường. Danh mục chung chỉ đọc cho phạm vi hẹp; lớp chưa phân khoa hoặc có roster ngoài phạm vi do Quản lý/Nhân viên toàn trường xử lý. Xem PHAM_VI_NHAN_VIEN.md.
- Hồ sơ chuyển lớp lưu payload/version và bản xem trước tại thời điểm gửi. Đổi dữ liệu sau đó làm áp dụng bị chặn; không tự dùng bản mới thay nội dung đã duyệt. Chưa có sửa/thu hồi hồ sơ duyệt; lập hồ sơ mới để xét lại.
- Quyết định duyệt và xác nhận thao tác AI là hai bước khác nhau. Không cấp quyền chỉ vì người dùng nói họ là Quản lý.
- Audit có before/after và người thao tác; chưa có dashboard kiểm toán toàn hệ thống. Tài chính/điểm danh đã có CSV theo quyền và in phiếu thu; các báo cáo tổng hợp khác chưa nối. Checklist CSV bên cạnh là công cụ bàn giao thủ công.
- Giữ SQL migration cũ; thêm file mới, sao lưu và chạy trên bản sao DB trước. Không tự đồng bộ sang schema QLSV khác.

## Ưu tiên triển khai tiếp

1. Nghiệm thu MySQL thật: migration từ database rỗng và database Lizz cũ có dữ liệu, lưu qua khởi động lại, cạnh tranh chỗ cuối với nhiều kết nối; nghiệm thu Gemini thật với các cách diễn đạt tiếng Việt.
2. Nghiệm thu chương trình đã nối và migration 014; tiếp tục chuyển chương trình có duyệt, công nhận/tương đương và so sánh phiên bản.
3. Lọc lớp theo chương trình, danh sách chờ, kéo/thả lịch, nhiều giảng viên và xếp lịch tự động.
4. Chia phòng/thi lại, hội đồng phúc khảo nhiều cấp, môn miễn tính/công nhận, xếp loại/cảnh báo.
5. Đối soát/hoàn tiền thật, dịch vụ, nội trú, tốt nghiệp và báo cáo; mở công cụ LizzChat cùng từng dịch vụ sau khi nghiệp vụ đủ kiểm chứng.

Cập nhật giao diện hiện hành: lịch theo từng ngày trong tuần, bỏ trục giờ; giữ đủ thẻ lớp đồng thời, lọc lớp/phòng và bản xem trước in. 202/202 test PASS có phạm vi; in hệ thống/PDF và DB/AI/thiết bị thật chưa nghiệm thu. Xem LICH_TUAN_VA_XUAT_LICH.md.

Chương trình đã có module và AI lookup_curriculum_progress; xem CHUONG_TRINH_DAO_TAO.md. Không tự đổi chương trình hoặc đăng ký cũ khi nâng cấp. Tham chiếu môn trong groups_json là kiểm tra dịch vụ, không ghi là FK vật lý. Toàn suite hiện hành 227/227 PASS có phạm vi.

Đợt hồ sơ hiện hành: migration 015–016, ảnh/bản in thông tin và menu shared/role-navigation.js; 288/288 test PASS có phạm vi. Có MA_TRAN_ROLE_VA_LUONG.md mô tả quyền hiện có và các bước liên kết, không suy quyền ghi từ menu hoặc một lần GET thành công.

Đợt chương trình hiện hành: migration 017, so sánh phiên bản và áp dụng 1–50 sinh viên trong quyền; 276/276 test. Xem SO_SANH_VA_AP_DUNG_CHUONG_TRINH.md cho bằng chứng và phần chưa kiểm chứng.

Thông báo hiện hành: migration 018; xem THONG_BAO_CA_NHAN.md. Phần tin cá nhân đã có không đồng nghĩa toàn bộ chức năng thông báo/liên thông trong tài liệu đã triển khai.

Học lại/cải thiện: migration 019, xem HOC_LAI_VA_CAI_THIEN.md. 305/305 test hiện tại; chưa cấu hình thì loại lượt học chưa xác minh, không backfill. MySQL/Gemini thật chưa nghiệm thu.

Chuyển phiên bản chương trình: migration 020, hồ sơ đối chiếu → duyệt → áp dụng, giữ nguyên đăng ký/điểm; lịch sử/CSV/thông báo/AI đọc theo quyền. 321/321 test hiện tại; MySQL/Gemini thật chưa nghiệm thu. Chưa chuyển ngành hoặc tự công nhận môn. Xem CHUYEN_PHIEN_BAN_CHUONG_TRINH.md.

Bảo lưu/quay lại: migration 021, gửi → kiểm tra → duyệt khác người gửi/người kiểm tra → áp dụng; chỉ quyết định đã áp dụng ảnh hưởng đăng ký mới. Lịch sử/CSV/thông báo/AI đọc theo quyền, giữ điểm/lớp/phí. Sửa quyền Nhân viên khoa ở chuyển chương trình. 338/338 test hiện tại; MySQL/Gemini thật vẫn chưa nghiệm thu. Xem BAO_LUU_VA_QUAY_LAI_HOC.md.

Đối chiếu học vụ: migration 022, từ trang Điểm và kết quả; cấu hình cảnh báo/xếp loại học kỳ, chỉ dùng đủ điểm công bố đúng lượt và snapshot, so sánh GPA gốc, căn cứ/CSV/AI đọc theo quyền. 355/355 test hiện tại; chưa cảnh báo chính thức hoặc xét tốt nghiệp. MySQL/Gemini thật chưa nghiệm thu. Xem DOI_CHIEU_HOC_VU.md.

## Luồng đăng nhập và mật khẩu

Đã nối `features/auth.js`, `features/accounts.js`, `auth.service.js`, `account.service.js`, API auth/accounts và migration 023. Hai hướng dẫn trên giao diện không quyết định role. Mã sinh viên cần hồ sơ liên kết; cấp lại do Quản lý, thu hồi phiên, bắt người nhận đổi. Dùng chung khung nhận diện cho đăng nhập và thiết lập, không tạo trang nghiệp vụ/AI khi cần đổi mật khẩu. Chi tiết và giới hạn nghiệm thu: DANG_NHAP_VA_CAP_LAI_MAT_KHAU.md.

## Số báo danh và chỗ ngồi

Đã nối exam-seating.js, seating.rules.js, seating.service.js, API seating/review và seating/confirm, MySQL bảng exam_seating_plans/migration 024, StaffStore và kết quả tra lịch của AI. Dùng tiếp menu Lịch thi, không thêm menu trùng. Xem SO_BAO_DANH_VA_CHO_NGOI.md để biết quyền, kiểm tra nguồn, bản lưu và phần khảo thí còn thiếu.

Biên bản ca thi đã nối report.service.js, exam-report.js, exam.controller.js, StaffStore, bảng exam_reports/migration 025 và lookup_exam_report. Giữ mỗi phiên bản, không sửa nguồn điểm/điểm danh. Chi tiết BIEN_BAN_CA_THI.md.


## Công nhận học phần hiện hành

FM04/FM08 đã nối công nhận tín chỉ vào chương trình, tiến độ và tiên quyết; đăng ký lưu quyết định đã dùng, không sửa điểm/GPA. Có UI, API, migration 026, phạm vi Nhân viên, thông báo và AI chỉ đọc. Các dòng thiếu công nhận ở bảng lịch sử được thay bằng phạm vi hiện hành này; miễn theo chứng chỉ và danh mục môn tương đương/thay thế vẫn còn thiếu. Minh chứng hiện là tham chiếu văn bản, chưa có tải tệp.

Xem CONG_NHAN_HOC_PHAN.md để biết luồng, API, giới hạn và bằng chứng.


## Kế hoạch đăng ký học phần hiện hành — hiện tại

Đã nối `academics/my-course-plan`, `course-plan.service.js`, `shared/course-plan.js` và component `features/course-plan.js` vào trang Đăng ký học phần. Lọc lớp theo chương trình, nhóm, kỳ dự kiến và tiến độ; bảng kế hoạch có môn chưa mở lớp, CSV và chọn đúng môn. Không thêm menu hay ghi dữ liệu từ kế hoạch. Dùng tiến độ/công nhận hiện có; vẫn kiểm tra lại đăng ký. Không có migration mới. Các dòng ưu tiên cũ về lọc lớp theo chương trình đã được thực hiện trong phạm vi này; danh sách chờ và xếp lịch tự động còn thiếu. Xem KE_HOACH_DANG_KY_HOC_PHAN.md.

## Thủ tục sinh viên hiện hành — hiện tại

FM13 đã nối #student-services, features/student-services.js, shared/student-services.js, API /api/v1/student-services, student-services.controller/service.js, StaffStore và migration 027 với hai bảng student_service_definitions/student_service_requests. Có FK tới hồ sơ, tài khoản và khoản thu; không đổi dữ liệu cũ. Nhân viên xử lý thường xuyên trong phạm vi; Quản lý công bố/đổi người/sửa liên kết phí; Giảng viên không có quyền. AI chỉ đọc. Xem THU_TUC_SINH_VIEN.md.
