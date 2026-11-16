// Chỉ xuất dữ liệu đã được API giới hạn quyền; chặn công thức khi mở bằng bảng tính.
export function serializeCsv(headers, rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (
      typeof value === "string" &&
      (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))
    )
      text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
export function downloadCsv(filename, headers, rows) {
  const url = URL.createObjectURL(
      new Blob([serializeCsv(headers, rows)], {
        type: "text/csv;charset=utf-8",
      }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
