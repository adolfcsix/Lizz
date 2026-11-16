# Lizz — Thứ tự hoàn thiện

**Ưu tiên người dùng chốt cho hiện tại:** hoàn thiện nền tảng/schema → các luồng hiện có → Gemini trước khi mở thêm nghiệp vụ. Đã bổ sung kiểm tra khởi động, quyền quản lý trong giao dịch, client API và bộ kiểm tra AI; MySQL/Gemini thật còn bị chặn do cấu hình/môi trường. Xem ON_DINH_NEN_TANG.md. Các phần thiếu nghiệp vụ ở bảng cũ được giữ cho giai đoạn sau, không tự coi là nguyên nhân web lỗi.

**Mốc hiện hành hiện tại:** dùng DOI_CHIEU_MUC_TIEU_GOC.md để đối chiếu đủ 16 phân hệ với tài liệu ban đầu. Đã có kế hoạch học phần (hiện tại) và thủ tục giấy tờ FM13 (hiện tại). Migration mới 027; 001–026 giữ nguyên. MySQL/Gemini thật vẫn cần nghiệm thu. Các mốc phía dưới là lịch sử khi đã có cập nhật mới thay thế.

Giữ một repository với frontend/backend tách rõ, JavaScript, MySQL 8.0.16+ utf8mb4/utf8mb4_unicode_ci. Không xóa dữ liệu hoặc sửa checksum migration đã chạy. Bảng này mô tả hiện trạng mã nguồn; PASS của một nhóm test không đồng nghĩa toàn đồ án đã nghiệm thu.

| Ưu tiên | Phần việc | Hiện trạng và điều kiện hoàn thiện |
| --- | --- | --- |
| 1 | Nghiệm thu nền dữ liệu và AI thật | Mã nguồn có adapter MySQL/Gemini; doctor hiện báo DB từ chối kết nối và AI chưa đủ cấu hình. Cần chạy migration 001–026 trên bản sao, kiểm tra lưu qua khởi động lại và tranh chỗ/phòng bằng nhiều kết nối; gọi Gemini thật theo bốn vai trò |
| 2 | Lịch thi và điểm danh | Đã thêm phòng, nháp/công bố/hủy, roster, chặn xung đột và công cụ tra cứu AI. Đã có điểm danh học/thi và điều kiện dự thi; đã thêm số báo danh/ghế trong phòng với xem trước/xác nhận/lịch sử/CSV; đã thêm biên bản coi thi → cán bộ kiểm tra/xác nhận, CSV/bản xem trước in; còn chia nhiều phòng, thi lại, sơ đồ vật lý, nghiệm thu bản in/DB thật |
| 3 | Tài chính | Đã có khoản thu/công nợ, xác minh tiền mặt/chuyển khoản, nộp từng phần, điều chỉnh/miễn giảm, hủy xác nhận và audit; CSV/in phiếu. Còn thanh toán/hoàn tiền thật, đối soát tự động, học bổng và nghiệm thu SQL |
| 4 | Phân quyền Nhân viên | Đã có toàn trường/khoa/khóa, đơn vị tài khoản/lớp, thu hồi phiên và kiểm tra API/AI; danh mục chung chỉ đọc cho phạm vi hẹp. Cần nghiệm thu SQL thật, ủy quyền riêng cho lớp liên khoa và quyền từng thao tác |
| 5 | Điểm và đào tạo | Đã có điểm thành phần/GPA, phúc khảo, chương trình theo phiên bản, gán theo đợt và chuyển phiên bản có duyệt; học lại/cải thiện; đối chiếu cảnh báo và xếp loại riêng học kỳ theo cấu hình. Đã có công nhận tín chỉ cơ bản theo hồ sơ; còn chuyển ngành/chương trình khác, miễn theo chứng chỉ và danh mục tương đương/thay thế, hồ sơ cảnh báo chính thức theo nhiều kỳ và xét tốt nghiệp. Thời khóa biểu đã nối đăng ký/thi/điểm danh; còn nhiều giảng viên, kéo thả và xếp tự động. Tất cả vẫn cần nghiệm thu SQL/AI thật |
| 6 | Các phân hệ tài liệu khác | Đã có liên hệ/người thân và luồng đề nghị–kiểm tra–duyệt; đã bổ sung ảnh có lịch sử/phân quyền và bản xem/in thông tin hiện có; lý lịch đầy đủ/minh chứng, dịch vụ, rèn luyện, nội trú, đề tài/tốt nghiệp và liên thông vẫn chưa hoàn thiện; xem BAN_DO_HE_THONG.md |
| 7 | Nghiệm thu giao diện và bàn giao | Có checklist và các đợt duyệt UI, chưa phủ mọi route/button/state/thiết bị thật. Lịch thi, điểm danh và tài chính mới kiểm tra component bằng fixture và dịch vụ bằng HTTP/test; chưa nghiệm thu UI với DB thật |

