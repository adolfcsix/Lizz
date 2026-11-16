# Ảnh và bản in thông tin sinh viên

Mỗi hồ sơ có thể có ảnh hoặc chưa có ảnh. Quản lý/Nhân viên cập nhật sau khi hồ sơ được tạo và đã đối chiếu với sinh viên. Chưa có nhập ảnh hàng loạt trong CSV hoặc ảnh ngay trên form tạo hồ sơ.

| Người dùng | Thao tác |
| --- | --- |
| Quản lý | Đọc/in hồ sơ, cập nhật/gỡ ảnh, xem lịch sử |
| Nhân viên | Cùng thao tác trong khoa/khóa được giao; bị thu hồi phạm vi thì không đọc/ghi được |
| Sinh viên | Đọc ảnh hiện tại và bản in của chính mình; liên hệ sai thì gửi yêu cầu cập nhật theo luồng đã có; không tự sửa ảnh |
| Giảng viên | Không đọc hồ sơ/ảnh/liên hệ riêng tư qua các API này; vẫn dùng roster giảng dạy đúng phân công |

## Cách sử dụng

Cán bộ mở Hồ sơ sinh viên → Hồ sơ / ảnh → Cập nhật ảnh. Chọn JPEG/PNG/WebP tối đa 10 MB; ứng dụng đọc ảnh, xoay theo thông tin của trình duyệt, thu gọn trong 720 px mỗi chiều và chuyển JPEG tối đa 96 KB, giữ tỷ lệ, không tự cắt khuôn mặt. PNG trong suốt được đặt trên nền trắng. Xem ảnh cũ–mới, nhập lý do, bấm Kiểm tra và lưu ảnh rồi xác nhận. Có gỡ ảnh với lý do và xác nhận; lịch sử vẫn được giữ.

Sinh viên mở Hồ sơ của tôi → Xem bản in. Bản xem có logo gốc, họ tên/mã, ảnh, email trường, lớp/khóa/khoa/ngành, các trường liên hệ đã lưu, thời điểm trích xuất theo giờ Việt Nam. Nút In thông tin đợi font/ảnh tải xong. Không tải được ảnh thì báo lỗi và cần tải lại hồ sơ. Bản in không phải giấy xác nhận có chữ ký, cũng chưa phải sơ yếu lý lịch đầy đủ (chưa có ngày sinh, nơi sinh, giấy tờ và minh chứng). Không tự điền dữ liệu chưa có.

## Dữ liệu và giao dịch

Migration 016 thêm `student_photo_changes` và `student_profiles.photo_id` nullable. Dữ liệu cũ giữ nguyên và chưa có ảnh. Bảng mới chứa bản ghi thay/gỡ bất biến: người thao tác, lý do, thời điểm, ảnh JPEG dạng base64 hoặc null khi gỡ, kích thước, dung lượng, ảnh trước, mã yêu cầu và hash. Ảnh cũ không bị xóa. Ghi lịch sử, đổi liên kết ảnh, tăng phiên bản hồ sơ và audit nằm cùng transaction; audit không chứa nội dung ảnh. Chưa có nút khôi phục trực tiếp ảnh cũ.

Mọi yêu cầu ghi phải có xác nhận, UUID thao tác, lý do và đúng phiên bản hồ sơ. Gửi lại cùng mã/nội dung trả trạng thái hiện tại, không phục hồi ảnh cũ; thay nội dung với cùng mã bị từ chối. Sửa ảnh làm tăng phiên bản hồ sơ, nên đề nghị liên hệ đang dựa trên phiên bản cũ cần đối chiếu/gửi lại trước khi duyệt. Không tự bỏ qua kiểm tra phiên bản.

Ảnh phục vụ bằng API có phiên đăng nhập, kiểm tra role/chủ/phạm vi; chỉ đọc ảnh đang liên kết và đúng `v`. Header JPEG, `nosniff`, `private, no-store`, same-origin; không có URL upload công khai hoặc data URL trong hồ sơ. CSP không nới lỏng. Nội dung base64 không xuất trong danh sách hồ sơ, lịch sử metadata hoặc LizzChat. Không nhận SVG/HTML hoặc đường dẫn file từ client. Backend kiểm tra base64 chuẩn, SOI/EOI, marker JPEG, kích thước 64–1024 px và 96 KB; chưa có thư viện giải mã/quét file phía server. Đầu vào thông thường được trình duyệt giải mã/chuyển đổi; không khẳng định kiểm tra marker thay được giải mã đầy đủ trên server.

| API | Chức năng |
| --- | --- |
| GET /api/v1/students/:id/profile | Snapshot hồ sơ tối thiểu cho bản xem/in |
| GET /api/v1/students/:id/photo?v=photoId | Byte JPEG của ảnh đang liên kết, kiểm tra lại quyền |
| GET /api/v1/students/:id/photo-history | Cán bộ xem lịch sử metadata trong quyền; không byte ảnh/hash yêu cầu |
| POST /api/v1/students/:id/photo | REPLACE hoặc REMOVE có xác nhận và phiên bản |

## Nâng cấp và kiểm tra còn lại

Sao lưu DB hiện tại, dừng backend cũ, chạy `npm run db:migrate`, khởi động backend mới. Giữ nguyên migration 001–015. Sao lưu DB bao gồm bảng ảnh; không cần sao chép thư mục uploads. Không chạy `npm run demo` như nguồn dữ liệu thật.

9 test mới đạt trong Node/HTTP kho tạm và mapping SQL giả lập; toàn suite 260/260. Giao diện được quan sát bằng dữ liệu tổng hợp, không có ảnh sinh viên thật. MySQL thật vẫn ECONNREFUSED, chưa chạy migration 016/lưu bền/khóa đa kết nối. Chưa kiểm tra Gemini thật, thiết bị thật hoặc trang giấy/PDF. Kiến trúc store hiện đọc toàn bảng trước khi lọc, bao gồm ảnh; cần tối ưu truy vấn theo ID và phân trang lịch sử trước khi mở rộng quy mô lớn. Dung lượng lịch sử ảnh cần được theo dõi trong sao lưu, không tự xóa để giảm dung lượng.
