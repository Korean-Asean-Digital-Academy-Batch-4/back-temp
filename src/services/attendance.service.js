const { pool, withTransaction } = require('../db/pool');
const AppError = require('../utils/AppError');

// §8.4 poin 2: sesi selalu terbuka dengan SELURUH siswa berstatus Alpa — dibuat dalam
// satu transaksi supaya "status kosong" tidak mungkin terjadi.
async function createSession({ classId, subjectId, teacherId, sessionDate }) {
  return withTransaction(async (client) => {
    let sessionRow;
    try {
      const res = await client.query(
        `INSERT INTO attendance_sessions (class_id, subject_id, teacher_id, session_date)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [classId, subjectId, teacherId, sessionDate]
      );
      sessionRow = res.rows[0];
    } catch (err) {
      if (err.code === '23505') {
        throw AppError.conflict('Sesi untuk kelas ini pada tanggal tersebut sudah dibuka');
      }
      throw err;
    }

    const studentsRes = await client.query(
      'SELECT student_id FROM class_students WHERE class_id = $1',
      [classId]
    );
    for (const { student_id: studentId } of studentsRes.rows) {
      await client.query(
        `INSERT INTO attendance_records (session_id, student_id, status)
         VALUES ($1, $2, 'Alpa')`,
        [sessionRow.id, studentId]
      );
    }

    const recordsRes = await client.query(
      `SELECT ar.student_id, s.name, ar.status
       FROM attendance_records ar JOIN students s ON s.id = ar.student_id
       WHERE ar.session_id = $1 ORDER BY s.name`,
      [sessionRow.id]
    );
    return { session: sessionRow, students: recordsRes.rows };
  });
}

async function getSessionDetail(sessionId) {
  const sessionRes = await pool.query('SELECT * FROM attendance_sessions WHERE id = $1', [sessionId]);
  if (!sessionRes.rows.length) throw AppError.notFound('Sesi presensi tidak ditemukan');
  const recordsRes = await pool.query(
    `SELECT ar.student_id, s.name, ar.status
     FROM attendance_records ar JOIN students s ON s.id = ar.student_id
     WHERE ar.session_id = $1 ORDER BY s.name`,
    [sessionId]
  );
  return { session: sessionRes.rows[0], students: recordsRes.rows };
}

const VALID_STATUS = ['Hadir', 'Izin', 'Sakit', 'Alpa'];

async function updateRecords(sessionId, records) {
  if (!Array.isArray(records) || !records.length) {
    throw AppError.badRequest('records wajib berupa array dan tidak boleh kosong');
  }
  for (const r of records) {
    if (!VALID_STATUS.includes(r.status)) {
      throw AppError.badRequest(`status tidak valid: ${r.status}`);
    }
    await pool.query(
      `UPDATE attendance_records SET status = $1, updated_at = now()
       WHERE session_id = $2 AND student_id = $3`,
      [r.status, sessionId, r.studentId]
    );
  }
  return { updatedCount: records.length };
}

async function markAllPresent(sessionId) {
  const { rowCount } = await pool.query(
    `UPDATE attendance_records SET status = 'Hadir', updated_at = now() WHERE session_id = $1`,
    [sessionId]
  );
  return { updatedCount: rowCount };
}

async function deleteSession(sessionId) {
  const { rowCount } = await pool.query('DELETE FROM attendance_sessions WHERE id = $1', [sessionId]);
  if (!rowCount) throw AppError.notFound('Sesi presensi tidak ditemukan');
}

module.exports = { createSession, getSessionDetail, updateRecords, markAllPresent, deleteSession };