Mỗi đợt cập nhật source, API, SQL, quyền, tài liệu và bằng chứng. QA_HIEN_TAI.md là trạng thái hiện hành; các QA_LOCAL cũ giữ làm lịch sử. Phân biệt BLOCKED do thiếu môi trường, NOT TESTED do chưa kiểm tra và các chức năng chưa viết.

Schema đang phát triển theo các module local, chưa được xác nhận tương đương toàn bộ tài liệu 36 bảng lõi + 24 bảng mở rộng. Cần đối chiếu QLSV/LIZZ và dữ liệu đang có trước khi chuyển dữ liệu thật; không thay bằng cách xóa và dựng lại DB.

Đợt thời khóa biểu: xem THOI_KHOA_BIEU.md, 17 ca mới và toàn suite 179/179. Đã rà component bằng fixture và sửa bố cục; chưa nghiệm thu UI + MySQL/thiết bị thật. Đợt theo khoa/khóa đã bổ sung, đợt tiếp theo đã nối chương trình theo phiên bản và nhóm tự chọn.

Đợt khoa/khóa: 13 ca mới, toàn suite 192/192. Xem DOT_DANG_KY_THEO_KHOA_KHOA.md và QA_GIAO_DIEN_HOC_VU.md.

Đợt lưới tuần: 8 ca mới, toàn suite 200/200. Đã rà component bốn vai trò, nhóm nhiều lớp, học bù, lỗi tải, tải .ics và bố cục hẹp qua Chrome zoom. Chưa có kéo/thả hoặc đồng bộ lịch ngoài; xem LICH_TUAN_VA_XUAT_LICH.md.

Cập nhật giao diện hiện hành: lịch theo từng ngày trong tuần, bỏ trục giờ; giữ đủ thẻ lớp đồng thời, lọc lớp/phòng và bản xem trước in. 202/202 test PASS có phạm vi; in hệ thống/PDF và DB/AI/thiết bị thật chưa nghiệm thu. Xem LICH_TUAN_VA_XUAT_LICH.md.

Đợt chương trình hiện hành: có bản nháp/công bố bất biến, nhóm bắt buộc/tự chọn, áp dụng từng sinh viên, tiến độ, kiểm tra đăng ký và AI chỉ đọc; 227/227 test PASS. Bổ sung 014, giữ nguyên checksum 001–013. Ưu tiên tiếp: nghiệm thu MySQL/Gemini thật; chuyển chương trình có duyệt, công nhận/tương đương và quy trình học lại/cải thiện; hoàn thiện hồ sơ và báo cáo. Không còn xem phần chương trình cơ bản/nhóm tự chọn là chưa viết.

Đợt vai trò và hồ sơ: đã nối Sinh viên → Nhân viên phụ trách → Quản lý → hồ sơ cập nhật; không cấp quyền duyệt cho STAFF hoặc quyền đọc liên hệ riêng cho LECTURER. Có ma trận quyền và kiểm tra 16 API/bốn role. 288/288 test PASS có phạm vi. Ưu tiên tiếp: MySQL/Gemini thật, ảnh/in lý lịch, đã có thông báo cá nhân cho các luồng chính; còn email/push/nhắc hạn tự động, quy trình học lại/chuyển chương trình và báo cáo; không gọi hồ sơ liên hệ là đã đủ toàn bộ hồ sơ sinh viên.

Đã bổ sung hộp thông báo theo bốn vai trò, ghi cùng giao dịch, đọc/chưa đọc và kiểm tra lại nguồn; 288 test, migration 018. Thông báo tài chính/phúc khảo, soạn tin chung, backfill lịch sử và nhắc hạn tự động vẫn chưa nối. Ưu tiên tiếp: nghiệm thu DB/AI, hồ sơ bảo lưu và duyệt học vụ, hoàn thiện thi và cảnh báo học vụ; không coi các nghiệp vụ này đã hoàn tất.


Đợt hiện tại bổ sung học lại/cải thiện trong đăng ký, cấu hình theo học kỳ, snapshot và lịch sử theo quyền; 305/305 test, migration 019. Chưa có quy chế thì giữ trạng thái chưa đối chiếu, không tự phân loại dữ liệu cũ. Ưu tiên tiếp: DB/Gemini thật; bảo lưu/chuyển chương trình có duyệt, thi lại/chia phòng/ghế và cảnh báo học vụ; sau đó công nhận/tương đương và xét tốt nghiệp. Các dòng “ưu tiên tiếp” ở đợt cũ chỉ mô tả thời điểm của đợt đó.


