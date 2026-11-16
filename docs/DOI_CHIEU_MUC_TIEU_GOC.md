# Đối chiếu Lizz với mục tiêu và dữ liệu ban đầu

Ngày rà: 16/11/2026. Nguồn nghiệp vụ: LIZZ(2).docx hiện hành, các phần 1–4 và 6, đối chiếu với mã nguồn hiện tại. Tài liệu gốc phân biệt yêu cầu thiết kế, phần đã xác định và đề xuất; bảng dưới phản ánh phần đã nối trong code, không coi mọi yêu cầu trong báo cáo là chức năng đã chạy.

## Những điểm được giữ

Ứng dụng phục vụ đồ án chạy local, JavaScript ES Modules, Node.js, MySQL 8.0.16+ utf8mb4/utf8mb4_unicode_ci. Frontend/backend tách thư mục trong cùng dự án. Bốn vai trò chính: Quản lý, Nhân viên, Giảng viên, Sinh viên. Tài khoản do Quản lý cấp, không đăng ký công khai; Nhân viên xử lý công việc thường xuyên trong phạm vi và Quản lý phụ trách thẩm quyền quan trọng.

Giữ hồ sơ, ID liên kết, đăng ký, điểm và chứng từ cũ; không reset database hoặc chèn dữ liệu minh họa vào MySQL. Migration mới chỉ bổ sung phần cần cho nghiệp vụ. Các biểu phí, ngưỡng điểm, quy chế và cấu hình phải có căn cứ của đơn vị, không lấy số liệu ví dụ làm quy định thật. LizzChat dùng công cụ nghiệp vụ theo quyền, thao tác ghi cần xác nhận. Không coi bản vẽ, mock hoặc trả lời mẫu là bằng chứng hệ thống đã chạy.

Kế toán tổng hợp, tiền lương, bệnh án điều trị và LMS chuyên biệt nằm ngoài phạm vi gốc; không xếp quản lý tiền lương thành chức năng bắt buộc còn thiếu của Lizz.

## Đủ 16 phân hệ

| Mã | Phân hệ | Phần đã nối trong mã | Khoảng trống chính |
| --- | --- | --- | --- |
| FM01 | Tổng quan và công việc | Tổng quan theo vai trò, giao/bàn giao việc, tiến độ, thông báo từ các luồng đã nối | Tổng hợp lịch/hạn đầy đủ và nhắc hạn tự động |
| FM02 | Tổ chức đào tạo | Khoa, ngành, khóa, lớp hành chính, sĩ số; chương trình có phiên bản | Cơ sở/đơn vị phân cấp, hiệu lực và lịch sử cơ cấu đầy đủ |
| FM03 | Hồ sơ và liên hệ | Hồ sơ liên kết tài khoản, lớp, liên hệ, yêu cầu cập nhật, ảnh có lịch sử, xem/in dữ liệu hiện có, nhập lô/CSV | Lý lịch đầy đủ, nhiều liên hệ có cấu trúc, tải giấy tờ, đổi danh tính chính thức có kiểm soát |
| FM04 | Chương trình và quy chế | Nhóm bắt buộc/tự chọn, tiên quyết, phiên bản/gán/chuyển cùng chương trình, công nhận tín chỉ, quy đổi điểm/GPA | Điều kiện học đồng thời, tương đương/thay thế theo danh mục, miễn theo chứng chỉ, chuyển ngành/chương trình khác |
| FM05 | Lớp và thời khóa biểu | Mở lớp, lịch nhiều buổi/phòng/ngoại lệ, lịch tuần, xung đột, xuất lịch | Nhiều giảng viên theo buổi, tiết/nghỉ theo cấu hình đầy đủ, xếp tự động/kéo thả |
| FM06 | Đăng ký và biến động học | Đăng ký/rút theo đợt, sĩ số/lịch/tín chỉ/tiên quyết, học lại/cải thiện, bảo lưu/quay lại và chuyển lớp; kế hoạch môn còn thiếu | Đợt đăng ký qua xét duyệt, danh sách chờ, gia hạn/bảo lưu có lịch hiệu lực, biến động chương trình khác ngành |
| FM07 | Thi và điểm danh | Điểm danh học/thi, điều kiện thi, lịch thi, một phòng/ca, số báo danh/chỗ ngồi và biên bản ca | Chia nhiều phòng, lần thi lại/thi bù, sơ đồ ghế vật lý và nghiệm thu bản in |
| FM08 | Điểm và kết quả | Đầu điểm/trọng số, nháp/gửi/công bố, GPA, phúc khảo/điều chỉnh, đối chiếu học kỳ | Cảnh báo/quyết định chính thức nhiều kỳ, hội đồng nhiều cấp và liên kết các lần thi |
| FM09 | Rèn luyện và quyết định | Chưa có luồng hoàn chỉnh | Tiêu chí, tự đánh giá/minh chứng, đối chiếu/duyệt, khen thưởng/kỷ luật theo hiệu lực |
| FM10 | Đề tài và tốt nghiệp | Chưa có luồng hoàn chỉnh | Đề tài/hướng dẫn/tiến độ, xét thử, quyết định tốt nghiệp và văn bằng |
| FM11 | Tài chính và hỗ trợ | Khoản thu, nộp từng phần, đối chiếu tiền mặt/chuyển khoản, công nợ, điều chỉnh/miễn giảm, hủy xác nhận, CSV/phiếu; liên kết khoản thu với thủ tục | Thanh toán/đối soát ngân hàng, hoàn tiền thực tế và học bổng |
| FM12 | Ký túc xá | Chưa có luồng hoàn chỉnh | Cơ sở/dãy/tầng/phòng/giường, đợt đăng ký, bố trí/gia hạn, công nợ và bảo trì |
| FM13 | Dịch vụ và đời sống | hiện tại có danh mục thủ tục theo phiên bản, phí/số lượng/hình thức nhận, nháp/gửi, tiếp nhận/bổ sung, kết quả/bàn giao, lịch sử, CSV, thông báo và AI đọc; liên kết sổ thu | Tệp giấy tờ/kết quả, khai báo ngoại trú, sức khỏe theo quyền riêng, khảo sát và sự kiện |
| FM14 | Cố vấn và nghề nghiệp | Sinh viên tự xem tiến độ và kế hoạch học phần trong chương trình | Phân công cố vấn, lịch hẹn/trao đổi, thực tập/cơ hội và theo dõi tham gia |
| FM15 | Tài khoản và quản trị | Bốn vai trò, cấp/khóa/khôi phục, đổi/cấp lại mật khẩu, phiên, phạm vi khoa/khóa và nhật ký | Quyền từng nghiệp vụ/thao tác, ủy quyền có hạn, khôi phục tự động; SSO là tùy chọn nếu chọn triển khai |
| FM16 | Thông tin và liên thông | Thông báo cá nhân đúng quyền, LizzChat với nguồn và công cụ đã nối, lịch sử hội thoại | Tin tức/thông báo chung, tích hợp email/LMS/thư viện theo phạm vi được chọn, phụ huynh và tra cứu văn bằng |

