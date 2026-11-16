# Ổn định nền tảng Lizz — hiện tại

## Mục tiêu đợt này

Theo thứ tự người dùng chốt ngày 16/11/2026: ưu tiên phần thiếu/sai sẽ khiến web hoặc luồng đã có không hoạt động; kiểm tra MySQL/schema trước, sau đó luồng hiện có, rồi Gemini. Các phân hệ nghiệp vụ chưa triển khai trong DOI_CHIEU_MUC_TIEU_GOC.md được giữ trong lộ trình, không mở thêm ở đợt này.

## Khởi động và database

Server, doctor và admin:create dùng chung bộ kiểm tra trước khi phục vụ/ghi dữ liệu. Bộ kiểm tra đọc 27 migration trong gói, đối chiếu lịch sử/checksum và hợp đồng cuối cùng của 52 bảng (gồm schema_migrations), 474 cột: tên, kiểu/độ dài, nullable, cột generated, engine/collation và các ràng buộc có tên/khóa chính đang hiệu lực. Thiếu migration/bảng/cột, checksum đã sửa hoặc database có migration mới hơn gói nguồn thì dừng với hướng dẫn, không chờ tới lúc người dùng mở trang mới báo lỗi.

Nguồn: backend/local/database/migration-catalog.js, schema.js, server.js, scripts/doctor.js và scripts/database/create-admin.js. Bộ kiểm tra chỉ đọc metadata; không tự chạy migration, xóa bảng, sửa checksum hoặc tạo tài khoản. Tên bảng/cột lấy từ mã nguồn, không nhận SQL từ client.

db:migrate giữ khóa độc quyền, rà toàn bộ lịch sử trước khi thực thi DDL còn thiếu và kiểm tra schema sau khi chạy. File chỉ được ghi hoàn tất sau khi các câu lệnh trong file thành công; khóa/kết nối được giải phóng khi lỗi. DDL MySQL tự commit, vì vậy không tuyên bố rollback toàn bộ một migration bị dở. Chỉ chạy trên bản sao/đã sao lưu, không sửa checksum để bỏ qua lỗi.

APP_ORIGIN được chuẩn hóa: http://localhost:3000/ thành http://localhost:3000, tránh từ chối toàn bộ thao tác ghi chỉ vì dấu / cuối. Chặn origin chứa thông tin đăng nhập, đường dẫn, query hoặc fragment; kiểm tra DB_PORT trước khi kết nối. Server báo lỗi cấu hình/cổng đã dùng gọn, không in mật khẩu hoặc toàn bộ tham số kết nối.

Không có migration mới; 001–027 và tài nguyên nhận diện giữ nguyên. Không thêm dependency runtime.

## Các luồng hiện có

Đã chạy hồi quy tài khoản/phiên, phạm vi, hồ sơ, danh mục, học vụ/đăng ký, lịch, điểm/thi, tài chính, thủ tục, thông báo và điều phối AI. Thao tác của Quản lý được kiểm tra lại trong giao dịch cấp/khóa tài khoản; không dùng quyền đã hết hiệu lực trong lúc yêu cầu chờ băm mật khẩu hoặc chờ ghi. Hai Quản lý không thể dùng hai yêu cầu khóa nhau đồng thời để làm mất toàn bộ tài khoản Quản lý hoạt động. Khóa tài khoản vẫn thu hồi phiên; lỗi ghi nhật ký hoàn tác cả thay đổi và thu hồi phiên.

Client API có giới hạn thời gian, xử lý phản hồi không phải JSON, lỗi mạng và phiên hết hạn. Không tự gửi lại thao tác ghi. Khi kết nối đứt, giao diện yêu cầu kiểm tra trạng thái vì máy chủ có thể đã nhận yêu cầu; không khẳng định dữ liệu chắc chắn chưa ghi. Các lỗi nghiệp vụ/version của máy chủ vẫn được giữ để người dùng xử lý đúng tình huống.

LizzChat dùng bộ nhớ trong trang nếu sessionStorage bị trình duyệt chặn; không để lỗi lưu mã hội thoại làm hỏng đăng nhập/đăng xuất. Nội dung và quyền hội thoại vẫn do backend kiểm tra.

Đã tải 66 lượt trang thuộc bốn vai trò qua DOM jsdom + HTTP local/kho tạm: Quản lý 21, Nhân viên 20, Giảng viên 10, Sinh viên 15. Chạy lại cả 66 lượt khi sessionStorage bị chặn. Tất cả route cho phép tải nội dung, không có HTTP lỗi hay lỗi DOM trong các ca đó. Tài khoản cấp mới đã hoàn tất đổi mật khẩu trước khi rà trang bằng AuthService. Đây là kiểm tra tải trang, không thay kiểm tra mọi nút hoặc bố cục trình duyệt.

