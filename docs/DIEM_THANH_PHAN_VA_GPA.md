# Điểm thành phần và tổng hợp kết quả học tập

Phần này mở rộng luồng điểm hiện có, không tạo một bộ nhập/công bố điểm khác. Mỗi lớp dùng một trong hai cách: nhập tổng kết trực tiếp như trước hoặc nhập thành phần theo trọng số. Không tự chuyển các lớp đã có điểm sang cách tính mới.

## Cách sử dụng

1. Quản lý/Nhân viên mở **Điểm và công bố / Kết quả học tập → Xem bảng điểm → Cấu hình điểm thành phần** khi lớp chưa có bất kỳ bản ghi điểm nào, kể cả điểm của đăng ký đã rút. Nhập 1–10 thành phần: mã in hoa, tên và trọng số nguyên. Mã không trùng, tổng trọng số đúng 100%.
2. Cách tính được khóa ngay khi bắt đầu có điểm. Không thay trọng số rồi ghi đè lịch sử. Lớp có điểm tổng kết cũ vẫn giữ cách nhập cũ; chuyển đổi có kiểm soát cho lớp đã có điểm chưa được triển khai.
3. Giảng viên vào lớp được phân công, nhập đầy đủ điểm 0–10, tối đa hai số lẻ cho mỗi thành phần. Để trống không phải 0. Máy chủ tự tính tổng kết theo trọng số, làm tròn một lần đến hai số lẻ; không tin điểm tổng kết client gửi khi lớp có cấu hình.
4. Lưu nháp → xem tổng kết và điểm quy đổi dự kiến → gửi toàn bảng. Sửa sau khi lưu làm nút Gửi bị khóa đến khi lưu lại. Điểm nháp/đang gửi chưa hiện cho Sinh viên.
5. Quản lý xem toàn bảng, tín chỉ, trọng số và chi tiết quy đổi rồi trả lại có lý do hoặc xác nhận công bố. Dữ liệu tính điểm/quy đổi đổi sau lúc xem làm bản xác nhận cũ hết hiệu lực.
6. Sinh viên xem tổng kết, mở điểm thành phần, điểm chữ/hệ 4 và tín chỉ đã chốt. Bảng tổng hợp có từng học kỳ và tích lũy. Quản lý/Nhân viên chọn sinh viên để tổng hợp; Giảng viên chỉ có điểm của lớp phụ trách, không có công cụ tổng hợp toàn bộ kết quả riêng của một sinh viên.
7. Nút Xuất CSV lấy kết quả trong quyền theo bộ tìm kiếm/học kỳ, gồm mọi trang kết quả; giữ rõ trạng thái điểm. Đây là CSV kết quả, chưa phải bảng điểm chính thức có chữ ký/số văn bản.

## Quy đổi và GPA

Quản lý/Nhân viên chọn **Quy đổi điểm và GPA**, chọn học kỳ đã tạo, quy tắc học lại và từng mức ngưỡng. Mức là điểm thấp nhất được áp dụng, bắt đầu từ 0, không trùng ngưỡng/điểm chữ; điểm hệ 4 từ 0–4 và không giảm khi ngưỡng tăng. Không cài sẵn thang quy đổi của trường khác. Cán bộ phải nhập theo quy chế được duyệt.

Có hai quy tắc cần chọn rõ: lấy điểm tổng kết cao nhất hoặc lần học sau cùng của cùng môn. Lần sau cùng xét ngày kết thúc lớp, sau đó thời điểm công bố và ID để phân xử ổn định. Không lấy ngày người quản lý bấm công bố để biến một lớp cũ thành lần học mới.

GPA = tổng (điểm × tín chỉ) / tổng tín chỉ của các kết quả được chọn; tính riêng hệ 10 và hệ 4, làm tròn đến hai số lẻ. Học lại không cộng tín chỉ cùng môn hai lần trong phạm vi tổng hợp. Tín chỉ đạt là tín chỉ của các lần được chọn có tổng kết đạt ngưỡng đã chốt. Các kỳ có thể có kết quả riêng, nhưng tích lũy sẽ **Chưa xác minh** nếu quy tắc học lại giữa các kỳ không thống nhất.

