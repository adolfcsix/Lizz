// Nhận các dòng đã lọc và đã giới hạn quyền từ API, không truy vấn thêm dữ liệu.
export function examExport(mode, rows, role) {
  if (mode === 'rooms') return {
    filename: 'Lizz_phong_thi.csv',
    headers: ['Mã phòng', 'Tên phòng', 'Sức chứa', 'Trạng thái'],
    rows: rows.map(r => [r.code, r.name, r.capacity, r.active ? 'Đang sử dụng' : 'Ngừng sử dụng']),
  };
  const student = role === 'STUDENT';
  const statuses = { DRAFT: 'Bản nháp', PUBLISHED: 'Đã công bố', CANCELLED: 'Đã hủy' };
  return {
    filename: 'Lizz_lich_thi.csv',
    headers: ['Ngày thi', 'Bắt đầu', 'Kết thúc', 'Học phần', 'Lớp học phần', 'Học kỳ', 'Mã phòng', 'Tên phòng', 'Coi thi', 'Trạng thái', ...(student ? ['Số báo danh của tôi', 'Ghế của tôi'] : [])],
    rows: rows.map(r => [String(r.examDate || '').split('-').reverse().join('/'), r.startTime, r.endTime, r.subjectName, r.sectionCode, r.term, r.roomCode, r.roomName, r.invigilatorName, statuses[r.status] || r.status, ...(student ? [r.mySeat?.candidateNumber || '', r.mySeat?.seatNumber ?? ''] : [])]),
  };
}
