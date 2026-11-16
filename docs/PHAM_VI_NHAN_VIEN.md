# Phân công dữ liệu cho Nhân viên

Hệ thống vẫn có bốn vai trò Quản lý, Nhân viên, Giảng viên và Sinh viên. Phần này bổ sung phạm vi dữ liệu cho Nhân viên, không tạo thêm vai trò hoặc một bộ nghiệp vụ khác.

## Cách phân công

Quản lý vào **Tài khoản và phân quyền → Phạm vi công việc** trên dòng Nhân viên. Chọn một trong hai cách:

- **Toàn trường:** giữ các quyền nghiệp vụ của Nhân viên trước đây; vẫn không trở thành Quản lý, không được cấp tài khoản/phạm vi hoặc công bố điểm thay Quản lý.
- **Theo khoa / khóa:** thêm một hoặc nhiều khoa; mỗi khoa chọn tất cả khóa hoặc một khóa cụ thể. Không trộn cả khoa và các khóa con của chính khoa đó, không nhập trùng. Danh sách rỗng nghĩa là chưa giao dữ liệu nghiệp vụ, không phải toàn trường.

Nhập lý do, xem lại danh sách trong khung xác nhận rồi xác nhận cập nhật. Máy chủ kiểm tra phiên Quản lý, version tài khoản và danh mục. Thay đổi tăng version tài khoản, thu hồi các phiên đăng nhập, giữ bản ghi phạm vi cũ ở trạng thái không hoạt động và ghi nhật ký. Người dùng đăng nhập lại; hội thoại/đề xuất AI theo phiên quyền cũ không dùng tiếp để ghi dữ liệu.

Tài khoản Nhân viên mới chưa được cấp phạm vi sẽ không mặc định thấy toàn trường. Migration 010 chuyển **Nhân viên đã tồn tại** sang bản ghi ALL rõ ràng để giữ quyền đang dùng; Quản lý cần rà từng tài khoản và thu hẹp theo phân công. Đây là bước giữ tương thích, không phải tự cấp quyền toàn trường cho tài khoản tạo sau nâng cấp.

## Hồ sơ, tài khoản và lớp học phần

Phạm vi hồ sơ sinh viên được suy từ **lớp hành chính → ngành → khoa**, cùng khóa của lớp. Không dùng email để suy ra khoa. Các khoản thu, phiếu và điều chỉnh theo hồ sơ sinh viên đó.

Tài khoản sinh viên chưa liên kết chưa có lớp để suy phạm vi. Quản lý vào **Đơn vị phụ trách**, phân khoa và tùy chọn khóa dự kiến trước khi nhân viên tìm email/tạo hồ sơ. Tài khoản chỉ hiện trong gợi ý nếu thuộc phạm vi; lớp đích cũng phải phù hợp đơn vị dự kiến. Liên kết đã có lấy lớp hành chính hiện tại làm căn cứ, không lấy đơn vị dự kiến để mở rộng quyền. Phân đơn vị tài khoản không tự chuyển lớp hồ sơ.

Giảng viên có thể được phân khoa bằng cùng biểu mẫu, không gắn một khóa sinh viên. Nhân viên theo khoa thấy giảng viên thuộc khoa hoặc đã được phân công giảng dạy/coi thi trong các lớp được quản lý.

Lớp học phần có thêm **Khoa phụ trách / Khóa** để xác định người xử lý. Lớp cũ chưa có đơn vị không được tự đoán từ tên môn hay giảng viên: Quản lý hoặc Nhân viên toàn trường phân bổ trước. Đây là phạm vi phụ trách, chưa phải quy định giới hạn ai được đăng ký học phần.

Nếu lớp có sinh viên ngoài phạm vi khoa/khóa được giao, nhân viên giới hạn không được mở một danh sách bị cắt bớt rồi chốt/công bố nhầm. Lớp đó do Quản lý hoặc Nhân viên toàn trường xử lý. Chưa triển khai cơ chế ủy quyền riêng cho lớp liên khoa.

## Phạm vi đọc và ghi

