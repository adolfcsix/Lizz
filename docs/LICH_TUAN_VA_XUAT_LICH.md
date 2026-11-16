# Thời khóa biểu và xuất lịch cá nhân

## Cách trình bày hiện tại

Lịch tuần từ thứ Hai đến Chủ nhật, dùng cột ngày cố định và thẻ buổi học theo thứ tự giờ. Không chia trục giờ thành các hàng cố định. Ngày chỉ có một buổi dùng thẻ ngang; ngày có nhiều buổi dùng các thẻ cùng hàng, tự xuống dòng và giữ đủ tên môn. Ngày trống được thu gọn nhưng không biến mất khỏi tuần. Buổi diễn ra đồng thời vẫn có thẻ riêng, không phải mở ô đếm mới tìm thấy lớp.

Giờ bắt đầu/kết thúc, mã lớp, môn, phòng và giảng viên có vị trí nhất quán. Học bù có nhãn chữ và chi tiết ngày gốc/lý do. Màu nhẹ chỉ giúp nhận diện môn, không thay thế nội dung. Mận/be, logo gốc và Noto Sans giữ theo nhận diện chung.

## Thao tác đã nối

| Thao tác | Kết quả |
| --- | --- |
| Tuần trước/sau, Hôm nay, chọn ngày | Tải đúng thứ Hai–Chủ nhật; giờ Việt Nam. Khi sang tuần khác, chế độ ngày chọn ngày đầu có buổi nếu tuần đó không chứa hôm nay |
| Tìm kiếm và học kỳ | Tìm môn, mã lớp, giảng viên, phòng; hỗ trợ có/không dấu. Đổi học kỳ bỏ lớp đã lọc để không giữ lớp của kỳ khác |
| Lọc theo lớp và phòng | Chọn lớp chính xác, phòng hoặc Chưa phân phòng; kết hợp điều kiện. Chỉ dùng dữ liệu API đã lọc quyền; giữ phòng được chọn khi tuần kế tiếp không có buổi ở phòng đó |
| Bỏ lọc | Đưa tìm kiếm, học kỳ, lớp, phòng về tất cả; giữ nguyên tuần và cách xem |
| Nhấn thẻ / nhấn ngày | Xem thông tin buổi hoặc toàn bộ buổi của ngày, gồm phòng, giảng viên và học bù |
| Màn hẹp, LizzChat | Theo ngày hoặc Danh sách. Thanh đầu trang trên màn hẹp giữ chỗ riêng cho nút LizzChat khi cuộn |
| Ngày nghỉ và thay đổi | Hiện theo học kỳ/lớp; ngày nghỉ vẫn được giữ khi bộ lọc buổi học không còn buổi tương ứng. Giao diện ghi rõ phạm vi này |
| Lỗi tải | Giữ tuần đã tải, bộ lọc và cách xem; hiện lỗi để người dùng thao tác lại |
| CSV và .ics | Xuất đúng buổi của tuần và bộ lọc. Phân lịch/Phòng giữ cách xuất CSV riêng |
| In lịch | Xem trước có logo, tuần, người xem, số buổi và bảng đầy đủ. Lệnh in chỉ lấy bảng này, không lấy menu/chat. CSS A4 ngang, lặp tiêu đề bảng và tránh cắt một hàng giữa hai trang |

Phân lịch/Phòng giữ nguyên dịch vụ, xác nhận, version và quyền Quản lý/Nhân viên. Sinh viên chỉ thấy lịch đăng ký, Giảng viên chỉ thấy lịch được phân công; frontend không cấp quyền từ bộ lọc. LizzChat vẫn tra qua lookup_timetable, chưa có thao tác chỉnh lịch bằng chat.

## Lịch cá nhân

