# Lizz University

Hệ thống quản lý đại học viết bằng JavaScript ES Modules. Frontend và backend tách thư mục trong cùng repository; một máy chủ Node.js phục vụ cả giao diện lẫn API. Dữ liệu chính lưu trong MySQL. Không cần build frontend.

## Chức năng

- Bốn vai trò: Quản lý, Nhân viên, Giảng viên, Sinh viên. Tài khoản do nhà trường cấp, không có tự đăng ký công khai.
- Khóa, khoa, ngành, lớp; hồ sơ sinh viên, ảnh, yêu cầu cập nhật, chuyển lớp, bảo lưu và thủ tục sinh viên.
- Chương trình đào tạo, môn học, lớp học phần, đăng ký, môn tiên quyết, học lại/cải thiện và công nhận học phần.
- Thời khóa biểu, điểm danh, điều kiện dự thi, lịch thi, số báo danh, ghế thi và biên bản ca thi.
- Điểm thành phần, GPA, công bố kết quả, phúc khảo và đối chiếu học vụ.
- Học phí, công nợ, ghi nhận thu, công việc, phê duyệt, thông báo và lịch sử thao tác.
- Menu phân nhóm theo quyền, thu gọn thành biểu tượng; CSV, bản xem trước in ở các phân hệ hỗ trợ; LizzChat tích hợp Gemini theo quyền dữ liệu.

Phạm vi chi tiết: [Bản đồ hệ thống](docs/BAN_DO_HE_THONG.md), [Đối chiếu mục tiêu](docs/DOI_CHIEU_MUC_TIEU_GOC.md).

## Phần mềm cần cài

| Phần mềm | Yêu cầu |
| --- | --- |
| Node.js | 24 trở lên, kèm npm |
| Git | Tải và cập nhật mã nguồn |
| VS Code | Mở dự án và chạy Terminal |
| MySQL Community Server | 8.0.16 trở lên khi lưu dữ liệu thật; không dùng MariaDB thay thế |
| Trình duyệt | Chrome, Edge, Firefox hoặc Safari hiện đại |

MySQL Workbench là công cụ quản trị tùy chọn, không thay MySQL Server. Không cần XAMPP, Apache, PHP hay Live Server.

## Tải mã nguồn

```bash
git clone https://github.com/adolfcsix/Lizz.git
cd Lizz
code .
```

Nếu tải ZIP, giải nén rồi mở đúng thư mục có `package.json`. Trong VS Code chọn **Terminal → New Terminal**:

```bash
node -v
npm -v
npm ci
```

## Chạy thử nhanh, không cần MySQL

```bash
npm run demo
```

Mở **http://localhost:3000**. Các tài khoản demo dùng chung mật khẩu `LizzDemo2026!`:

| Vai trò | Tên đăng nhập |
| --- | --- |
| Quản lý | `minh.anh` |
| Nhân viên | `thu.ha` |
| Giảng viên | `hoang.nam` |
| Sinh viên có hồ sơ | `mai.lan` |
| Sinh viên chưa liên kết hồ sơ | `quang.minh` |

Tài khoản được cấp có thể phải đổi mật khẩu trước khi vào nghiệp vụ. Dữ liệu demo nằm trong bộ nhớ: **mọi thay đổi mất khi dừng máy chủ**. Demo không giả lập câu trả lời AI. Không cần chạy migration hoặc tạo quản lý MySQL khi dùng demo. Nhấn **Ctrl + C** để dừng.

## Chạy với MySQL để lưu dữ liệu

### 1. Tạo database

Khởi động MySQL Server, mở Workbench hoặc MySQL CLI bằng tài khoản có quyền quản trị:

```sql
CREATE DATABASE IF NOT EXISTS lizz
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'lizz_app'@'localhost' IDENTIFIED BY 'THAY_BANG_MAT_KHAU_RIENG';
GRANT ALL PRIVILEGES ON lizz.* TO 'lizz_app'@'localhost';
```

Nếu user đã tồn tại, dùng thông tin hiện có. Tài khoản cần quyền trên database để chạy migration, không cần cấp quyền toàn máy chủ.

### 2. Tạo file cấu hình

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Điền `.env` theo máy đang dùng:

```dotenv
HOST=127.0.0.1
PORT=3000
APP_ORIGIN=http://localhost:3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=lizz
DB_USER=lizz_app
DB_PASSWORD=THAY_BANG_MAT_KHAU_RIENG
LIZZ_DEMO=false
ADMIN_USERNAME=quanly
ADMIN_NAME=Quan ly Lizz
ADMIN_EMAIL=quanly@example.com
ADMIN_PASSWORD=THAY_BANG_MAT_KHAU_QUAN_LY_RIENG
LIZZCHAT_ENABLED=false
GEMINI_API_KEY=
GEMINI_MODEL=
```

Dùng thông tin quản lý thực tế, mật khẩu 12–128 ký tự. Giá trị có dấu `#` cần đặt trong dấu nháy. Không đưa `.env` hoặc khóa API lên GitHub.

### 3. Tạo bảng và Quản lý đầu tiên

```bash
npm run db:migrate
npm run admin:create
npm run doctor
npm start
```

`admin:create` chỉ dùng khi database chưa có tài khoản. Sau khi tạo thành công, xóa giá trị `ADMIN_PASSWORD` khỏi `.env`. Các tài khoản tiếp theo được cấp trong trang **Tài khoản và phân quyền**.

