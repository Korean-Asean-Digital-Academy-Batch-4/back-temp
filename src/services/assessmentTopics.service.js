const { pool } = require('../db/pool');
const AppError = require('../utils/AppError');

const ASSESSMENT_CODES = Object.freeze(['T1', 'T2', 'T3', 'U1', 'U2', 'U3', 'UTS', 'UAS']);
const MAX_TOPIC_LENGTH = 100;

function normalizeTopics(topics) {
  if (!Array.isArray(topics)) {
    throw AppError.badRequest('topics wajib berupa array');
  }

  const normalized = topics.map((item) => ({
    componentCode: String(item?.componentCode || '').trim().toUpperCase(),
    topic: typeof item?.topic === 'string' ? item.topic.trim() : '',
  }));
  const codes = normalized.map((item) => item.componentCode);
  const duplicateCodes = codes.filter((code, index) => codes.indexOf(code) !== index);
  const invalidCodes = codes.filter((code) => !ASSESSMENT_CODES.includes(code));
  const missingCodes = ASSESSMENT_CODES.filter((code) => !codes.includes(code));

  if (normalized.length !== ASSESSMENT_CODES.length || duplicateCodes.length || invalidCodes.length || missingCodes.length) {
    throw AppError.badRequest('Topik harus berisi tepat T1, T2, T3, U1, U2, U3, UTS, dan UAS tanpa duplikasi');
  }

  for (const item of normalized) {
    if (!item.topic) throw AppError.badRequest(`Topik ${item.componentCode} wajib diisi`);
    if (item.topic.length > MAX_TOPIC_LENGTH) {
      throw AppError.badRequest(`Topik ${item.componentCode} maksimal ${MAX_TOPIC_LENGTH} karakter`);
    }
  }

  return normalized;
}

async function getClassTopics(classId, subjectId, queryable = pool) {
  const { rows } = await queryable.query(
    `SELECT ac.code AS component_code, ac.weight_percent, at.topic, at.updated_at
     FROM assessment_components ac
     LEFT JOIN assessment_topics at
       ON at.component_id = ac.id AND at.class_id = $1 AND at.subject_id = $2
     WHERE ac.code = ANY($3)
     ORDER BY ac.sort_order`,
    [classId, subjectId, ASSESSMENT_CODES],
  );
  return rows;
}

async function saveClassTopics({ classId, subjectId, teacherId, topics }) {
  const normalized = normalizeTopics(topics);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const components = await client.query(
      'SELECT id, code FROM assessment_components WHERE code = ANY($1)',
      [ASSESSMENT_CODES],
    );
    if (components.rowCount !== ASSESSMENT_CODES.length) {
      throw AppError.conflict('Konfigurasi 8 komponen penilaian belum lengkap');
    }
    const componentIdByCode = Object.fromEntries(components.rows.map((row) => [row.code, row.id]));

    for (const item of normalized) {
      await client.query(
        `INSERT INTO assessment_topics
           (class_id, subject_id, component_id, topic, updated_by_teacher_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, subject_id, component_id)
         DO UPDATE SET
           topic = EXCLUDED.topic,
           updated_by_teacher_id = EXCLUDED.updated_by_teacher_id,
           updated_at = now()`,
        [classId, subjectId, componentIdByCode[item.componentCode], item.topic, teacherId],
      );
    }

    const savedTopics = await getClassTopics(classId, subjectId, client);
    await client.query('COMMIT');
    return { savedCount: savedTopics.length, topics: savedTopics };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getStudentTopics(studentId) {
  const { rows } = await pool.query(
    `SELECT cs.class_id, sub.id AS subject_id, sub.name AS subject_name, sub.grade_level,
            ac.code AS component_code, ac.weight_percent, at.topic, g.score, at.updated_at
     FROM class_students cs
     JOIN class_subjects csub ON csub.class_id = cs.class_id
     JOIN subjects sub ON sub.id = csub.subject_id
     CROSS JOIN assessment_components ac
     LEFT JOIN assessment_topics at
       ON at.class_id = cs.class_id AND at.subject_id = sub.id AND at.component_id = ac.id
     LEFT JOIN grades g
       ON g.class_id = cs.class_id AND g.subject_id = sub.id
      AND g.student_id = cs.student_id AND g.component_id = ac.id
     WHERE cs.student_id = $1 AND ac.code = ANY($2)
     ORDER BY sub.name, ac.sort_order`,
    [studentId, ASSESSMENT_CODES],
  );
  return rows;
}

module.exports = {
  ASSESSMENT_CODES,
  normalizeTopics,
  getClassTopics,
  saveClassTopics,
  getStudentTopics,
};

