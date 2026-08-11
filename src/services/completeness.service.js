const { pool } = require('../db/pool');

// Mengecek kelengkapan nilai per mata pelajaran pada satu kelas.
// "Lengkap" = seluruh siswa di kelas itu punya skor terisi (bukan NULL)
// untuk seluruh 8 komponen penilaian, pada mata pelajaran tsb (§8.3, §6.3).
async function getClassCompleteness(classId) {
  const { rows } = await pool.query(
    `
    SELECT
      s.id AS subject_id,
      s.name AS subject_name,
      s.grade_level,
      (SELECT count(*) FROM class_students cs WHERE cs.class_id = $1) * 8 AS expected_count,
      count(g.id) FILTER (WHERE g.score IS NOT NULL) AS filled_count
    FROM class_subjects csub
    JOIN subjects s ON s.id = csub.subject_id
    LEFT JOIN class_students cs2 ON cs2.class_id = $1
    LEFT JOIN grades g
      ON g.subject_id = s.id
     AND g.class_id = $1
     AND g.student_id = cs2.student_id
    WHERE csub.class_id = $1
    GROUP BY s.id, s.name, s.grade_level
    ORDER BY s.name
    `,
    [classId]
  );

  return rows.map((r) => ({
    subjectId: r.subject_id,
    subjectName: `${r.subject_name} ${r.grade_level}`,
    expectedCount: Number(r.expected_count),
    filledCount: Number(r.filled_count),
    isComplete: Number(r.expected_count) > 0 && Number(r.expected_count) === Number(r.filled_count),
  }));
}

module.exports = { getClassCompleteness };