| Nhóm dữ liệu | Nhân viên theo khoa/khóa |
| --- | --- |
| Khoa/khóa/ngành/lớp | Chỉ các danh mục liên quan; được thao tác lớp thuộc phạm vi. Ngành chỉ được ghi khi được giao toàn khoa đó |
| Khoa, khóa, môn, học kỳ/đợt, tiên quyết, phòng thi, quy đổi GPA dùng chung | Chỉ đọc, không sửa danh mục chung từ tài khoản giới hạn |
| Sinh viên | Tìm/lọc/CSV, gợi ý tài khoản, nhập đợt và sửa trong phạm vi; chuyển lớp vẫn cần hồ sơ duyệt theo quy trình cũ |
| Tài chính | Chỉ khoản thu/phiếu của sinh viên thuộc phạm vi; giữ các giới hạn vai trò cũ về miễn giảm/hủy xác nhận |
| Lớp, thi, điểm danh | Theo đơn vị phụ trách và danh sách sinh viên hợp lệ trong phạm vi; không ghi chéo khoa bằng cách gửi ID khác |
| Điểm | Bảng theo lớp chỉ trong phạm vi. Điểm PUBLISHED của sinh viên thuộc phạm vi vẫn được tổng hợp đủ, kể cả học ở khoa khác; không lộ nháp hoặc roster lớp ngoài phạm vi |
| Công việc, phê duyệt | Việc được giao và đề nghị của chính mình; tài nguyên nghiệp vụ bên trong vẫn cần nằm trong phạm vi |
| Nhật ký | Nhân viên giới hạn chỉ thấy thao tác của mình được ghi trong đúng phiên phạm vi hiện tại; không đọc log Quản lý hoặc lịch sử phạm vi cũ. Quản lý giữ quyền kiểm toán đầy đủ |
| LizzChat | Tìm kiếm, thống kê, chuẩn bị và xác nhận dùng cùng giới hạn; không thay phạm vi qua lời nhắn |

Không tính GPA từ một phần lớp bị lọc mà vẫn báo đủ căn cứ. Luồng tổng hợp chỉ bổ sung kết quả công bố của sinh viên thuộc phạm vi; bảng lớp/điểm nháp vẫn giữ giới hạn riêng.

Nút sửa danh mục chung được ẩn trên các trang của nhân viên giới hạn. API vẫn kiểm tra lại; giấu nút không phải biện pháp phân quyền chính. Trang Tài khoản của tôi hiển thị phạm vi đang nhận.

## Cấu trúc mã và API

`backend/local/modules/access/staff-store.js` bọc kho dữ liệu cho STAFF ở `routeApi`. Lớp này lọc đọc và kiểm tra bản ghi trước/sau khi ghi; transaction nhận một kho bọc mới để kiểm tra quyền hiện hành. `AiService.forActor` dùng cùng lớp khi đọc, chuẩn bị và xác nhận, không thay store của phiên AI khác.

Các kiểm tra toàn vẹn vẫn phải nhìn dữ liệu toàn trường: lịch giảng viên, phòng thi, lịch sinh viên và mã duy nhất. `integrityStore` chỉ được dùng ở các kiểm tra đó và phần lọc kết quả công bố theo chủ sở hữu; không trả kho đầy đủ cho response. Lỗi xung đột không kèm tên/hồ sơ của khoa khác.

Nhật ký và kết quả gửi lại của lệnh giới hạn gắn dấu phạm vi nội bộ. Sau đổi phạm vi không trả lại batch/replay nhạy cảm của phiên trước. Dấu nội bộ không được đưa vào phần mô tả nhật ký trên UI.

| API dưới `/api/v1` | Nội dung |
| --- | --- |
| GET `/access/me` | Phạm vi/khả năng giao diện của người đang đăng nhập; không tự sửa quyền |
| GET `/accounts/:id/access` | Quản lý xem đơn vị, phạm vi và các danh mục để phân công |
| POST `/accounts/:id/access` | Quản lý cập nhật; bắt buộc version, requestId, confirm=true, reason |

Với STAFF, body có allSchools và scopes [{facultyId,cohortId|null}]. Với STUDENT/LECTURER, body có facultyId/cohortId; Giảng viên không nhận cohortId. Các route nghiệp vụ cũ giữ URL, được kiểm tra phạm vi ngay ở biên API. Công cụ `lookup_my_account` bổ sung phạm vi để LizzChat giải thích đúng quyền đang có.

