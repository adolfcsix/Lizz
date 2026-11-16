# Chuyển phiên bản chương trình có phê duyệt

Luồng này dùng khi sinh viên đã được áp dụng một chương trình và cần chuyển sang phiên bản đã công bố mới hơn. Không áp dụng phiên bản mới cho cả khóa chỉ vì chương trình vừa được công bố. Người phụ trách phải lập hồ sơ riêng cho sinh viên, đối chiếu trước–sau và có quyết định trước khi thay liên kết.

## Phân công và các bước

| Bước | Người thực hiện | Kết quả |
| --- | --- | --- |
| Lập hồ sơ | Nhân viên đúng phạm vi hoặc Quản lý | Chọn sinh viên đã có chương trình, tìm theo mã/tên, chọn phiên bản đích, nhập căn cứ |
| Đối chiếu | Người lập | Xem học phần/nhóm, tín chỉ tối thiểu, học kỳ dự kiến và đăng ký ngoài chương trình đích; xác nhận gửi |
| Quyết định | Quản lý khác người lập | Nhập lý do, xác nhận duyệt hoặc từ chối. Người lập không tự duyệt |
| Áp dụng | Người lập Nhân viên còn quyền hoặc Quản lý | Nhập lý do, xác nhận riêng. Server kiểm tra lại căn cứ rồi mới thay liên kết |
| Tra cứu | Cán bộ đúng quyền; Sinh viên của chính mình | Cán bộ xem hồ sơ mình lập hoặc toàn bộ nếu là Quản lý; Sinh viên chỉ thấy lịch sử đã áp dụng, có CSV |

Mở tại Chương trình đào tạo → Chuyển phiên bản có phê duyệt. Không thêm menu lặp. Giảng viên không được đọc hồ sơ chuyển chương trình riêng tư hoặc ra quyết định; API và công cụ AI cũng chặn, không chỉ ẩn nút.

Có tìm kiếm, lọc trạng thái và phân trang hồ sơ. Mỗi hồ sơ giữ căn cứ, bản đối chiếu, người đề nghị, quyết định, kết quả áp dụng và phiên bản. CSV đối chiếu gồm tín chỉ tối thiểu, nhóm, học phần và đăng ký ngoài chương trình; CSV lịch sử Sinh viên chỉ có thông tin đã áp dụng của mình.

Quản lý có thể hủy hồ sơ chờ duyệt hoặc hồ sơ đã duyệt nhưng chưa áp dụng; người lập Nhân viên chỉ hủy khi còn chờ duyệt. Hồ sơ đã áp dụng không có nút hủy hoặc tự hoàn tác. Khi hồ sơ cũ bị chặn vì căn cứ thay đổi, hủy hồ sơ chưa áp dụng và lập lại sau đối chiếu. Trường hợp Quản lý tự lập cần một Quản lý khác duyệt; không mở ngoại lệ tự duyệt để bỏ qua bước này.

## Điều kiện và dữ liệu được giữ

Chỉ chấp nhận phiên bản có số lớn hơn, đã công bố, cùng mã chương trình, cùng ngành và khóa. Ngành/khóa của lớp hành chính hiện tại cũng phải khớp. Chưa hỗ trợ đổi ngành, đổi khóa, sang mã chương trình khác hoặc quay về phiên bản cũ.

Bản đối chiếu gắn với phiên bản hồ sơ, lớp hành chính, liên kết chương trình, nội dung hai chương trình, đăng ký, lớp học phần và điểm của sinh viên. Nguồn thay đổi sau lúc xem trước sẽ bị chặn khi gửi, duyệt hoặc áp dụng; không tự xử lý theo một bản khác với bản người dùng đã xem. Một sinh viên chỉ có một hồ sơ chờ duyệt/chờ áp dụng; kiểm tra trên kho đầy đủ để hai Nhân viên khác nhau không tạo hai hồ sơ đang mở cho cùng người.

Khi áp dụng, chỉ đổi chương trình và căn cứ của liên kết hiện hành, tăng phiên bản liên kết. Không đổi hồ sơ, lớp hành chính, lớp đã đăng ký hoặc điểm. Tiến độ và kiểm tra đăng ký mới đọc liên kết mới. Đăng ký đang hiệu lực nằm ngoài chương trình đích được cảnh báo và giữ nguyên, không tự rút lớp hoặc công nhận tương đương. GPA và điểm công bố vẫn dùng cơ chế đã có.

