# Lịch thi và phòng thi

Phân hệ này dùng danh sách sinh viên đang đăng ký lớp học phần. Mỗi lớp có tối đa một lịch chưa hủy. Lịch được lưu nháp trước, kiểm tra lại rồi mới công bố; không sửa trực tiếp lịch đã công bố. Khi đổi lịch, cán bộ hủy bản cũ có lý do rồi lập bản thay thế. Bản cũ và nhật ký vẫn được giữ.

## Người sử dụng

| Vai trò | Thao tác |
| --- | --- |
| Quản lý | Quản lý phòng; lập/sửa nháp; kiểm tra, công bố, hủy lịch; xem thí sinh |
| Nhân viên | Theo phạm vi toàn trường hoặc khoa/khóa; phòng thi dùng chung chỉ đọc với phạm vi hẹp. Lớp liên khoa ngoài phạm vi do Quản lý/Nhân viên toàn trường xử lý |
| Giảng viên | Xem lịch đã công bố hoặc đã hủy của lớp giảng dạy hoặc lịch được phân công coi thi; xem thí sinh trong các lịch đó |
| Sinh viên | Chỉ xem lịch công bố/đã hủy của lớp mình đang đăng ký; không đọc bản nháp, danh sách tài khoản hoặc danh sách thí sinh |

Bộ lọc không mở rộng quyền: danh sách được giới hạn theo người dùng trước khi tìm môn, lớp, phòng hoặc học kỳ. LizzChat gọi cùng dịch vụ tra cứu, có nguồn và thời điểm; chưa được lập, công bố hay hủy lịch thi qua chat.

## Trước khi công bố

Cán bộ chọn lớp, phòng đang sử dụng, giảng viên coi thi, ngày và giờ Việt Nam. Phòng phải đủ chỗ cho danh sách đang đăng ký. Hệ thống chặn trùng phòng, giảng viên coi thi và sinh viên giữa các lịch công bố có giờ giao nhau; hai ca tiếp giáp được phép. Hệ thống cũng kiểm tra lịch giảng dạy của người coi thi và lịch học của sinh viên, không tính buổi học của chính lớp đang tổ chức thi.

Bước kiểm tra tạo mã đối chiếu từ lịch, phòng, lớp, phiên quyền giảng viên và danh sách đăng ký. Khi bấm xác nhận, server kiểm tra lại trong giao dịch. Nếu dữ liệu đã đổi hoặc xuất hiện lịch xung đột, không công bố. Gửi lại cùng xác nhận đã thành công không tạo thêm nhật ký công bố.

Sinh viên đăng ký thêm lớp được kiểm tra sức chứa phòng thi và xung đột thi–thi, thi–học. Lớp đã kết thúc ca thi công bố không nhận đăng ký mới qua luồng này. Thay đổi lịch giảng dạy cũng bị chặn nếu gây trùng lịch coi thi đã công bố. Phòng có lịch công bố không được ngừng sử dụng; sức chứa không được giảm dưới số thí sinh hiện có.

Danh sách thí sinh hiện lấy theo đăng ký ACTIVE, chưa phải danh sách chốt bất biến. Đăng ký/rút hợp lệ sẽ làm danh sách thay đổi. Đã bổ sung bản chụp danh sách khi mở buổi điểm danh, điểm danh thi và điều kiện chuyên cần/tài chính tùy cấu hình; xem DIEM_DANH_VA_TAI_CHINH.md. Danh sách trên lịch vẫn là ACTIVE hiện tại; đã bổ sung SBD/ghế và biên bản theo bản lưu; còn chia nhiều phòng, thi lại nhiều đợt, chữ ký số và nghiệm thu bản in.

## API và mã nguồn

| API | Tác dụng |
| --- | --- |
| GET /api/v1/exams?q=&term= | Lịch trong quyền và danh mục cần thiết cho cán bộ |
| POST /api/v1/exams/rooms | Thêm phòng thi |
| PATCH /api/v1/exams/rooms/:id | Sửa phòng, có version |
| POST /api/v1/exams | Lập bản nháp |
| PATCH /api/v1/exams/:id | Sửa nháp, có version |
| GET /api/v1/exams/:id/review | Kiểm tra và lấy reviewHash |
| POST /api/v1/exams/:id/publish | version, reviewHash và confirm=true |
| POST /api/v1/exams/:id/cancel | version, reason và confirm=true |
| GET /api/v1/exams/:id/students | Danh sách thí sinh trong quyền |

