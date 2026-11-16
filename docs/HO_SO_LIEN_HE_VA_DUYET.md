# Cập nhật liên hệ và xử lý yêu cầu hồ sơ

## Nội dung đã nối

Sinh viên xem thông tin liên hệ ngay trong Hồ sơ của tôi và gửi đề nghị cập nhật. Các trường gồm điện thoại, email cá nhân, địa chỉ, người liên hệ khi cần, điện thoại và mối quan hệ. Không cho thay mã sinh viên, tài khoản, vai trò, email trường hoặc lớp bằng yêu cầu này. Việc cấp tài khoản, tạo hồ sơ và chuyển lớp tiếp tục dùng chức năng hiện có.

Hồ sơ gốc không đổi lúc gửi hay khi Nhân viên đề nghị duyệt. Chỉ bước Duyệt và cập nhật của Quản lý áp dụng nội dung đã kiểm tra. Giao diện có bảng cũ–mới, ý kiến xử lý và xác nhận; giao dịch cập nhật hồ sơ, trạng thái yêu cầu và audit cùng nhau. Nếu audit lỗi, toàn bộ thay đổi nghiệp vụ phải rollback.

## Vai trò và các bước

| Bước | Người thực hiện | Kết quả |
| --- | --- | --- |
| Gửi đề nghị | Sinh viên, hồ sơ của mình | Chờ tiếp nhận; hồ sơ vẫn giữ nguyên |
| Tiếp nhận | Nhân viên trong phạm vi hoặc Quản lý | Đang xử lý, ghi người phụ trách |
| Yêu cầu bổ sung | Nhân viên đang phụ trách hoặc Quản lý | Cần bổ sung, lưu lý do |
| Bổ sung và gửi lại | Sinh viên sở hữu yêu cầu | Xem thông tin hiện tại để đối chiếu, gửi lại bằng version hồ sơ mới; giữ đề nghị trước trong lịch sử |
| Đề nghị duyệt | Nhân viên phụ trách hoặc Quản lý | Chờ quản lý duyệt |
| Duyệt và cập nhật | Chỉ Quản lý | Áp dụng đúng đề nghị, tăng version hồ sơ và kết thúc yêu cầu |
| Từ chối | Quản lý | Lưu lý do; không đổi hồ sơ |
| Hủy | Sinh viên sở hữu, trước tiếp nhận hoặc khi chờ bổ sung | Kết thúc yêu cầu; không đổi hồ sơ |
| Nhận lại xử lý | Quản lý | Nhận quyền xử lý rõ ràng, đưa về Đang xử lý và giữ lịch sử; không tự đổi đề nghị |

Giảng viên không có menu, API hoặc công cụ AI đọc yêu cầu liên hệ riêng tư. Giảng viên vẫn có chương trình đã công bố, lớp được giao, lịch giảng dạy, điểm danh, nhập/gửi điểm, rà soát/phúc khảo, lịch thi theo phân công và tài khoản của mình.

Nhân viên khác người phụ trách không tự đề nghị duyệt thay. Nhân viên ngoài khoa/khóa được giao không tìm thấy yêu cầu dù biết mã. Phạm vi được đọc lại khi xử lý, không tin dữ liệu role/studentId do trình duyệt gửi. Quản lý có thể làm các bước nghiệp vụ khi cần nhưng Nhân viên không được mượn quyền Quản lý.

## Tính toàn vẹn

Mỗi sinh viên chỉ có một yêu cầu chưa kết thúc qua dịch vụ. Mã yêu cầu và mã thao tác chống gửi lặp; retry đúng nội dung không thực hiện hai lần hoặc quay lùi trạng thái. Version yêu cầu chặn hai cán bộ xử lý trên cùng bản cũ. Version và snapshot hồ sơ gốc chặn áp dụng sau khi hồ sơ đã thay đổi. Cần trả bổ sung và cho sinh viên kiểm tra/gửi lại, không tự ghép nội dung vào hồ sơ mới.

Thay đổi liên hệ giữ nguyên tài khoản, mã, họ tên chính thức, lớp và vai trò. Hồ sơ từ chối/hủy, đề nghị trước khi bổ sung và lịch sử ý kiến được giữ; không có xóa cứng qua module này. Tối đa 100 lượt xử lý một yêu cầu. Điện thoại được chuẩn hóa; email có kiểm tra; người liên hệ phải có cả tên và điện thoại. Các trường khác có thể để trống có chủ đích trong bản đề nghị, và vẫn phải qua duyệt trước khi xóa nội dung hiện có.

