# Vai trò và liên kết nghiệp vụ hiện hành

Hệ thống có đúng bốn mã MANAGER, STAFF, LECTURER, STUDENT: Quản lý, Nhân viên, Giảng viên, Sinh viên. Tài khoản do Quản lý cấp; không dùng đăng ký công khai để tự chọn quyền. Bảng mô tả chức năng đã nối, không khẳng định mọi phần của tài liệu đồ án đã hoàn thiện.

| Nghiệp vụ | Quản lý | Nhân viên | Giảng viên | Sinh viên |
| --- | --- | --- | --- | --- |
| Tài khoản, phạm vi | Cấp/khóa, cấp lại mật khẩu, phân quyền | Tài khoản của mình | Tài khoản của mình | Tài khoản của mình |
| Khóa/khoa/ngành/lớp | Quản lý danh mục | Theo phạm vi; danh mục dùng chung có giới hạn | Đọc danh mục phục vụ lớp | Đọc danh mục phục vụ hồ sơ/đăng ký |
| Hồ sơ sinh viên | Tạo/sửa, nhập đợt, xem liên hệ | Theo phạm vi, chuyển lớp phải qua duyệt | Không có trang hồ sơ riêng tư | Xem hồ sơ mình, đề nghị sửa liên hệ |
| Ảnh và bản in hồ sơ | Cập nhật/gỡ, xem lịch sử, đọc/in | Cùng thao tác trong phạm vi | Không đọc hồ sơ riêng tư | Xem ảnh và in thông tin của mình; không sửa ảnh |
| Yêu cầu liên hệ | Tiếp nhận, trả bổ sung, duyệt/từ chối và áp dụng | Tiếp nhận, xử lý, đề nghị duyệt trong phạm vi | Không truy cập | Gửi/bổ sung/hủy và theo dõi của mình |
| Công việc/chuyển lớp | Giao/bàn giao, quyết định duyệt | Việc được giao, lập hồ sơ/chuyển lớp theo duyệt | Không có menu nội bộ | Không tự chuyển lớp |
| Chương trình | Nháp/công bố, gán một hoặc nhiều sinh viên, so sánh | Nháp/gán theo đợt/so sánh trong phạm vi; không công bố | Xem và so sánh bản công bố | Tiến độ chương trình mình |
| Môn/lớp học phần | Quản lý | Theo phạm vi | Lớp phân công, roster trong quyền | Đăng ký/rút và xem của mình |
| Lịch học/phòng | Phân lịch và ngoại lệ | Theo phạm vi | Lịch giảng dạy được giao | Lịch lớp đã đăng ký |
| Quy định đăng ký | Cấu hình học kỳ/đợt/tiên quyết | Theo phạm vi/quy định dùng chung | Đọc quy định cần thiết | Đọc điều kiện, không cấu hình |
| Điểm | Công bố/trả bảng điểm | Đọc trong phạm vi | Nhập/lưu/gửi đúng lớp | Điểm đã công bố của mình |
| Phúc khảo | Duyệt và áp dụng tách bước | Lập/đọc trong phạm vi | Đề xuất theo lớp giao | Yêu cầu của mình |
| Điểm danh/thi | Quản lý/chốt/mở lại theo nghiệp vụ | Theo phạm vi | Lớp/coi thi được phân công | Lịch và kết quả đã chốt của mình |
| Học phí/công nợ | Quản lý, điều chỉnh/xác nhận | Thu/xác minh theo phạm vi; không tự miễn giảm | Không truy cập tài chính sinh viên | Khoản thu của mình, báo chuyển khoản |
| Thông báo | Hộp tin của mình về hồ sơ/việc/bảng điểm | Hộp tin việc/hồ sơ trong phạm vi hiện tại | Hộp tin lịch/điểm theo phân công | Hộp tin hồ sơ/điểm/lịch/chương trình của mình |
| Audit | Xem nghiệp vụ trong quyền | Có giới hạn theo phạm vi/người thao tác | Không có dashboard audit nội bộ | Không có dashboard audit nội bộ |
| LizzChat | Công cụ trong quyền, xác nhận thao tác được hỗ trợ | Cùng phạm vi backend | Tra dữ liệu giảng dạy trong quyền | Tra dữ liệu mình, hỗ trợ đăng ký |

## Những luồng đã liên kết

