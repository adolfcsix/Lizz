# Số báo danh và chỗ ngồi phòng thi

## Phạm vi đã triển khai

Chức năng nằm trong Lịch thi → Thí sinh, dùng phòng đã gắn với lịch thi công bố. Quản lý hoặc Nhân viên trong phạm vi được giao lập số báo danh và đánh số ghế liên tục từ 1. Danh sách sắp theo mã sinh viên, có so thứ tự số trong mã; số báo danh gồm tiền tố và số bắt đầu do người lập nhập.

Mỗi ca thi có một danh sách riêng. Số báo danh duy nhất trong ca, chưa phải số báo danh dùng chung toàn kỳ thi. Ghế là số thứ tự trong phòng, chưa mô tả hàng/cột hoặc sơ đồ vật lý. Chưa chia một lớp sang nhiều phòng, chưa gộp nhiều lớp vào một phòng hoặc tổ chức đợt thi lại riêng.

| Vai trò | Thao tác |
| --- | --- |
| Quản lý | Xem trước, xác nhận, lập lại trước giờ thi, xem lịch sử và xuất danh sách |
| Nhân viên | Cùng thao tác trong phạm vi khoa/khóa được cấp; không xử lý nửa danh sách lớp ngoài phạm vi |
| Giảng viên | Xem và xuất danh sách của lớp phụ trách hoặc ca được phân coi thi; không xếp lại |
| Sinh viên | Chỉ thấy số báo danh và ghế của mình trên lịch thi đã công bố; không tải danh sách phòng |
| LizzChat | Công cụ tra lịch thi sẵn có đọc thêm ghế riêng của Sinh viên theo cùng quyền; chưa có công cụ tự lập danh sách |

## Cách sử dụng

1. Mở Lịch thi, chọn Thí sinh ở ca đã công bố.
2. Chọn Xếp số báo danh và ghế. Nhập tiền tố tối đa 16 ký tự, số bắt đầu 1–999000, lý do 5–1000 ký tự.
3. Xem trước toàn bộ danh sách qua tìm kiếm và phân trang. Có thể chỉnh lại mà chưa ghi dữ liệu.
4. Chọn Xác nhận lưu danh sách. Hệ thống kiểm tra lại nguồn, phiên bản và quyền rồi mới lưu.
5. Danh sách đã xác nhận xuất hiện cho cán bộ/giảng viên trong quyền. Sinh viên xem phần riêng ngay trên lịch thi. LizzChat đọc cùng dữ liệu khi tra lịch.

Không xếp cho ca nháp/đã hủy, ca đã bắt đầu, phòng ngừng sử dụng, chưa có thí sinh, thiếu hồ sơ, đăng ký trùng hoặc vượt sức chứa. Thời điểm bắt đầu được hiểu theo giờ Việt Nam. Xếp ghế không cấp quyền dự thi, không sửa điểm danh, học phí, điều kiện dự thi, đăng ký hay điểm; người dùng vẫn xem Điều kiện dự thi riêng.

Bản xem trước có dấu kiểm tra nguồn và phiên bản hiện tại. Thay đổi lịch thi, phòng, thông tin thí sinh hoặc đăng ký trong lúc xác nhận sẽ bị từ chối; người lập phải xem trước lại. Hai yêu cầu cùng xác nhận không tạo hai bản kế tiếp từ cùng một nguồn cũ. Gửi lại đúng yêu cầu đã thành công trả kết quả đã ghi, không nhân đôi.

## Lịch sử và dữ liệu thay đổi

Mỗi lần xác nhận tạo một bản lưu mới, không ghi đè bản trước. Lý do, thời gian, số thí sinh và lần lập được hiển thị trong lịch sử. Bản lưu giữ đầy đủ danh sách, nguồn đối chiếu, người lập; sự kiện audit ghi mã ca, lần lập và số lượng, không sao chép toàn bộ hồ sơ.

Khi lịch, phòng, hồ sơ hoặc đăng ký thay đổi, kết quả cũ chuyển sang Cần xếp lại; API và giao diện không tiếp tục đưa ghế cũ như kết quả hiện hành. Quản lý/Nhân viên xem trước và lập bản mới nếu chưa đến giờ thi. Hủy lịch cũng ngừng hiển thị chỗ ngồi. Các bản trước vẫn được giữ để kiểm tra. Nếu thí sinh đã chuyển ra ngoài phạm vi của Nhân viên, không trả bản cũ chứa dữ liệu ngoài quyền; trường hợp không đọc được bản mới nhất cần Quản lý xử lý.

