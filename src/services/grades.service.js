const { pool } = require('../db/pool');
const AppError = require('../utils/AppError');

// Guru hanya mengampu tepat 1 mata pelajaran → cari subject miliknya yang terhubung ke classId.
async function resolveTeacherSubjectForClass(teacherId, classId) {
  const { rows } = await pool.query(
    `SELECT s.id FROM subjects s
     JOIN class_subjects csub ON csub.subject_id = s.id
     WHERE s.teacher_id = $1 AND csub.class_id = $2`,
    [teacherId, classId]
  );
  if (!rows.length) {
    throw AppError.forbidden('Anda tidak mengajar mata pelajaran pada kelas ini');
  }
  return rows[0].id;
}

// entries: [{ studentId, componentCode, score }]
async function saveGrades({ classId, subjectId, entries, filledByTeacherId }) {
  if (!Array.isArray(entries) || !entries.length) {
    throw AppError.badRequest('entries wajib berupa array dan tidak boleh kosong');
  }
  const componentsRes = await pool.query('SELECT id, code FROM assessment_components');
  const componentByCode = Object.fromEntries(componentsRes.rows.map((c) => [c.code, c.id]));

  let savedCount = 0;
  for (const entry of entries) {
    const { studentId, componentCode, score } = entry;
    const componentId = componentByCode[componentCode];
    if (!studentId || !componentId) {
      throw AppError.badRequest(`Entri tidak valid: studentId/componentCode salah (${JSON.stringify(entry)})`);
    }
    if (score !== null && score !== undefined && (score < 0 || score > 100)) {
      throw AppError.badRequest(`Skor harus 0-100 atau null (siswa ${studentId}, ${componentCode})`);
    }
    await pool.query(
      `INSERT INTO grades (student_id, class_id, subject_id, component_id, score, filled_by_teacher_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (student_id, subject_id, component_id)
       DO UPDATE SET score = EXCLUDED.score, filled_by_teacher_id = EXCLUDED.filled_by_teacher_id, updated_at = now()`,
      [studentId, classId, subjectId, componentId, score ?? null, filledByTeacherId]
    );
    savedCount++;
  }
  return { savedCount };
}

// Selalu mengembalikan grid lengkap siswa × 8 komponen, walau belum pernah disimpan (score: null).
async function getClassGrades(classId, subjectId) {
  const { rows } = await pool.query(
    `SELECT cs.student_id, s.name AS student_name, ac.code AS component_code, g.score
     FROM class_students cs
     JOIN students s ON s.id = cs.student_id
     CROSS JOIN assessment_components ac
     LEFT JOIN grades g
       ON g.student_id = cs.student_id AND g.subject_id = $2
      AND g.class_id = $1 AND g.component_id = ac.id
     WHERE cs.class_id = $1
     ORDER BY s.name, ac.sort_order`,
    [classId, subjectId]
  );
  return rows;
}

module.exports = { resolveTeacherSubjectForClass, saveGrades, getClassGrades };