1. Quản lý cấp tài khoản → Nhân viên tạo hồ sơ gắn email → hồ sơ có lớp/khóa/ngành/khoa → Sinh viên xem thông tin của mình.
2. Nháp chương trình → Quản lý công bố → Quản lý/Nhân viên gán đúng sinh viên → kiểm tra đăng ký → điểm công bố → tiến độ theo nhóm môn.
3. Nhân viên phân lớp/lịch/phòng → Sinh viên đăng ký trong đợt, đủ điều kiện → lịch cá nhân/Giảng viên → điểm danh và lịch thi có kiểm tra xung đột.
4. Giảng viên nhập/gửi điểm → Quản lý công bố hoặc trả → Sinh viên xem kết quả; phúc khảo dùng quy trình riêng, giữ trước/sau.
5. Sinh viên gửi liên hệ mới → Nhân viên tiếp nhận/kiểm tra/đề nghị duyệt → Quản lý duyệt và cập nhật → Sinh viên và cán bộ cùng thấy hồ sơ đã đổi, lịch sử được giữ.
6. Khoản thu phát hành → Sinh viên báo nộp/Nhân viên ghi nhận → xác minh → công nợ và điều kiện thi đọc kết quả; chưa có đối soát ngân hàng thật.

7. Quản lý/Nhân viên đối chiếu ảnh → xem trước và xác nhận → lưu ảnh mới + nhật ký + tăng phiên bản cùng giao dịch → Sinh viên đọc ảnh qua phiên đăng nhập. Gỡ ảnh chỉ bỏ liên kết đang dùng, không xóa ảnh cũ.

Menu không thay kiểm tra quyền API. Role được lấy từ phiên server; biết ID không đồng nghĩa được đọc/sửa. Không thêm quyền Quản lý cho Nhân viên để làm cho nút bấm được. Nhân viên được giao việc qua phạm vi/assignment, Giảng viên qua lớp và lịch coi thi, Sinh viên qua liên kết tài khoản–hồ sơ–đăng ký.

## Độ phủ kiểm tra

role-surfaces.test.js thực hiện 64 lượt GET: bốn role × 16 API chính, xác nhận 200/403 theo phạm vi đọc cấp module; thêm một ca menu. Quyền ghi và giới hạn đúng người/lớp được kiểm tra ở các suite nghiệp vụ, đặc biệt profile-requests, curriculum, grades, attendance, exams, finance và staff-scopes. Không gọi 64 lượt GET là đã nghiệm thu mọi nút CRUD hay mọi dữ liệu của mỗi role.

355/355 test hiện đạt trong môi trường kho tạm/HTTP và mapping SQL giả lập. MySQL/Gemini thật, mọi route/state và thiết bị thật chưa được nghiệm thu. Các nghiệp vụ chưa có như rèn luyện, nội trú, tốt nghiệp, dịch vụ, lý lịch đầy đủ có minh chứng và báo cáo toàn trường vẫn là phần còn thiếu cho từng role liên quan; xem LOCAL_ROADMAP.md và BAN_DO_HE_THONG.md.

Đợt áp dụng chương trình: đối chiếu 1–50 hồ sơ → xác nhận → các liên kết và audit cùng giao dịch → Sinh viên xem tiến độ từ liên kết mới. Người đã có chương trình tiếp tục giữ nguyên liên kết. Giảng viên chỉ đọc so sánh, Sinh viên không có thao tác áp dụng.

Thông báo chỉ mở trang nghiệp vụ, không thay xác nhận/duyệt. Đổi phạm vi/role/phân công hoặc lượt học làm nguồn không còn đọc được thì mục đó không xuất hiện trong hộp tin và số chưa đọc. Xem THONG_BAO_CA_NHAN.md.


Học lại/cải thiện: Quản lý và Nhân viên toàn trường lưu quy chế học kỳ có căn cứ/xác nhận; Nhân viên phạm vi hẹp chỉ tra hồ sơ trong quyền. Sinh viên xem lịch sử của mình và xác nhận đăng ký; Giảng viên chỉ thấy loại lượt học trong lớp được giao. UI/API/AI cùng kiểm tra; đổi điểm/quy chế sau xem trước phải đối chiếu lại. Không tự đổi điểm/GPA cũ. Xem HOC_LAI_VA_CAI_THIEN.md.


