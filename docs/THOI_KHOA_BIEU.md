# Thời khóa biểu, phòng học và học bù

Lịch học được dùng chung cho trang thời khóa biểu, đăng ký học phần, lịch thi, điểm danh và LizzChat. Lớp đang đóng nhận đăng ký vẫn có lịch học, vì vậy không được bỏ qua khi tìm xung đột.

## Nghiệp vụ đã bổ sung

| Nội dung | Cách xử lý |
| --- | --- |
| Nhiều buổi mỗi tuần | Mỗi lớp có 1–16 mục lịch, mỗi mục có mã ổn định, ngày trong tuần, giờ bắt đầu/kết thúc và phòng. Có thể có nhiều buổi trong một ngày nếu không trùng giờ |
| Phòng | Dùng chung danh mục phòng với lịch thi, không lập hai danh mục trùng nhau. Phòng phải hoạt động và sức chứa ít nhất bằng sĩ số tối đa của lớp |
| Ngày nghỉ | Ngoại lệ CANCEL bỏ đúng buổi định kỳ vào ngày đã chọn; các tuần khác giữ nguyên |
| Học bù/đổi giờ, phòng | Ngoại lệ MOVE thay một buổi gốc bằng ngày, giờ và phòng mới trong khoảng ngày của lớp. Hiển thị ngày gốc, lý do và thời gian mới |
| Xung đột | Đối chiếu ngày thực tế sau ngoại lệ: giảng viên, phòng, sinh viên đang đăng ký và lịch thi công bố. Hai buổi nối tiếp nhau ở cùng giờ kết thúc/bắt đầu không tính là trùng |
| Lịch cũ | Khi chưa có kế hoạch nhiều buổi, giữ nguyên thứ/giờ/khoảng ngày trong course_sections. Chưa có phòng thì ghi Chưa phân phòng, không tự chọn phòng thay người dùng |
| Chỉnh lịch | Lưu thay thế toàn bộ kế hoạch sau khi xác nhận, có lý do, kiểm tra phiên bản, nhật ký trước/sau và chống gửi lặp. Không xóa lịch sử điểm danh hoặc đăng ký |

Mỗi kế hoạch có tối đa 64 ngoại lệ và khoảng ngày học phần tối đa ba năm. Ngày gốc phải thật sự tồn tại trong lịch định kỳ; một buổi gốc trong một ngày chỉ có một ngoại lệ. Buổi học bù không được tạo hai lần cùng mã buổi vào cùng ngày. Các giới hạn này được máy chủ kiểm tra, không chỉ giới hạn trên form.

## Quyền theo vai trò

- Quản lý phân lịch cho các lớp, quản lý phòng và xem lịch theo ngày.
- Nhân viên phân lịch các lớp trong phạm vi đã được giao. Nhân viên giới hạn khoa/khóa chỉ đọc danh mục phòng; Quản lý hoặc Nhân viên toàn trường quản lý danh mục chung. Xung đột ngoài phạm vi vẫn được kiểm tra nhưng không trả chi tiết hồ sơ ngoài quyền.
- Giảng viên chỉ xem lịch lớp hiện được phân công; không tự thay lịch.
- Sinh viên chỉ xem lịch các lớp đang đăng ký, gồm ngày nghỉ và học bù. Không nhận roster, danh sách tài khoản hoặc toàn bộ kế hoạch của lớp khác.

Trang `#schedule` thay trực tiếp trang lịch cũ. Cán bộ có các chế độ Lịch theo ngày, Phân lịch học và Phòng học và phòng thi. Trang lịch hiện dùng lưới tuần bảy ngày, có chuyển tuần/Hôm nay/chọn ngày, lọc học kỳ, tìm kiếm, chi tiết và CSV/.ics; màn hẹp chuyển theo ngày. Phân lịch/Phòng giữ phân trang. API vẫn hỗ trợ khoảng đọc tối đa 63 ngày; xem LICH_TUAN_VA_XUAT_LICH.md. Giao diện dùng font và nhận diện mận/be hiện có, không thêm menu AI trùng với nút LizzChat nổi.

## Liên hệ với các phần đang có

Khi lưu kế hoạch, phiên bản lớp tăng để các bản xem trước AI/điểm cũ phải kiểm tra lại. Đăng ký học phần đối chiếu mọi buổi và buổi học bù, không chỉ lịch đầu tiên. Lịch thi kiểm tra cả phòng có lịch học và lịch giảng viên/sinh viên; phiên bản kế hoạch tham gia dấu xác nhận công bố thi. Đổi giảng viên hoặc tăng sĩ số lớp cũng phải thỏa lịch/phòng đang áp dụng.

Điểm danh chọn đúng buổi trong ngày. Buổi mới lưu mã buổi, giờ và phòng tại lúc mở; chưa đến giờ của buổi đó thì chưa ghi điểm danh. Hai buổi cùng ngày có hai sổ riêng. Lịch đã mở điểm danh không được thay ngày, giờ, phòng hoặc mã buổi để tránh mất liên kết hay tạo thêm sổ trùng. Chưa có quy trình chuyển sổ điểm danh sang lịch mới; khi cần phải rà hồ sơ bằng quy trình bổ sung, không xóa dữ liệu cũ.

Quy định số buổi tối thiểu để dự thi vẫn do cán bộ cấu hình trong Điểm danh. Thêm lịch học không tự điều chỉnh số buổi kỳ vọng hay tự kết luận đủ điều kiện dự thi.

