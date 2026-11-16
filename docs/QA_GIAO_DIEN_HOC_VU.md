# Rà giao diện học vụ

Phạm vi là các component đang dùng trong mã bàn giao, kết hợp dữ liệu tổng hợp từ dịch vụ trên MemoryStore và API giả riêng cho ca kiểm tra. Không sử dụng tài khoản người dùng thật và không ghi hồ sơ thật. Đăng nhập + MySQL không thuộc bằng chứng này.

| Khu vực | Kết quả | Đã quan sát |
| --- | --- | --- |
| Nhận diện | PASS cho màn đã xem | Logo trắng trên menu mận, UNIVERSITY sát logo; Noto Sans, màu nút và trạng thái thống nhất; trang đăng nhập giữ ảnh campus và logo |
| Thời khóa biểu Quản lý/Nhân viên | PASS cho ca đã thử | Lịch theo ngày, bảng phân lịch, hai buổi định kỳ cùng phòng và buổi học bù hiển thị ngày gốc/lý do |
| Biểu mẫu phân lịch | PASS cho ca đã thử | Mở lịch CSDL01, thêm rồi bỏ buổi, danh sách buổi gốc cập nhật, nhập lý do, xem xác nhận và quay lại; không khẳng định đã lưu vào MySQL |
| Sinh viên | PASS cho ca đã thử | Chỉ lịch các lớp đang đăng ký, không có nút phân lịch/quản lý phòng; bỏ tab đơn lẻ không có lựa chọn khác |
| Tìm lịch | PASS cho ca đã thử | Nhập chuỗi không có kết quả hiện empty; xóa tìm kiếm khôi phục lịch; bảng ngoại lệ vẫn giữ trong phạm vi dữ liệu đã được phép |
| Giảng viên / điểm danh | PASS cho ca đã thử | Chọn CSDL01, ngày gốc 16/11 không có buổi; ngày học bù 17/11 chọn đúng 09:00–11:00, A101. Chưa gửi điểm danh trong trình duyệt |
| Đợt đăng ký | PASS cho ca đã thử | Nhập khoa CNTT–Khóa 70, thời gian Việt Nam, xem xác nhận rồi lưu vào fixture; bảng hiện đối tượng và Chưa đến giờ mở |
| LizzChat | PASS cho bố cục đã xem | Mở khung cạnh trang, bộ lọc chuyển hai cột theo chiều rộng nội dung, không tràn sang chat; thu nhỏ khôi phục trang. Trạng thái chưa kết nối khóa gửi; không kiểm chứng câu trả lời mô hình thật |
| Độ rộng hẹp qua thu phóng Chrome | PASS có giới hạn | Kiểm tra các chiều rộng 770, 674, 449, 337 pixel CSS; ở 674/449/337 không tràn ngang phần trang (scrollWidth bằng clientWidth). Đây là zoom trên desktop, không phải Safari/iPhone thật |
| Thiết bị thật, mọi route/nút/trạng thái | NOT TESTED | Chưa phủ toàn bộ iPhone/Android/tablet, bàn phím ảo, mọi trạng thái mạng/lỗi/loading, Excel hoặc máy in |

Đã sửa trực tiếp bộ lọc thời khóa biểu bị xếp dọc quá rộng; thêm truy vấn theo chiều rộng panel khi mở chat để tránh tràn. Bổ sung tên truy cập rõ cho select dùng chung; rút tên thao tác thành Bỏ buổi học/Bỏ ngoại lệ. Không thêm thư viện runtime, không thay nhận diện hoặc dựng menu giả trong mã bàn giao.

Ảnh kiểm tra được giữ riêng, không đóng vào nguồn ứng dụng. Ba file _qa-ui.html, _qa-ui.js và _qa-fixture.js đã được gỡ trước kiểm tra nguồn và đóng gói. Kết quả hiện hành xem QA_HIEN_TAI.md; các báo cáo trước giữ phạm vi lịch sử của từng đợt.

