# Lizz hiện tại — Rà chữ, bố cục chung và bổ sung xuất lịch thi

Ngày: 16/11/2026. Nền: bản hiện tại.

## Chỉnh giao diện

- Menu mở rộng cho nhãn dài xuống dòng thay vì cắt bằng dấu ba chấm.
- Tên tài khoản ở thanh trên được xuống dòng; thanh tự tăng chiều cao theo nội dung.
- Logo khi thu gọn được co toàn bộ vào khung, không cắt một phần ảnh.
- Tiêu đề, khối thao tác, tiêu đề hộp thoại và phân trang tự xuống hàng; các phần tử con trong grid/flex được phép co lại.
- Số liệu/thông báo/trạng thái dài được ngắt dòng thay vì đẩy nội dung ra ngoài.
- Vùng bảng có giới hạn chiều rộng và nhận focus bằng Tab để cuộn bằng bàn phím.
- Trang lỗi khởi động dùng màu và bề mặt chung của Lizz.
- Giữ nguyên logo gốc, màu nhận diện, dữ liệu và phân quyền. Các chỉnh CSS chỉ áp dụng trên màn hình, không thay CSS bản in.

## Chức năng bổ sung

Xuất CSV trong trang Lịch thi. Với tài khoản quản lý có cả tab Phòng thi, nút xuất chuyển theo tab. Xuất toàn bộ dòng khớp bộ lọc hiện tại qua mọi trang, không chỉ 10 dòng đang hiển thị. Nút ghi số dòng và bị vô hiệu hóa khi không có dữ liệu. Dữ liệu chỉ lấy từ phản hồi API đã giới hạn quyền; Sinh viên xuất số báo danh và ghế của chính mình, không xuất danh sách thí sinh. Tiếp tục dùng bộ xuất CSV chung có BOM tiếng Việt và chặn công thức bảng tính.

## Kiểm tra

- npm test: 511/511 đạt, 0 lỗi.
- npm run check: 185 file JavaScript, 793 import tương đối, 0 lỗi.
- CSS glass.css: phân tích cú pháp và kiểm tra khai báo sau khi thay biến thương hiệu, 0 lỗi.
- npm run qa:interface: kiểm tra xuất CSV qua DOM với 23 dòng, bộ lọc còn 12 dòng, không có kết quả và chuyển tab phòng; kiểm tra trang theo bốn vai trò với bộ nhớ bình thường/bị chặn.
- Bộ rà trang kiểm tra tiêu đề, lỗi tải, ID trùng; thử mở các nút tạo mới khả dụng, kiểm tra tiêu đề/ID hộp thoại rồi đóng mà không gửi biểu mẫu. Không coi đây là kiểm tra mọi thao tác sửa/xóa của mọi biểu mẫu.
- Bằng chứng từng trang nằm trong qa-interface-*.json. Không có dữ liệu cá nhân thật trong các ca này.

## Giới hạn và phần còn thiếu

Chưa thể xác nhận trực quan không mất chữ ở mọi kích thước: Chromium không khởi động được vì socket bị chặn. jsdom không có máy dựng bố cục, không đo được cắt chữ, chồng lớp hay FPS. Các sửa lỗi bố cục dựa trên quy tắc CSS cụ thể; cần nghiệm thu tiếp ở trình duyệt thật, gồm desktop/menu thu gọn, 390px và phóng chữ 200%.

MySQL/Gemini thật vẫn chưa có cấu hình hợp lệ để nghiệm thu. Các nghiệp vụ còn thiếu đã ghi ở KIEM_TRA_LUONG.md (chia nhiều phòng/thi lại, xét tốt nghiệp, cảnh báo nhiều kỳ, tương đương/thay thế và đối soát tự động) chưa được triển khai trong đợt này, không coi toàn bộ hệ thống đã hoàn thành.

## Chạy lại

npm ci, npm test, npm run check, npm run qa:interface. Công cụ giao diện dùng kho demo tạm, không thay dữ liệu MySQL. Báo cáo được ghi trong docs. Cách khởi động ứng dụng giữ như README.

Kết quả rà trang cuối: 132 lượt tải trang, 20 lượt mở hộp thoại tạo mới khả dụng; không ghi nhận ID trùng hoặc lỗi HTTP/DOM trong các ca này.
