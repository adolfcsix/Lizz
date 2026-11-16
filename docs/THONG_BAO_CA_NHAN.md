# Thông báo cá nhân và liên kết nghiệp vụ

Mỗi tài khoản có hộp thông báo riêng, mở bằng biểu tượng chuông trên thanh đầu trang. Hộp tin có tìm kiếm, lọc nhóm/trạng thái, phân trang 20 mục, đánh dấu đã đọc/chưa đọc từng mục hoặc đánh dấu trang hiện tại đã đọc. Số chưa đọc được tính lại trong quyền hiện hành. Nhóm lọc và menu theo vai trò; không thêm menu thông báo trùng với biểu tượng chuông.

## Những luồng đã nối

| Nghiệp vụ | Người nhận |
| --- | --- |
| Sinh viên gửi/bổ sung yêu cầu liên hệ | Quản lý và Nhân viên đang có phạm vi xử lý sinh viên đó |
| Tiếp nhận, yêu cầu bổ sung, đề nghị duyệt, duyệt/từ chối/hủy hồ sơ | Người gửi, người phụ trách hoặc Quản lý tùy bước; không gửi lại cho chính người vừa thao tác |
| Giao việc, phân công lại, cập nhật tiến độ | Người được giao/người giao còn liên quan; giữ kiểm tra quyền công việc hiện tại |
| Gửi, quyết định và áp dụng hồ sơ chuyển lớp | Quản lý hoặc Nhân viên gửi hồ sơ tùy bước |
| Gửi/trả/công bố bảng điểm | Quản lý, Giảng viên phân công; Sinh viên chỉ có thông báo cho dòng điểm của chính mình thực sự được công bố |
| Công bố/hủy lịch thi | Giảng viên phụ trách/coi thi và sinh viên có đăng ký đang hoạt động theo nguồn còn đọc được |
| Lưu kế hoạch thời khóa biểu | Giảng viên và Sinh viên của lớp liên quan |
| Áp dụng chương trình đào tạo | Sinh viên được áp dụng chương trình |

Thông báo điểm giữ mã dòng điểm và phiên bản lượt đăng ký. Người chưa có dòng điểm được công bố không nhận thông báo công bố chỉ vì cùng lớp. Rút rồi đăng ký lại hoặc bản điểm không còn công bố sẽ không làm lộ thông báo của lượt học cũ. Phạm vi, chủ hồ sơ, phân công giảng dạy/coi thi được kiểm tra lại trước khi trả dữ liệu hoặc đếm chưa đọc. Thông báo không tự cấp thêm quyền cho người nhận.

Hiển thị hạn xử lý/quá hạn của công việc đang liên quan theo ngày Việt Nam; việc COMPLETED không còn đánh dấu quá hạn. Đây là trạng thái lấy từ công việc hiện tại khi mở hộp tin, chưa phải lịch đẩy nhắc hạn tự động.

## Lưu trữ và quyền

Migration 018 thêm bảng notifications, khóa ngoại tới audit_events và accounts; mỗi sự kiện/người nhận là một mục duy nhất. Lưu loại nguồn, ID nguồn, hành động, vai trò người nhận, thời điểm, trạng thái đọc và version. Payload điểm chỉ giữ ID/phiên bản để kiểm tra quyền lượt học, không giữ điểm số. Không sao chép mật khẩu, email liên hệ, địa chỉ, số điện thoại hoặc lý do hồ sơ vào thông báo. Thông tin nhận diện tối thiểu như mã/tên sinh viên, mã lớp hoặc tên công việc được lấy lại từ nguồn sau kiểm tra quyền.

Thông báo được ghi trong cùng transaction với nghiệp vụ và audit; lỗi ghi thông báo làm toàn giao dịch thất bại. Không có chế độ âm thầm bỏ qua lỗi gửi. Gửi lại thao tác nghiệp vụ đã được chống trùng không sinh lại thông báo. Vai trò tài khoản đổi thì thông báo của vai trò cũ không được trả; đổi mật khẩu cùng vai trò vẫn giữ hộp tin. Tài khoản khóa/phiên cũ bị từ chối. Đọc thông báo không thay đổi trạng thái hồ sơ, điểm hoặc quyết định nghiệp vụ.

Quản lý không có API đọc hộp tin của tài khoản khác. API chỉ nhận phiên hiện tại:

| API | Thao tác |
| --- | --- |
| GET /api/v1/notifications?q=&kind=&status=&page= | Hộp tin trong quyền, tổng số và số chưa đọc; lọc unread để xem chưa đọc |
| POST /api/v1/notifications/read | read=true/false và danh sách id/version; tối đa 100 mục, kiểm tra chủ và nguồn, đổi đồng thời hoặc hoàn tác khi có mục không hợp lệ |

Mở mục liên quan sẽ đánh dấu đã đọc thành công trước khi chuyển trang. Đường dẫn do server quy định theo nhóm nghiệp vụ; hiện mở trang phân hệ, chưa tự mở đúng modal/bản ghi. Huy hiệu được cập nhật khi dựng trang, mở/làm mới hộp tin và sau thay đổi trạng thái đọc. Không có WebSocket/SSE, thông báo trình duyệt, email, SMS hoặc ứng dụng điện thoại. Không tự đưa nội dung cũ trước migration vào hộp tin, không tự xóa thông báo và chưa có chức năng lưu trữ/ẩn thủ công.

