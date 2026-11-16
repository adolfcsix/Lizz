# Điểm danh, điều kiện dự thi và học phí

Hai phân hệ dùng chung tài khoản, hồ sơ sinh viên, học kỳ, lớp học phần, đăng ký và nhật ký hiện có. Frontend vẫn là HTML/CSS/JavaScript ES Modules; backend Node.js, không thêm framework hoặc thư viện runtime. Mã mới nằm ở `frontend/app/features/attendance.js`, `finance.js` và `backend/local/modules/attendance/`, `finance/`.

## Quyền thao tác

| Nghiệp vụ | Quản lý | Nhân viên | Giảng viên | Sinh viên |
| --- | --- | --- | --- | --- |
| Lập/sửa nháp, phát hành/hủy khoản thu | Có | Có | Không | Không |
| Ghi phiếu chờ xác minh, xác nhận/từ chối thu | Có | Có | Không | Chỉ báo chuyển khoản cho khoản thu của mình, không xác nhận |
| Điều chỉnh/miễn giảm; hủy xác nhận/mở lại phiếu | Có, phải ghi lý do | Không | Không | Không |
| Xem công nợ/phiếu, CSV, in phiếu đã xác nhận | Có | Có | Không | Chỉ của mình |
| Thiết lập điều kiện dự thi | Có | Có | Không | Không |
| Điểm danh buổi học | Có | Có | Chỉ lớp giảng dạy được giao | Không |
| Điểm danh buổi thi | Có | Có | Chỉ ca thi được phân công coi | Không |
| Xem điểm danh/điều kiện dự thi | Có | Có | Trong phân công, không đọc số tiền nợ | Chỉ của mình, buổi đã chốt |

Nhân viên được phân toàn trường hoặc theo khoa/khóa; API, số liệu và LizzChat cùng dùng phạm vi. Xem PHAM_VI_NHAN_VIEN.md cho dữ liệu cũ, lớp liên khoa và danh mục chỉ đọc.

## Khoản thu và xác nhận tiền

1. Chọn hồ sơ sinh viên, học kỳ đã thiết lập, nội dung, số tiền nguyên VND và hạn nộp. Bản nháp chưa hiện cho sinh viên. Kiểm tra rồi xác nhận phát hành.
2. Nhân viên ghi nhận tiền mặt/chuyển khoản hoặc Sinh viên báo chuyển khoản có mã giao dịch. Phiếu mới ở trạng thái **Chờ xác minh**, công nợ chưa giảm. Có thể nộp từng phần.
3. Cán bộ đối chiếu tiền thực nhận trước khi xác nhận. Máy chủ kiểm tra phiên quyền, phiên bản phiếu/khoản thu, số dư và mã yêu cầu. Hai phiếu đang chờ không dự trữ số tiền: phiếu được xác nhận sau phải kiểm tra số dư mới nhất.
4. Mã giao dịch chuyển khoản được chuẩn hóa và không được dùng lại. Tiền mặt không lưu mã chuyển khoản. Mỗi lần gửi có mã yêu cầu để retry không ghi hai lần.
5. Quản lý điều chỉnh tăng/giảm khoản thu bằng bản ghi riêng kèm lý do; tổng sau điều chỉnh không âm và không thấp hơn số đã thu. Miễn toàn bộ cần bản điều chỉnh rõ ràng, không suy từ việc chưa lập khoản thu.
6. Hủy xác nhận giữ phiếu và lịch sử, đưa tiền ra khỏi số đã xác nhận; **không chuyển tiền trả cho sinh viên**. Nếu hủy nhầm, Quản lý mở lại để cán bộ xác minh lại. Không hủy khoản thu đang có phiếu chờ hoặc đã xác nhận.

Số còn phải nộp = tiền gốc + tổng điều chỉnh − tổng phiếu CONFIRMED. Phiếu PENDING, REJECTED, REVERSED không giảm nợ. Đối chiếu tài chính học kỳ chỉ kết luận CLEAR khi có khoản thu phát hành và đã thanh toán/miễn giảm đầy đủ; không có khoản thu là NOT_VERIFIED.

