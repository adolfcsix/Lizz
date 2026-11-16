# Biên bản ca thi

## Mục đích và phạm vi

Biên bản nối lịch thi, danh sách thí sinh, số báo danh/ghế và sổ điểm danh thi. Chức năng nằm trong Lịch thi → Biên bản ca thi, không mở một menu trùng. Ca đã kết thúc hiện trạng thái biên bản ngay trong danh sách cho người xử lý.

Giảng viên được phân coi thi lập nháp và gửi. Nhân viên trong phạm vi hoặc Quản lý kiểm tra, trả bổ sung hoặc xác nhận. Giảng viên dạy lớp nhưng không được phân coi ca đó không đọc/ghi biên bản; Sinh viên không đọc hồ sơ nội bộ này. Người lập không tự xác nhận, kể cả sau khi đổi vai trò. Quản lý/Nhân viên không sửa hộ số bài hoặc ghi chú của Giảng viên bằng thao tác xác nhận.

Xác nhận là trạng thái kiểm tra trong hệ thống, chưa thay thế chữ ký số hoặc chữ ký theo quy định. Biên bản hiện cho ca một phòng đã có, chưa bao gồm chia nhiều phòng, gộp lớp hoặc đợt thi lại.

## Số liệu và điều kiện

Danh sách lấy các đăng ký ACTIVE của lớp. Sổ điểm danh phải đúng ca, đúng lớp/ngày thi, đã chốt, khớp mã đăng ký và phiên bản đăng ký. Mỗi thí sinh cần đúng một trạng thái hợp lệ: Có mặt, Đến muộn, Vắng hoặc Vắng có phép. Thiếu hoặc sai phiên bản được ghi Chưa ghi nhận; không tự coi là vắng.

Có mặt/đến muộn được cộng vào số tham dự thực tế. Vắng/vắng có phép được tính là không có mặt trong ca. Số bài thu là số bài của thí sinh, không phải tổng số tờ giấy. Khi gửi, số bài không được vượt số có mặt/đến muộn. Nếu ít bài hơn số tham dự hoặc chỗ ngồi đang cần đối chiếu lại, phải ghi rõ lý do trong ghi chú.

Chỉ lập kết quả khi lịch đã công bố và ca đã kết thúc theo giờ Việt Nam. Nháp có thể lưu khi điểm danh còn thiếu để chuẩn bị, nhưng chưa gửi được. Gửi hoặc xác nhận đều kiểm tra lại nguồn; thay đổi lịch, phòng, hồ sơ, đăng ký, sổ/điểm danh hoặc bản chỗ ngồi làm yêu cầu cũ bị từ chối.

Biên bản không sửa điểm danh, điểm, đăng ký hoặc học phí. Nếu cần sửa nguồn, thực hiện tại nghiệp vụ tương ứng rồi lập lại biên bản qua luồng bổ sung; không sửa âm thầm để đạt số liệu mong muốn.

## Luồng xử lý

| Trạng thái | Người thao tác | Hành động kế tiếp |
| --- | --- | --- |
| Chưa lập | Giảng viên coi thi | Nhập số bài thu và ghi chú, lưu nháp sau khi ca kết thúc |
| Bản nháp | Giảng viên coi thi | Sửa/lưu; gửi sau xác nhận khi điểm danh đủ và nguồn còn khớp |
| Chờ kiểm tra | Nhân viên trong quyền/Quản lý khác người lập | Xác nhận hoặc trả bổ sung có lý do |
| Đã xác nhận | Người có quyền đọc | Xem/in/CSV; nếu cần sửa, cán bộ mở lại có lý do |
| Cần bổ sung | Giảng viên coi thi | Lưu bản nháp mới theo nguồn hiện tại, sau đó gửi lại |

Khi sửa trường nháp trên giao diện, nút gửi tạm ẩn để người dùng lưu trước. Mọi bước gửi, xác nhận, trả hoặc mở lại đều có bước đồng ý riêng. Lỗi nguồn thay đổi hiện trong chính cửa sổ xác nhận; có thể quay lại tải bản mới hoặc trả bổ sung.

Mỗi lần lưu/chuyển trạng thái tạo một bản mới có version tăng, người ghi nhận và thời gian; bản trước không bị ghi đè. Lịch sử mở được từng bản ở chế độ chỉ đọc. Sau thay đổi nguồn, bản đã lưu vẫn giữ nội dung gốc nhưng có cảnh báo không còn khớp hiện tại; không tự chuyển thành một biên bản mới đã được xác nhận.

Mã requestId chống ghi trùng theo ca và nội dung. Gửi lại đúng yêu cầu trả bản đã ghi, kể cả sau một bước xử lý khác; dùng lại cùng mã với nội dung khác bị chặn. Version cũ hoặc hai người sửa đồng thời không cùng tạo được bản kế tiếp. Ghi lịch sử/audit lỗi thì giao dịch hoàn tác cả bản mới.

## Xuất và tra cứu

