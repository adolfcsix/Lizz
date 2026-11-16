# Học lại, cải thiện điểm và lịch sử học phần

Phần này nối trực tiếp vào đăng ký học phần đang có, không tạo một nơi đăng ký trùng. Sinh viên mở lớp, xem căn cứ rồi xác nhận. Học kỳ phải có quy chế do người có quyền lưu thì hệ thống mới xác minh loại lượt học. Các số 2 lượt hoặc ngưỡng 8 xuất hiện khi mở biểu mẫu chỉ là giá trị khởi tạo để người ban hành sửa, chưa phải quy chế đã áp dụng.

## Phân công

| Vai trò | Thao tác đã nối |
| --- | --- |
| Quản lý | Ban hành/sửa quy chế theo học kỳ, có căn cứ, xem trước và xác nhận; tra lịch sử từng sinh viên |
| Nhân viên | Tra lịch sử sinh viên trong khoa/khóa được giao. Chỉ Nhân viên có phạm vi toàn trường được sửa quy chế chung |
| Giảng viên | Danh sách lớp được giao hiển thị loại lượt học. Không được đọc toàn bộ lịch sử riêng của sinh viên hoặc sửa quy chế |
| Sinh viên | Tra lịch sử của mình, lọc theo môn từ lớp học phần, xuất CSV và đăng ký theo điều kiện được kiểm tra tại lúc ghi |

Quyền được kiểm tra ở API và LizzChat, không chỉ ẩn nút. Đổi role/thu hồi phạm vi làm phiên hoặc thao tác cũ mất hiệu lực theo cơ chế hiện có.

## Cách đối chiếu

| Tình huống | Kết quả khi học kỳ đã có quy chế |
| --- | --- |
| Không có lượt trước đang hiệu lực cùng môn | Học lần đầu |
| Các lượt trước đủ căn cứ đều chưa đạt | Học lại |
| Có ít nhất một lượt trước đã đạt | Cải thiện điểm; lấy điểm đạt tốt nhất để đối chiếu ngưỡng, không dùng một lần trượt sau đó để né điều kiện |
| Điểm tốt nhất đúng bằng ngưỡng cho phép | Được xét tiếp; vượt ngưỡng thì chặn |
| Điểm chưa công bố, khác phiên bản lượt đăng ký, thiếu ngưỡng đạt, ngày sai hoặc lớp chưa kết thúc trước ngày bắt đầu lớp mới | Chưa đối chiếu được; chặn và hướng dẫn liên hệ cán bộ |
| Lượt đã rút | Không cộng vào số lượt hoàn tất; vẫn hiện trong lịch sử nếu bản ghi còn có trong hệ thống |
| Vượt tổng số lượt hoặc loại lượt học đang bị đóng | Chặn xác nhận |

Tổng số lượt gồm các lượt hoàn tất có điểm công bố đủ căn cứ và lượt sắp đăng ký. Điểm công bố dùng ngưỡng đạt đã lưu tại chính lượt đó, không lấy ngưỡng hiện tại sửa lại kết quả cũ. Các điều kiện về chỗ, đợt, tín chỉ, tiên quyết, lịch và chương trình tiếp tục được kiểm tra riêng. Tiên quyết cũng được bổ sung kiểm tra đúng phiên bản lượt đăng ký.

**Học kỳ chưa cấu hình:** giữ hành vi đăng ký hiện hành, lưu loại `UNVERIFIED` và hiển thị chưa xác minh; không tự suy thành học lần đầu. Cán bộ cần ban hành quy chế trước khi dùng phần kiểm soát học lại/cải thiện chính thức. Không backfill hoặc đổi loại lượt học cũ sau khi ban hành.

## Xác nhận và dữ liệu

Màn đăng ký hiển thị loại lượt học, số lượt, lớp/điểm đã công bố và lý do chặn. API tính lại điều kiện trong giao dịch; mã đối chiếu ràng buộc hồ sơ, lớp, học kỳ, quy chế, các lượt học và điểm nguồn. Thay đổi nguồn sau lúc mở màn xác nhận trả lỗi 409, không âm thầm ghi theo dữ liệu mới. Yêu cầu lặp đã ghi trả kết quả đã lưu, không đổi snapshot theo quy chế mới.

