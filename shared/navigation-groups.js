export const navigationGroups = [
  { id: 'overview', label: 'Tổng quan', pages: ['home'] },
  { id: 'operations', label: 'Điều hành', pages: ['tasks', 'approvals'] },
  { id: 'students', label: 'Hồ sơ sinh viên', pages: ['students', 'profile-requests', 'student-status', 'student-services'] },
  { id: 'training', label: 'Đào tạo', pages: ['catalog', 'curriculum', 'academics', 'policies'] },
  { id: 'learning', label: 'Học tập và khảo thí', pages: ['schedule', 'attendance', 'exams', 'grades', 'grade-reviews'] },
  { id: 'finance', label: 'Tài chính', pages: ['finance'] },
  { id: 'system', label: 'Hệ thống', pages: ['accounts', 'audit', 'profile'] },
];
export function groupedNavigation(pages) {
  return navigationGroups.map(group => ({ ...group, items: group.pages.map(id => pages.find(page => page.id === id)).filter(Boolean) })).filter(group => group.items.length);
}
