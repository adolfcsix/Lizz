# So sánh phiên bản và áp dụng chương trình theo đợt

## Cách sử dụng

Mở Chương trình đào tạo → Xem chi tiết → So sánh phiên bản. Chọn hai bản cùng mã chương trình, ngành và khóa. Bảng đối chiếu chỉ ra học phần thêm/bỏ/điều chỉnh/giữ nguyên; tên chương trình, tên/loại nhóm, mức tín chỉ tối thiểu, chuyển nhóm, tên/mã môn, tín chỉ và học kỳ dự kiến. Đảo thứ tự nhóm/môn không được tính là đổi yêu cầu học. Có xuất CSV toàn bộ thay đổi. Bảng có vùng cuộn riêng và hỗ trợ bàn phím.

Ở bản đã công bố, chọn Áp dụng cho sinh viên. Tìm theo mã/tên không dấu, lọc lớp, chọn từng hồ sơ hoặc chọn trang hiện tại. Danh sách chia 20 hồ sơ/trang; lựa chọn được giữ khi tìm/lọc/chuyển trang, có đếm các lựa chọn nằm ngoài bộ lọc. Mỗi đợt tối đa 50 hồ sơ. Sinh viên đã có chương trình không được chọn để ghi đè. Thao tác một sinh viên và nhiều sinh viên dùng chung biểu mẫu; form riêng lẻ cũ đã bỏ khỏi giao diện, API riêng lẻ giữ tương thích với chức năng hiện có.

Nhập căn cứ → Đối chiếu danh sách. Máy chủ đọc lại đúng đối tượng và phiên bản, trả rõ hồ sơ đủ điều kiện, đã có chương trình, đã thay đổi, khác ngành/khóa hoặc không có trong quyền. Màn đối chiếu hiển thị mã chương trình/phiên bản, ngành/khóa, căn cứ và từng sinh viên. Chỉ khi tất cả hợp lệ mới mở nút xác nhận. Có hồ sơ lỗi thì toàn đợt chưa được ghi; quay lại kiểm tra danh sách. Backend vẫn kiểm tra lại ở bước xác nhận. Sau khi ghi thành công có danh sách kết quả và xuất CSV.

## Vai trò và liên kết

| Vai trò | So sánh | Áp dụng |
| --- | --- | --- |
| Quản lý | Nháp/công bố trong quyền, cùng chương trình/ngành/khóa | Một hoặc tối đa 50 hồ sơ chưa có chương trình, đúng đối tượng |
| Nhân viên | Cùng thao tác đọc trong ngành/khóa được giao | Cùng quy trình trong phạm vi, không được công bố chương trình |
| Giảng viên | Hai bản đã công bố | Không có quyền áp dụng, không đọc danh sách sinh viên từ API đợt |
| Sinh viên | Giữ màn tiến độ của mình, không mở đối chiếu nội bộ | Không tự áp dụng/chuyển chương trình |

Áp dụng chỉ tạo liên kết chương trình cho người chưa có liên kết. Hồ sơ, ảnh, liên hệ, lớp, đăng ký và điểm cũ giữ nguyên. Đăng ký mới được kiểm tra theo chương trình đã áp dụng; tiến độ đọc cùng liên kết và điểm công bố hiện có. Công bố phiên bản mới không tự thay phiên bản đã gán. Chuyển chương trình của người đã có chương trình vẫn cần nghiệp vụ phê duyệt riêng, chưa nối trong đợt này.

## Kiểm soát dữ liệu

Bước đối chiếu không ghi dữ liệu. Hash đối chiếu gắn với nội dung yêu cầu, người thực hiện/phạm vi, bản chương trình và các hồ sơ/lớp/liên kết hiện tại. Thay đổi sau bước đối chiếu thì phải đối chiếu lại. Ghi toàn bộ liên kết, nhật ký từng sinh viên, bản ghi đợt và nhật ký đợt trong một transaction; lỗi ở bất kỳ bước nào thì hoàn tác toàn bộ đợt.

Mã đợt UUID được giữ khi thử lại cùng nội dung. Gửi lại sau khi mất phản hồi trả kết quả đã ghi, không ghi thêm hoặc đảo dữ liệu mới. Cùng mã nhưng khác người/nội dung bị chặn. Quyền hiện hành được kiểm tra lại cả khi gửi lại; thay phạm vi hoặc các đối tượng ra ngoài quyền thì không trả bản kết quả cũ. Đây là lưu vết đợt qua DB và audit; chưa có màn lịch sử đợt chuyên biệt hoặc nút hoàn tác hàng loạt.

| API | Mục đích |
| --- | --- |
| GET /api/v1/curricula/compare?before=id&after=id | Đọc hai phiên bản và thay đổi trong quyền |
| POST /api/v1/curricula/assignment-batches/preview | Đối chiếu 1–50 hồ sơ; chưa ghi |
| POST /api/v1/curricula/assignment-batches | Xác nhận, đối chiếu lại và ghi toàn đợt |

