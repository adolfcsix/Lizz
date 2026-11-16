# Đối chiếu học vụ và xếp loại học kỳ

Phần này bổ sung vào trang Điểm và kết quả bằng nút **Đối chiếu học vụ**. Không tạo một menu hoặc một bộ nhập điểm khác. Cán bộ chọn học kỳ, xem sinh viên cần rà soát, kiểm tra căn cứ điểm rồi xuất danh sách; Sinh viên chỉ xem kết quả của mình.

## Quy chế cần nhập

Quản lý hoặc Nhân viên có phạm vi toàn trường được cấu hình theo học kỳ, nhập căn cứ và xác nhận. Nhân viên theo khoa/khóa chỉ đọc trong phạm vi của mình. Giảng viên không có quyền đọc tổng hợp học vụ riêng của sinh viên hoặc sửa quy chế.

| Nội dung | Cách áp dụng |
| --- | --- |
| GPA hệ 4 thấp hơn | Cần rà soát khi GPA gốc nhỏ hơn ngưỡng; bằng ngưỡng không thỏa điều kiện này |
| Tín chỉ chưa đạt từ | Cần rà soát khi số tín chỉ chưa đạt lớn hơn hoặc bằng ngưỡng |
| Kết hợp | Chỉ cần thỏa một trong hai tiêu chí được cấu hình |
| Không áp dụng một tiêu chí | Để trống; phải còn ít nhất một tiêu chí được dùng |
| Xếp loại học kỳ | Nhập 2–10 mức, GPA từ 0 đến 4; mức đầu từ 0, không trùng ngưỡng hoặc tên |

Biểu mẫu không cài sẵn ngưỡng và tên xếp loại của trường khác. Ngưỡng 0 ở dòng xếp loại đầu tiên chỉ là điều kiện bao phủ dữ liệu, không phải một quy chế đã ban hành. Tên/ngưỡng trong các ca kiểm thử là dữ liệu tổng hợp, không tự áp vào DB khi nâng cấp.

Quy chế có phiên bản và căn cứ. Sửa quy chế phải xác nhận; phiên bản cũ bị chặn nếu có người khác vừa thay đổi. Audit giữ trước–sau. Sửa quy chế làm lần đối chiếu sau dùng bản mới, không sửa điểm, GPA đã chốt trong từng kết quả hoặc tự ban hành quyết định hành chính.

## Kết quả đối chiếu

| Trạng thái | Ý nghĩa |
| --- | --- |
| Cần rà soát học vụ | Dữ liệu đủ căn cứ và thỏa ít nhất một tiêu chí đã cấu hình; hiện rõ lý do |
| Đáp ứng tiêu chí | Dữ liệu đủ căn cứ, không thỏa tiêu chí cần rà soát |
| Chưa đủ căn cứ | Còn đăng ký/lớp/điểm/quy đổi chưa xác minh được; không gán GPA 0 hoặc xếp loại |
| Chưa có quy chế | Học kỳ chưa cấu hình tiêu chí; không tự kết luận |
| Chưa có đăng ký | Không có đăng ký đang hiệu lực thuộc học kỳ đã chọn |

Chỉ tính riêng học kỳ được chọn. Kết quả dựa trên mọi đăng ký đang hiệu lực của sinh viên trong kỳ, không dựa vào một trang điểm bị giới hạn. Lớp cần kết thúc theo ngày Việt Nam; điểm phải được công bố, đúng phiên bản lượt đăng ký và có snapshot môn, kỳ, ngày kết thúc, tín chỉ và quy đổi hợp lệ. Có dữ liệu cũ thiếu căn cứ thì để chưa đủ, không lấy tín chỉ hiện tại để bù ngược.

Điểm nháp/gửi, điểm thuộc lượt đăng ký cũ hoặc lớp không xác định không được dùng để kết luận. Không trả điểm chưa công bố trong căn cứ, CSV hoặc AI. Một lớp chưa đủ dữ liệu sẽ chặn việc kết luận từ phần điểm còn lại. Đăng ký đã rút không được tính vào đối chiếu hiện tại.

GPA dùng cùng hàm tổng hợp học kỳ và quy tắc chọn điểm HIGHEST/LATEST đã chốt lúc công bố. Học lại không cộng tín chỉ cùng môn hai lần. Tín chỉ chưa đạt = tín chỉ được chọn để tính GPA − tín chỉ đạt của các kết quả được chọn. Các kết quả trong kỳ dùng quy tắc chọn điểm không thống nhất thì chưa xác minh.

Ngưỡng và xếp loại so sánh số gốc trước làm tròn, bằng tổng điểm nguyên theo tín chỉ. Ví dụ trong kiểm thử, GPA gốc 2,495 hiển thị 2,50 nhưng vẫn thấp hơn ngưỡng 2,50; kết quả có giá trị gốc và căn cứ để đối chiếu, không lấy số hiển thị làm thay số tính.

## Giao diện, báo cáo và AI

