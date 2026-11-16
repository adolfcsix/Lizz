# Kế hoạch đăng ký học phần — hiện tại

## Luồng sử dụng

Sinh viên vào Đăng ký học phần. Trang giữ danh sách tất cả lớp như trước, thêm bộ lọc trong chương trình cá nhân, nhóm học phần, học kỳ dự kiến và tiến độ. Có thể kết hợp tìm không dấu theo mã lớp, mã/tên môn hoặc giảng viên, học kỳ thực tế, lớp đã đăng ký và lớp mở còn chỗ. Học kỳ dự kiến là số thứ tự trong chương trình; học kỳ thực tế là mã học kỳ của lớp mở, hai trường không thay thế nhau.

Nút Xem kế hoạch học phần mở toàn bộ học phần thuộc phiên bản đã áp dụng, kể cả môn chưa có lớp. Mặc định lọc Cần học tiếp; có thể chuyển sang toàn bộ, đã đạt, đã công nhận, đang học hoặc cần đối chiếu. Bảng phân trang 10 dòng, xuất CSV toàn bộ kết quả lọc, bao gồm chương trình/phiên bản, học kỳ lọc lớp, nhóm, tín chỉ, tiến độ, số lớp mở còn chỗ và thời điểm/căn cứ đối chiếu. Xem lớp chọn đúng ID học phần, bỏ các bộ lọc phụ có thể che lớp; giữ học kỳ thực tế đã chọn. Bỏ chọn môn quay về danh sách trong chương trình.

Các thao tác Đăng ký, Rút và Lịch sử học phần dùng luồng hiện có. Sau khi đăng ký/rút thành công, trang đọc lại tiến độ từ máy chủ. Không tạo điểm, công nhận tín chỉ hay đăng ký chỉ bằng việc chọn bộ lọc.

## Căn cứ và giới hạn

- Chỉ dùng phiên bản đã gán cho chính sinh viên, không tự chọn phiên bản công bố mới nhất.
- Tiến độ dùng lại dịch vụ chương trình đã có: điểm công bố đúng lượt, tín chỉ công nhận đã áp dụng và đăng ký đang hiệu lực. Thu hồi công nhận được phản ánh ở lần tải sau.
- Cần học tiếp gồm chưa học, chưa đạt hoặc thiếu tín chỉ. Môn đang học, đã đạt, đã công nhận không nằm trong nhóm này. Nhóm tự chọn đã đủ tín chỉ không biến những môn chưa chọn thành các môn bắt buộc còn thiếu.
- Kế hoạch vẫn hiển thị môn đã đạt/công nhận khi chọn toàn bộ hoặc bộ lọc tương ứng; không cấm việc xem lớp để học cải thiện. Điều kiện học lại/cải thiện vẫn do quy chế hiện hành kiểm tra.
- Chưa có hồ sơ/chương trình: hiện lý do, vẫn giữ danh sách lớp và kiểm tra đăng ký cũ. Không tự áp một chương trình mặc định.
- Hồ sơ đổi ngành/khóa, kết quả cũ thiếu căn cứ: cảnh báo cần đối chiếu, tổng tín chỉ còn thiếu không được xác nhận. Bảng chi tiết là căn cứ rà soát, không phải kết luận tốt nghiệp hay giấy xác nhận.
- Lớp mở còn chỗ chỉ phản ánh trạng thái nhận đăng ký và sĩ số lúc tải; chưa xác nhận đợt, tiên quyết, bảo lưu, lịch học/thi, điều kiện học lại hoặc các nghĩa vụ tài chính. API xem trước và giao dịch ghi hiện có kiểm tra lại theo nghiệp vụ đã triển khai. Không gắn nhãn Đủ điều kiện cho số lớp này.
- Trang không tự cập nhật theo thời gian thực. Cần tải lại sau khi cán bộ đổi chương trình, điểm, công nhận hoặc lớp học. Không có danh sách chờ hay tự đăng ký hàng loạt trong đợt này.

## API và phân quyền

`GET /api/v1/academics/my-course-plan` chỉ dành cho STUDENT đã đăng nhập và hoàn tất thiết lập mật khẩu. Không nhận ID sinh viên để chọn người khác; ID hồ sơ lấy từ tài khoản trong phiên. Quản lý, Nhân viên và Giảng viên không được sử dụng endpoint cá nhân này. Họ tiếp tục dùng module Chương trình/tiến độ theo quyền hiện có.

Dữ liệu trả về gồm trạng thái, chương trình, tổng tín chỉ, danh sách môn/nhóm/tiến độ và thời điểm đối chiếu. Không trả assignment nội bộ, căn cứ công nhận chi tiết, điểm nháp hoặc hồ sơ sinh viên khác. Quyền xác thực/phiên và ràng buộc đăng ký được giữ nguyên.

Nguồn: `shared/course-plan.js`, `backend/local/modules/academic/course-plan.service.js`, `academic.controller.js`, `frontend/app/features/course-plan.js`, `academic.js`.

## Nâng cấp và kiểm tra

Không thêm dependency runtime hay migration. Giữ nguyên migration 001–026. Gói cũ chưa có migration 026 vẫn phải nâng cấp database theo hướng dẫn Công nhận học phần trước khi chạy mã mới. Sao lưu database và giữ riêng .env; thay mã trong thư mục sạch, chạy npm ci, npm run db:migrate theo phiên bản database, rồi npm start.

14 ca kiểm thử mới trong bộ Node gồm API, quyền, dữ liệu cá nhân, phiên bản đã gán, hồ sơ đổi khóa, điểm nháp/công bố, đăng ký/rút, công nhận/thu hồi và tổ hợp bộ lọc. Có kiểm tra component bằng DOM jsdom gọi HTTP local với kho tạm: mở bảng, tìm không dấu, chọn/bỏ môn, CSV và đăng ký/rút cập nhật tiến độ.

Không coi kiểm tra DOM là kiểm tra bố cục: Chromium tại môi trường chạy bị chặn socket, trình duyệt dùng chung không kết nối được server local. Chưa nghiệm thu giao diện thực ở viewport desktop/iPhone của đợt này. MySQL thật và Gemini thật chưa nghiệm thu; kiểm thử kho tạm không chứng minh khóa SQL hay kết nối mô hình.