CSV xuất dữ liệu trong quyền theo tab và bộ tìm kiếm, gồm cả các trang kết quả, không chỉ trang đang thấy. Giá trị văn bản có thể bị bảng tính hiểu là công thức được vô hiệu hóa khi xuất. In phiếu chỉ mở cho CONFIRMED, bố cục in loại menu/chat/nút; phiếu nội bộ này chưa phải hóa đơn điện tử, chưa phải chứng từ xác minh ngân hàng tự động. Đầu ra máy in/PDF thực tế chưa được nghiệm thu.

## Điểm danh và điều kiện dự thi

1. Quản lý/Nhân viên quy định số buổi tối thiểu phải chốt, tỷ lệ tham dự, cách tính đi muộn/vắng có phép, có đối chiếu tài chính và có áp dụng vào lịch thi hay không. Không đưa sẵn quy định giả cho lớp cũ.
2. Mở buổi học đúng thứ và khoảng ngày của lớp hoặc buổi thi từ ca đã công bố. Có thể chuẩn bị trước, nhưng chỉ ghi điểm danh từ giờ bắt đầu theo Việt Nam.
3. Danh sách lấy từ đăng ký ACTIVE và lưu bản chụp ID/phiên bản. Khi đăng ký thay đổi, cần đồng bộ buổi đang mở rồi ghi lại dòng thay đổi. Không xóa điểm danh cũ âm thầm.
4. Mỗi sinh viên phải được chọn Có mặt / Đi muộn / Vắng có phép / Vắng mặt. Dòng chưa ghi nhận không tự đổi thành vắng. Chốt buổi chỉ khi tất cả dòng hiện hành hợp lệ; Sinh viên chỉ đọc buổi đã chốt của mình.
5. Mở lại buổi cần lý do. Khi đã công bố lịch có áp dụng điều kiện, không được thay chính sách hoặc mở lại dữ liệu chuyên cần đã chốt để âm thầm thay căn cứ; phải hủy lịch trước.
6. Chỉ dữ liệu CLASS đã chốt và khớp đăng ký được dùng cho tỷ lệ tham dự. Thiếu quy định, thiếu buổi hoặc thiếu dòng hợp lệ trả **Chưa xác minh**; dữ liệu đủ nhưng không đạt tỷ lệ/còn nợ trả **Không đủ điều kiện**. Không có dữ liệu không đồng nghĩa đạt hay vắng.
7. Khi bật áp dụng, xem trước/công bố lịch thi gắn với chính sách, điểm danh, đăng ký và tài chính đã kiểm tra. Thay đổi giữa xem trước và xác nhận làm bản cũ hết hiệu lực. Ghi/chốt buổi thi kiểm tra lại điều kiện cho Có mặt/Đi muộn, kể cả công nợ thay đổi sau lúc mở sổ. Lịch đã công bố không bị tự xóa khi tài chính đổi; cán bộ phải xử lý theo quy trình hiện hành.

CSV sổ điểm danh chỉ xuất các dòng được API cho phép. Lớp cũ không có chính sách vẫn xem được lịch nhưng không bị gán đủ điều kiện; muốn cưỡng chế điều kiện phải cấu hình và bật áp dụng rõ ràng.

## API và dữ liệu

Mọi đường dẫn dưới tiền tố `/api/v1`, cần phiên đăng nhập; API ghi cần Origin hợp lệ. Các thao tác có version/mã yêu cầu được kiểm tra lại trong giao dịch cùng nhật ký.

| Nhóm | API |
| --- | --- |
| Tài chính | GET `/finance`; POST `/finance/charges`; PATCH `/finance/charges/:id` |
| Khoản thu | POST `/finance/charges/:id/issue`, `/cancel`, `/adjust` |
| Phiếu | POST `/finance/receipts`; GET `/finance/receipts/:id`; POST `/finance/receipts/:id/confirm`, `/reject`, `/reverse`, `/reopen` |
| Điểm danh | GET `/attendance`; POST `/attendance/policies`, `/attendance/sessions`; GET `/attendance/sessions/:id` |
| Sổ điểm danh | POST `/attendance/sessions/:id/marks`, `/sync`, `/close`, `/reopen` |
| Điều kiện | GET `/attendance/sections/:id/eligibility` |