LizzChat có lookup_my_notifications cho bốn role: chỉ đọc hộp tin của chính tài khoản, nguồn/thời điểm và giới hạn 20 mục/trang; hỏi thông báo chưa đọc ngay trong trang Thông báo. Không nhận accountId khác và không tự đánh dấu đã đọc. Không suy mọi công việc quá hạn trong hệ thống từ danh sách thông báo giới hạn. Adapter Gemini thật vẫn chưa có cấu hình đầy đủ để kiểm chứng hội thoại tự nhiên.

## Mã nguồn và nâng cấp

notification.events.js nhận sự kiện qua hàm audit dùng chung; đã bỏ bản hàm audit lặp trong workflow.service.js. notification.service.js kiểm tra nguồn/quyền và trạng thái đọc; notification.controller.js cung cấp API. notification-labels.js giữ nhãn/nhóm/route dùng chung; notifications.js dựng hộp tin, main.js gắn biểu tượng chuông. Không sửa migration cũ hoặc dựng trang chỉ có dữ liệu tĩnh.

Sao lưu DB, dừng backend cũ, chạy npm run db:migrate để áp dụng 018_notifications.sql rồi khởi động backend mới. MySQL 8.0.16+, InnoDB, utf8mb4/utf8mb4_unicode_ci. Giữ nguyên migration 001–017 và dữ liệu hiện có. Nếu DB có bảng notifications khác cấu trúc, cần đối chiếu schema trên bản sao; không xóa bảng để chạy tiếp. Chưa chạy migration này trên MySQL thật trong môi trường hiện tại.

Kiến trúc store vẫn đọc toàn bảng rồi lọc. Cần chuyển truy vấn theo người nhận/nguồn và tối ưu các truy vấn kiểm tra quyền trước khi dùng dữ liệu lớn. Không lấy số kiểm thử hoặc ảnh giao diện làm bằng chứng về hiệu năng hoặc lưu bền.

## Phạm vi kiểm chứng

12 ca mới trong notifications.test.js: luồng task/hồ sơ, khán giả nhận, phạm vi bị thu hồi, vai trò/phiên đổi, đọc/chưa đọc idempotent/version, nguyên tử khi đánh dấu một trang, lọc/phân trang, lỗi lưu làm rollback, điểm đúng dòng/đúng lượt học, SQL bind, HTTP xác thực/Origin và công cụ AI chỉ đọc. Toàn bộ 288/288 test PASS; 130 file JavaScript và 528 import tương đối, 0 lỗi. Kho tạm, HTTP và mapping SQL giả lập; chưa phải nghiệm thu DB thật.

Đã mở giao diện thật qua main.js bằng fixture dữ liệu tổng hợp cho Quản lý/Nhân viên/Giảng viên/Sinh viên; xem menu/hộp tin riêng, huy hiệu, đọc một trang về 0, lọc chưa đọc ra trạng thái rỗng, lỗi tải được hiển thị và phục hồi, nhóm lọc Sinh viên không có Công việc/Phê duyệt nội bộ. Fixture không được đóng gói. Các thao tác ghi trạng thái qua UI dùng phản hồi giả lập; API ghi được kiểm tra riêng bằng HTTP.

Chrome ở 337 px CSS: document client/scroll 337/337; panel nằm trong 16–321 px, chuông khoảng 168–208 px và LizzChat 279–325 px, nút trong thẻ không tràn. Chưa kiểm tra iPhone/Safari, bàn phím cảm ứng hoặc mọi trạng thái của mọi route.

Doctor: MySQL ECONNREFUSED, Gemini chưa đủ cấu hình. Chưa nghiệm thu migration 001–018, lưu qua restart, cạnh tranh đa kết nối hoặc Gemini thật. Chưa nối thông báo tài chính/phúc khảo và mọi sự kiện của toàn hệ thống; chưa có email/push, lịch nhắc hạn tự động, hộp thông báo chung do cán bộ soạn hoặc backfill lịch sử. Các nghiệp vụ còn thiếu khác giữ trong LOCAL_ROADMAP.md.


Đợt chuyển chương trình thêm nhóm PROGRAM_CHANGE: Quản lý nhận hồ sơ mới; người lập nhận quyết định/hủy; Sinh viên nhận khi áp dụng. Lưu cùng giao dịch và đọc lại quyền nguồn. Mở trang Chương trình, người dùng vào Hồ sơ chuyển chương trình để xử lý, không tự duyệt từ thông báo. Migration 020 và chi tiết tại CHUYEN_PHIEN_BAN_CHUONG_TRINH.md.


Bổ sung STUDY_STATUS: Quản lý nhận yêu cầu/chờ duyệt; người gửi, Sinh viên liên quan và người kiểm tra nhận cập nhật. Không sao lý do riêng tư vào thông báo. Tin mở trang Bảo lưu và quay lại học, không tự duyệt/áp dụng; nguồn và phạm vi được kiểm tra lại. Xem BAO_LUU_VA_QUAY_LAI_HOC.md.
