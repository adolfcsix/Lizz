# Công nhận học phần

Chức năng nằm trong Chương trình đào tạo, dùng cho trường hợp sinh viên đã học một học phần ở nơi khác và có căn cứ để đề nghị công nhận tín chỉ trong chương trình đang áp dụng. Hệ thống lưu quyết định riêng, không tạo điểm, không sửa bảng điểm và không cộng tín chỉ này vào GPA.

## Phân công

| Vai trò | Thao tác |
| --- | --- |
| Nhân viên | Lập và xem hồ sơ trong phạm vi sinh viên được giao; hủy hồ sơ chờ duyệt do mình lập; áp dụng hồ sơ mình lập sau khi được duyệt |
| Quản lý | Lập hồ sơ; duyệt hoặc từ chối hồ sơ do người khác lập; hủy, áp dụng, thu hồi theo điều kiện |
| Sinh viên | Xem quyết định đã áp dụng hoặc đã thu hồi của chính mình và xuất CSV; không đọc minh chứng, lý do nội bộ hoặc hồ sơ chờ duyệt |
| Giảng viên | Không có quyền đọc hoặc xử lý hồ sơ công nhận |

## Các bước xử lý

1. Chọn sinh viên và học phần đích thuộc chương trình đã công bố, đang được gán cho sinh viên. Nhập nơi đào tạo nguồn, tên học phần, tín chỉ nguồn, ngày hiệu lực, căn cứ minh chứng và lý do. Mặc định không sử dụng làm điều kiện tiên quyết.
2. Xem trước và xác nhận gửi. Hồ sơ chuyển sang Chờ phê duyệt; tín chỉ chưa thay đổi.
3. Quản lý khác người lập kiểm tra căn cứ, ghi lý do hoặc số quyết định và phê duyệt hay từ chối. Duyệt chưa làm tăng tín chỉ.
4. Người có quyền kiểm tra lại và xác nhận Áp dụng quyết định. Máy chủ đối chiếu lại nguồn; nếu sinh viên, chương trình, liên kết hoặc dữ liệu liên quan đã thay đổi thì yêu cầu lập lại hồ sơ phù hợp.
5. Tiến độ hiện Đã công nhận tín chỉ, giữ điểm trống. Nếu đã có kết quả đạt thì chỉ tính một lần; nhóm tự chọn vẫn có giới hạn tín chỉ. Đủ tiến độ không đồng nghĩa đã có quyết định tốt nghiệp.

## Điều kiện bảo toàn dữ liệu

- Tín chỉ nguồn là số nguyên từ 1 đến 60, không ít hơn tín chỉ đích. Ngày hiệu lực phải có thật và không sau ngày hiện tại theo giờ Việt Nam. Minh chứng hiện là số văn bản hoặc tham chiếu bằng chữ, chưa phải tệp tải lên hay thông tin đã được xác minh tự động.
- Mỗi sinh viên/học phần chỉ có một hồ sơ đang chờ, đã duyệt hoặc đã áp dụng. Gửi lại cùng mã và nội dung trả hồ sơ cũ; dùng lại mã với nội dung khác bị chặn.
- Không công nhận khi còn đăng ký ACTIVE của chính học phần chưa kết thúc. Không tự rút lớp, hủy đăng ký, xóa hay sửa điểm để giải quyết xung đột.
- Chỉ quyết định đã áp dụng, đủ dữ liệu kết quả và còn phù hợp chương trình hiện tại mới được tính. Phiên bản mới cùng chương trình/ngành/khóa có thể tiếp tục sử dụng khi học phần và tín chỉ còn phù hợp; không tự quy đổi sang môn khác.
- Được dùng làm tiên quyết chỉ khi hồ sơ ghi rõ cho phép, đủ tín chỉ và cả ngày hiệu lực lẫn ngày áp dụng thực tế đều trước ngày bắt đầu lớp mới. Không nhập lùi ngày để vượt điều kiện học trước. Đăng ký lưu mã và phiên bản quyết định đã sử dụng.
- Quản lý có thể thu hồi với lý do, giữ lịch sử. Chặn thu hồi nếu còn lớp đang học phụ thuộc quyết định, kể cả khi cấu hình tiên quyết đã được sửa. Thu hồi không sửa các đăng ký hoặc điểm trước đó.
- Mỗi lần thay đổi cần phiên bản và xác nhận; kiểm tra lại tài khoản, phạm vi, nguồn trong giao dịch. Ghi nhật ký và thông báo cùng giao dịch; lỗi phải hoàn tác.

## Liên kết kỹ thuật

| Thành phần | Vị trí |
| --- | --- |
| Giao diện | frontend/app/features/credit-recognitions.js; curriculum.js |
| Nghiệp vụ và hiệu lực | backend/local/modules/curriculum/recognition.service.js; recognition.rules.js |
| API | GET /api/v1/curricula/recognitions; POST /recognitions/preview; POST /recognitions; POST /recognitions/:id/approve, reject, cancel, apply, revoke (cùng tiền tố /api/v1/curricula) |
| Dữ liệu | credit_recognition_requests; migration 026_credit_recognitions.sql |
| Đăng ký và tiến độ | registration-policy.service.js; academic.service.js; curriculum.service.js; studySnapshot giữ căn cứ tiên quyết |
| LizzChat | lookup_credit_recognitions, chỉ đọc theo quyền; không có công cụ tự duyệt hoặc áp dụng |
| Kiểm thử | tests/local/credit-recognitions.test.js, 23 ca |

## Cập nhật và nghiệm thu

Sao lưu cơ sở dữ liệu, dừng backend cũ, chạy npm run db:migrate rồi khởi động backend mới. Giữ nguyên migration 001–025 và dữ liệu hiện có. Không xóa bảng để cập nhật.

Toàn bộ 429/429 kiểm thử Node đạt, gồm HTTP local, kho tạm và mapping SQL giả lập. Browser đã thao tác biểu mẫu Nhân viên, duyệt/áp dụng riêng của Quản lý, kết quả Sinh viên, tìm kiếm rỗng, tải CSV và khung hẹp bằng dữ liệu tổng hợp. Đây chưa phải nghiệm thu giao diện với MySQL thật. Migration 026, lưu qua khởi động lại, cạnh tranh nhiều kết nối MySQL, Gemini thật, Excel và thiết bị thật vẫn cần kiểm tra.

Chưa bao gồm miễn học bằng chứng chỉ, danh mục môn tương đương/thay thế, quy đổi điểm hoặc xét tốt nghiệp. Hồ sơ cần được người có thẩm quyền kiểm tra căn cứ trước khi quyết định.