## Ưu tiên tiếp tục

1. Nghiệm thu nền dữ liệu trên MySQL đúng phiên bản: migration database rỗng và bản sao database cũ, lưu qua khởi động lại, rollback và cạnh tranh nhiều kết nối. Nghiệm thu Gemini thật theo bốn vai trò. Hiện doctor vẫn bị chặn do chưa có kết nối/cấu hình thật.
2. Hoàn thiện các liên kết học vụ còn thiếu: chia phòng/thi lại, điều kiện đồng thời, hồ sơ cảnh báo chính thức và danh mục tương đương/chứng chỉ; bổ sung kiểm tra đối với dữ liệu cũ trước khi áp dụng.
3. Hoàn thiện hồ sơ/minh chứng, sau đó rèn luyện và tốt nghiệp theo tiêu chí được cung cấp; không tự suy ra quy chế của trường.
4. Hoàn thiện các phần còn lại của FM12–FM14, quyền theo nhóm nghiệp vụ và liên thông đúng phạm vi tài liệu; không tạo các màn hình chưa có xử lý thật.
5. Nghiệm thu mọi luồng qua trình duyệt với MySQL/Gemini và các trạng thái lỗi/mất mạng, khung hẹp/thiết bị thật. Các kiểm tra Node/DOM hiện có là bằng chứng có giới hạn.

Trạng thái này thay cho các danh sách thiếu/ưu tiên cũ khi có mâu thuẫn. Chi tiết nguồn/API/schema ở BAN_DO_HE_THONG.md và tài liệu từng module; QA_HIEN_TAI.md nêu bằng chứng mới nhất. Lizz hiện tại hoàn thành thêm phần thủ tục trong FM13, chưa hoàn tất toàn bộ mục tiêu 16 phân hệ.


## Điều chỉnh ưu tiên theo yêu cầu mới — hiện tại

Người dùng xác định ưu tiên là phần thiếu/sai sẽ gây lỗi cho web hoặc chức năng đang có. Vì vậy xử lý schema/khởi động, quyền/phiên, luồng đã nối và kết nối AI trước; các nghiệp vụ còn thiếu trong 16 phân hệ có thể bổ sung sau. Đợt hiện tại không mở thêm phân hệ. Xem ON_DINH_NEN_TANG.md và QA_HIEN_TAI.md; không ghi nền tảng đã nghiệm thu MySQL/Gemini thật khi chưa có môi trường.
