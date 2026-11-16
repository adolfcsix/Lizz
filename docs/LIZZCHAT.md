# LizzChat trong bản local hiện tại

**Cập nhật hiện tại:** cấu trúc API/công cụ đã đối chiếu lại; adapter chặn phản hồi lỗi/sai cấu trúc, giới hạn body và xử lý timeout khi đọc. Chạy npm run ai:check sau khi điền key/model để kiểm tra vòng công cụ bằng thăm dò. Thiếu cấu hình thì không gọi nhà cung cấp. Chưa nghiệm thu Gemini thật trong môi trường này. Xem ON_DINH_NEN_TANG.md; các mốc migration phía dưới là lịch sử, schema hiện hành tới 027.

Yêu cầu nghiệp vụ đã cập nhật trong LIZZ.docx trước khi triển khai mã nguồn. LizzChat là chatbot nổi dùng chung sau đăng nhập, không có mục AI trong menu. Nhận diện, font và màu tiếp tục dùng hệ thống Lizz hiện có.

## Tra cứu phúc khảo

Công cụ `lookup_grade_reviews` đọc yêu cầu theo cùng quyền với trang Phúc khảo, có nguồn và thời điểm. Đã duyệt khác đã áp dụng; LizzChat không tự kết luận điểm đã đổi khi hồ sơ mới được duyệt. Chưa có công cụ AI lập, đề xuất, duyệt hoặc áp dụng điều chỉnh điểm. Migration hiện hành đến 013; chạy đủ các file chưa áp dụng bằng db:migrate, không sửa file SQL cũ.

## Cấu hình mô hình thật

1. Cài phụ thuộc, cấu hình MySQL và chạy `npm run db:migrate` để áp dụng các migration bổ sung `002_lizzchat.sql` và `003_academic.sql`, `004_roles_workflows.sql`, `005_registration_results.sql`. Không sửa lại migration 001 đã áp dụng. Sao lưu DB trước nâng cấp.
2. Tạo khóa Gemini trong Google AI Studio theo tài khoản của bạn. Điền các biến bên dưới vào `.env` ở backend/gốc repository; không đưa khóa vào source, chat hoặc frontend.

```dotenv
LIZZCHAT_ENABLED=true
GEMINI_API_KEY=
GEMINI_MODEL=
```

`GEMINI_MODEL` là model được tài khoản của bạn cấp quyền và hỗ trợ Interactions API/function calling. Không đặt tên model giả trong README làm mặc định. Kiểm tra danh mục model của nhà cung cấp rồi điền đúng ID. `npm run doctor` chỉ kiểm tra có cấu hình, không chứng minh khóa hoạt động.

3. Chạy `npm start`, đăng nhập, bấm nút nổi **LizzChat** và gửi yêu cầu. Bật mạng để gọi dịch vụ mô hình. Khi thiếu cấu hình, nút gửi bị khóa và giao diện thông báo chưa khả dụng; không tự bật bộ trả lời bằng từ khóa.
4. Kiểm tra thực tế với database minh họa trước khi dùng dữ liệu thật. Nếu cần chạy mô hình thật cùng kho tạm để thử giao diện, dùng `node --env-file-if-exists=.env backend/local/server.js --demo`; chế độ này vẫn không chứng minh MySQL đạt.

## Chức năng đã nối trong code