Chuyển phiên bản chương trình: Nhân viên đúng khoa/khóa lập và áp dụng hồ sơ mình lập sau khi được duyệt; Quản lý duyệt hồ sơ người khác, có thể hủy trước áp dụng và áp dụng trong quyền. Người lập không tự duyệt. Sinh viên chỉ lịch sử đã áp dụng của mình, có CSV; Giảng viên không có API/menu/công cụ đọc hồ sơ này. Nguồn thay đổi phải đối chiếu lại. Thông báo không cấp thêm quyền. Xem CHUYEN_PHIEN_BAN_CHUONG_TRINH.md.


Bảo lưu/quay lại: Sinh viên gửi/xem của mình và hủy khi còn chờ kiểm tra; Nhân viên gửi/kiểm tra trong khoa/khóa, áp dụng hồ sơ mình đã kiểm tra sau duyệt; Quản lý duyệt khi khác người gửi/người kiểm tra, từ chối/hủy trước áp dụng hoặc áp dụng đúng quyết định. Giảng viên không có quyền đọc lý do hồ sơ. Trạng thái chỉ đổi ở bước áp dụng; AI đăng ký cùng kiểm tra, công cụ tra cứu AI không trả lý do riêng tư. Xem BAO_LUU_VA_QUAY_LAI_HOC.md.


Đối chiếu học vụ: Quản lý/Nhân viên toàn trường lưu quy chế học kỳ có căn cứ/xác nhận; Nhân viên khoa/khóa chỉ đọc sinh viên trong quyền, đủ kết quả công bố kể cả lớp liên khoa. Sinh viên chỉ dữ liệu mình. Giảng viên không có nút/API/công cụ đọc tổng hợp này. Kết quả chưa phải quyết định hành chính và không đổi quyền đăng ký. Xem DOI_CHIEU_HOC_VU.md.

Đăng nhập dùng chung dịch vụ xác thực cho bốn vai trò. Sinh viên có thêm bí danh mã sinh viên từ hồ sơ đã liên kết. Cấp lại mật khẩu chỉ Quản lý thực hiện với tài khoản khác; người được cấp mới/cấp lại phải tự đổi trước khi gọi nghiệp vụ/AI. Nhân viên không được cấp tài khoản hoặc cấp lại mật khẩu cho người khác. Xem DANG_NHAP_VA_CAP_LAI_MAT_KHAU.md.

Số báo danh/ghế: Quản lý/Nhân viên xếp trong phạm vi sau xem trước và xác nhận; Giảng viên đọc danh sách lớp/ca được giao; Sinh viên chỉ đọc phần của mình. Không cho Nhân viên vượt khoa/khóa qua bản lưu cũ. Xếp ghế không thay thế điều kiện dự thi và AI chỉ đọc qua công cụ lịch thi, chưa ghi danh sách.

Biên bản ca thi: chỉ Giảng viên được phân coi thi lập/gửi; Nhân viên trong scope hoặc Quản lý khác người lập xác nhận/trả/mở lại có lý do. Sinh viên và Giảng viên chỉ dạy lớp không đọc hồ sơ này. AI chỉ tra tổng hợp trong cùng quyền.


## Công nhận học phần hiện hành

Nhân viên lập trong phạm vi, hủy hồ sơ chờ do mình lập và áp dụng hồ sơ mình lập đã được duyệt. Quản lý khác người lập duyệt/từ chối, Quản lý áp dụng/thu hồi có lý do. Sinh viên chỉ quyết định đã áp dụng/thu hồi của mình; không đọc minh chứng và lịch sử nội bộ. Giảng viên không truy cập. Chỉ áp dụng mới ảnh hưởng tiến độ; phê duyệt không tự áp dụng.

Xem CONG_NHAN_HOC_PHAN.md để biết luồng, API, giới hạn và bằng chứng.


## Thủ tục sinh viên — hiện tại

Sinh viên chỉ bản nháp/yêu cầu của mình; gửi/bổ sung/hủy theo trạng thái. Nhân viên toàn trường soạn danh mục nháp, Nhân viên khoa/khóa chỉ đọc danh mục và xử lý sinh viên trong quyền. Người tiếp nhận xử lý tới trả kết quả, không ép Quản lý làm thay công việc thường xuyên. Quản lý công bố/đóng danh mục, đổi người phụ trách có phạm vi phù hợp và sửa liên kết khoản thu. Giảng viên không có menu/API/công cụ. Thông báo và AI kiểm tra lại cùng quyền; nháp chưa gửi không hiện nội dung qua nhật ký quản trị. Xem THU_TUC_SINH_VIEN.md.
