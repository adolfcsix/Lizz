# Đợt đăng ký, điều kiện học và điểm tổng kết

Đợt này nối các phần FM02, FM04, FM06, FM08 và FM16. Giữ JavaScript thuần và cấu trúc frontend/backend đang dùng; không đặt các bản xử lý cũ/mới song song. Quy định chung đặt trong service; giao diện, API và LizzChat gọi lại cùng dịch vụ.

## Luồng chạy để kiểm tra

1. Quản lý/Nhân viên tạo học kỳ với mã, tên, hạn mức tín chỉ và ngưỡng đạt. Mã kỳ phải khớp `term` của lớp học phần. Mã không đổi sau tạo. Hạ hạn mức không tự hủy đăng ký đã có; lần đăng ký tiếp theo phải thỏa mức mới.
2. Tạo đợt: thời điểm mở < đóng nhận đăng ký ≤ hạn rút. Có nhiều đợt/kỳ; các đợt bật không chồng thời gian nhận đăng ký. Đóng một đợt không xóa hồ sơ.
3. Tạo điều kiện A cần B: hai môn khác nhau; chặn vòng lặp. Tắt điều kiện thay vì xóa lịch sử. Hiện áp dụng chung theo môn, chưa có phiên bản chương trình và phạm vi khoa/khóa.
4. Sinh viên chọn lớp và xem trước. Máy chủ kiểm tra hồ sơ, lớp mở, còn chỗ, trùng môn/lịch, đợt, hạn mức và tiên quyết. Chưa cấu hình kỳ/đợt thì chặn, không tự cho phép.
5. Giảng viên mở Điểm và kết quả, chọn lớp phân công, nhập điểm tổng kết 0–10, tối đa hai số lẻ. Để trống không được tự biến thành 0. Lưu nháp chưa công bố cho Sinh viên.
6. Giảng viên gửi toàn bảng đã lưu. Thiếu điểm, danh sách hoặc đăng ký đổi phiên bản thì phải tải lại. Bảng đã gửi bị khóa sửa.
7. Quản lý xem rồi trả lại kèm lý do hoặc xác nhận công bố trong khung ngay trên trang. Khi trả lại, Giảng viên sửa và gửi lại. Khi công bố, đóng dấu người/thời điểm/ngưỡng đạt; Sinh viên mới thấy kết quả của mình.

Đã mở rộng cấu hình điểm thành phần, điểm chữ/hệ 4 và GPA theo quy định đã chốt; xem DIEM_THANH_PHAN_VA_GPA.md cho API mới và tương thích dữ liệu cũ. Đã thêm phúc khảo và sửa sau công bố theo PHUC_KHAO_VA_DIEU_CHINH_DIEM.md. Chưa có lần thi hoặc chốt nhiều cấp. Không dùng chức năng này để tự kết luận tốt nghiệp.

## Quy tắc cần giữ

- Mở đợt có hiệu lực từ thời điểm mở (bao gồm) đến trước giờ đóng (không bao gồm). Rút dùng hạn rút riêng; đợt vẫn cần bật và lớp vẫn Mở. API kiểm tra theo giờ máy chủ, không tin đồng hồ client.
- Giao diện nhập giờ Việt Nam. Dữ liệu lưu epoch milliseconds; module shared/academic-format.js chuyển đổi cố định +07:00, không phụ thuộc múi giờ máy người dùng.
- Tín chỉ tính từ mọi đăng ký ACTIVE cùng học kỳ. Các môn/lớp đã mở được bảo toàn nội dung theo quy tắc cũ. Cạnh tranh hai đăng ký phải khóa và tính lại trong transaction.
- Tiên quyết dùng điểm PUBLISHED của đúng sinh viên, đạt theo pass_score đã lưu lúc công bố. Lớp tiên quyết phải kết thúc trước ngày bắt đầu lớp mới. Có điểm đạt nhưng hai lớp vẫn đang học cùng thời gian thì chưa đủ điều kiện học trước.
- Nháp hoặc SUBMITTED không thỏa tiên quyết. Môn đang học đồng thời chưa được hỗ trợ; không suy ra rằng điều kiện đã đạt.
- Lớp đã gửi/công bố điểm không nhận thêm đăng ký mới. Sinh viên không tự rút lớp đã gửi/công bố điểm. Rút khi còn nháp rồi đăng ký lại làm version đăng ký đổi; Giảng viên phải đối chiếu/lưu lại nháp trước khi gửi.
- Gửi/trả/công bố đối chiếu toàn bảng, version điểm/đăng ký/lớp và (khi công bố) version quy định học kỳ. Nếu ngưỡng đạt đổi sau lúc xem thì chặn công bố bản cũ. Sau công bố không cho thay ngưỡng đạt hồi tố.
- Gửi lại cùng requestId và cùng nội dung trả kết quả đã ghi; không thao tác lần hai. Dùng lại requestId cho nội dung khác bị chặn. Audit và dữ liệu nghiệp vụ cùng transaction.