`study_attempt_policies` giữ quy chế hiện tại theo học kỳ; audit giữ trước–sau mỗi lần sửa. `enrollments.study_mode` và `study_snapshot_json` giữ loại và căn cứ lúc đăng ký. Điểm cũ không bị xóa hoặc ghi đè bởi lần học mới; GPA vẫn theo cơ chế chọn điểm/quy đổi hiện có, không thay công thức trong đợt này.

Lịch sử chỉ trả điểm đã công bố, đúng phiên bản đăng ký hiện tại; điểm nháp/gửi không xuất hiện trong API/CSV/AI. API không trả số điện thoại, ảnh hoặc mật khẩu. Hiện đây là lịch sử các bản ghi đăng ký còn trong hệ thống, chưa phải sổ bất biến lưu mọi lần rút–đăng ký lại trong cùng một lớp; không dùng để kết luận tốt nghiệp hay công nhận tín chỉ.

LizzChat có `lookup_study_history` cho Sinh viên và cán bộ trong quyền, hỏi mã sinh viên chính xác nếu thiếu. `prepare_course_registration` dùng cùng phép đối chiếu và ghi căn cứ vào đề xuất; chỉ thực hiện qua bước xác nhận sẵn có. Không có công cụ AI tự ban hành quy chế hoặc sửa điểm. Quyền giáo viên không được mở rộng từ yêu cầu trong hội thoại.

## Nâng cấp và kiểm tra

1. Sao lưu DB và dừng backend cũ.
2. Chạy `npm ci`, kiểm tra `.env` theo README, rồi `npm run db:migrate`. Gói này thêm `019_study_attempts.sql`; giữ nguyên migration 001–018.
3. Khởi động `npm start`. Quản lý vào Đợt đăng ký và điều kiện → Học lại và cải thiện điểm, lưu quy chế đúng học kỳ có xác nhận.
4. Kiểm tra trên bản sao: học lần đầu, học lại, cải thiện, vượt ngưỡng, điểm chưa công bố, đổi quy chế lúc đang xác nhận, retry và bốn role. Kiểm tra lại sau khởi động backend và với nhiều kết nối MySQL.

Đã đạt 305/305 test Node: 17 ca mới về phân loại, quyền, xác nhận, dữ liệu cũ, giới hạn, stale source, retry/đồng thời trong kho tạm, rollback audit, tiên quyết, mapping SQL, HTTP/Origin và AI có kịch bản. Kiểm tra nguồn: 134 JS, 554 import, 0 lỗi.

Đã rà component thật bằng fixture tổng hợp: đăng ký học lại/cải thiện, căn cứ điểm, trạng thái bị chặn, lỗi ghi 409, lịch sử/CSV, quy chế/xác nhận/khóa biểu mẫu, Nhân viên phạm vi hẹp và roster Giảng viên. CSV tải được, 2 dòng đúng loại/điểm; không xuất điểm chưa công bố. Chrome zoom khung 340 px CSS, chiều rộng nội dung 337 px, hộp thoại nằm trong khung, bảng cuộn ngang riêng và nút xác nhận tiếp cận được. Chưa phải iPhone/Safari hoặc UI ghi DB thật.

MySQL thật đang BLOCKED do kết nối bị từ chối; Gemini chưa đủ cấu hình. Migration 019, lưu bền, khóa nhiều kết nối và hội thoại mô hình thật chưa được nghiệm thu. Luồng này chưa có hồ sơ xin học lại nhiều cấp, thi lại, bảo lưu, miễn/tương đương/công nhận hoặc chuyển ngành/chương trình khác. Chuyển phiên bản cùng chương trình có duyệt đã được bổ sung, xem CHUYEN_PHIEN_BAN_CHUONG_TRINH.md. Các việc còn lại tiếp tục nằm trong LOCAL_ROADMAP.md.