## Database và cập nhật

Migration **010_staff_scopes.sql** thêm bảng `staff_access_scopes`, các trường đơn vị tài khoản, khoa/khóa lớp học phần và dấu phạm vi trong `academic_requests`/`import_batches`. Không xóa tài khoản, hồ sơ, lớp hoặc điểm. Các migration 001–009 giữ nguyên byte.

Dừng server và sao lưu, giữ `.env`, giải nén vào thư mục sạch rồi chạy `npm ci` → `npm run db:migrate` → `npm run doctor` → `npm start`. Rà phạm vi các Nhân viên cũ và phân khoa cho lớp học phần/tài khoản chưa liên kết trước khi chuyển nhân viên sang phạm vi hẹp. Không chạy ứng dụng trong lúc đang nâng cấp schema. MySQL DDL có tự commit; lỗi giữa chừng cần đối chiếu bản sao/schema, không tự sửa checksum hoặc mặc định đã rollback.

Bộ lọc hiện dùng mô hình service/kho chung phù hợp đồ án chạy local, chưa phải SQL row-level security và chưa tối ưu cho lượng dữ liệu lớn. Khi thêm controller hoặc công cụ AI, phải giữ luồng qua staffStore; không gọi kho gốc để né kiểm tra phạm vi.

## Kiểm chứng và giới hạn

- 20 ca staff-scopes.test.js: khoa/khóa, chưa cấp/toàn trường, bảng con, giả ID, batch và mã trùng ngoài phạm vi, xung đột lịch liên khoa, cấp/thu hồi/version/retry, rollback audit, hồ sơ chưa liên kết, log/replay, HTTP, AI chuẩn bị/xác nhận và GPA đủ học phần. Cùng bộ cũ: **141/141 PASS** trên kho kiểm thử.
- Chrome desktop, component thật với fixture độc lập: form phạm vi, lý do và khung xác nhận/quay lại; nút danh mục chung chỉ đọc; danh mục theo phạm vi; khoa/khóa trên form mở lớp. Không cấp quyền hay thay dữ liệu thật bằng fixture; harness đã xóa trước đóng gói.
- SQL 010 trên MySQL rỗng/có dữ liệu, nhiều kết nối và lưu qua khởi động lại: NOT TESTED; doctor vẫn báo kết nối bị từ chối. Không coi mapping SQL giả lập là DDL đã chạy.
- Gemini thật và mọi luồng trên điện thoại/tablet, mọi trạng thái UI: chưa nghiệm thu. Phân quyền theo từng thao tác riêng, ủy quyền có hạn và xử lý lớp liên khoa bằng quyền lớp riêng chưa triển khai.

Phúc khảo/sửa sau công bố đã bổ sung: Nhân viên trong phạm vi được lập và đọc hồ sơ của sinh viên, không đề xuất/phê duyệt/áp dụng điểm. Xem PHUC_KHAO_VA_DIEU_CHINH_DIEM.md. Ưu tiên tiếp là lịch nhiều buổi/phòng/ngoại lệ.

## Liên hệ thời khóa biểu mới

Lịch nhiều buổi, phòng và ngoại lệ đã nối qua dịch vụ dùng chung, xem THOI_KHOA_BIEU.md. Đăng ký/lịch thi đọc ngày thực tế; điểm danh chọn đúng buổi/ngày và giữ giờ/phòng đã mở sổ. Nhân viên theo phạm vi lớp, phòng là danh mục chung chỉ ghi bởi Quản lý/Nhân viên toàn trường. Toàn suite hiện 179/179; SQL/Gemini và giao diện mới trên thiết bị thật chưa nghiệm thu.

## Đợt đăng ký theo đối tượng

Đã bổ sung đợt theo khoa/khóa, lọc theo hồ sơ sinh viên và phạm vi Nhân viên. Đăng ký mới giữ đợt/hạn rút; đợt sau không tự gia hạn đăng ký cũ. LizzChat đọc cùng dữ liệu và kiểm tra lại trước ghi; xem DOT_DANG_KY_THEO_KHOA_KHOA.md. Toàn suite hiện 192/192; DB/Gemini thật chưa nghiệm thu.
