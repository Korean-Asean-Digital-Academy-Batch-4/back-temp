const { pool } = require('../../db/pool');
const { ok, created } = require('../../utils/response');
const AppError = require('../../utils/AppError');
const gradesService = require('../../services/grades.service');
const attendanceService = require('../../services/attendance.service');
const { assertClassNotLocked } = require('../../services/reportCardLock.service');

async function listSessions(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  await gradesService.resolveTeacherSubjectForClass(teacherId, classId);
  const { rows } = await pool.query(
    `SELECT * FROM attendance_sessions WHERE class_id = $1 AND teacher_id = $2 ORDER BY session_date DESC`,
    [classId, teacherId]
  );
  return ok(res, rows);
}

async function openSession(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  const { date } = req.body;
  if (!date) throw AppError.badRequest('date wajib diisi (format YYYY-MM-DD)');

  const subjectId = await gradesService.resolveTeacherSubjectForClass(teacherId, classId);
  await assertClassNotLocked(classId, req.user.role);

  const result = await attendanceService.createSession({
    classId, subjectId, teacherId, sessionDate: date,
  });
  return created(res, result, `Sesi presensi ${date} dibuka`);
}

async function getSession(req, res) {
  const { id } = req.params;
  const result = await attendanceService.getSessionDetail(id);
  await assertOwnsSession(req, result.session);
  return ok(res, result);
}

async function updateRecords(req, res) {
  const { id } = req.params;
  const { records } = req.body;
  const session = await getSessionOrThrow(id);
  await assertOwnsSession(req, session);
  await assertClassNotLocked(session.class_id, req.user.role);
  const result = await attendanceService.updateRecords(id, records);
  return ok(res, result, 'Presensi berhasil disimpan');
}

async function markAllPresent(req, res) {
  const { id } = req.params;
  const session = await getSessionOrThrow(id);
  await assertOwnsSession(req, session);
  await assertClassNotLocked(session.class_id, req.user.role);
  const result = await attendanceService.markAllPresent(id);
  return ok(res, result, 'Seluruh siswa ditandai Hadir');
}

async function deleteSession(req, res) {
  const { id } = req.params;
  const session = await getSessionOrThrow(id);
  await assertOwnsSession(req, session);
  await assertClassNotLocked(session.class_id, req.user.role);
  await attendanceService.deleteSession(id);
  return ok(res, null, 'Sesi presensi berhasil dihapus');
}

// ---- Helper ---------------------------------------------------------------

async function getSessionOrThrow(sessionId) {
  const { rows } = await pool.query('SELECT * FROM attendance_sessions WHERE id = $1', [sessionId]);
  if (!rows.length) throw AppError.notFound('Sesi presensi tidak ditemukan');
  return rows[0];
}

async function assertOwnsSession(req, session) {
  if (req.user.role === 'admin') return;
  if (session.teacher_id !== req.user.sub) {
    throw AppError.forbidden('Sesi ini dibuka oleh Guru lain');
  }
}

module.exports = { listSessions, openSession, getSession, updateRecords, markAllPresent, deleteSession };
