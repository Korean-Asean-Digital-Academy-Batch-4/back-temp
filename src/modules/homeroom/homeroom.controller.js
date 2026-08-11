const { pool, withTransaction } = require('../../db/pool');
const { ok } = require('../../utils/response');
const AppError = require('../../utils/AppError');
const { getClassCompleteness } = require('../../services/completeness.service');

function assertHomeroomOfClass(req, classId) {
  if (req.user.role === 'admin') return;
  if (!(req.user.isHomeroomOf || []).includes(classId)) {
    throw AppError.forbidden('Anda bukan Wali Kelas untuk kelas ini');
  }
}

async function getClassOverview(req, res) {
  const { classId } = req.params;
  assertHomeroomOfClass(req, classId);

  const studentsRes = await pool.query(
    `SELECT s.id, s.nis, s.name FROM class_students cs
     JOIN students s ON s.id = cs.student_id WHERE cs.class_id = $1 ORDER BY s.name`,
    [classId]
  );
  const gradesRes = await pool.query(
    `SELECT g.student_id, sub.name AS subject_name, sub.kkm,
            ROUND(SUM(g.score * ac.weight_percent) / 100.0, 2) AS final_score,
            COUNT(*) FILTER (WHERE g.score IS NULL) AS missing_count
     FROM class_subjects csub
     JOIN subjects sub ON sub.id = csub.subject_id
     JOIN class_students cs ON cs.class_id = csub.class_id
     LEFT JOIN grades g ON g.subject_id = sub.id AND g.student_id = cs.student_id AND g.class_id = $1
     LEFT JOIN assessment_components ac ON ac.id = g.component_id
     WHERE csub.class_id = $1
     GROUP BY g.student_id, sub.name, sub.kkm`,
    [classId]
  );

  return ok(res, { students: studentsRes.rows, grades: gradesRes.rows });
}

async function getClassCompletenessHandler(req, res) {
  const { classId } = req.params;
  assertHomeroomOfClass(req, classId);
  const completeness = await getClassCompleteness(classId);
  return ok(res, completeness);
}

async function getReportCard(req, res) {
  const { studentId } = req.params;
  const rows = await findReportCardRows(studentId);
  if (!rows.length) throw AppError.notFound('Rapor belum tersedia untuk siswa ini');
  assertHomeroomOfClass(req, rows[0].class_id);
  return ok(res, rows[0]);
}

async function updateReportCardNote(req, res) {
  const { studentId } = req.params;
  const { note } = req.body;
  const rows = await findReportCardRows(studentId);
  if (!rows.length) throw AppError.notFound('Rapor belum tersedia untuk siswa ini');
  assertHomeroomOfClass(req, rows[0].class_id);

  const { rows: updated } = await pool.query(
    'UPDATE report_cards SET general_note = $1 WHERE id = $2 RETURNING *',
    [note, rows[0].id]
  );
  return ok(res, updated[0], 'Catatan rapor berhasil disimpan');
}

// Finalisasi seluruh siswa di kelas sekaligus (§6.3). Ditolak bila ada mapel belum lengkap.
async function finalizeClass(req, res) {
  const { classId } = req.params;
  assertHomeroomOfClass(req, classId);

  const classRes = await pool.query('SELECT * FROM classes WHERE id = $1', [classId]);
  if (!classRes.rows.length) throw AppError.notFound('Kelas tidak ditemukan');
  const kelas = classRes.rows[0];

  const completeness = await getClassCompleteness(classId);
  const incomplete = completeness.filter((c) => !c.isComplete);
  if (incomplete.length) {
    throw AppError.unprocessable(
      'Finalisasi ditolak, terdapat mata pelajaran yang belum lengkap',
      incomplete.map((c) => ({
        subject: c.subjectName,
        reason: `Data Mapel ${c.subjectName} belum ada, tolong hubungi guru yang bertanggung jawab.`,
      }))
    );
  }

  const finalizedCount = await withTransaction(async (client) => {
    const studentsRes = await client.query(
      'SELECT student_id FROM class_students WHERE class_id = $1',
      [classId]
    );
    for (const { student_id: studentId } of studentsRes.rows) {
      await client.query(
        `INSERT INTO report_cards (class_id, student_id, semester_id, status, finalized_by, finalized_at)
         VALUES ($1, $2, $3, 'Finalized', $4, now())
         ON CONFLICT (student_id, semester_id)
         DO UPDATE SET status = 'Finalized', finalized_by = EXCLUDED.finalized_by, finalized_at = now()`,
        [classId, studentId, kelas.semester_id, req.user.sub]
      );
    }
    return studentsRes.rows.length;
  });

  return ok(res, { finalizedCount }, `Rapor kelas ${kelas.name} berhasil difinalisasi`);
}

async function distributeClass(req, res) {
  const { classId } = req.params;
  assertHomeroomOfClass(req, classId);

  const { rows } = await pool.query(
    `UPDATE report_cards SET status = 'Distributed', distributed_by = $1, distributed_at = now()
     WHERE class_id = $2 AND status = 'Finalized' RETURNING id`,
    [req.user.sub, classId]
  );
  if (!rows.length) {
    throw AppError.unprocessable('Tidak ada rapor berstatus Finalized pada kelas ini untuk didistribusikan');
  }
  return ok(res, { distributedCount: rows.length }, 'Rapor berhasil didistribusikan');
}

async function downloadReportCard(req, res) {
  const { studentId } = req.params;
  const rows = await findReportCardRows(studentId);
  if (!rows.length) throw AppError.notFound('Rapor belum tersedia untuk siswa ini');
  assertHomeroomOfClass(req, rows[0].class_id);
  if (rows[0].status === 'Draft') {
    throw AppError.forbidden('Rapor belum difinalisasi');
  }
  // MVP: kirim ringkasan teks sederhana. Layout PDF resmi menyusul (lihat 00-RINGKASAN-MEETING.md).
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rapor-${studentId}.txt"`);
  return res.send(
    `RAPOR SEMESTER\nSiswa: ${rows[0].student_name}\nKelas: ${rows[0].class_name}\nStatus: ${rows[0].status}\nCatatan Wali Kelas: ${rows[0].general_note || '-'}\n`
  );
}

async function findReportCardRows(studentId) {
  const { rows } = await pool.query(
    `SELECT rc.*, c.name AS class_name, st.name AS student_name
     FROM report_cards rc
     JOIN classes c ON c.id = rc.class_id
     JOIN students st ON st.id = rc.student_id
     WHERE rc.student_id = $1
     ORDER BY rc.created_at DESC LIMIT 1`,
    [studentId]
  );
  return rows;
}

module.exports = {
  getClassOverview, getClassCompletenessHandler, getReportCard, updateReportCardNote,
  finalizeClass, distributeClass, downloadReportCard,
};