CSV gồm lớp/phòng/ngày, trạng thái/bản, nguồn còn khớp, SBD/ghế, mã/họ tên/điểm danh, số bài và ghi chú. Dùng bộ xuất CSV chung có xử lý ô công thức. Bản xem trước in có logo Lizz/UNIVERSITY, bảng tổng hợp, ghi chú, danh sách đối chiếu và người/thời gian ghi nhận; giữ nguyên nhãn Nháp/Chờ kiểm tra/Đã xác nhận và cảnh báo nguồn nếu có. CSS dành riêng cho A4 dọc, bảng lặp tiêu đề và không kéo nội dung ra ngoài chiều ngang.

LizzChat có lookup_exam_report cho Quản lý, Nhân viên và Giảng viên coi thi. AI dùng ID ca từ kết quả tra lịch, chỉ nhận trạng thái, số liệu, ghi chú và tình trạng nguồn trong quyền; không nhận cả danh sách sinh viên nếu không cần. Không có công cụ AI lập, gửi hoặc xác nhận biên bản. Sinh viên không được cung cấp công cụ này.

## API và dữ liệu

| API | Phạm vi |
| --- | --- |
| GET /api/v1/exams/:id/report | Người trong quyền đọc bản hiện tại, nguồn đối chiếu và lịch sử |
| GET /api/v1/exams/:id/report?revision=N | Đọc bản trước, không có thao tác sửa/duyệt |
| POST /api/v1/exams/:id/report/save | Giảng viên coi thi; papers, notes, version, sourceHash, requestId |
| POST /api/v1/exams/:id/report/submit | Giảng viên gửi nháp của mình; version, sourceHash, requestId, confirm=true |
| POST /api/v1/exams/:id/report/confirm | Quản lý/Nhân viên khác người lập; đối chiếu nguồn và xác nhận |
| POST /api/v1/exams/:id/report/return | Trả bản đang chờ, bắt buộc lý do và xác nhận |
| POST /api/v1/exams/:id/report/reopen | Mở bản đã xác nhận để bổ sung, bắt buộc lý do và xác nhận |

Migration 025_exam_reports.sql thêm exam_reports, khóa ngoại ca/người tạo, status, payload JSON, version, created_at và unique(exam_id,version). Payload giữ bản nguồn, số bài, ghi chú, người lập, lý do, bản trước và dấu yêu cầu. Nội bộ requestId/requestHash không trả trong API đọc. Bộ lọc StaffStore kiểm tra cả ca và toàn bộ thí sinh trong bản lưu, không trả một phần hồ sơ chứa người ngoài quyền.

Mã chính: report.service.js xử lý dữ liệu và trạng thái; exam-report.js dùng cùng hàm trình bày cho màn hình/bản in; exam.controller.js khai báo API; ai.tools.js/ai.service.js giới hạn công cụ. Giữ frontend/backend trong cùng repository, JavaScript ES Modules, MySQL 8.0.16+ và utf8mb4/utf8mb4_unicode_ci.

Trước cập nhật: sao lưu, dừng backend cũ, thử migration trên bản sao, chạy npm run db:migrate rồi khởi động backend mới. Mã mới cần bảng 025 để đọc trạng thái trong lịch thi; giữ nguyên migration 001–024 và dữ liệu cũ.

## Kết quả đã kiểm tra

20 ca mới: tính số liệu/phiên bản điểm danh; đúng giảng viên coi thi; lifecycle; không tự xác nhận; số bài/ghi chú/xác nhận; chặn ca chưa kết thúc; nguồn thiếu hoặc đổi; retry sau nhiều bước; cạnh tranh; bản trước bất biến; scope STAFF và actor cũ; audit rollback; HTTP/Origin; adapter SQL; AI theo quyền; trạng thái danh sách và escaping bản in. Toàn bộ 406 kiểm thử đạt, lưu trong KET_QUA_TEST.txt.

Browser dùng sáu thí sinh tổng hợp qua bootstrap/component thật, API giả lập: Giảng viên lưu/gửi, Quản lý mở bản chờ và xác nhận; lỗi 409 hiện đúng ở modal, thử lại giữ requestId; mở bản 1 chỉ đọc, tải bản 3; CSV có header + sáu dòng, nhãn Đã xác nhận, vắng và ghi chú. Rà khung khoảng 1363/681/340 px: modal không tràn ngang, tổng hợp thành hai cột khi hẹp, bảng cuộn riêng.

Đã kiểm tra bản xem trước in và mã CSS A4. Trong trình duyệt kiểm tra, lệnh in không mở hộp thoại in hệ điều hành nên chưa xác minh file PDF hoặc trang giấy thực tế. Cần nghiệm thu tiếp bản in dài, phân trang, Safari/điện thoại thật và trình duyệt trên máy bảo vệ.

MySQL từ chối kết nối và Gemini chưa đủ cấu hình. Chưa chạy migration 025, lưu bền/đa kết nối SQL và mô hình AI thật. Các kiểm thử kho tạm/HTTP/mapping SQL và AI có kịch bản không thay thế các bước nghiệm thu đó.
