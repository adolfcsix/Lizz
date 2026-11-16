# Đăng nhập và cấp lại mật khẩu

## Cách vào hệ thống

| Người dùng | Thông tin đăng nhập | Không gian sau đăng nhập |
| --- | --- | --- |
| Sinh viên | Mã sinh viên đã liên kết hồ sơ, email hoặc tên đăng nhập được cấp | Hồ sơ, đăng ký, lịch, kết quả và dữ liệu của mình |
| Giảng viên | Email hoặc tên đăng nhập được cấp | Lớp giảng dạy, lịch và kết quả trong nhiệm vụ được giao |
| Nhân viên | Email hoặc tên đăng nhập được cấp | Nghiệp vụ theo phạm vi công việc |
| Quản lý | Email hoặc tên đăng nhập được cấp | Quản lý tài khoản, phân công, duyệt và điều hành |

Hai lựa chọn trên trang đăng nhập chỉ đổi nhãn và hướng dẫn. Máy chủ xác thực tài khoản rồi xác định vai trò. Không gửi lựa chọn giao diện để tự cấp quyền. Giữ một luồng xác thực chung, không nhân bản bốn trang đăng nhập.

Mã sinh viên chỉ dùng khi hồ sơ đã gắn với tài khoản STUDENT. Chưa liên kết thì dùng email/tên đăng nhập. So khớp không phân biệt hoa thường và bỏ khoảng trắng đầu/cuối. Nếu một giá trị đồng thời khớp hai tài khoản khác nhau, máy chủ từ chối chung, không tự chọn một người. Quản trị kiểm tra dữ liệu; người dùng dùng định danh riêng khác đã được cấp. Không đổi mã hoặc xóa dữ liệu tự động để xử lý trùng.

## Cấp và đổi mật khẩu

Tài khoản do Quản lý cấp, có mật khẩu ban đầu. Người nhận đổi mật khẩu trước khi sử dụng hệ thống. Quản trị viên đầu tiên tạo bằng `npm run admin:create` dùng mật khẩu tự đặt, không bắt đổi ngay. Không công khai thông tin tài khoản khởi tạo trong giao diện.

Khi quên mật khẩu, người dùng liên hệ quản trị nhà trường để xác minh. Quản lý chọn Cấp lại mật khẩu ở tài khoản đang hoạt động, nhập mật khẩu tạm thời 12–128 ký tự hai lần, ghi lý do 5–1000 ký tự và đánh dấu xác nhận. Tài khoản bị khóa phải được mở riêng trước; không tự mở qua chức năng này. Tài khoản của chính Quản lý dùng Đổi mật khẩu và kiểm tra mật khẩu hiện tại.

Sau cấp lại, hệ thống băm mật khẩu, tăng version, thu hồi mọi phiên của người nhận và ghi lịch sử trong cùng giao dịch. Giữ nguyên vai trò, phạm vi, hồ sơ và dữ liệu học tập. Mật khẩu không hiển thị lại sau lưu; người cấp chuyển riêng cho người nhận. Không gửi qua LizzChat. Lịch sử chỉ chứa lý do và việc thu hồi phiên, không chứa mật khẩu hoặc token.

Đăng nhập bằng mật khẩu được cấp chỉ mở màn hình thiết lập mật khẩu. API nghiệp vụ, thông báo, phạm vi và AI đều bị chặn đến khi đổi xong; vẫn cho xem phiên, đăng xuất và đổi mật khẩu. Mật khẩu mới phải khác mật khẩu hiện tại, dài 12–128 ký tự và nhập lại đúng. Sau lưu, mọi phiên kết thúc; người dùng đăng nhập lại để vào đúng không gian của mình.

Nếu kiểm tra, version hoặc ghi lịch sử thất bại thì không đổi mật khẩu một phần. Người dùng tải lại trước khi thao tác trên bản ghi đã thay đổi.

## API và dữ liệu

| API | Quyền và kết quả |
| --- | --- |
| POST /api/v1/auth/login | Xác thực bằng username/email/mã sinh viên; trả tài khoản công khai và cookie HttpOnly/SameSite=Strict |
| GET /api/v1/auth/me | Phiên hiện tại, gồm mustChangePassword |
| POST /api/v1/auth/password | Phiên hiện tại, mật khẩu hiện tại/mới/xác nhận; thu hồi phiên sau lưu |
| POST /api/v1/auth/logout | Kết thúc phiên và xóa cookie |
| POST /api/v1/accounts/:id/password-reset | Quản lý; password/passwordConfirm/reason/confirm=true/version; không cho tự cấp lại |

Migration `023_account_password_setup.sql` thêm `accounts.must_change_password`, mặc định FALSE cho dữ liệu cũ, có CHECK 0/1. Adapter MySQL đổi sang boolean ở model. Không sửa migration 001–022, không thay đổi tài khoản có sẵn bằng dữ liệu khởi tạo mới. Sao lưu và thử trên bản sao trước khi cập nhật dữ liệu thật. Dừng backend cũ → `npm run db:migrate` → khởi động backend mới. Không khởi động mã mới trên schema chưa có cột.

Mật khẩu dùng scrypt và salt ngẫu nhiên. Phiên kéo dài 8 giờ như cấu hình hiện có. Mỗi tài khoản/IP tối đa 5 lần thử trong 15 phút, dùng chung cho username/email/mã sinh viên; thêm giới hạn 30 lần/IP. Giữ chỗ trước khi băm để các yêu cầu đồng thời được tính. Giới hạn hiện lưu trong tiến trình, mất khi khởi động lại và chưa dùng chung cho nhiều backend. Sau xác minh mật khẩu, giao dịch kiểm tra lại phiên bản/định danh/quyền trước khi tạo phiên, tránh nhận dữ liệu cũ trong lúc quản trị vừa đổi tài khoản.

## Kiểm tra và phần còn lại

Đã kiểm thử bằng Node/HTTP local: bốn vai trò; giả mạo role trong body; bí danh và trùng định danh; hồ sơ chưa liên kết/sai role; giới hạn lần thử; đổi dữ liệu trong lúc đăng nhập; cấp tài khoản; cấp lại sai quyền/tự cấp lại/thiếu xác nhận/version cũ/tài khoản khóa; thu hồi phiên; bắt đổi mật khẩu; lỗi audit hoàn tác và mapping SQL.

Đã mở trình duyệt để kiểm tra trang đăng nhập, hai hướng dẫn, nút hiện/ẩn khi trường trống, hướng dẫn quên mật khẩu, required validation, trang thiết lập và biểu mẫu cấp lại. Đã rà khung CSS rộng khoảng 1363 px, trung gian khoảng 909/681 px và hẹp khoảng 340 px bằng zoom; không thấy tràn ngang ở ca đã đo. Màn hình thiết lập được kiểm tra qua component và bootstrap thực với tài khoản tổng hợp đang cần đổi mật khẩu, không hiện menu hoặc LizzChat. Biểu mẫu quản lý dùng dữ liệu tổng hợp; thao tác ghi mật khẩu được kiểm thử qua dịch vụ/HTTP, không nhập mật khẩu trong browser.

Chưa kiểm thử điện thoại vật lý/iOS Safari, MySQL migration và ghi bền thật, đa kết nối SQL hoặc xác thực Gemini thật. Chưa có đăng nhập Microsoft/Google, MFA, email khôi phục tự động hay đồng bộ danh tính với trường. Giao diện không đặt nút các dịch vụ chưa cấu hình. Đây là phần hoàn thiện luồng tài khoản, chưa phải tuyên bố toàn bộ hệ thống đã hoàn tất.