## Kết nối giao diện, API và AI

- #students hiển thị liên hệ; Sinh viên mở đề nghị từ hồ sơ và theo dõi tại #profile-requests. Quản lý/Nhân viên xem liên hệ và mở danh sách yêu cầu từ bảng sinh viên.
- #profile-requests có tìm kiếm, lọc trạng thái, phân trang, xem đề nghị, cũ–mới, thao tác theo role/người phụ trách/trạng thái và lịch sử xử lý. Lỗi stale giữ ý kiến để đối chiếu, không báo thành công.
- GET/POST /api/v1/profile-requests; POST /api/v1/profile-requests/:id/receive, takeover, request-info, recommend, approve, reject, cancel, resubmit.
- shared/role-navigation.js là nơi khai báo menu bốn role, được main.js dùng trực tiếp. shared/profile-workflow.js giữ nhãn/trạng thái và quy tắc thao tác dùng chung; backend kiểm tra lại ownership, phạm vi và version.
- LizzChat có lookup_profile_requests chỉ đọc mã, trạng thái, người phụ trách và thời điểm trong quyền; không tự ghi/duyệt/hủy. Công cụ tra sinh viên cũ không gửi contactDetails cho mô hình. Nội dung điện thoại, email cá nhân, địa chỉ và người liên hệ không được trả bởi công cụ trạng thái.

Không tự tạo work_items, không gửi email hoặc thông báo ngoài. Nhân viên xử lý trong hàng đợi yêu cầu hồ sơ riêng; chưa tự gộp vào lịch nhắc hạn toàn trường.

## Nâng cấp DB

Sao lưu, dừng backend cũ, chạy npm run db:migrate để thêm 015_profile_requests.sql rồi mới khởi động gói mới. Giữ nguyên migration 001–014. 015 thêm contact_details_json nullable vào student_profiles và bảng profile_change_requests, FK tới sinh viên/người gửi/người phụ trách/người cập nhật, version, status, snapshot và lịch sử JSON; MySQL 8.0.16+, InnoDB, utf8mb4/utf8mb4_unicode_ci.

Không tự tạo yêu cầu hoặc đổi contact dữ liệu cũ khi nâng cấp. DDL MySQL tự commit; migration chưa được chạy trên DB thật trong môi trường này. Không xóa cột/bảng khi gặp lỗi để ép migration chạy lại; cần đối chiếu phần đã áp dụng trước khi phục hồi.

## Kiểm chứng

19 ca mới về chuẩn hóa, quyền sở hữu, xác nhận, trùng/stale, luồng ba vai trò, người phụ trách, bổ sung, retry, tranh duyệt, rollback audit, hủy/từ chối, phạm vi thu hồi, AI không trả liên hệ riêng, SQL JSON/bind và HTTP từ gửi đến áp dụng. Có thêm 5 ca kiểm tra ranh giới quyền đọc của 16 API với bốn role và menu tương ứng. Toàn suite 251/251 PASS trên kho tạm/HTTP local, mapping MySQL và mô hình có kịch bản.

Browser kiểm tra component bằng các snapshot tổng hợp tạo từ dịch vụ thật: Quản lý có duyệt, Nhân viên không có duyệt, Giảng viên không có menu và nhận lỗi quyền, Sinh viên thấy liên hệ đã cập nhật và mở form riêng. Đã xem bảng so sánh, lịch sử, xác nhận và lỗi stale giữ ý kiến/mở lại nút. Form ở Chrome zoom bề rộng 337px CSS nằm trong khung, các trường xuống một cột. Đây không phải đăng nhập + MySQL hay iPhone thật; không suy từ fixture rằng mọi CRUD giao diện đã chạy với DB thật.

Còn thiếu: ảnh hồ sơ, in lý lịch, minh chứng đính kèm, chỉnh thông tin chính thức theo quy trình riêng, đề nghị thay mặt sinh viên, giao lại cho một Nhân viên được chọn, nhắc hạn/thông báo, lịch sử học tập/nghỉ học và các phân hệ trong roadmap. MySQL/migration/lưu bền/tranh chấp nhiều kết nối, Gemini thật và thiết bị thật chưa nghiệm thu.
