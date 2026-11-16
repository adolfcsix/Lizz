# Chương trình đào tạo và tiến độ học tập

## Phạm vi đã nối

Trang Chương trình đào tạo quản lý từng bản theo ngành, khóa và số phiên bản. Mỗi chương trình có các nhóm học phần bắt buộc hoặc tự chọn; từng học phần giữ mã, tên, tín chỉ và học kỳ dự kiến tại thời điểm lưu. Tín chỉ nhóm bắt buộc bằng tổng tín chỉ các môn; nhóm tự chọn có mức tối thiểu riêng. Một môn chỉ xuất hiện trong một nhóm, tránh tính trùng.

Quản lý/Nhân viên tạo và chỉnh bản nháp trong phạm vi được giao. Chỉ Quản lý công bố. Bản đã công bố không sửa trực tiếp; nút Tạo phiên bản tiếp theo sao nội dung sang bản nháp với số phiên bản chưa dùng. Không tự chuyển sinh viên sang bản mới.

Áp dụng chương trình là thao tác được xác nhận riêng (một hoặc tối đa 50 sinh viên/đợt, xem SO_SANH_VA_AP_DUNG_CHUONG_TRINH.md): đúng ngành/khóa, chưa có chương trình, nhập căn cứ và xác nhận tên/mã người được áp dụng cùng phiên bản. Backend đối chiếu lại version hồ sơ/chương trình trong transaction, kiểm tra quyền và ghi audit. Retry cùng mã/nội dung trả lại kết quả cũ; nội dung khác hoặc gán lần hai bị chặn. Chưa có quy trình chuyển chương trình, nên không ghi đè liên kết cũ.

## Vai trò

| Vai trò | Quyền |
| --- | --- |
| Quản lý | Tạo/sửa nháp, công bố, áp dụng một hoặc nhiều sinh viên, so sánh phiên bản, xem và xuất tiến độ |
| Nhân viên | Tạo/sửa nháp và áp dụng trong ngành/khóa được giao; không công bố; xem tiến độ trong quyền |
| Giảng viên | Xem và xuất danh mục chương trình đã công bố; không đọc tiến độ cá nhân sinh viên qua module này |
| Sinh viên | Xem/xuất tiến độ của chính mình và mở trang lớp học phần; không xem bản nháp hay người khác |

Nhân viên phạm vi hẹp chưa được coi là có đầy đủ lịch sử học tập liên khoa. Kết quả ghi rõ cần đối chiếu, không trả con số tín chỉ còn thiếu như một kết luận đã xác minh. Không mở rộng quyền chỉ để tính đủ báo cáo.

## Tính tiến độ

Chỉ điểm PUBLISHED của đúng sinh viên, đúng thế hệ đăng ký đang hoạt động, đạt ngưỡng đã chốt và có snapshot subjectId/tín chỉ đủ yêu cầu mới hoàn thành học phần. Điểm nháp, chưa đạt, bản ghi cũ sau rút/đăng ký lại không được tính. Nhiều lần đạt cùng môn chỉ tính một lần; tín chỉ tự chọn được ghi nhận tối đa mức yêu cầu của nhóm. Các môn ngoài chương trình không tự bù vào môn còn thiếu.

| Trạng thái học phần | Ý nghĩa |
| --- | --- |
| Đã đạt | Có điểm đạt công bố đủ căn cứ và tín chỉ |
| Đã đăng ký | Có đăng ký hoạt động, chưa có kết quả công bố phù hợp |
| Chưa đạt | Kết quả công bố chưa đạt ngưỡng |
| Chưa ghi nhận | Chưa có đăng ký/kết quả phù hợp trong dữ liệu được đọc |
| Cần đối chiếu | Kết quả cũ thiếu snapshot tín chỉ, ngưỡng/điểm hợp lệ hoặc thế hệ đăng ký |
| Chưa đủ tín chỉ | Đã đạt nhưng snapshot tín chỉ thấp hơn yêu cầu học phần của chương trình |

UNASSIGNED là chưa được gán, không phải tiến độ 0%. NEEDS_REVIEW giữ con số đã ghi nhận nhưng tín chỉ còn thiếu là null, giao diện hiện Cần đối chiếu. Sau khi hồ sơ đổi ngành/khóa, liên kết cũ được giữ và yêu cầu xét lại. Đủ tín chỉ trên màn này không phải quyết định đủ điều kiện tốt nghiệp; còn thiếu các điều kiện và quy trình xét tốt nghiệp.

## Liên kết đăng ký và LizzChat

Sinh viên chưa được gán chương trình tiếp tục dùng quy định đăng ký hiện hành. Sau khi được gán, bước xem trước và lúc xác nhận đăng ký đều kiểm tra môn thuộc chương trình. Không tự hủy đăng ký hoặc điểm cũ. Học ngoài chương trình và chuyển phiên bản chưa có quy trình duyệt ngoại lệ.

Bản xem trước đăng ký và đề xuất đăng ký của AI có mã/phiên bản chương trình nếu đã áp dụng. Fingerprint đề xuất AI bổ sung id/version của chương trình và liên kết áp dụng, nên đề xuất cũ phải chuẩn bị lại nếu các căn cứ này đổi. Công cụ lookup_curriculum_progress chỉ đọc, giới hạn Quản lý/Nhân viên/Sinh viên. Nếu chưa rõ người cần tra phải hỏi mã chính xác, không chọn ngầm hồ sơ đầu tiên. AI không tự tạo/công bố/gán/chuyển chương trình hoặc kết luận tốt nghiệp.

## Mã nguồn và API

