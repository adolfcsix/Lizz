# Lizz hiện tại — Phân nhánh menu và sửa thanh thu gọn

Ngày: 16/11/2026. Bám theo hai ảnh lỗi người dùng cung cấp.

## Nguyên nhân và cách sửa

Quy tắc cũ của lớp kính cho nhãn ở thanh thu gọn display:inline, opacity:0 và max-width:0. Khi chữ vẫn có thể xuống dòng, nhãn vô hình tiếp tục tạo chiều cao rất lớn. Đây là lý do biểu tượng bị đẩy cách xa nhau trong ảnh. Đã thay quy tắc này bằng display:none, đồng thời cố định hàng biểu tượng 42px, căn giữa và bỏ padding lệch.

Thanh bên dùng bố cục flex với header/footer không co giãn và vùng chức năng flex:1, min-height:0, cuộn riêng. Logo, nút thu gọn và danh tính không bị cuốn vào danh sách dài. Menu mở rộng rộng 260px; thu gọn 76px; drawer điện thoại rộng tối đa 288px.

Biểu trưng thu gọn chỉ hiện vùng chữ L–sách của đúng ảnh logo gốc bằng khung CSS; ẩn wordmark Lizz/UNIVERSITY. Không thay, tạo lại hoặc ghi đè file logo. Nút mở/thu có vị trí riêng và dùng dấu chỉ hướng; di động dùng dấu đóng.

## Phân nhánh

- Tổng quan.
- Điều hành: công việc, hồ sơ phê duyệt.
- Hồ sơ sinh viên: hồ sơ, yêu cầu cập nhật, bảo lưu, thủ tục.
- Đào tạo: tổ chức, chương trình, môn/lớp học phần, đợt đăng ký.
- Học tập và khảo thí: lịch, điểm danh, thi, kết quả, phúc khảo.
- Tài chính.
- Hệ thống: tài khoản, lịch sử, tài khoản cá nhân.

Chỉ nhóm có chức năng được cấp quyền mới xuất hiện. Nhóm nhiều mục có nút mở/đóng và nhớ trạng thái theo tài khoản trong phiên; nhánh chứa trang đang xem luôn được mở khi chuyển trang. Nhóm một mục là liên kết trực tiếp. Thanh thu gọn hiện các biểu tượng liên kết, có title và aria-label; ẩn nút tiêu đề nhóm, giữ đường phân nhóm mảnh. Thông báo giữ nút truy cập trên thanh đầu trang.

## Rà hệ thống

Giữ màu, font, dữ liệu, URL và quyền nghiệp vụ. Chạy lại các trang theo bốn vai trò, gồm đăng nhập/đăng xuất, khôi phục truy cập, thiết lập mật khẩu, menu di động, tên hộp thoại, biểu mẫu tạo mới khả dụng, xuất CSV và tài nguyên chung. Các sửa chống cắt chữ của hiện tại tiếp tục giữ.

- npm test: 515/515 đạt, gồm bốn ca đảm bảo mỗi tuyến được phép chỉ thuộc đúng một nhóm và không lộ trang quản trị cho vai trò khác.
- npm run check: kết quả trong KET_QUA_CHECK.txt.
- npm run qa:interface: kết quả và danh sách trang trong qa-interface-*.json; kiểm tra thêm thao tác mở/đóng nhóm.
- CSS parse: không có lỗi cú pháp.

## Giới hạn

Chưa nghiệm thu pixel/bố cục trên trình duyệt thật do Chromium bị môi trường chặn socket. DOM không đo vị trí hoặc khoảng cách; không khẳng định đã xem toàn bộ trang ở mọi độ rộng. Lỗi từ ảnh được sửa từ nguyên nhân CSS xác định được, cần xác nhận trực quan trên máy chạy ứng dụng. Không thêm tính năng nghiệp vụ ngoài yêu cầu menu trong đợt này.

MySQL/Gemini thật vẫn chưa nghiệm thu do thiếu môi trường/cấu hình. Các phần nghiệp vụ lớn còn thiếu giữ như KIEM_TRA_LUONG.md; không coi hệ thống hoàn thiện tuyệt đối.

## Dùng bản mới

Thay mã nguồn bằng gói mới, giữ file .env và dữ liệu MySQL của máy đang dùng. Chạy npm ci rồi npm start (hoặc npm run demo để kiểm tra tạm). Nếu trình duyệt vẫn dùng CSS cũ, tải lại bằng Ctrl+F5. Không có migration mới.
