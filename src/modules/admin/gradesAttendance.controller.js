const { ok } = require('../../utils/response');
const AppError = require('../../utils/AppError');
const gradesService = require('../../services/grades.service');
const attendanceService = require('../../services/attendance.service');

// Admin dapat mengisi/mengubah nilai kelas & mapel manapun (§8.1), termasuk yang sudah Final.
async function putGrades(req, res) {
  const { classId, subjectId, entries } = req.body;
  if (!classId || !subjectId) throw AppError.badRequest('classId dan subjectId wajib diisi');
  const result = await gradesService.saveGrades({
    classId, subjectId, entries, filledByTeacherId: null,
  });
  return ok(res, result, 'Nilai berhasil disimpan');
}

async function putAttendanceRecords(req, res) {
  const { id: sessionId } = req.params;
  const { records } = req.body;
  const result = await attendanceService.updateRecords(sessionId, records);
  return ok(res, result, 'Presensi berhasil disimpan');
}

module.exports = { putGrades, putAttendanceRecords };
