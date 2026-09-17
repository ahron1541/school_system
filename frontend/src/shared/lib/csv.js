export function downloadCsv(filename, rows) {
  const escape = (value) => '"' + String(/^[=+@\-\t\r\n]/.test(String(value ?? '')) ? "'" + value : value ?? '').replaceAll('"', '""') + '"';
  const url = URL.createObjectURL(new Blob([rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