## API và quyền

Tất cả dưới `/api/v1`, dùng session và kiểm tra Origin trên lệnh ghi.

| API | Quyền và kết quả |
| --- | --- |
| GET academics/policies | Bốn vai trò đọc quy định, serverTime |
| POST academics/terms; PATCH academics/terms/:id | Quản lý/Nhân viên; ghi có version, audit |
| POST academics/periods; PATCH academics/periods/:id | Quản lý/Nhân viên; nhiều đợt và kiểm tra chồng giờ |
| POST academics/requirements; PATCH academics/requirements/:id | Quản lý/Nhân viên; chặn vòng lặp, tắt thay vì xóa |
| GET academics/sections/:id/eligibility | Sinh viên; kiểm tra điều kiện của chính mình, chưa ghi |
| GET academics/registrations/:id/eligibility | Sinh viên; kiểm tra hạn/quyền rút của chính mình |
| GET grades | Quản lý/Nhân viên theo role hiện tại; Giảng viên lớp giao; Sinh viên chỉ điểm PUBLISHED của mình |
| GET grades/sections/:id | Quản lý/Nhân viên/Giảng viên lớp được giao, không cho Sinh viên đọc bảng người khác |
| PUT grades/sections/:id | Giảng viên lớp giao; rows gồm enrollmentId, enrollmentVersion, score, version (0 nếu chưa có điểm) |
| POST grades/sections/:id/submit | Giảng viên lớp giao, toàn bảng DRAFT → SUBMITTED |
| POST grades/sections/:id/publish | Quản lý, toàn bảng SUBMITTED → PUBLISHED |
| POST grades/sections/:id/return | Quản lý, toàn bảng SUBMITTED → DRAFT, bắt buộc reason |

Lệnh gửi/trả/công bố có requestId, sectionVersion, termVersion và rows [{id,version}]. Lệnh công bố cần termVersion khớp; không lấy ngưỡng do client tự gửi.

## Nguồn mã và database

| File | Trách nhiệm |
| --- | --- |
| frontend/app/features/registration-policies.js | Học kỳ, đợt, điều kiện và form sửa |
| frontend/app/features/grades.js | Nhập/gửi/công bố và tra cứu điểm |
| frontend/app/components/ui.js | bindForm và confirmAction dùng chung |
| shared/academic-format.js | Giờ Việt Nam, kiểm tra ngày giờ |
| backend/local/modules/academic/registration-policy.service.js | Quy định, cửa sổ, tín chỉ và tiên quyết |
| backend/local/modules/academic/academic.common.js | Xác thực actor, audit, thứ tự khóa dùng chung học vụ |
| backend/local/modules/academic/academic.service.js | Đăng ký/rút kiểm tra lại ở lúc ghi |
| backend/local/modules/grades/grade.service.js | Quyền và vòng đời điểm |
| backend/local/modules/ai/ai.service.js | Công cụ đọc quy định/điểm đã lọc quyền |
| backend/local/database/migrations/005_registration_results.sql | 4 bảng bổ sung, không DROP hoặc nhập đè dữ liệu cũ |
| tests/local/study-rules.test.js | Các ca điều kiện, điểm, API, rollback, version, AI và múi giờ |

MySQL thật và Gemini thật chưa được nghiệm thu. Sau sao lưu, chạy migration trên bản sao DB, đối chiếu dữ liệu cũ trước–sau, kiểm tra khóa nhiều kết nối và lưu qua khởi động lại. Các test MemoryStore và SQL mapping không thay cho bước này.

## Liên hệ thời khóa biểu mới

Lịch nhiều buổi, phòng và ngoại lệ đã nối qua dịch vụ dùng chung, xem THOI_KHOA_BIEU.md. Đăng ký/lịch thi đọc ngày thực tế; điểm danh chọn đúng buổi/ngày và giữ giờ/phòng đã mở sổ. Nhân viên theo phạm vi lớp, phòng là danh mục chung chỉ ghi bởi Quản lý/Nhân viên toàn trường. Toàn suite hiện 179/179; SQL/Gemini và giao diện mới trên thiết bị thật chưa nghiệm thu.

## Đợt đăng ký theo đối tượng

Đã bổ sung đợt theo khoa/khóa, lọc theo hồ sơ sinh viên và phạm vi Nhân viên. Đăng ký mới giữ đợt/hạn rút; đợt sau không tự gia hạn đăng ký cũ. LizzChat đọc cùng dữ liệu và kiểm tra lại trước ghi; xem DOT_DANG_KY_THEO_KHOA_KHOA.md. Toàn suite hiện 192/192; DB/Gemini thật chưa nghiệm thu.