## Lần rà lưới tuần

Thời khóa biểu đã thay bằng lưới theo tuần và cách xem ngày/danh sách. Đã thử cả bốn vai trò; Sinh viên/Giảng viên không có tab phân lịch/phòng. Đã mở nhóm ba lớp trong cùng giờ và từng thẻ, thấy đúng phòng/giảng viên/ngày gốc học bù; tuần/Ngày chọn/Hôm nay và tìm kiếm vẫn giữ dữ liệu đúng. Khi lỗi tải tuần, trang giữ tuần cũ và bộ lọc; thử lại tải được.

Đã thao tác tải .ics và đọc tệp thực tế do trình duyệt tạo, đúng 2 buổi theo bộ lọc, giờ UTC và cấu trúc kết thúc. Trạng thái trống hiện rõ; hủy xuất đóng hộp kiểm tra. Đã xem Danh sách và quay lại Lưới tuần. Panel cạnh chat và Chrome zoom 674/337px CSS không tràn ngang; ở màn hẹp các ô lọc xếp một cột, ngày có lịch có dấu chấm và ngày chọn có nền mận. Lưới đặt vị trí qua CSSOM, giữ nguyên CSP.

Giới hạn vẫn là fixture, chưa đăng nhập + DB hoặc thiết bị thật. Chưa thử kéo/thả, đồng bộ hoặc nhập tệp vào ứng dụng lịch ngoài. Báo cáo chi tiết: LICH_TUAN_VA_XUAT_LICH.md; toàn suite hiện 200/200.

## Đợt chỉnh bảng tuần không có trục giờ

Đã thay lưới theo giờ bằng cột ngày và thẻ linh hoạt, giữ tên môn dài và ba lớp cùng giờ. Đã kiểm tra component Thời khóa biểu của bốn vai trò, bộ lọc lớp/phòng/tìm không dấu, bỏ lọc, học bù, xem trước in và .ics. Cột thẻ có cùng điểm bắt đầu/chiều rộng; 1348px không tràn ngang; Chrome zoom 674/337px CSS chuyển sang ngày, bộ lọc xếp lại. Nút chat trên màn hẹp đã có vùng riêng trong thanh đầu trang khi cuộn. Bản in hệ thống chưa mở được để kiểm tra giấy/PDF; thiết bị thật và UI+MySQL chưa kiểm tra. Fixture và bộ chọn vai trò không đưa vào ZIP.

## Chương trình đào tạo

PASS cho ca component đã xem: thẻ nháp/công bố, form chọn nhóm tự chọn, lỗi API stale giữ nội dung và mở lại nút lưu; chi tiết snapshot; Quản lý có bước xác nhận công bố; Nhân viên không có nút công bố; Giảng viên chỉ xem bản công bố; Sinh viên tiến độ riêng, 6/9 tín chỉ và còn thiếu 3 trong fixture. CSV tải thực tế có 4 học phần, mã SV001 và trạng thái. Mở LizzChat có hai gợi ý tra chương trình của chính sinh viên. Chrome zoom 674/337px CSS không tràn ngang trang; bảng 600px cuộn trong vùng riêng, có tên vùng và focus bàn phím. Chưa nghiệm thu UI ghi thật với MySQL, mô hình Gemini hoặc thiết bị thật.

## Yêu cầu cập nhật hồ sơ theo vai trò

Đã rà component danh sách/tìm/lọc, chi tiết cũ–mới, lịch sử, xác nhận duyệt, lỗi stale giữ ý kiến; Nhân viên không có nút duyệt, Giảng viên không có menu và nhận lỗi quyền, Sinh viên xem liên hệ sau áp dụng. Form 337px CSS xuống một cột, nằm trong khung; không gọi đây là iPhone thật. Luồng ghi hoàn chỉnh được kiểm tra bằng HTTP/kho tạm, không phải UI+MySQL. Gỡ fixture/bộ chọn role trước đóng gói.