Các luồng kế hoạch học phần và thủ tục tiếp tục được thao tác qua component + HTTP: đăng ký/rút, đọc lại tiến độ; soạn/công bố thủ tục, nháp/gửi/bổ sung, liên kết khoản thu, kết quả/bàn giao và CSV. Các hành vi trên được kiểm tra với dữ liệu tổng hợp, không sửa hồ sơ thật.

## Gemini

Đối chiếu Interactions API và vòng function_call/function_result với tài liệu chính thức. Giữ endpoint cố định, store:false, key trong header, các bước/signature phục vụ lượt tiếp theo ở backend. Không đưa key hoặc thought/signature ra giao diện.

Adapter kiểm tra trạng thái hoàn tất/yêu cầu công cụ và cấu trúc từng bước, không nhận failed/incomplete thành câu trả lời thành công. Giới hạn số bước/công cụ/kích thước body; xử lý lỗi kết nối cả lúc gửi lẫn lúc đọc, timeout và quota. Nội dung lỗi thô của nhà cung cấp không được đưa ra UI/log. Không thực thi nghiệp vụ từ phản hồi sai cấu trúc.

Lệnh mới:

    npm run ai:check

Lệnh chỉ gửi câu thăm dò công khai và công cụ echo để kiểm tra vòng gọi công cụ hai lượt; không đọc hồ sơ, không gọi công cụ nghiệp vụ và không ghi database. Chỉ PASS khi model gọi đúng công cụ và nhận lại kết quả. Thiếu LIZZCHAT_ENABLED/GEMINI_API_KEY/GEMINI_MODEL thì dừng, không gọi dịch vụ hoặc trả lời giả. Lệnh có gọi Gemini thật khi được cấu hình, nên vẫn dùng hạn mức API của tài khoản.

Kết nối thành công bằng thăm dò chưa thay nghiệm thu tiếng Việt/bốn vai trò/dữ liệu MySQL. Trong môi trường đợt này chưa có key/model, ai:check dừng đúng lý do; chưa có bằng chứng gọi Gemini thật.

## Cách chạy tại máy có MySQL

1. Giữ riêng .env và sao lưu database; thay mã trong thư mục sạch.
2. Chạy npm ci. Điền DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD và APP_ORIGIN đúng địa chỉ truy cập.
3. Chạy npm run db:migrate. Nếu đã có đủ 001–027 thì lệnh giữ dữ liệu và kiểm tra lại schema.
4. Chỉ với database mới chưa có tài khoản: điền ADMIN_USERNAME/ADMIN_NAME/ADMIN_EMAIL/ADMIN_PASSWORD rồi chạy npm run admin:create; xóa giá trị ADMIN_PASSWORD sau khi tạo thành công.
5. Chạy npm run doctor, npm test, npm run check. Cấu hình LizzChat khi cần và chạy npm run ai:check.
6. Chạy npm start, đăng nhập và kiểm tra luồng thực tế. Không dùng npm run demo để kiểm chứng lưu bền vì kho tạm mất khi dừng.

Chưa có MySQL server/cấu hình .env trong môi trường hiện tại: doctor vẫn ECONNREFUSED. Không dùng hồi quy kho tạm hoặc metadata giả lập để nhận đã nghiệm thu migration/lưu bền/cạnh tranh SQL thật. Các kiểm tra browser/layout, iPhone, gửi/in kết quả thật cũng còn ở trạng thái chưa nghiệm thu.

## Nguồn kỹ thuật đối chiếu ngày 16/11/2026

- [MySQL COLUMNS metadata](https://dev.mysql.com/doc/refman/8.0/en/information-schema-columns-table.html)
- [MySQL TABLE_CONSTRAINTS và CHECK được thực thi](https://dev.mysql.com/doc/refman/8.0/en/information-schema-table-constraints-table.html)
- [Gemini Interactions API](https://ai.google.dev/api/interactions-api)
- [Gemini stateless history và bước model-generated](https://ai.google.dev/gemini-api/docs/interactions-overview)
- [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling)

Bằng chứng lệnh mới nhất ở QA_HIEN_TAI.md và KET_QUA_*.txt/json. Kiểm thử có giới hạn; không kết luận toàn bộ Lizz không còn lỗi hoặc tất cả phân hệ đã hoàn thành.
