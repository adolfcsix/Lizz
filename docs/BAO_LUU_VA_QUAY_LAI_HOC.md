# Bảo lưu và quay lại học

Phần học vụ mới cho phép Sinh viên gửi yêu cầu của mình, Nhân viên kiểm tra trong khoa/khóa được giao, Quản lý phê duyệt, rồi người kiểm tra hoặc Quản lý áp dụng quyết định. Các bước có xác nhận riêng; gửi yêu cầu hoặc duyệt chưa làm thay đổi trạng thái học.

## Luồng xử lý

| Trạng thái | Người thao tác | Bước tiếp theo |
| --- | --- | --- |
| Chờ kiểm tra | Sinh viên của mình hoặc cán bộ trong quyền gửi | Nhân viên/Quản lý kiểm tra căn cứ |
| Chờ Quản lý duyệt | Người kiểm tra xác nhận đã đối chiếu | Quản lý khác người gửi và người kiểm tra duyệt |
| Đã duyệt, chưa áp dụng | Người kiểm tra Nhân viên còn quyền hoặc Quản lý | Xác nhận áp dụng đúng quyết định |
| Đã áp dụng | Chỉ đọc lịch sử | Muốn thay trạng thái phải lập yêu cầu ngược lại |
| Đã từ chối/đã hủy | Chỉ đọc lịch sử | Lập hồ sơ mới nếu còn nhu cầu |

Quản lý có thể từ chối trước duyệt hoặc hủy yêu cầu chưa áp dụng. Người gửi chỉ hủy khi còn chờ kiểm tra. Nhân viên không được phê duyệt; Sinh viên không được tự kiểm tra, duyệt hoặc áp dụng. Nếu Quản lý vừa gửi hoặc kiểm tra hồ sơ thì cần Quản lý khác phê duyệt. Giảng viên không có API/menu hoặc công cụ AI đọc lý do riêng tư của hồ sơ này.

Mỗi bước giữ người thao tác, thời điểm, lý do, phiên bản và trạng thái trong lịch sử. Tên tại bước xử lý được giữ để cán bộ phạm vi hẹp đọc được người đã duyệt, không cần mở quyền quản trị tài khoản. Có tìm kiếm, lọc, phân trang, CSV danh sách đang lọc và xem các lớp đăng ký được giữ nguyên.

## Khi nào ảnh hưởng đăng ký

Chỉ quyết định **đã áp dụng** mới có hiệu lực:

- Bảo lưu chuyển sang `ON_LEAVE`, chặn đăng ký lớp mới qua giao diện, API và công cụ chuẩn bị đăng ký của LizzChat.
- Quay lại học chuyển sang `ACTIVE`, nhưng không giữ chỗ, tự ghi danh hoặc bỏ qua điều kiện đợt/chỗ/lịch/tín chỉ/tiên quyết/chương trình/học lại.
- Không tự rút lớp đã đăng ký, xóa điểm, thay chương trình hoặc miễn/hoàn học phí. Rút lớp vẫn theo hạn và điều kiện hiện có; điểm đã gửi/công bố vẫn chặn tự rút.
- Không khóa tài khoản, cấm xem điểm hoặc xóa lịch sử. Sinh viên vẫn theo dõi hồ sơ và công nợ của mình.

Quyết định có hiệu lực từ thời điểm áp dụng. Học kỳ được chọn là căn cứ hồ sơ, không phải lịch tự bắt đầu/kết thúc bảo lưu. Chưa có hẹn ngày hiệu lực, tự quay lại, gia hạn, tối đa thời gian bảo lưu hoặc tệp minh chứng/ban hành văn bản ký số. Các chính sách đó cần được xác nhận trước khi xây tiếp.

Hồ sơ chưa từng có quyết định trạng thái trong hệ thống tiếp tục dùng luồng đăng ký cũ. API trả `hasDecision: false`; giao diện không khẳng định đã xác minh trạng thái hành chính của dữ liệu nhập cũ.

## Toàn vẹn dữ liệu và quyền

Bảng `student_status_requests` giữ yêu cầu và kết quả áp dụng. Trạng thái hiện hành lấy theo số thứ tự quyết định đã áp dụng của sinh viên, không đoán từ ngày tháng hoặc hồ sơ đang chờ. Quay lại học chỉ được lập khi đang có quyết định bảo lưu đã áp dụng.

Bản xem trước gắn với hồ sơ, lớp hành chính, học kỳ, trạng thái trước và đăng ký/lớp học phần đang hiệu lực. Nguồn thay đổi sẽ bị chặn khi gửi, kiểm tra, duyệt hoặc áp dụng; Quản lý hủy yêu cầu chưa áp dụng rồi lập lại sau đối chiếu. Điểm thay đổi riêng không làm mất hiệu lực bản đối chiếu vì luồng này không chỉnh điểm hoặc dùng điểm để tự quyết định bảo lưu.