Chỉ dùng PUBLISHED có đủ ảnh chụp dữ liệu. Thiếu tín chỉ đã chốt, thiếu bảng quy đổi tại thời điểm công bố hoặc thiếu căn cứ thống nhất thì GPA là null và UI hiện “— / Chưa xác minh”. Không lấy tín chỉ hiện tại của danh mục để suy ngược cho điểm cũ; không tự hồi tố bảng quy đổi mới vào kết quả đã công bố. Việc bổ sung quy định sau đó không tự làm GPA cũ xuất hiện.

Khi công bố mới, từng điểm giữ `resultSnapshot`: môn/mã/tên, tín chỉ, kỳ, ngày kết thúc lớp, cấu hình trọng số và quy định quy đổi có ID/version, điểm chữ/hệ 4. Sau đó thay danh mục không làm GPA cũ đổi. Quy định GPA đã dùng khi công bố bị khóa sửa ở cả API và form; học kỳ tiếp theo có quy định riêng. Lớp nhập tổng kết trực tiếp vẫn có thể được quy đổi nếu đã cấu hình quy định trước khi công bố.

GPA này chưa bao gồm môn miễn tính, công nhận chuyển đổi, miễn học, bảo lưu kết quả, các loại lần thi hoặc chương trình theo phiên bản. Chưa có xếp loại/cảnh báo tự động và xét tốt nghiệp; không dùng GPA hiện tại để tự quyết định những việc đó.

## Quyền và API

Mọi API dưới `/api/v1`; ghi phải có phiên và Origin hợp lệ.

| API | Quyền / nội dung |
| --- | --- |
| GET `/grades` | Giữ phạm vi cũ; thêm summaries cho Quản lý/Nhân viên/Sinh viên, Sinh viên chỉ kết quả công bố của mình |
| GET `/grades/settings` | Quản lý/Nhân viên: học kỳ và quy định quy đổi, cờ locked nếu đã dùng |
| POST `/grades/gpa-policies` | Quản lý/Nhân viên; termId, version (0 khi tạo), bands [{minScore,letter,points}], repeatRule |
| POST `/grades/sections/:id/scheme` | Quản lý/Nhân viên; sectionVersion, version, components [{code,name,weight}]; chặn lớp đã có điểm |
| GET `/grades/sections/:id` | Giữ quyền xem bảng; thêm subject, scheme, schemeLocked, gpaPolicy và reviewHash |
| PUT `/grades/sections/:id` | Giảng viên lớp được giao; schemeVersion và rows, mỗi dòng componentScores theo mã nếu có cấu hình, hoặc score nếu nhập tổng kết trực tiếp |
| POST `/grades/sections/:id/submit`, `/return`, `/publish` | Giữ quyền/vòng đời; thêm schemeVersion, gpaPolicyVersion và reviewHash khi gửi từ UI mới |

Công bố lớp có cấu hình thành phần hoặc GPA bắt buộc reviewHash khớp bản đã xem. Hash bao gồm lớp, học kỳ, môn/tín chỉ, cấu hình, quy đổi, đăng ký và điểm. API tổng kết trực tiếp cũ không có cấu hình mới vẫn tương thích; nếu gửi reviewHash thì vẫn kiểm tra. UI bàn giao luôn gửi hash. Gửi lặp cùng mã yêu cầu/nội dung trả kết quả đã ghi, không công bố lần hai. Dữ liệu và audit cùng giao dịch; lỗi audit rollback nghiệp vụ.