| Công cụ | Người dùng | Kết quả |
| --- | --- | --- |
| lookup_exam_schedule | Bốn vai trò | Lịch thi trong quyền, tìm môn/lớp/phòng/học kỳ, nguồn và giờ; chưa ghi lịch |
| lookup_my_account | Bốn mã vai trò hiện tại | Chỉ metadata tài khoản của chính mình |
| lookup_catalog | Tài khoản đã đăng nhập | Khóa, khoa, ngành, lớp trong danh mục |
| lookup_students | MANAGER/STAFF/STUDENT | Sinh viên bị giới hạn theo accountId trước khi tìm kiếm |
| find_unlinked_accounts | MANAGER/STAFF | Tìm tài khoản sinh viên chưa liên kết, không có credential |
| prepare_student_profiles | MANAGER/STAFF | Xem trước 1–50 hồ sơ theo email và mã lớp |
| prepare_catalog_entry | MANAGER/STAFF | Xem trước thêm khóa/khoa/ngành/lớp |
| lookup_registration_rules | Bốn vai trò | Đợt đăng ký/rút, hạn mức và điều kiện tiên quyết, thời gian máy chủ |
| lookup_learning_results | Bốn vai trò | Điểm trong quyền; Sinh viên chỉ điểm công bố của mình |
| prepare_student_change | MANAGER/STAFF | Xem trước đổi tên/chuyển lớp theo mã sinh viên |

Code dùng bốn vai trò MANAGER, STAFF, LECTURER, STUDENT, tương ứng Quản lý, Nhân viên, Giảng viên, Sinh viên. Migration 004 chuyển mã role cũ và thu hồi hiệu lực phiên cũ bằng version. Nhân viên chuyển lớp qua LizzChat phải nêu lý do: xác nhận chỉ gửi hồ sơ PENDING, sau đó Quản lý khác duyệt rồi người có quyền xác nhận áp dụng. Chưa có AI tự phê duyệt/giao công việc; dùng biểu mẫu tương ứng. Đã bổ sung phạm vi Nhân viên theo khoa/khóa, dùng cùng lớp kiểm tra khi đọc, chuẩn bị và xác nhận. Giảng viên đọc lớp/lịch/danh sách và điểm được phân công; Sinh viên đọc điểm đã công bố của mình. Đã có công cụ đọc điểm danh/điều kiện thi và tài chính, chưa có công cụ AI ghi hai phần này. Nhập/gửi/công bố điểm qua biểu mẫu, chưa có công cụ AI ghi điểm.

## Luồng thao tác

Người dùng có thể nói “thêm sinh viên”, “lập hồ sơ cho bạn Mai” hoặc một câu khác cùng ý. Câu hỏi được gửi cho mô hình ngôn ngữ, không dùng một bộ regex để giả lập hiểu ý. Mô hình đề nghị công cụ; server kiểm tra schema, role, dữ liệu và phần thiếu. Các công cụ prepare không gọi service ghi nghiệp vụ.

Ví dụ: “Tạo hồ sơ Mai Lan, mã SV001, email mai@example.test, lớp IT01”. Backend đối chiếu tài khoản và lớp, chặn trùng/sĩ số, lập đề xuất 10 phút. Người dùng xem email, mã, tên, lớp rồi bấm **Xác nhận thực hiện**. Từ “đồng ý” trong tin nhắn không tự làm thực thi; khung chat vẫn yêu cầu nút xác nhận. Hủy không tạo hồ sơ.

Khi xác nhận, backend kiểm tra chủ đề xuất, phiên bản tài khoản, quyền, hạn dùng và fingerprint dữ liệu, rồi gọi service gốc trong cùng transaction với kết quả đề xuất. Fingerprint hiện gồm ID/version của danh mục, tài khoản, hồ sơ, môn, lớp học phần, đăng ký, học kỳ, đợt, tiên quyết và điểm; cách này bảo thủ, một thay đổi không liên quan cũng có thể yêu cầu xem trước lại. Gửi xác nhận lặp trả kết quả đã lưu. Không sửa payload từ browser; muốn đổi nội dung phải chuẩn bị đề xuất mới.

## Mã nguồn cần đọc