Một sinh viên chỉ có một yêu cầu chưa kết thúc. Kiểm tra trùng trên kho đầy đủ, không để hai người khác nhau tạo hai yêu cầu đang mở cho cùng người. Gửi lặp trả yêu cầu đã lưu; áp dụng lặp không tăng số quyết định hoặc thêm lịch sử. Đăng ký lớp đã ghi thành công trước bảo lưu nếu gửi lại đúng mã cũ vẫn trả kết quả cũ, không bị hiểu thành một đăng ký mới.

Trạng thái yêu cầu, lịch sử, audit và thông báo cùng giao dịch; lỗi lưu phải hoàn tác tất cả. Quyền được kiểm tra lại từ phiên/phạm vi hiện hành. Nhân viên mất phạm vi không còn đọc hoặc áp dụng hồ sơ; Quản lý còn quyền có thể tiếp tục quyết định đã hợp lệ.

Thông báo gửi Quản lý khi có yêu cầu/chờ duyệt; người gửi, Sinh viên liên quan và người kiểm tra nhận cập nhật phù hợp. Tin không chứa lý do riêng tư; khi mở vẫn kiểm tra lại nguồn và quyền. Không có email/push trong đợt này.

## LizzChat

`lookup_study_status` tra trạng thái và tiến trình trong quyền, hỏi mã sinh viên chính xác nếu cán bộ chưa đưa. Sinh viên chỉ của mình; Giảng viên bị chặn. Trả tối đa 50 yêu cầu, tổng số, nguồn và thời điểm. Không đưa lý do riêng tư hoặc snapshot hồ sơ vào kết quả công cụ AI; không suy miễn học phí từ bảo lưu.

Luồng AI đăng ký dùng cùng kiểm tra bảo lưu với API ghi. Fingerprint có các yêu cầu trạng thái để đề xuất cũ cần đối chiếu lại khi nguồn thay đổi. Chưa có công cụ AI ghi bảo lưu/duyệt/áp dụng; các thao tác này thực hiện ở biểu mẫu có căn cứ và xác nhận.

## Sửa quyền Nhân viên ở luồng chương trình

Đợt này sửa lỗi `staff-store.js`: hồ sơ chuyển chương trình đã lọc đúng khi đọc, nhưng thiếu nhánh kiểm tra ghi cho Nhân viên phạm vi khoa/khóa, kèm một nhánh lặp không dùng. Đã bỏ nhánh lặp và cho phép ghi đúng hồ sơ người đó lập trong phạm vi hiện tại. Không mở quyền duyệt cho Nhân viên. Có thêm kiểm thử lập → Quản lý duyệt → Nhân viên theo khoa áp dụng trọn luồng.

## Nâng cấp và kiểm tra

1. Sao lưu DB và dừng backend cũ.
2. Chạy `npm ci`, kiểm tra cấu hình theo README, chạy `npm run db:migrate` để thêm `021_student_status.sql`. Giữ nguyên migration 001–020.
3. Khởi động `npm start`. Mở Bảo lưu và quay lại học, dùng Sinh viên lập yêu cầu → Nhân viên kiểm tra → Quản lý khác người gửi/người kiểm tra duyệt → xác nhận áp dụng.
4. Kiểm tra đăng ký trước và sau bảo lưu, quay lại học, dữ liệu điểm/học phí/lớp cũ, thu hồi phạm vi, nguồn thay đổi, gửi lại và khởi động lại backend trên bản sao MySQL. Thử nhiều kết nối trước khi nghiệm thu.

Đã đạt 338/338 test Node: 16 ca bảo lưu mới và 1 ca bổ sung cho Nhân viên phạm vi khoa ở luồng chương trình. Phủ trạng thái mặc định chưa xác minh, đối chiếu, xác nhận/quyền, nguồn đổi ở bốn mốc, tranh yêu cầu/applied trong kho tạm, replay, lịch sử, rollback, đăng ký/AI, dữ liệu điểm/học phí, thông báo, mapping SQL và HTTP/Origin. Kiểm tra nguồn: 143 JS, 609 import tương đối, 0 lỗi.

Đã rà main/menu/LizzChat và component bằng fixture tổng hợp cho Sinh viên, Nhân viên, Quản lý: lập, quay lại giữ dữ liệu, kiểm tra/duyệt/áp dụng riêng, lịch sử, CSV tải/đọc được, yêu cầu quay lại học và lỗi 409 phục hồi. POST/trạng thái trong browser được mô phỏng từ dữ liệu service; Node HTTP kiểm tra ghi trên kho tạm. Giảng viên bị chặn trong kiểm thử quyền; chưa nghiệm thu mọi trang của role này.

Chrome zoom 340 px CSS: nội dung 337 px, bảng riêng 303/600 px; modal 303 px, bảng lịch sử/bảng lớp cuộn riêng và có tabIndex. LizzChat nằm tách cụm tên/chuông ở các khung đã quan sát. Chưa Safari/iPhone/tablet thật.

MySQL thật vẫn BLOCKED do ECONNREFUSED; Gemini chưa cấu hình đầy đủ. Migration 021, lưu bền, khóa đa kết nối và hội thoại mô hình thật chưa nghiệm thu. Số test không phải kết luận toàn bộ đồ án đã hoàn tất.
