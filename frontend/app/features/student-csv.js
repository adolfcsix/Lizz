// Parser CSV nhỏ: hỗ trợ dấu phẩy/tab, xuống dòng và dấu nháy kép.
export function parseStudentCsv(text) {
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\t")) {
      row.push(value);
      value = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else value += char;
  }
  if (quoted) throw Error("CSV có dấu nháy chưa đóng.");
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (/^email$/i.test(rows[0]?.[0]?.trim() || "")) rows.shift();
  if (!rows.length || rows.length > 50) throw Error("CSV cần 1–50 dòng.");
  return rows.map((cells, index) => {
    if (cells.length !== 4)
      throw Error(`Dòng ${index + 1}: cần email,mã sinh viên,họ tên,mã lớp.`);
    const [email, code, fullName, classCode] = cells.map((cell) => cell.trim());
    return { email, code, fullName, classCode };
  });
}
