# Rà soát và ổn định Lizz hiện tại

Ngày: 16/11/2026. Nền: bản hiện tại đã thêm lớp giao diện kính.

## Thay đổi

- Giữ logo, màu thương hiệu, nội dung nghiệp vụ và quyền hiện có; không thêm tự đăng ký. Tài khoản vẫn do nhà trường cấp.
- Nhớ menu mở/thu gọn theo tài khoản trong phiên; chuyển trang không tự mở menu. Nếu bộ nhớ trình duyệt bị chặn, vẫn thao tác bình thường nhưng không nhớ trạng thái.
- Menu di động có vòng Tab/Shift+Tab, Escape/Đóng trả focus, phần nội dung phía sau không nhận focus khi menu đang mở. Trạng thái truy cập được đồng bộ khi đổi kích thước màn hình.
- Hộp thoại chung liên kết tên truy cập với tiêu đề, áp dụng cho các biểu mẫu dùng openEditor.
- Thêm công cụ qa:interface với jsdom là dependency phát triển, không phải dependency runtime. Bộ kiểm tra dùng kho tạm trong bộ nhớ và không kết nối MySQL.

## Kiểm tra

- npm test: 508/508 đạt, 0 lỗi.
- npm run check: 182 file JavaScript, 788 import tương đối, 0 lỗi.
- npm run qa:interface: Quản lý 21, Nhân viên 20, Giảng viên 10, Sinh viên 15 lượt trang; mỗi lượt chạy với bộ nhớ bình thường và bộ nhớ bị chặn, tổng 132 lượt trang.
- Các ca mở lại đăng nhập/đăng xuất, hỗ trợ quên mật khẩu, mẫu thiết lập mật khẩu, menu và hộp thoại nằm trong cùng bộ kiểm tra. Đổi mật khẩu tài khoản demo được thực hiện qua API để mở nghiệp vụ theo đúng điều kiện bắt đổi mật khẩu.
- CSS/logo/font được yêu cầu qua HTTP. Bằng chứng riêng từng vai trò nằm trong qa-interface-*.json.

## Giới hạn nghiệm thu và phần còn thiếu

DOM/jsdom không đo bố cục, vùng bấm, hiệu năng đồ họa hay FPS. Chromium bị môi trường chặn socket và trình duyệt dùng chung không truy cập được server local. Vì vậy chưa nghiệm thu trực quan toàn bộ trang hoặc iPhone thật.

npm run doctor báo ECONNREFUSED do chưa có MySQL/.env hợp lệ. npm run ai:check báo thiếu LIZZCHAT_ENABLED/GEMINI_API_KEY/GEMINI_MODEL. Không khẳng định lưu bền, migration SQL thật hoặc Gemini thật đã đạt.

Các phần nghiệp vụ còn thiếu theo lộ trình hiện tại: chia nhiều phòng/thi lại, xét tốt nghiệp, cảnh báo học vụ nhiều kỳ có quyết định, danh mục tương đương/thay thế và đối soát tài chính tự động. Các chức năng này không được thêm vội trong đợt ổn định giao diện; chưa được coi là hoàn tất. Ưu tiên nghiệm thu MySQL/Gemini thật trước khi mở rộng tiếp các phần này.

## Tái chạy

Cài dependency bằng npm ci, sau đó npm test, npm run check và npm run qa:interface. Lệnh qa:interface ghi lại tám tệp bằng chứng trong docs; có thể chạy riêng node scripts/qa-interface.js STUDENT --blocked. Dữ liệu demo chỉ dùng trong tiến trình kiểm tra và bị hủy khi kết thúc.
