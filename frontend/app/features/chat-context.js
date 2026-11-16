// Gợi ý chỉ dẫn đến công cụ đã nối, không tự thực hiện hoặc tự đoán dữ liệu.
export function chatContext(role, route) {
  if (route === "#student-services" && role !== "LECTURER")
    return { label: "Thủ tục sinh viên", prompts: role === "STUDENT" ? ["Có những thủ tục sinh viên nào đang nhận hồ sơ?", "Tra tiến trình hồ sơ thủ tục của tôi"] : ["Tra danh mục thủ tục đang nhận hồ sơ", "Tra hồ sơ thủ tục theo mã sinh viên"] };
  if (route === "#notifications")
    return {
      label: "Thông báo của tôi",
      prompts: [
        "Tôi có thông báo nào chưa đọc?",
        "Tra các thông báo mới nhất của tôi",
      ],
    };
  if (route === "#profile-requests")
    return {
      label: "Yêu cầu cập nhật hồ sơ",
      prompts:
        role === "STUDENT"
          ? ["Yêu cầu cập nhật hồ sơ của tôi đang ở bước nào?"]
          : ["Tra các yêu cầu hồ sơ đang chờ xử lý trong phạm vi của tôi"],
    };
  if (route === "#curriculum")
    return {
      label: "Chương trình đào tạo",
      prompts:
        role === "STUDENT"
          ? [
              "Tôi còn thiếu những học phần và tín chỉ nào trong chương trình?",
              "Nhóm tự chọn của tôi cần đạt bao nhiêu tín chỉ?",
            ]
          : role === "LECTURER"
            ? ["So sánh hai phiên bản của một chương trình đã công bố"]
            : [
                "Tra tiến độ chương trình theo mã sinh viên",
                "So sánh hai phiên bản chương trình đào tạo",
              ],
    };
  if (route === "#schedule")
    return {
      label: "Thời khóa biểu",
      prompts: [
        "Cho tôi xem lịch học trong một khoảng ngày",
        "Tra các ngày nghỉ và lịch học bù của tôi trong tuần",
      ],
    };
  if (route === "#grade-reviews")
    return {
      label: "Phúc khảo và rà soát điểm",
      prompts: [
        "Tra cứu các yêu cầu phúc khảo trong quyền của tôi",
        "Kiểm tra trạng thái một hồ sơ rà soát điểm",
      ],
    };
  if (route === "#finance")
    return {
      label: "Học phí và công nợ",
      prompts:
        role === "STUDENT"
          ? [
              "Tôi còn phải nộp khoản nào?",
              "Kiểm tra các phiếu chuyển khoản đang chờ xác minh",
            ]
          : [
              "Tra cứu công nợ của một sinh viên",
              "Kiểm tra các phiếu thu đang chờ xác minh",
            ],
    };
  if (route === "#attendance")
    return {
      label: "Điểm danh và điều kiện dự thi",
      prompts: [
        "Tra cứu điều kiện dự thi của một lớp học phần",
        "Tôi đã đạt điều kiện điểm danh để dự thi chưa?",
      ],
    };
  if (route === "#exams")
    return {
      label: "Lịch thi",
      prompts: [
        "Cho tôi xem lịch thi trong học kỳ này",
        "Tìm lịch thi của một học phần",
      ],
    };
  const manager = ["MANAGER", "STAFF"].includes(role);
  if (route === "#grades")
    return {
      label: "Điểm và kết quả",
      prompts:
        role === "STUDENT"
          ? [
              "Cho tôi xem điểm đã công bố của mình",
              "Tra GPA học kỳ và tín chỉ tích lũy của tôi",
            ]
          : [
              "Tra cứu điểm trong các lớp tôi được quyền xem",
              "Cho tôi xem các lớp học phần",
            ],
    };
  if (route === "#policies")
    return {
      label: "Đăng ký và điều kiện",
      prompts: [
        "Cho tôi xem các đợt đăng ký hiện có",
        "Tra cứu điều kiện tiên quyết của môn học",
      ],
    };
  if (route === "#students" && manager)
    return {
      label: "Hồ sơ sinh viên",
      prompts: [
        "Tôi muốn tạo hồ sơ sinh viên",
        "Tìm tài khoản sinh viên chưa liên kết hồ sơ",
      ],
    };
  if (route === "#catalog" && manager)
    return {
      label: "Tổ chức đào tạo",
      prompts: [
        "Tra cứu khóa, khoa, ngành và lớp",
        "Tôi muốn thêm một lớp hành chính",
      ],
    };
  if (role === "STUDENT")
    return {
      label: "Không gian sinh viên",
      prompts: [
        "Các lớp học phần nào đang còn chỗ?",
        "Tôi đang đăng ký những lớp nào?",
        "Cho tôi xem điểm đã công bố của mình",
      ],
    };
  if (role === "LECTURER")
    return {
      label: "Không gian giảng dạy",
      prompts: [
        "Cho tôi xem các lớp giảng dạy",
        "Tôi muốn tra danh sách một lớp",
        "Tra cứu điểm trong các lớp tôi được quyền xem",
      ],
    };
  return {
    label: "Không gian làm việc",
    prompts: [
      "Tôi muốn tạo hồ sơ sinh viên",
      "Tôi cần mở một lớp học phần",
      "Tra cứu khóa, khoa, ngành và lớp",
    ],
  };
}