| Bảng mới | Ý nghĩa |
| --- | --- |
| student_charges | Khoản phải thu theo sinh viên/học kỳ, trạng thái và version |
| payment_receipts | Thông tin thu/báo chuyển khoản, xác nhận và điều chỉnh trạng thái |
| charge_adjustments | Tăng/giảm tiền gốc có lý do, không ghi đè lịch sử |
| attendance_policies | Quy định chuyên cần/tài chính theo lớp học phần |
| attendance_sessions | Buổi học/thi, bản chụp danh sách, người/thời điểm chốt |
| attendance_marks | Trạng thái từng sinh viên, đăng ký/phiên bản và người ghi |

Chống gửi lặp dùng lại `academic_requests` có phân biệt loại thao tác trong hash, không thêm một bảng chức năng trùng. Nhật ký dùng `audit_events`. Khóa ngoại và CHECK được khai báo trong SQL; mapping tên bảng/cột và tham số chỉ từ whitelist. Giao dịch hiện khóa tài khoản chung trước ghi để nhất quán với các nghiệp vụ cũ; cần đo và kiểm tra khóa bằng nhiều kết nối MySQL thật trước khi tăng tải.

## Cập nhật an toàn và kiểm chứng

Sao lưu, giữ `.env`, giải nén vào thư mục sạch, chạy `npm ci`, `npm run db:migrate`, `npm run doctor`, `npm start`. Migration **007_finance.sql**, **008_attendance.sql** thêm sáu bảng; 001–006 không sửa. Không xóa DB để cập nhật. MySQL DDL có tự commit: lỗi giữa chừng phải đối chiếu schema và bản sao, không sửa checksum hoặc mặc định cho là rollback toàn bộ.

- Mốc điểm danh/tài chính: 106/106 PASS bằng Node, kho kiểm thử, HTTP, provider AI có kịch bản và mapping SQL. Có ca quyền/Origin, ghi lặp, cạnh tranh, stale version, rollback audit, đổi đăng ký, công nợ đổi trước chốt thi và chống công thức CSV.
- Chrome desktop: kiểm tra component thật bằng fixture tách biệt cho Quản lý/Nhân viên/Giảng viên/Sinh viên; không coi fixture là đăng nhập + DB end-to-end. Đã xóa harness trước đóng gói. Nguồn bàn giao không có bộ API giả cho các màn hình mới.
- MySQL: BLOCKED do kết nối bị từ chối. DDL 007/008, nâng cấp DB rỗng/có dữ liệu, lưu qua khởi động lại, deadlock/khóa nhiều kết nối và ràng buộc trên MySQL thật là NOT TESTED.
- Gemini thật: BLOCKED do thiếu model/key. Hai công cụ đọc mới đã test quyền nhưng chưa chứng minh hiểu hội thoại thực tế.
- Mobile/tablet thật, toàn bộ hover/focus/loading/empty/error, in thực tế và CSV trên Excel thật: NOT TESTED trong đợt này.

## Phần cần làm tiếp

Chưa có cổng thanh toán, webhook ngân hàng, đối soát tự động, hoàn tiền thật, hóa đơn điện tử, lập học phí hàng loạt, học bổng. Điểm danh còn theo mô hình một buổi cố định mỗi tuần của lớp, chưa có nhiều buổi trong ngày, phòng/tiết/ngoại lệ; lịch thi chưa chia phòng, thi lại, số báo danh/ghế hoặc biên bản đầy đủ. Điểm thành phần/GPA đã nối ở đợt sau, xem DIEM_THANH_PHAN_VA_GPA.md. Các phần phúc khảo, ủy quyền lớp liên khoa, nội trú/dịch vụ/tốt nghiệp vẫn chưa hoàn thiện. Xem bản đồ hệ thống, không dùng số test PASS để nhận toàn đồ án đã xong.

## Liên hệ thời khóa biểu mới

Lịch nhiều buổi, phòng và ngoại lệ đã nối qua dịch vụ dùng chung, xem THOI_KHOA_BIEU.md. Đăng ký/lịch thi đọc ngày thực tế; điểm danh chọn đúng buổi/ngày và giữ giờ/phòng đã mở sổ. Nhân viên theo phạm vi lớp, phòng là danh mục chung chỉ ghi bởi Quản lý/Nhân viên toàn trường. Toàn suite hiện 179/179; SQL/Gemini và giao diện mới trên thiết bị thật chưa nghiệm thu.
