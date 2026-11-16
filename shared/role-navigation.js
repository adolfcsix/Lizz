// Menu theo bốn vai trò. Quyền dữ liệu vẫn được kiểm tra riêng tại API.
export const navigation = [
  {
    id: "home",
    label: "Tổng quan",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  { id: "tasks", label: "Công việc", roles: ["MANAGER", "STAFF"] },
  {
    id: "notifications",
    label: "Thông báo",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  { id: "approvals", label: "Hồ sơ phê duyệt", roles: ["MANAGER", "STAFF"] },
  {
    id: "students",
    label: "Hồ sơ sinh viên",
    roles: ["MANAGER", "STAFF", "STUDENT"],
  },
  {
    id: "profile-requests",
    label: "Yêu cầu cập nhật hồ sơ",
    roles: ["MANAGER", "STAFF", "STUDENT"],
  },
  {
    id: "student-status",
    label: "Bảo lưu và quay lại học",
    roles: ["MANAGER", "STAFF", "STUDENT"],
  },
  { id: "catalog", label: "Tổ chức đào tạo", roles: ["MANAGER", "STAFF"] },
  { id: "student-services", label: "Thủ tục sinh viên", roles: ["MANAGER", "STAFF", "STUDENT"] },
  {
    id: "curriculum",
    label: "Chương trình đào tạo",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  {
    id: "academics",
    label: "Môn học và lớp học phần",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  {
    id: "schedule",
    label: "Thời khóa biểu",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  {
    id: "attendance",
    label: "Điểm danh",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  {
    id: "finance",
    label: "Học phí và công nợ",
    roles: ["MANAGER", "STAFF", "STUDENT"],
  },
  {
    id: "exams",
    label: "Lịch thi",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  {
    id: "policies",
    label: "Đợt đăng ký và điều kiện",
    roles: ["MANAGER", "STAFF"],
  },
  {
    id: "grades",
    label: "Điểm và kết quả",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  {
    id: "grade-reviews",
    label: "Phúc khảo và điều chỉnh điểm",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
  { id: "accounts", label: "Tài khoản và phân quyền", roles: ["MANAGER"] },
  { id: "audit", label: "Lịch sử thao tác", roles: ["MANAGER", "STAFF"] },
  {
    id: "profile",
    label: "Tài khoản của tôi",
    roles: ["MANAGER", "STAFF", "LECTURER", "STUDENT"],
  },
];
