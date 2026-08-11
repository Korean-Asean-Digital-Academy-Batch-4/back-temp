const { pool } = require('../../db/pool');
const { ok, fail } = require('../../utils/response');
const AppError = require('../../utils/AppError');
const aiInsightService = require('../../services/aiInsight.service');
const assessmentTopicsService = require('../../services/assessmentTopics.service');

async function getMyGrades(req, res) {
  const studentId = req.user.sub;
  const { rows } = await pool.query(
    `SELECT sub.id AS subject_id, sub.name AS subject_name, sub.grade_level, sub.kkm,
            ac.code AS component_code, ac.weight_percent, at.topic, g.score
     FROM class_students cs
     JOIN class_subjects csub ON csub.class_id = cs.class_id
     JOIN subjects sub ON sub.id = csub.subject_id
     CROSS JOIN assessment_components ac
     LEFT JOIN assessment_topics at
       ON at.class_id = cs.class_id AND at.subject_id = sub.id AND at.component_id = ac.id
     LEFT JOIN grades g ON g.subject_id = sub.id AND g.student_id = cs.student_id AND g.component_id = ac.id
     WHERE cs.student_id = $1
     ORDER BY sub.name, ac.sort_order`,
    [studentId]
  );
  return ok(res, rows);
}

async function getMyAssessmentTopics(req, res) {
  const rows = await assessmentTopicsService.getStudentTopics(req.user.sub);
  return ok(res, rows);
}

async function getMyAttendance(req, res) {
  const studentId = req.user.sub;
  const { rows } = await pool.query(
    `SELECT sub.name AS subject_name, sub.grade_level,
            COUNT(*) FILTER (WHERE ar.status IN ('Hadir','Izin','Sakit')) AS present_count,
            COUNT(*) AS total_sessions
     FROM class_students cs
     JOIN class_subjects csub ON csub.class_id = cs.class_id
     JOIN subjects sub ON sub.id = csub.subject_id
     JOIN attendance_sessions ats ON ats.class_id = cs.class_id AND ats.subject_id = sub.id
     JOIN attendance_records ar ON ar.session_id = ats.id AND ar.student_id = cs.student_id
     WHERE cs.student_id = $1
     GROUP BY sub.name, sub.grade_level
     ORDER BY sub.name`,
    [studentId]
  );
  const withPercent = rows.map((r) => ({
    subjectName: `${r.subject_name} ${r.grade_level}`,
    totalSessions: Number(r.total_sessions),
    presentPercent: Number(r.total_sessions) > 0
      ? Math.round((Number(r.present_count) / Number(r.total_sessions)) * 100)
      : null,
  }));
  return ok(res, withPercent);
}

// §8.6 poin 7: kegagalan layanan AI tidak boleh menghambat fitur lain — respons 503 saja.
async function getAiInsight(req, res) {
  const studentId = req.user.sub;
  try {
    const insight = await aiInsightService.generateInsight(studentId);
    return ok(res, insight);
  } catch (err) {
    if (err.isAiFailure) {
      return fail(res, 503, 'Rekomendasi belum dapat dibuat saat ini, coba lagi sebentar lagi');
    }
    throw err;
  }
}

async function getMyReportCard(req, res) {
  const studentId = req.user.sub;
  const { rows } = await pool.query(
    `SELECT rc.status, rc.general_note, rc.distributed_at, c.name AS class_name
     FROM report_cards rc JOIN classes c ON c.id = rc.class_id
     WHERE rc.student_id = $1 ORDER BY rc.created_at DESC LIMIT 1`,
    [studentId]
  );
  if (!rows.length) throw AppError.notFound('Rapor belum tersedia');
  const rc = rows[0];
  if (rc.status !== 'Distributed') {
    return ok(res, { status: rc.status, className: rc.class_name }, 'Rapor belum didistribusikan');
  }
  return ok(res, rc);
}

async function downloadMyReportCard(req, res) {
  const studentId = req.user.sub;
  const { rows } = await pool.query(
    `SELECT rc.*, c.name AS class_name, s.name AS student_name
     FROM report_cards rc JOIN classes c ON c.id = rc.class_id JOIN students s ON s.id = rc.student_id
     WHERE rc.student_id = $1 ORDER BY rc.created_at DESC LIMIT 1`,
    [studentId]
  );
  if (!rows.length || rows[0].status !== 'Distributed') {
    throw AppError.forbidden('Rapor belum didistribusikan');
  }
  const rc = rows[0];
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="rapor-${studentId}.txt"`);
  return res.send(
    `RAPOR SEMESTER\nSiswa: ${rc.student_name}\nKelas: ${rc.class_name}\nCatatan Wali Kelas: ${rc.general_note || '-'}\n`
  );
}

module.exports = {
  getMyGrades,
  getMyAssessmentTopics,
  getMyAttendance,
  getAiInsight,
  getMyReportCard,
  downloadMyReportCard,
};