LizzChat có công cụ đọc `lookup_timetable`, yêu cầu khoảng ngày rõ ràng và trả nguồn/thời điểm. Công cụ trả lịch thực tế cùng ngoại lệ theo quyền, chưa có công cụ AI tự sửa kế hoạch. Việc mở lớp qua AI vẫn tạo lịch ban đầu; phân nhiều buổi/phòng trên trang Thời khóa biểu.

## Mã nguồn và API

| Thành phần | Đường dẫn |
| --- | --- |
| Diễn giải buổi theo ngày, ngoại lệ và giao nhau | backend/local/modules/academic/timetable.rules.js |
| Kiểm tra, lưu kế hoạch, phân quyền đầu ra | backend/local/modules/academic/timetable.service.js |
| Điều phối API | backend/local/modules/academic/timetable.controller.js |
| Giao diện | frontend/app/features/timetable.js |
| Biểu mẫu phòng dùng chung | frontend/app/features/exams.js / roomForm |
| Kiểm thử mới | tests/local/timetable.test.js |

| Phương thức | Đường dẫn dưới /api/v1 | Ý nghĩa |
| --- | --- | --- |
| GET | /timetable?from=YYYY-MM-DD&to=YYYY-MM-DD | Lịch theo ngày trong quyền, thông tin lớp và ngoại lệ; cán bộ có kế hoạch/phòng để phân lịch |
| POST | /timetable/sections/:id | Lưu kế hoạch: meetings, exceptions, reason, version kế hoạch, sectionVersion, confirm=true và requestId UUID |
| POST / PATCH | /timetable/rooms hoặc /timetable/rooms/:id | Dùng cùng dịch vụ quản lý phòng với /exams/rooms; không có bảng phòng riêng |

Tham số ngày được kiểm tra trên máy chủ; ngày và giờ học hiểu theo giờ Việt Nam. Giờ chỉ nằm trong cùng ngày, không có ca qua nửa đêm trong đợt này.

## Database và nâng cấp an toàn

Migration `012_timetable.sql` thêm bảng timetable_plans, tham chiếu course_sections và accounts. Kế hoạch lưu meetings_json, exceptions_json, lý do, người/thời điểm cập nhật và version; nhật ký before/after nằm ở audit_events, chống lặp dùng academic_requests.

Migration cũng thêm lesson_key, lesson_start_time, lesson_end_time và lesson_room_id vào attendance_sessions. Sổ cũ nhận mã mặc định legacy; không đổi điểm danh, roster hoặc điểm học tập đã có. Thay khóa duy nhất theo lớp/ngày bằng lớp/ngày/mã buổi để hỗ trợ nhiều buổi cùng ngày. Dùng lại exam_rooms cho liên kết phòng; giữ MySQL 8.0.16+, InnoDB và utf8mb4/utf8mb4_unicode_ci.

Sao lưu rồi chạy `npm run db:migrate` trên bản sao trước. Migration 001–011 giữ nguyên byte. MySQL DDL tự commit: nếu lỗi giữa chừng, dừng và đối chiếu schema/bản sao, không sửa checksum hoặc chạy lệnh xóa để làm lại. Chưa chạy DDL 012 trên MySQL thật trong môi trường hiện tại.

## Kiểm chứng và giới hạn

17 kiểm thử mới kiểm tra lịch cũ, biên ngày/giờ, ngày nghỉ/học bù, dữ liệu sai/trùng, quyền/phạm vi, bản cũ, cạnh tranh trên kho bộ nhớ, retry, rollback audit, trùng phòng/giảng viên/sinh viên, đăng ký, lịch thi, bảo vệ điểm danh, giờ mở sổ, HTTP/Origin, công cụ AI đọc và mapping SQL. Toàn suite 179/179 PASS. Kiểm tra nguồn hiện 103 file JavaScript, 395 import tương đối, 0 lỗi.

Đợt triển khai ban đầu chưa mở được trình duyệt; đợt tiếp theo đã rà component bằng fixture cho bốn vai trò, sửa bộ lọc và bố cục khi mở LizzChat. Xem QA_GIAO_DIEN_HOC_VU.md. Chưa coi đây là UI + MySQL hoặc kiểm tra thiết bị thật. MySQL thật vẫn từ chối kết nối; Gemini chưa đủ cấu hình. DDL, lưu qua khởi động lại, nhiều kết nối SQL, hội thoại AI thật và toàn bộ trạng thái thiết bị là BLOCKED hoặc NOT TESTED theo checklist.

Đã có lưới tuần; chưa có kéo/thả hoặc tự tối ưu xếp lịch, nhiều giảng viên mỗi lớp, quy đổi tiết học, lịch nghỉ chung toàn trường, phê duyệt thay lịch nhiều cấp, gửi thông báo tự động hoặc lịch học bù ngoài khoảng học phần. Chưa có quy trình đổi khoảng ngày của lớp đã phân nhiều buổi. Ưu tiên nghiệp vụ kế tiếp: chương trình đào tạo theo phiên bản và nhóm tự chọn; phạm vi đợt theo khoa/khóa đã bổ sung ở DOT_DANG_KY_THEO_KHOA_KHOA.md; tiếp tục nghiệm thu MySQL/Gemini khi có môi trường.

Cập nhật giao diện hiện hành: lịch theo từng ngày trong tuần, bỏ trục giờ; giữ đủ thẻ lớp đồng thời, lọc lớp/phòng và bản xem trước in. 202/202 test PASS có phạm vi; in hệ thống/PDF và DB/AI/thiết bị thật chưa nghiệm thu. Xem LICH_TUAN_VA_XUAT_LICH.md.