| File | Trách nhiệm |
| --- | --- |
| frontend/app/features/lizzchat.js | Nút nổi, hội thoại, thẻ đề xuất, xác nhận/hủy |
| backend/local/integrations/gemini.js | REST adapter Interactions API, timeout và lỗi cấu hình |
| backend/local/modules/ai/ai.tools.js | Tool schema, role, system prompt, kiểm tra tham số |
| backend/local/modules/ai/ai.actions.js | Chuẩn hóa bản xem trước và gọi lại service nghiệp vụ |
| backend/local/modules/ai/ai.service.js | Hội thoại, tool loop, quyền, fingerprint và giao dịch xác nhận |
| backend/local/modules/ai/ai.repository.js | Lưu hội thoại và đề xuất |
| backend/local/modules/ai/ai.controller.js | API và kiểm tra đăng nhập |
| backend/local/database/migrations/002_lizzchat.sql | Hai bảng bổ sung, không xóa dữ liệu |
| tests/local/lizzchat.test.js | Kiểm tra điều phối bằng provider có kịch bản, không phải Gemini thật |

API gồm `GET /api/v1/ai/status`, `POST /ai/messages`, `GET /ai/conversations/:id`, `POST /ai/proposals/:id/confirm` và `/cancel`, đều dưới tiền tố `/api/v1`. Confirm/cancel vẫn yêu cầu cookie, Origin đúng, chủ sở hữu và role hiện hành. Không có công cụ confirm cung cấp cho mô hình.

## Dữ liệu và giới hạn

Adapter gọi endpoint cố định, gửi API key trong header và `store:false`. Hội thoại được giữ ở MySQL của Lizz theo chủ sở hữu; thông tin nội bộ/thought signature không trả ra giao diện. Không gửi bảng DB, credential, cookie hoặc API key cho mô hình. User message có thể chứa thông tin cá nhân do người dùng chủ động nhập; cần rà chính sách xử lý và retention trước khi dùng dữ liệu thật. `store:false` không phải tuyên bố dịch vụ bên ngoài hoàn toàn không lưu dữ liệu theo chính sách riêng.

Có giới hạn độ dài, lượt công cụ, tốc độ trong tiến trình và thời gian chờ. Mất mạng/thiếu khóa không được báo thành công. RAG trên kho quy chế có phiên bản, lịch sử nhiều cuộc hội thoại đầy đủ, job tự động dọn hội thoại/phiên và kiểm thử production chưa triển khai. Xem QA_LOCAL_V3.md để biết phần đã kiểm chứng.

## Nguồn kỹ thuật đã đối chiếu ngày 14 tháng 11 năm 2026

- Google Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Interactions API và stateless history: https://ai.google.dev/gemini-api/docs/interactions
- REST contract: https://ai.google.dev/api/interactions-api
- Canvas IgniteAI role permissions: https://community.instructure.com/en/kb/articles/664390-how-do-i-assign-the-igniteai-agent-to-specific-instructors

Các nguồn dùng để nghiên cứu cách gọi công cụ, ngữ cảnh và kiểm soát quyền; không sao chép giao diện hay khẳng định Lizz đã đạt mức hoàn thiện của sản phẩm thương mại. Báo cáo gửi giảng viên không liệt kê sản phẩm/trường tham khảo.


## Công cụ học phần ở bản local hiện tại

Thêm 7 công cụ: lookup_course_sections, lookup_my_registrations, lookup_section_students, prepare_course_registration, prepare_course_withdrawal, prepare_subject, prepare_course_section. Đó là mốc triển khai ban đầu; các công cụ đọc quy định, điểm, lịch thi, tài chính và điều kiện dự thi được bổ sung ở các mục sau. Tất cả lọc theo vai trò tại server. Giảng viên tra lớp/danh sách trong phân công; Sinh viên đăng ký/rút cho chính mình; chỉ MANAGER/STAFF thêm môn và mở lớp.

Mọi công cụ ghi đi qua đề xuất, fingerprint bao gồm subjects/sections/enrollments và dữ liệu gốc. Xác nhận gọi đúng service dùng bởi form tay, tái kiểm tra điều kiện, ghi kết quả và nhật ký trong cùng giao dịch. Backend không coi câu “đồng ý” trong hội thoại là xác nhận.