Có tìm theo mã/tên, lọc kết quả, phân trang và xem căn cứ từng sinh viên: lớp/môn, điểm công bố, ngưỡng đạt, điểm hệ 4, tín chỉ được chọn hoặc lớp đang thiếu căn cứ. Đổi học kỳ sẽ xóa kết quả cũ; trong lúc tải, chọn học kỳ và nút thao tác bị khóa để không đặt dữ liệu kỳ cũ dưới tên kỳ mới.

CSV xuất toàn bộ danh sách đang lọc, không chỉ trang đang mở. Có học kỳ, trạng thái, xếp loại, GPA hiển thị/GPA gốc, tín chỉ, lý do, ID/phiên bản quy chế và thời điểm dữ liệu. Đây là báo cáo đối chiếu tại thời điểm đọc, chưa phải bản quyết định hoặc hồ sơ đã ký; mở lại có thể thay đổi khi điểm/quy chế thay đổi.

`lookup_academic_standing` của LizzChat yêu cầu mã học kỳ chính xác; cán bộ cần thêm mã sinh viên trong quyền. Sinh viên hỏi của mình không cần nhập mã người khác. Công cụ hỏi lại khi thiếu, trả nguồn/thời điểm, trạng thái và căn cứ. Không có quyền ghi quy chế, sửa điểm hoặc tự đưa ra quyết định cảnh báo.

## Giới hạn hiện tại

Đã có đối chiếu tiêu chí và xếp loại riêng học kỳ. Chưa có hồ sơ cảnh báo chính thức để duyệt/phát hành, đánh số quyết định, mức cảnh báo theo nhiều kỳ liên tiếp, tiêu chí tích lũy/nợ môn theo thời gian, ngoại lệ bảo lưu/miễn tính hoặc điều kiện xét tốt nghiệp. Không tự khóa tài khoản, hạn chế đăng ký, thay học phí hoặc buộc thôi học từ kết quả rà soát.

Sinh viên/cán bộ thấy dữ liệu trong quyền trước khi tìm kiếm. Nhân viên phụ trách sinh viên được đối chiếu đủ điểm công bố của người đó, kể cả học lớp liên khoa; không vì lớp bị lọc phạm vi mà tạo một GPA thiếu môn rồi báo đủ căn cứ. Không trả kết quả của sinh viên ngoài phạm vi. Giảng viên tiếp tục chỉ dùng bảng điểm lớp được giao.

## Nâng cấp và kiểm tra

1. Sao lưu DB và dừng backend cũ.
2. Chạy `npm ci`, kiểm tra `.env` theo README, chạy `npm run db:migrate` để thêm `022_academic_standing.sql`. Giữ nguyên 001–021.
3. Khởi động `npm start`. Từ Điểm và kết quả → Đối chiếu học vụ → Cấu hình quy chế, nhập theo quy chế được duyệt rồi xác nhận.
4. Chọn học kỳ, rà điểm đủ/thiếu, biên ngưỡng, học lại, lớp liên khoa và CSV. Kiểm tra lại sau khi sửa điểm/quy chế, khởi động lại backend và bằng các tài khoản đúng phạm vi trên bản sao MySQL.

Dữ liệu mới nằm trong `academic_standing_policies`, một quy chế mỗi học kỳ. Các kết quả cũ không bị backfill, sửa hoặc xóa. API chính: GET `/api/v1/grades/standing/settings`, POST `/api/v1/grades/standing/policies`, GET `/api/v1/grades/standing?termId=...`.

Đã đạt 355/355 test Node, gồm 17 ca mới: pipeline nhập/gửi/công bố thật trên kho tạm, thiếu cấu hình, biên ngưỡng/làm tròn, thiếu điểm/lượt học/ngày/quy đổi, học lại, phạm vi kỳ/người, quyền cấu hình, class liên khoa, thu hồi phạm vi, audit rollback, tranh tạo quy chế, dữ liệu thay đổi, AI, mapping SQL và HTTP/Origin. Kiểm tra nguồn: 148 JS, 634 import tương đối, 0 lỗi.

Đã rà main/menu và component bằng fixture tổng hợp cho bốn vai trò: lối vào từ trang điểm, cấu hình/khóa input/xác nhận, lỗi 409 phục hồi, cảnh báo/xếp loại/căn cứ, thiếu điểm hoặc quy chế, lọc rỗng/phục hồi, CSV tải và đọc được, Nhân viên khoa không sửa quy chế và Giảng viên không có nút truy cập. GET dùng dữ liệu tạo từ service; POST trong browser mô phỏng lỗi 409. Node HTTP kiểm tra ghi trên kho tạm, không gọi đây là UI ghi MySQL.

Chrome zoom 340 px CSS: nội dung 337 px, modal 303 px, bảng cuộn riêng 257/520 px có tabIndex. Chưa kiểm tra Safari/iPhone/tablet thật.

MySQL thật vẫn BLOCKED do ECONNREFUSED, Gemini chưa cấu hình đầy đủ. Chưa nghiệm thu migration 022, lưu bền/đa kết nối hoặc hội thoại mô hình thật. Các kết quả trên không chứng minh toàn bộ đồ án đã hoàn tất.
