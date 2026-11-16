# Đợt đăng ký theo khoa và khóa

Đợt đăng ký không còn mặc định mở cho mọi sinh viên trong cùng học kỳ. Quản lý hoặc Nhân viên toàn trường chọn khoa và khóa khi tạo đợt. Nhân viên giới hạn khoa/khóa vẫn chỉ đọc các đợt có liên quan, không tự sửa quy định dùng chung.

## Đối tượng của đợt

| Khoa | Khóa | Sinh viên được đăng ký |
| --- | --- | --- |
| Tất cả | Tất cả | Toàn trường |
| Một khoa | Tất cả | Sinh viên thuộc khoa đó |
| Tất cả | Một khóa | Sinh viên thuộc khóa đó, ở mọi khoa |
| Một khoa | Một khóa | Sinh viên đồng thời thuộc khoa và khóa đã chọn |

Khoa được xác định qua lớp hành chính → ngành → khoa; khóa lấy từ lớp hành chính. Không dùng khoa phụ trách của lớp học phần hoặc trường do trình duyệt gửi để xác định sinh viên. Thiếu liên kết hồ sơ/lớp/ngành thì không suy đoán đối tượng. Đợt giới hạn chỉ cho qua khi đủ căn cứ; đợt toàn trường cũ giữ cách hoạt động hiện có.

Hai đợt đang bật trong một học kỳ được trùng thời gian đăng ký khi đối tượng không giao nhau. Ví dụ Khoa A–Khóa 70 và Khoa B–Khóa 70 được trùng giờ; Khoa A–Tất cả khóa với Khoa A–Khóa 70 thì không. Đợt toàn trường giao với mọi đối tượng. Khoảng đăng ký tính từ giờ mở đến trước giờ đóng, theo giờ Việt Nam trên giao diện và thời gian máy chủ khi kiểm tra.

## Giữ đúng đợt và hạn rút

Mỗi đăng ký mới ghi registration_period_id, registration_period_version và withdrawal_deadline. Khi rút, máy chủ dùng đúng đợt này, không lấy một đợt mở sau để kéo dài thời hạn. Hạn được dùng là mốc sớm hơn giữa hạn đã ghi khi đăng ký và hạn hiện hành của đợt. Đóng đợt hoặc rút ngắn hạn vẫn có hiệu lực; kéo dài hạn đợt không tự kéo dài các đăng ký đã nhận. Chưa có quy trình gia hạn riêng theo sinh viên hoặc theo lô.

Sinh viên chuyển lớp hành chính vẫn có thể rút đăng ký đã được chấp nhận trong hạn đã ghi; kiểm tra đối tượng ban đầu không bị thay bằng khoa mới. Nếu đăng ký lại sau khi rút, phải đủ điều kiện của đợt đang mở và ghi lại đợt/hạn mới. Retry cùng mã yêu cầu vẫn trả giao dịch đã ghi, không tạo thêm đăng ký.

Đợt đã có đăng ký liên kết không được đổi khoa/khóa. Nếu học kỳ có đăng ký cũ chưa xác minh được đợt, cũng chặn đổi đối tượng của đợt hiện có để tránh mất căn cứ. Cần mở đợt mới phù hợp thay vì sửa quan hệ cũ.

Đăng ký từ trước migration chưa có thông tin đợt/hạn sẽ giữ NULL, không tự gán một đợt giả. Khi rút dữ liệu này, hệ thống dùng các đợt hiện hành phù hợp với hồ sơ và chọn hạn gần nhất. Đây là cách tương thích dữ liệu cũ, không chứng minh được hạn gốc của từng đăng ký cũ. Cần đối chiếu trước khi chuyển hồ sơ thật; không gọi dữ liệu chưa có căn cứ là đã xác minh.

## Giao diện và AI

Trang Đợt đăng ký và điều kiện có cột Đối tượng, hai ô chọn khoa/khóa và bước xác nhận trình bày cả thời gian lẫn đối tượng. Hộp rút đăng ký hiển thị hạn đang áp dụng. LizzChat chỉ trả các đợt phù hợp cho Sinh viên, có tên khoa/khóa, nguồn và thời điểm; khi chuẩn bị và xác nhận đăng ký vẫn gọi cùng kiểm tra máy chủ.

Đã rà giao diện bằng component thật với dữ liệu tổng hợp riêng: tạo đợt khoa–khóa, xem xác nhận và dòng vừa lưu. Bộ kiểm tra này không ghi hồ sơ thật, không thay cho kiểm tra đăng nhập + MySQL. File dựng dữ liệu giao diện đã được gỡ khỏi gói bàn giao.

## Mã nguồn và nâng cấp

| Thành phần | Nội dung |
| --- | --- |
| registration-policy.service.js | Đối tượng, giao nhau, chọn đợt và hạn rút |
| academic.service.js | Lưu đợt/hạn vào đăng ký; kiểm tra lại khi rút/đăng ký lại |
| staff-store.js | Lọc đợt theo phạm vi Nhân viên; danh mục chung chỉ đọc |
| registration-policies.js | Chọn khoa/khóa, bảng đối tượng và xác nhận |
| academic.js | Hiển thị hạn rút trên hộp xác nhận |
| registration-audiences.test.js | 13 ca hồi quy mới, gồm HTTP và AI chuẩn bị |

API giữ các đường dẫn đang có: GET /api/v1/academics/policies; POST/PATCH /api/v1/academics/periods; đăng ký/rút và eligibility. Khi ghi đợt có thêm facultyId/cohortId, NULL nghĩa là tất cả. Các trường ràng buộc đợt trên đăng ký do máy chủ ghi, không lấy theo khai báo của Sinh viên.

Migration 013_registration_audiences.sql bổ sung khoa/khóa cho registration_periods, tham chiếu faculties/cohorts; thêm ba trường ràng buộc đợt/hạn cho enrollments, khóa ngoại tới registration_periods và chỉ mục. Không tạo tài khoản, đợt hoặc đăng ký mẫu. Giữ MySQL 8.0.16+, utf8mb4/utf8mb4_unicode_ci và các migration 001–012 nguyên byte.

Sao lưu rồi chạy npm run db:migrate trên bản sao trước. MySQL DDL tự commit; lỗi giữa chừng cần đối chiếu schema và bản sao, không sửa checksum hoặc xóa dữ liệu để làm lại.

## Kiểm chứng

13 ca mới kiểm tra đối tượng giao nhau, biên giờ, mã tham chiếu sai, phiên bản cũ, thiếu căn cứ lớp/ngành, khoa của sinh viên khác khoa lớp học phần, ràng buộc đợt/hạn, chuyển lớp và đăng ký lại, đợt cũ chưa xác minh, phạm vi Nhân viên, HTTP chống giả đối tượng, AI hỏi/chuẩn bị và không tự ghi, rollback audit cùng mapping SQL. Toàn suite 192/192 PASS; check-source 104 file JavaScript, 402 import, 0 lỗi.

MySQL thật, DDL 013, lưu qua khởi động lại và nhiều kết nối SQL chưa nghiệm thu; Gemini thật chưa đủ cấu hình. Chưa có phạm vi theo ngành/lớp, ưu tiên mở đăng ký, danh sách chờ, phê duyệt học vụ hoặc gia hạn theo hồ sơ. Ưu tiên tiếp theo là chương trình đào tạo theo phiên bản và nhóm tự chọn, cùng nghiệm thu DB/AI thật.