Hiện đã có kiểm tra tiên quyết/tín chỉ và công cụ đọc điểm, học phí, điều kiện dự thi. Chưa có công cụ AI ghi điểm, điểm danh hoặc xác nhận thu. Mô hình được nhắc nêu rõ giới hạn. Kiểm thử điều phối dùng ScriptedProvider trong tests, không được coi là nghiệm thu Gemini thật.


## Đối chiếu adapter và giới hạn thực tế

Adapter được đối chiếu với tài liệu chính thức Gemini: https://ai.google.dev/api/interactions-api và https://ai.google.dev/gemini-api/docs/interactions-overview . Dùng REST Interactions `store:false`, gửi lại lịch sử gồm các bước mô hình và function_result; công cụ function whitelist, không cung cấp SQL hoặc công cụ confirm cho mô hình. Việc đọc tài liệu không thay cho gọi API thật. Kiểm tra thủ công cần có model/key hợp lệ: tra cứu bằng nhiều cách nói, hỏi thiếu thông tin, hủy đề xuất, xác nhận hai lần, dữ liệu thay đổi giữa hai bước, mất quyền và mạng lỗi. Ghi kết quả vào checklist.

Ảnh campus là ảnh minh họa từ bản thiết kế đã chốt, không khẳng định là ảnh cơ sở trường có thật. Logo giữ nguyên nguồn đã chọn; Noto Sans được đóng gói local kèm giấy phép.


## Khi đăng ký có quy định học vụ

LizzChat không tự đoán đợt, tín chỉ hoặc kết quả đạt. Công cụ chuẩn bị gọi checkRegistration, còn xác nhận gọi registerSection và kiểm tra lại. Hết giờ giữa hai bước vẫn bị chặn. Có thay đổi quy định/điểm sẽ làm bản xem trước cũ hết hiệu lực. Điểm đạt chỉ lấy từ PUBLISHED, đúng sinh viên, ngưỡng đã chốt ở lần công bố, lớp tiên quyết kết thúc trước lớp muốn học. Công cụ đọc điểm lọc theo quyền trước khi tìm kiếm và giới hạn kết quả; không lộ điểm nháp cho Sinh viên. Những kiểm tra bằng provider có kịch bản chưa chứng minh chất lượng hội thoại Gemini thật.

## Cách dùng khung trò chuyện

Nút hình sách mở LizzChat; gợi ý thay đổi theo vai trò và trang hiện tại. Chọn gợi ý chỉ điền vào ô soạn, không tự gửi hoặc ghi dữ liệu. Biểu tượng đồng hồ mở lịch sử; dấu cộng bắt đầu hội thoại khác, không xóa hội thoại đã lưu. Nếu còn tin nhắn chưa gửi, hệ thống hỏi trước khi bỏ bản nháp. Nguồn dữ liệu thu gọn trong từng câu trả lời. Đề xuất quá hạn không còn nút xác nhận.

`GET /api/v1/ai/conversations?q=...` trả tối đa 20 cuộc gần nhất, tổng số phù hợp, tiêu đề tối đa 80 ký tự từ câu hỏi đầu tiên, thời điểm cuối và số đề xuất chưa hết hạn. Tìm theo tiêu đề, không phân biệt dấu. Chỉ trả cuộc có actorId và accountVersion hiện tại; không trả payload công cụ, thought signature hoặc transcript nội bộ. Endpoint mở lại hội thoại vẫn kiểm tra cùng quyền. Sau đổi mật khẩu/quyền làm tăng accountVersion, lịch sử phiên quyền cũ không được cấp lại qua endpoint này.

Dòng “Trợ lý đại học” chỉ là mô tả; trạng thái cho phép gửi lấy từ kiểm tra cấu hình, không chứng minh Gemini đã trả lời thật. Thiếu cấu hình thì khóa Gửi, cho thử kiểm tra lại; không chèn hội thoại giả. MySQL lưu qua bảng cũ, kho tạm mất khi dừng tiến trình.