Nguồn: curriculum-batch.service.js và curriculum.controller.js; biểu mẫu curriculum-tools.js dùng lại từ curriculum.js; quy tắc so sánh nằm trong shared/curriculum-comparison.js. Áp dụng theo đợt gọi lại dịch vụ áp dụng riêng lẻ hiện có bên trong cùng transaction để giữ chung kiểm tra đúng người/đúng chương trình; chưa tối ưu số truy vấn cho dữ liệu quy mô lớn.

## LizzChat

Công cụ compare_curriculum_versions dành cho Quản lý, Nhân viên và Giảng viên. Cần mã chương trình và hai số phiên bản; trùng ngành/khóa thì hỏi thêm. Giảng viên chỉ có bản công bố, Nhân viên theo cùng phạm vi backend. Có nguồn/thời điểm đọc; trả tối đa 50 học phần thay đổi kèm tổng số và cờ giới hạn, hướng người dùng mở bảng đầy đủ khi cần. Chỉ đọc nội dung chương trình; không gửi danh sách sinh viên, không tự áp dụng hoặc chuyển chương trình qua chat. Sinh viên tiếp tục dùng công cụ tra tiến độ của mình. Công cụ đã kiểm tra với lời gọi có cấu trúc, chưa xác nhận mô hình Gemini thật hiểu mọi cách hỏi tự nhiên.

## Nâng cấp và kiểm chứng

Sao lưu DB, dừng backend cũ, chạy npm run db:migrate để thêm 017_curriculum_batches.sql rồi chạy backend mới. Giữ nguyên migration 001–016. Bảng curriculum_assignment_batches có khóa ngoại tới tài khoản và chương trình, kết quả JSON, mã yêu cầu/hash, phạm vi và thời điểm; MySQL 8.0.16+, InnoDB, utf8mb4/utf8mb4_unicode_ci. Migration không tự áp dụng chương trình cho bất kỳ sinh viên nào. DDL MySQL không được coi là hoàn tác trọn gói; đối chiếu schema/backup trước khi chạy với dữ liệu thật.

16 ca mới trong curriculum-batch.test.js đạt: phạm vi, từ chối role sai, thu hồi quyền, đúng 50/vượt 50/trùng, gửi lại, tranh gán, snapshot cũ, lỗi audit hoàn tác, giữ nguyên hồ sơ/đăng ký, Sinh viên đọc đúng liên kết, so sánh và câu hỏi thiếu/trùng của AI, SQL bind, HTTP xác thực/Origin/xác nhận. Tổng suite 276/276 PASS trong kho tạm/HTTP và mapping SQL giả lập; 124 file JavaScript, 502 import tương đối, 0 lỗi.

Giao diện đã rà bằng dữ liệu tổng hợp cho bốn vai trò: chọn ba trang và chặn chọn cả trang vượt 50; giữ lựa chọn ngoài bộ lọc; đối chiếu 19 hồ sơ; khóa xác nhận khi 1 hồ sơ đổi; thông báo lỗi được đưa vào vùng nhìn thấy; màn kết quả và hai tệp CSV. CSV đối chiếu tải thực tế có 7 dòng gồm tiêu đề; CSV kết quả có 19 sinh viên. Màn kết quả dùng phản hồi tạo từ dịch vụ chạy trên kho tạm trong fixture, không gọi đó là UI ghi thành công trên MySQL. API ghi đã được thử riêng bằng HTTP.

Bản khung rộng cuối có dialog 1043/1043 px client/cuộn, bảng 987/987; độ rộng 337 px CSS có dialog 297/297, bảng cuộn trong vùng 257 px và nội dung 520 px. Hai nút xác nhận/quay lại nằm trong khung hẹp. Đây là kiểm tra bằng Chrome zoom, chưa thay kiểm tra điện thoại/tablet/Safari thật. Không đóng gói fixture giao diện.

MySQL hiện ECONNREFUSED, AI chưa đủ cấu hình. Migration 001–017, lưu bền qua restart, khóa đa kết nối và Gemini thật chưa được nghiệm thu. Còn thiếu chuyển chương trình có duyệt, môn tương đương/miễn/công nhận, điều kiện đồng thời và xét tốt nghiệp; các phân hệ thiếu khác giữ trong LOCAL_ROADMAP.md.

Đợt tiếp theo đã bổ sung chuyển phiên bản cho sinh viên đang có chương trình qua hồ sơ có phê duyệt; không dùng áp dụng theo đợt để ghi đè. Xem CHUYEN_PHIEN_BAN_CHUONG_TRINH.md. Chuyển ngành/chương trình khác và hoàn tác theo đợt vẫn chưa có.
