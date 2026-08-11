const { pool } = require('../../db/pool');
const { ok } = require('../../utils/response');
const gradesService = require('../../services/grades.service');

async function listMyClasses(req, res) {
  const teacherId = req.user.sub;
  const { rows } = await pool.query(
    `SELECT DISTINCT c.id, c.name, c.grade_level,
            sub.id AS subject_id, sub.name AS subject_name,
            ay.name AS academic_year_name, sem.name AS semester_name
     FROM classes c
     JOIN class_subjects csub ON csub.class_id = c.id
     JOIN subjects sub ON sub.id = csub.subject_id
     JOIN semesters sem ON sem.id = c.semester_id
     JOIN academic_years ay ON ay.id = sem.academic_year_id
     WHERE sub.teacher_id = $1
     ORDER BY c.name`,
    [teacherId]
  );
  return ok(res, rows);
}

async function listClassStudents(req, res) {
  const teacherId = req.user.sub;
  const { classId } = req.params;
  await gradesService.resolveTeacherSubjectForClass(teacherId, classId);

  const { rows } = await pool.query(
    `SELECT s.id, s.nis, s.name FROM class_students cs
     JOIN students s ON s.id = cs.student_id WHERE cs.class_id = $1 ORDER BY s.name`,
    [classId]
  );
  return ok(res, rows);
}

module.exports = { listMyClasses, listClassStudents };