Đợt hiện tại có chuyển phiên bản cùng chương trình/ngành/khóa: Nhân viên đề nghị, Quản lý khác người lập quyết định, áp dụng có xác nhận; giữ snapshot/liên kết cũ trong hồ sơ và không đổi đăng ký/điểm. 321/321 test; migration 020. Xem CHUYEN_PHIEN_BAN_CHUONG_TRINH.md. Ưu tiên tiếp: MySQL/Gemini thật, bảo lưu/quay lại học có duyệt, chia phòng/thi lại/ghế và cảnh báo học vụ; chuyển ngành/chương trình khác và công nhận/tương đương vẫn chưa có. Không gọi các dòng ưu tiên của đợt cũ là hiện trạng mới.


Đợt hiện tại bổ sung bảo lưu/quay lại có kiểm tra–duyệt–áp dụng, chặn đăng ký mới qua UI/API/AI khi đang bảo lưu; không đổi lớp/điểm/phí cũ. 338/338 test; migration 021. Sửa quyền ghi chuyển chương trình cho Nhân viên khoa/khóa. Xem BAO_LUU_VA_QUAY_LAI_HOC.md. Ưu tiên tiếp: nghiệm thu MySQL/Gemini thật; lịch thi/chia phòng/thi lại/ghế, cảnh báo học vụ, sau đó công nhận/tương đương và xét tốt nghiệp. Bảo lưu cơ bản không còn là phần chưa viết; hẹn ngày, thời hạn/gia hạn, minh chứng/văn bản và tự kết thúc vẫn chưa có.


Đợt hiện tại bổ sung Đối chiếu học vụ trong trang Điểm và kết quả: quy chế từng kỳ, ngưỡng GPA/tín chỉ chưa đạt, xếp loại học kỳ, căn cứ, CSV và AI đọc theo quyền. 355/355 test; migration 022. Đây là báo cáo sống theo dữ liệu/quy chế hiện tại, chưa phải cảnh báo chính thức hoặc tốt nghiệp. Ưu tiên tiếp: nghiệm thu MySQL/Gemini thật; hoàn thiện thi/chia phòng/thi lại/ghế, hồ sơ cảnh báo có duyệt theo nhiều kỳ, rồi công nhận/tương đương và xét tốt nghiệp. Không mở thêm lĩnh vực ngoài phạm vi để thay việc hoàn thiện phần còn thiếu.

Đợt tài khoản: hoàn thiện đăng nhập, mã sinh viên, Quản lý cấp lại mật khẩu và bắt đổi mật khẩu được cấp trước khi vào nghiệp vụ/AI; 372/372 test. Migration 023 chỉ thêm cờ, giữ dữ liệu cũ. SSO/MFA/email phục hồi vẫn chưa triển khai. Ưu tiên nghiệm thu MySQL/Gemini thật và các phần thiếu trong bảng trên vẫn giữ nguyên.

Đợt phòng thi: số báo danh và ghế cho ca một phòng đã công bố, giữ bản lưu từng lần, chặn nguồn thay đổi, Sinh viên chỉ đọc của mình và AI tra lịch theo cùng quyền. 386/386 test; migration 024. Ở đợt đó chưa có biên bản; 025 đã bổ sung. Chia nhiều phòng/thi lại vẫn chưa có. Các ưu tiên nghiệm thu MySQL/Gemini thật vẫn giữ nguyên.

Đợt biên bản: đã nối luồng Giảng viên coi thi → Nhân viên/Quản lý kiểm tra/trả/xác nhận, bản nguồn và lịch sử từng lần, CSV, xem trước in và AI chỉ đọc. 406/406 test; migration 025. In PDF/bản giấy chưa xác minh, không coi xác nhận ứng dụng là chữ ký số. Chia nhiều phòng/thi lại, công nhận/miễn/tương đương, hồ sơ cảnh báo nhiều kỳ và xét tốt nghiệp vẫn còn thiếu.


## Công nhận học phần hiện hành

Đã có hồ sơ công nhận tín chỉ theo học phần đích thuộc chương trình hiện tại: đề nghị, duyệt độc lập, áp dụng, thu hồi có kiểm tra phụ thuộc; 429/429 test, migration 026. Phần này thay cho nhận định “chưa có công nhận học phần” ở các đợt trước. Còn miễn theo chứng chỉ, danh mục tương đương/thay thế, chuyển ngành, xét tốt nghiệp, chia nhiều phòng/thi lại, quyết định cảnh báo nhiều kỳ và đối soát tài chính tự động. Ưu tiên nghiệm thu MySQL 001–026 và Gemini thật vẫn giữ nguyên.

Xem CONG_NHAN_HOC_PHAN.md để biết luồng, API, giới hạn và bằng chứng.

Thủ tục sinh viên: danh mục có phiên bản, nháp/gửi/bổ sung/tiếp nhận/kết quả/bàn giao, liên kết khoản thu, phạm vi Nhân viên, lịch sử/CSV/thông báo/AI đọc. Không còn ghi toàn bộ thủ tục giấy tờ là chưa viết; các phần khác của FM13 vẫn thiếu. Xem THU_TUC_SINH_VIEN.md.