## Tra cứu học phí và điều kiện dự thi

`lookup_finance` dùng dịch vụ tài chính đã lọc quyền: Quản lý/Nhân viên được tra trong phạm vi hiện hành; Sinh viên chỉ khoản thu và phiếu của mình; Giảng viên không được gọi. Có nguồn, thời điểm, đơn vị VND và giới hạn kết quả. Phiếu PENDING là thông tin chờ xác minh, chưa phải tiền đã nộp. Không cung cấp công cụ xác nhận thu, miễn giảm hoặc hoàn tiền cho mô hình.

`lookup_exam_eligibility` yêu cầu mã lớp học phần và học kỳ. Thiếu hoặc trùng nghĩa thì yêu cầu làm rõ. Giảng viên chỉ tra lớp được giao, Sinh viên chỉ kết quả của mình; không trả số tiền nợ cho giảng viên. Kết quả NOT_VERIFIED phải nói rõ chưa đủ căn cứ, không biến thành đủ điều kiện. Công cụ không thay cán bộ quyết định, không tự công bố lịch hoặc ghi điểm danh. Phần đọc quyền/nguồn đã kiểm thử bằng provider có kịch bản; hội thoại Gemini thực tế còn BLOCKED do thiếu cấu hình.


## GPA và tổng hợp kết quả

Công cụ `lookup_academic_summary` dành cho MANAGER/STAFF/STUDENT, dùng summaries của gradeOverview sau khi đã lọc quyền. Sinh viên chỉ dữ liệu mình; Giảng viên không được tra tổng hợp toàn bộ kết quả của một sinh viên. Học kỳ chỉ lọc phần theo kỳ, phần tích lũy vẫn ghi rõ là tích lũy. Trả nguồn, thời điểm và tối đa 50 sinh viên; không tự tính GPA từ lookup_learning_results bị giới hạn 50 dòng.

GPA dùng điểm PUBLISHED và snapshot quy định/tín chỉ; NOT_VERIFIED nghĩa là chưa có số đủ căn cứ, không phải GPA 0. Không có công cụ ghi cấu hình, sửa/công bố điểm hoặc xét tốt nghiệp. Quyền và thiếu dữ liệu đã test bằng provider có kịch bản; hội thoại Gemini thật vẫn BLOCKED.


## Phạm vi Nhân viên

STAFF không mặc định có dữ liệu toàn trường. lookup_my_account trả phạm vi hiện hành; các công cụ đọc/chuẩn bị/xác nhận dùng staffStore. Danh mục chung chỉ do Quản lý hoặc Nhân viên ALL cập nhật. Thiếu khoa/khóa khi mở lớp phải hỏi lại; đổi phạm vi thu hồi phiên và làm đề xuất cũ không còn dùng để ghi. Không cung cấp công cụ AI tự cấp phạm vi. Xem PHAM_VI_NHAN_VIEN.md.

## Tra cứu thời khóa biểu

Công cụ lookup_timetable dùng khoảng ngày rõ ràng (tối đa 63 ngày), trả lịch thực tế sau nghỉ/học bù cùng nguồn/thời điểm, lọc theo vai trò/phạm vi. Không suy lịch từ buổi gốc duy nhất và không có công cụ AI đổi kế hoạch. Bản xem trước đăng ký có mô tả đầy đủ các buổi định kỳ; ngày nghỉ và buổi bù xem qua công cụ này. Chi tiết tại THOI_KHOA_BIEU.md.

## Đợt đăng ký theo đối tượng

Đã bổ sung đợt theo khoa/khóa, lọc theo hồ sơ sinh viên và phạm vi Nhân viên. Đăng ký mới giữ đợt/hạn rút; đợt sau không tự gia hạn đăng ký cũ. LizzChat đọc cùng dữ liệu và kiểm tra lại trước ghi; xem DOT_DANG_KY_THEO_KHOA_KHOA.md. Toàn suite hiện 192/192; DB/Gemini thật chưa nghiệm thu.