Frontend: `frontend/app/features/exams.js`. Backend: `backend/local/modules/exams/`, gồm controller, service và quy tắc dùng chung với đăng ký học phần. Không dùng bảng hoặc endpoint do mô hình AI tự đặt tên. Các truy vấn ghi dùng bind tham số.

Migration mới `006_exams.sql` thêm `exam_rooms` và `exam_schedules`, giữ utf8mb4/utf8mb4_unicode_ci và các khóa ngoại đến lớp, phòng, tài khoản. Không sửa migration 001–005 và không xóa dữ liệu. Sao lưu trước, chạy `npm run db:migrate`, kiểm tra doctor rồi mới dùng tính năng. Chạy nâng cấp trên bản sao DB trước khi áp dụng dữ liệu đồ án.

## Đã kiểm tra và còn cần kiểm tra

`tests/local/exams.test.js` có 15 ca mới: giá trị/quan hệ/quyền, nháp ẩn, phạm vi lịch và roster, các loại trùng lịch, thay đổi sau kiểm tra, sức chứa, đăng ký thêm, hai yêu cầu tranh cùng phòng, rollback audit, HTTP/Origin, mapping SQL và công cụ tra cứu AI. Mốc lịch thi đạt 80/80; sau bổ sung điểm danh/tài chính, mốc tiếp theo đạt 106/106 (hiện tại sau điểm thành phần/GPA là 121/121) trên kho kiểm thử; đây không phải bằng chứng khóa MySQL nhiều kết nối đã đạt.

Giao diện thật của component đã được mở trong Chrome qua một harness fixture riêng: phòng, lập lịch, bước công bố, hủy thiếu/có lý do, trạng thái theo vai trò. Harness dùng phản hồi giả lập chỉ để kiểm tra giao diện và đã bị xóa khỏi nguồn bàn giao. Việc lưu bền, tải lại sau khởi động, nâng cấp DB có dữ liệu, tranh phòng bằng nhiều kết nối MySQL, UI đăng nhập xuyên suốt với API mới, mobile thật và Gemini thật chưa được nghiệm thu. `KET_QUA_DOCTOR.txt` ghi MySQL ECONNREFUSED và AI chưa đủ cấu hình trong môi trường kiểm tra hiện tại.

## Liên hệ thời khóa biểu mới

Lịch nhiều buổi, phòng và ngoại lệ đã nối qua dịch vụ dùng chung, xem THOI_KHOA_BIEU.md. Đăng ký/lịch thi đọc ngày thực tế; điểm danh chọn đúng buổi/ngày và giữ giờ/phòng đã mở sổ. Nhân viên theo phạm vi lớp, phòng là danh mục chung chỉ ghi bởi Quản lý/Nhân viên toàn trường. Toàn suite hiện 179/179; SQL/Gemini và giao diện mới trên thiết bị thật chưa nghiệm thu.

## Số báo danh và ghế

Đã bổ sung trong danh sách thí sinh của ca một phòng: xem trước/xác nhận, lập lại trước giờ bắt đầu, giữ từng bản, CSV và đọc ghế riêng. Nguồn đổi thì không trả ghế cũ. Chưa chia nhiều phòng, thi lại hoặc hàng/cột; biên bản đã bổ sung ở BIEN_BAN_CA_THI.md. SO_BAO_DANH_VA_CHO_NGOI.md là phần mô tả mới cho luồng này.

Biên bản ca thi đã có lưu nháp/gửi/kiểm tra/xác nhận/trả/mở lại, có trạng thái trên lịch, lịch sử, CSV và xem trước in. Chưa xác minh PDF/bản giấy, chia phòng/thi lại; xem BIEN_BAN_CA_THI.md.