| Thành phần | File / endpoint |
| --- | --- |
| Giao diện | frontend/app/features/curriculum.js, route #curriculum |
| Dịch vụ | backend/local/modules/curriculum/curriculum.service.js |
| Controller | backend/local/modules/curriculum/curriculum.controller.js |
| Danh sách/nháp | GET/POST /api/v1/curricula; PATCH /api/v1/curricula/:id |
| Công bố | POST /api/v1/curricula/:id/publish |
| Áp dụng | POST /api/v1/curricula/assignments |
| Tiến độ | GET /api/v1/curricula/students/:id/progress |
| AI | ai.tools.js, ai.service.js, ai.actions.js; chat-context.js |
| Kiểm thử | tests/local/curriculum.test.js |

CRUD giữ trong một module, không thêm trang chương trình giả hoặc bản code cũ chạy song song. CSS nối vào theme chung, icon nét mảnh và Noto Sans; bảng học phần có vùng cuộn được đặt tên và nhận focus bàn phím. Xuất CSV của nội dung chương trình/tiến độ đang xem, có mã người và phạm vi xác minh.

## Cập nhật database

Sao lưu DB trước, dừng backend cũ rồi chạy npm run db:migrate từ gốc repository. Gói này yêu cầu migration 014_curricula.sql; không sửa hoặc bỏ qua migration 001–013. Sau khi migration thành công mới khởi động backend mới. Nếu DB đã có bảng trùng tên khác cấu trúc, phải đối chiếu schema trước, không xóa bảng để chạy tiếp.

014 thêm curriculum_versions và student_curricula, MySQL 8.0.16+, InnoDB, utf8mb4/utf8mb4_unicode_ci. Có khóa ngoại tới ngành/khóa/sinh viên/tài khoản và chương trình; unique sinh viên chỉ gán một bản, unique mã/phiên bản/ngành/khóa. Nhóm và danh sách môn được giữ trong groups_json để lưu snapshot trọn phiên bản. Tham chiếu subjectId bên trong JSON được kiểm tra ở service, không phải khóa ngoại vật lý MySQL. Không sửa môn thuộc bản đã công bố qua API môn học.

Không tạo chương trình hoặc gán hàng loạt tự động cho DB hiện có. DDL MySQL tự commit; không tuyên bố rollback toàn migration. Transaction nghiệp vụ và audit được kiểm thử rollback; hành vi khóa nhiều kết nối MySQL thật chưa được nghiệm thu.

## Bằng chứng và phần còn thiếu

25 ca mới kiểm tra dữ liệu nhóm, snapshot, trùng/stale, quyền công bố, giữ bản công bố, danh mục đổi, rollback audit, xác nhận/đúng đối tượng, retry/tranh gán, bản mới không tự áp dụng, tính lặp/tự chọn, điểm thiếu căn cứ, đổi ngành/khóa, riêng tư, giới hạn đăng ký, phạm vi Nhân viên, AI/fingerprint, SQL bind/JSON, HTTP từ tạo nháp đến áp dụng. Toàn suite 227/227 PASS trên kho tạm/HTTP local và mapping SQL giả lập.

Chrome dùng component thật với dữ liệu tổng hợp. Đã xem chương trình Quản lý, form nhóm tự chọn, báo lỗi version giữ form, chi tiết bản công bố, Giảng viên chỉ có bản công bố, Nhân viên không có nút công bố, hộp xác nhận Quản lý, tiến độ Sinh viên 6/9 tín chỉ, xuất CSV 4 học phần, gợi ý LizzChat đúng trang. Zoom Chrome 674/337 pixel CSS không tràn ngang toàn trang; bảng có cuộn riêng. Đây không phải đăng nhập + DB thật hay iPhone/Safari thật; không xác nhận CRUD giao diện đã chạy với MySQL từ ảnh component.

Còn thiếu: chuyển chương trình có phê duyệt; môn thay thế/tương đương, miễn/công nhận; điều kiện đồng thời; xếp loại/cảnh báo; xét tốt nghiệp. MySQL migration 014, lưu qua khởi động lại, tranh chấp nhiều kết nối, Gemini thật và các thiết bị thật chưa được nghiệm thu. LizzChat đã có công cụ mới nhưng chưa thể kết luận mô hình thật hiểu đầy đủ các cách hỏi.

Sau đợt yêu cầu hồ sơ: bộ kiểm thử hiện hành là 251/251; yêu cầu DB đến migration 015. Các con số 227/25 ca phía trên ghi lại phạm vi kiểm chứng riêng đợt chương trình. Xem QA_HIEN_TAI.md cho trạng thái mới nhất.

Hiện hành: đã bổ sung so sánh hai phiên bản, áp dụng theo đợt có đối chiếu, CSV và LizzChat đọc so sánh. Gói dùng migration 017; tổng 276/276 test PASS có phạm vi. Xem SO_SANH_VA_AP_DUNG_CHUONG_TRINH.md và QA_HIEN_TAI.md; các số liệu cũ phía trên là lịch sử của đợt đầu chương trình.


## Công nhận học phần hiện hành

Tiến độ nhận quyết định đã áp dụng và còn phù hợp chương trình; hiện Đã công nhận tín chỉ, không tạo điểm/GPA và không cộng trùng với môn đã đạt. Phiên bản mới cùng chương trình/ngành/khóa chỉ tiếp tục sử dụng khi học phần/tín chỉ tương thích. Công nhận không phải tự quy đổi môn hoặc miễn theo chứng chỉ. Chuyển phiên bản đã được bổ sung ở migration 020; công nhận cơ bản ở 026, thay cho nhận định thiếu trong mục lịch sử trước.

Xem CONG_NHAN_HOC_PHAN.md để biết luồng, API, giới hạn và bằng chứng.