.ics là bản xuất của tuần, không phải nguồn nhận cập nhật. Thay đổi sau khi nhập vào ứng dụng lịch không tự sửa/xóa sự kiện cũ; hộp xác nhận nêu rõ trước khi tải. Chưa có đồng bộ Google/Apple/Outlook, lịch qua URL, nhắc tự động hoặc nghiệm thu nhập tệp trong các ứng dụng này.

Giờ +07 chuyển thành UTC trong DTSTART/DTEND, gồm cả buổi đầu ngày có ngày UTC lùi lại. UID theo lớp/mã buổi/ngày; mô tả gồm giảng viên, ngày gốc/lý do học bù. Escape chuỗi và gấp dòng UTF-8 theo byte, CRLF, tránh chèn thêm bản ghi từ văn bản.

## Mã nguồn và dữ liệu

- frontend/app/features/timetable.js thay trực tiếp giao diện cũ, giữ biểu mẫu phân lịch. Không để một trang thời khóa biểu cũ chạy song song.
- shared/timetable-view.js tính tuần, sắp buổi, lọc kết hợp, màu môn và xuất .ics. Bỏ phép chia làn/dải giờ chỉ phục vụ trục giờ cũ.
- theme.css thay các selector trục giờ bằng bảng tuần/ngày/danh sách, giữ CSS biểu mẫu; lizzchat.css chỉnh thanh đầu trang ở màn hẹp.
- components/ui.js cho select lọc bỏ placeholder và thuộc tính required; mặc định select biểu mẫu cũ giữ nguyên.

Không thêm dependency runtime, không đổi CSP, backend hoặc migration 001–013. Không tự thay dữ liệu hiện có. Frontend/backend tiếp tục cùng repository, tách thư mục, JavaScript ES Modules.

## Kiểm chứng và giới hạn

10 ca trong timetable-view.test.js: tuần qua tháng/năm/ngày nhuận, ngày sai, giữ đủ lớp đồng thời, sắp giờ sớm/muộn không sửa mảng nguồn, không kéo buổi tuần khác vào, giờ sai, màu ổn định, tìm không dấu kết hợp lớp/phòng/học kỳ, lớp trùng tên, phòng chưa phân và các ca .ics. Toàn suite 202/202 PASS trên kho tạm/HTTP local/mapping SQL giả lập/Gemini kịch bản.

Chrome kiểm tra component thật với dữ liệu tổng hợp riêng cho bốn vai trò. Quản lý/Nhân viên có phân lịch/phòng; Sinh viên/Giảng viên không có. Đã xem ba lớp cùng giờ, tên dài, học bù, chi tiết, bộ lọc kết hợp, bản xem trước in sáu buổi, tải .ics hai sự kiện/UTC đúng, lỗi tải giữ tuần/tìm kiếm. Mở chat làm panel chuyển sang xem ngày. Chrome zoom đạt bề rộng 674/337 pixel CSS không tràn ngang; các bộ lọc xếp thành hàng riêng; kiểm tra cột thẻ desktop cùng điểm bắt đầu/chiều rộng.

Cửa sổ in hệ thống không xuất hiện khi gọi window.print trong môi trường này. Có kiểm tra HTML xem trước; chưa thể xác nhận phân trang PDF/giấy, lặp tiêu đề trên bản nhiều trang hoặc máy in thật. Chưa nghiệm thu mọi route/state/điện thoại thật, đăng nhập + MySQL hay Gemini thật. MySQL từ chối kết nối và AI chưa đủ cấu hình. Không dùng số test hoặc ảnh component để tuyên bố toàn đồ án hoàn tất.

File dựng fixture và bộ chọn vai trò được gỡ trước đóng gói. Còn thiếu kéo/thả, nhiều giảng viên/lớp, xếp lịch tự động, thông báo thay lịch và đồng bộ bên ngoài. Chương trình đào tạo theo phiên bản/nhóm tự chọn vẫn là ưu tiên nghiệp vụ tiếp theo; các phân hệ còn lại xem LOCAL_ROADMAP.md.