LizzChat có `lookup_academic_summary` cho Quản lý/Nhân viên/Sinh viên. Dữ liệu được lọc quyền trước tìm kiếm, có nguồn và thời điểm, giới hạn 50 sinh viên; hỏi GPA của chính mình không cần mã. NOT_VERIFIED phải trả lời thiếu căn cứ, không tự cộng từ một trang tìm kiếm bị giới hạn. Không có công cụ AI sửa quy đổi, nhập/công bố điểm hoặc quyết định tốt nghiệp.

## Dữ liệu và nâng cấp

Migration **009_grade_components.sql** thêm `grade_schemes`, `gpa_policies` và ba cột nullable trong `grade_records`: component_scores_json, scheme_version, result_snapshot_json. Dữ liệu cũ giữ nguyên, giá trị mới là NULL; không gán lại điểm cũ hoặc tự sinh GPA. JSON chỉ lưu cấu trúc nghiệp vụ có kiểm tra ở service; SQL tên bảng/cột từ whitelist và giá trị được bind.

Sao lưu trước, giữ `.env`, giải nén gói mới vào thư mục sạch, chạy `npm ci` → `npm run db:migrate` → `npm run doctor` → `npm start`. Migration 001–008 giữ nguyên byte. DDL MySQL tự commit; nếu lỗi giữa chừng phải đối chiếu bản sao/schema, không chạy lại mù quáng hoặc sửa checksum. Chưa áp dụng trực tiếp vào một database QLSV khác schema.

## Kết quả kiểm tra

- 15 ca mới trong grade-components.test.js, toàn bộ bộ hồi quy **121/121 PASS** trên kho kiểm thử và HTTP local. Bao gồm trọng số/quy đổi sai, batch atomic, quyền lớp, đăng ký/version đổi, tổng kết giả, thiếu dữ liệu cũ, snapshot bất biến, retry, học lại, tín chỉ, rollback audit, quyền AI và mapping SQL.
- Chrome desktop qua component thật với fixture độc lập: form trọng số, nhập/lưu tổng kết 7.91 từ 7.35×30% + 8.15×70%, khung gửi, bảng Quản lý, form quy đổi và khóa khi đã dùng, kết quả Sinh viên và mở thành phần. Fixture không phải kết nối MySQL hoặc phiên người dùng thật; đã xóa khỏi gói.
- MySQL DDL 009, nâng cấp rỗng/có dữ liệu, lưu bền và nhiều kết nối: NOT TESTED; doctor vẫn báo ECONNREFUSED. Kiểm tra mapping không thay cho DDL thật.
- Gemini thật: BLOCKED vì chưa có model/key. Công cụ được test bằng provider có kịch bản; chưa nghiệm thu cách hiểu hội thoại thực.
- Mobile/tablet thật, các trạng thái trên mọi thiết bị, file CSV mở bằng Excel và bảng điểm chính thức: chưa nghiệm thu.

Phúc khảo/sửa điểm đã có quy trình riêng, dùng snapshot khi công bố; xem PHUC_KHAO_VA_DIEU_CHINH_DIEM.md. Phần làm tiếp: ủy quyền lớp liên khoa/quyền chi tiết từng thao tác, chương trình theo phiên bản và các phân hệ còn thiếu trong BAN_DO_HE_THONG.md.


Sau bổ sung phạm vi STAFF, nhân viên giới hạn không được sửa bảng quy đổi dùng chung. Điểm công bố của sinh viên thuộc phạm vi vẫn được tổng hợp đủ kể cả ở khoa khác, nhưng không mở nháp hoặc roster lớp ngoài phạm vi. Xem PHAM_VI_NHAN_VIEN.md.


Đợt sau bổ sung Đối chiếu học vụ riêng học kỳ theo quy chế có cấu hình, căn cứ/CSV và AI đọc theo quyền; xem DOI_CHIEU_HOC_VU.md. Không thay công thức GPA hoặc tự đưa ra quyết định cảnh báo/xếp loại tốt nghiệp. 355/355 là kết quả hiện tại; các số kiểm tra phía trên mô tả đợt điểm thành phần trước.