Mở **http://localhost:3000**, đăng nhập bằng tài khoản vừa tạo. Những lần sau chỉ cần `npm start`. Nếu MySQL lỗi, ứng dụng dừng và không tự chuyển sang dữ liệu demo.

## Cấu hình LizzChat

Lấy API key trong Google AI Studio. Chọn model có hỗ trợ công cụ/function calling và khả dụng cho tài khoản, điền ở backend:

```dotenv
LIZZCHAT_ENABLED=true
GEMINI_API_KEY=DIEN_KHOA_API_CUA_BAN
GEMINI_MODEL=DIEN_TEN_MODEL_KHA_DUNG
```

```bash
npm run ai:check
```

Khởi động lại server sau khi sửa `.env`. Khóa API chỉ nằm ở backend. Việc trả lời phụ thuộc model, quyền truy cập, hạn mức và kết nối nhà cung cấp. Thao tác ghi có bước xác nhận theo luồng được hỗ trợ.

## Các lệnh

| Lệnh | Công dụng |
| --- | --- |
| `npm ci` | Cài dependency theo lockfile, gồm công cụ kiểm tra |
| `npm start` | Chạy với `.env` và MySQL |
| `npm run dev` | Chạy cùng máy chủ local, không tự tải lại mã |
| `npm run demo` | Chạy dữ liệu minh họa trong bộ nhớ |
| `npm run db:migrate` | Áp dụng migration và kiểm tra schema |
| `npm run admin:create` | Tạo quản lý đầu tiên |
| `npm run doctor` | Kiểm tra cấu hình, kết nối và schema |
| `npm run ai:check` | Thăm dò cấu hình/kết nối Gemini |
| `npm test` | Kiểm thử hồi quy Node/HTTP |
| `npm run check` | Kiểm tra cú pháp và import |
| `npm run qa:interface` | Kiểm tra DOM/API, menu và CSV bằng kho tạm |

## Cấu trúc

```text
frontend/app/             Trang nghiệp vụ, component, CSS và API client
backend/local/           HTTP server, cấu hình và nghiệp vụ backend
backend/local/database/  Adapter MySQL, kho demo và migration SQL
shared/                  Quy tắc, định dạng và điều hướng dùng chung
assets/                  Logo, font và ảnh nền
scripts/                 Migration, tạo quản lý, chẩn đoán và công cụ QA
tests/local/             Kiểm thử tự động
docs/                    Tài liệu nghiệp vụ và bằng chứng kiểm tra
```

## Kiểm tra và phạm vi hoàn thiện

Nền mã nguồn đã đạt **515/515 kiểm thử**, kiểm tra cú pháp/import không báo lỗi. QA đã chạy **132 lượt tải trang** theo bốn vai trò với bộ nhớ phiên bình thường/bị chặn và thử các biểu mẫu tạo mới khả dụng. Chạy lại các lệnh kiểm tra trên máy sau khi cài đặt.

DOM không xác nhận vị trí hiển thị, cắt chữ, chuyển động hay mọi nút ở mọi màn hình. Trình duyệt/điện thoại thật, MySQL thật và Gemini thật chưa được nghiệm thu đầy đủ trong môi trường bàn giao. Các phần còn thiếu gồm chia nhiều phòng/thi lại, xét tốt nghiệp, cảnh báo nhiều kỳ có quyết định, danh mục tương đương/thay thế và đối soát tài chính tự động.

## Xử lý lỗi thường gặp

| Hiện tượng | Cách xử lý |
| --- | --- |
| Không tìm thấy `package.json` | Chuyển Terminal vào thư mục gốc của dự án |
| Thiếu module | Chạy `npm ci`; QA giao diện cần cả dev dependency |
| `ECONNREFUSED` | Bật MySQL Server, kiểm tra host/cổng, chạy `npm run doctor` |
| Access denied | Kiểm tra user/password và quyền trên database |
| Schema chưa sẵn sàng | Sao lưu rồi chạy `npm run db:migrate`; không tự sửa checksum |
| `EADDRINUSE` | Dừng tiến trình chiếm cổng hoặc đổi cả `PORT` và `APP_ORIGIN` |
| Ghi dữ liệu bị từ chối Origin | Dùng đúng `APP_ORIGIN`, không trộn `localhost` và `127.0.0.1` |
| Mở từ điện thoại | Cùng mạng LAN, đặt `HOST=0.0.0.0`, `APP_ORIGIN=http://IP_MAY_TINH:3000`, khởi động lại và mở đúng địa chỉ |
| Menu/CSS vẫn cũ | Tải lại bằng Ctrl + F5 |
| Tài khoản demo không đăng nhập được | Chỉ dùng tài khoản mẫu trong `npm run demo`; MySQL dùng tài khoản tự tạo |
| Mất dữ liệu sau khi tắt | Đang chạy demo; dùng MySQL nếu cần lưu bền |

## Cập nhật và dữ liệu riêng

Giữ `.env` riêng trên máy và sao lưu database trước khi cập nhật/migration. Không commit dependency cài cục bộ, khóa API, bản dump hoặc hồ sơ sinh viên thật. `.gitignore` đã loại `.env` và `node_modules`. Push mã lên GitHub không tự triển khai website.
