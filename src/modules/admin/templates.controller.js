const XLSX = require('xlsx');

function teachersCsvTemplate(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="templat-guru.csv"');
  return res.send('Nama,NIP\n');
}

function studentsCsvTemplate(req, res) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="templat-siswa.csv"');
  return res.send('Nama,NIS\n');
}

function classStudentsXlsxTemplate(req, res) {
  const ws = XLSX.utils.aoa_to_sheet([['Kelas', 'NIS', 'Nama']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Siswa');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="templat-siswa-kelas.xlsx"');
  return res.send(buffer);
}

module.exports = { teachersCsvTemplate, studentsCsvTemplate, classStudentsXlsxTemplate };