Tìm kiếm theo mã sinh viên, họ tên, số báo danh hoặc số ghế; phân trang 15 người. CSV lấy toàn bộ kết quả đã lọc, không chỉ trang đang xem, kèm lớp/phòng/ngày/giờ/trạng thái/lần lập. CSV ở bước xem trước ghi rõ Xem trước. Nội dung dùng bộ xuất CSV chung có xử lý ô công thức.

## API và mã nguồn

| API | Ý nghĩa |
| --- | --- |
| GET /api/v1/exams | Lịch trong quyền, trạng thái xếp chỗ và mySeat của chính Sinh viên |
| GET /api/v1/exams/:id/students | Danh sách cán bộ/giảng viên trong quyền, số báo danh/ghế hiện hành; lịch sử chỉ cán bộ quản lý |
| POST /api/v1/exams/:id/seating/review | Quản lý/Nhân viên gửi prefix, startNumber, reason; trả danh sách xem trước, version và reviewHash; chưa ghi |
| POST /api/v1/exams/:id/seating/confirm | Gửi lại cấu hình, version, reviewHash và confirm=true; kiểm tra lại rồi lưu giao dịch |

`seating.rules.js` tạo nguồn đối chiếu và xác định trạng thái; `seating.service.js` kiểm tra/xác nhận; `exam.service.js` giới hạn dữ liệu trả về; `exam-seating.js` dùng chung bảng cho xem trước và danh sách. Chức năng danh sách cũ được chuyển sang component mới, không để hai bản xử lý song song.

Migration `024_exam_seating.sql` thêm `exam_seating_plans`: khóa ngoại ca thi/người lập, JSON chứa bản lưu và unique (exam_id, version). Chỉ thêm bảng, không sửa migration 001–023 hoặc xóa dữ liệu cũ. Giữ MySQL 8.0.16+, utf8mb4/utf8mb4_unicode_ci.

Trước cập nhật: sao lưu DB, dừng backend cũ, thử migration trên bản sao, chạy `npm run db:migrate`, rồi khởi động backend mới. Mã mới cần bảng 024 trước khi đọc lịch thi. Không chuyển dữ liệu thật bằng cách xóa DB và dựng lại.

## Bằng chứng và việc còn lại

14 ca mới trong exam-seating.test.js kiểm tra thứ tự/duy nhất, xem trước không ghi, xác nhận, retry/cạnh tranh, nguồn cũ, version/quyền/phạm vi, hoàn tác khi audit lỗi, bản trước không đổi, Sinh viên chỉ đọc của mình, hủy lịch, AI tra lịch và mapping SQL/HTTP/Origin. Toàn bộ 386 kiểm thử đạt trong lần chạy ghi ở KET_QUA_TEST.txt.

Browser dùng dữ liệu tổng hợp 37 người qua bootstrap và component thật: tìm mã, xem trước, xác nhận giả lập, tìm SBD, phân trang 1/3→2/3, mở lịch sử, xuất CSV sau lọc chỉ còn một thí sinh. CSV có mã/phòng đúng và không chứa người bị lọc. Kiểm tra Sinh viên thấy SBD/ghế riêng, không có nút danh sách/xếp chỗ. Khung CSS khoảng 1363/681/340 px: modal không tràn ngang, bảng cuộn riêng. Đây chưa phải kiểm thử browser nối MySQL thật hoặc điện thoại vật lý.

MySQL hiện từ chối kết nối, Gemini chưa đủ cấu hình. Migration 024, lưu bền sau khởi động lại, cạnh tranh nhiều kết nối SQL và mô hình AI thật còn chưa nghiệm thu. Biên bản đã được nối ở migration 025, xem BIEN_BAN_CA_THI.md. Các phần tiếp theo là chia nhiều phòng, kỳ thi lại, sơ đồ hàng/cột và nghiệm thu dữ liệu thật; không coi đợt này là hoàn tất toàn bộ phân hệ khảo thí.