## Lịch sử học và đăng ký học lại/cải thiện

lookup_study_history trả lịch sử còn có trong hệ thống, chỉ điểm đã công bố đúng lượt đăng ký; Sinh viên tra mình, cán bộ đúng phạm vi và mã sinh viên, Giảng viên không có công cụ này. Thiếu mã thì hỏi lại, không đoán người. prepare_course_registration dùng cùng phép đối chiếu học lại/cải thiện của API; preview ghi loại lượt học, số lượt và tình trạng quy chế. Đề xuất giữ mode/hash, fingerprint gồm quy chế; sau xác nhận server kiểm tra lại rồi mới ghi. Không có công cụ tự ban hành quy chế/sửa điểm. Học kỳ chưa cấu hình ghi rõ chưa xác minh. Xem HOC_LAI_VA_CAI_THIEN.md; 305/305 test hiện tại, Gemini thật vẫn BLOCKED.


## Tra cứu chuyển phiên bản chương trình

lookup_curriculum_transfers tra theo mã sinh viên chính xác trong quyền; thiếu mã hỏi lại. Sinh viên chỉ lịch sử đã áp dụng của mình, Giảng viên bị chặn. Trả tối đa 50 dòng, tổng số, nguồn/thời điểm; không trả snapshot nội bộ. Chưa có công cụ AI gửi/duyệt/áp dụng; người dùng xử lý ở trang Chương trình có đối chiếu và xác nhận. 321/321 test hiện tại; hội thoại Gemini thật vẫn BLOCKED.


## Trạng thái học và bảo lưu

lookup_study_status tra đúng sinh viên/phạm vi; thiếu mã hỏi lại, Sinh viên chỉ mình, Giảng viên bị chặn. Không trả lý do riêng tư hoặc snapshot; tối đa 50 hồ sơ, tổng số và nguồn/giờ. Đăng ký mới kiểm tra quyết định bảo lưu đã áp dụng, fingerprint có yêu cầu trạng thái; không tự bỏ chặn qua hội thoại. Chưa có công cụ AI gửi/duyệt/áp dụng bảo lưu. 338/338 test hiện tại; Gemini thật vẫn BLOCKED.


## Đối chiếu học vụ theo học kỳ

lookup_academic_standing hỏi mã học kỳ chính xác, cán bộ cần mã sinh viên trong quyền. Sinh viên chỉ mình, Giảng viên bị chặn. Cùng dịch vụ với UI/API, không cộng từ một trang điểm thiếu môn; trả nguồn/thời điểm, quy chế và căn cứ điểm công bố hoặc trạng thái thiếu dữ liệu. Không tự sửa quy chế, điểm, ra quyết định cảnh báo/thôi học hoặc xét tốt nghiệp. 355/355 test hiện tại; Gemini thật vẫn BLOCKED.

lookup_exam_report đọc tổng hợp biên bản cho Quản lý/Nhân viên trong quyền và Giảng viên coi thi; trạng thái, bài thu, ghi chú, nguồn còn khớp. Không cung cấp cho Sinh viên và không có tool ghi/gửi/xác nhận biên bản.


## Công nhận học phần hiện hành

Công cụ lookup_credit_recognitions dành cho Quản lý/Nhân viên trong phạm vi và Sinh viên với dữ liệu của mình; Giảng viên không được cấp. Chỉ trả học phần, trạng thái, hiệu lực, điều kiện tiên quyết và thời điểm áp dụng, không trả minh chứng nội bộ. Không cung cấp công cụ ghi/duyệt/thu hồi cho mô hình. Quyết định thay đổi làm hết hiệu lực đề xuất đăng ký AI đã chuẩn bị; xác nhận đăng ký chạy lại cùng điều kiện. Gemini thật chưa được gọi kiểm chứng.

Xem CONG_NHAN_HOC_PHAN.md để biết luồng, API, giới hạn và bằng chứng.