Bảng `curriculum_transfer_requests` lưu hồ sơ, bản đối chiếu và snapshot liên kết trước thay đổi; audit ghi các bước gửi/duyệt/từ chối/hủy/áp dụng. Không xóa lịch sử. Gửi lặp trả hồ sơ đã lưu, áp dụng lặp không tăng phiên bản lần nữa. Yêu cầu áp dụng chương trình ban đầu nếu gửi lại vẫn trả kết quả ban đầu đã ghi, kể cả sau nhiều lần chuyển; không trả nhầm liên kết mới như thể đó là kết quả của yêu cầu cũ.

Thay liên kết, cập nhật trạng thái, audit và thông báo cùng giao dịch. Lỗi lưu audit/thông báo phải hoàn tác cả thay đổi nghiệp vụ. Quản lý nhận hồ sơ mới; người lập nhận quyết định; Sinh viên nhận thông báo khi đã áp dụng. Hộp tin kiểm tra lại nguồn, role và phạm vi hiện tại, không cấp quyền từ nội dung tin.

## LizzChat

Công cụ `lookup_curriculum_transfers` trả hồ sơ trong quyền, hỏi mã sinh viên chính xác nếu cán bộ chưa cung cấp. Sinh viên chỉ lịch sử đã áp dụng của mình; Giảng viên bị chặn. Kết quả có nguồn, thời điểm, tổng số và tối đa 50 dòng; không trả toàn bộ snapshot nội bộ. Công cụ này chỉ đọc. Lập/duyệt/áp dụng vẫn thực hiện ở biểu mẫu có đối chiếu và xác nhận; chưa có công cụ AI ghi cho luồng này.

## Nâng cấp và nghiệm thu

1. Sao lưu DB và dừng backend cũ.
2. Chạy `npm ci`, kiểm tra cấu hình local theo README, rồi `npm run db:migrate` để thêm `020_curriculum_transfers.sql`. Giữ nguyên migration 001–019.
3. Khởi động `npm start`. Trên bản sao dữ liệu, chuẩn bị hai phiên bản công bố, áp dụng phiên bản cũ cho sinh viên, dùng Nhân viên lập hồ sơ và Quản lý khác người lập duyệt.
4. Đối chiếu đăng ký/điểm trước–sau, thử nguồn thay đổi, retry, hai người lập đồng thời, thu hồi phạm vi, đọc chéo hồ sơ và khởi động lại backend. Kiểm tra bằng nhiều kết nối MySQL thật trước bảo vệ.

Đã đạt 321/321 test Node, gồm 16 ca mới về toàn luồng, dữ liệu giữ nguyên, chương trình đích, xác nhận/phiên bản, tự duyệt, trạng thái kết thúc, nguồn thay đổi, cạnh tranh trong kho tạm, quyền, rollback, thông báo, AI kịch bản, mapping SQL và HTTP/Origin. Kiểm tra nguồn: 138 JS, 581 import tương đối, 0 lỗi.

Đã rà component Chương trình thật với fixture tổng hợp: tìm/chọn sinh viên, lọc phiên bản, xem trước, quay lại giữ dữ liệu, duyệt và áp dụng tách bước, Nhân viên không có quyền duyệt, Giảng viên không có lối vào, lịch sử riêng Sinh viên, CSV tải được và lỗi 409 phục hồi biểu mẫu. Trạng thái/POST trong browser được mô phỏng bằng dữ liệu từ service; Node HTTP kiểm tra ghi trên kho tạm thật. Không gọi đây là UI ghi MySQL.

Chrome zoom khung 340 px CSS, nội dung 337 px; hộp thoại rộng 303 px, bảng cuộn riêng 227/520 px và có tabIndex để dùng bàn phím; không tràn toàn trang. Chưa nghiệm thu iPhone/Safari hoặc tablet thật.

MySQL thật đang BLOCKED do ECONNREFUSED; Gemini chưa đủ cấu hình. Chưa chạy migration 020 trên DB thật, kiểm tra lưu bền/đa kết nối hoặc hội thoại mô hình thật. Chuyển ngành/chương trình khác, bảo lưu, thi lại, công nhận môn và xét tốt nghiệp vẫn thuộc phần còn thiếu.


Đợt sau sửa nhánh ghi của StaffStore cho Nhân viên theo khoa/khóa: bỏ nhánh lặp không dùng, thêm guard đúng hồ sơ do người đó lập trong phạm vi. Có kiểm thử trọn luồng với quyền khoa. Bảo lưu/quay lại cơ bản đã bổ sung, xem BAO_LUU_VA_QUAY_LAI_HOC.md; 338/338 là kết quả hiện tại. Các số liệu ở phần kiểm tra phía trên mô tả đợt chuyển chương trình trước.
