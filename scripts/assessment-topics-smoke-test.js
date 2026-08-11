require('dotenv').config();

const app = require('../src/app');
const { pool } = require('../src/db/pool');
const { signToken } = require('../src/utils/jwt');
const { collectStudentAcademicData } = require('../src/services/aiInsight.service');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function readJson(response) {
  const payload = await response.json();
  return { response, payload };
}

async function main() {
  let server;
  let assignment;
  let previousTopics = [];

  try {
    const assignmentResult = await pool.query(`
      SELECT cs.class_id, cs.subject_id, s.teacher_id, cst.student_id
      FROM class_subjects cs
      JOIN subjects s ON s.id = cs.subject_id
      JOIN class_students cst ON cst.class_id = cs.class_id
      ORDER BY (
        SELECT count(*) FROM assessment_topics at
        WHERE at.class_id = cs.class_id AND at.subject_id = cs.subject_id
      ), cs.class_id, cs.subject_id
      LIMIT 1
    `);
    assert(assignmentResult.rowCount === 1, 'Perlu satu kelas, mapel, guru, dan siswa untuk smoke test');
    assignment = assignmentResult.rows[0];

    const backup = await pool.query(
      `SELECT id, class_id, subject_id, component_id, topic, updated_by_teacher_id, updated_at
       FROM assessment_topics WHERE class_id = $1 AND subject_id = $2`,
      [assignment.class_id, assignment.subject_id],
    );
    previousTopics = backup.rows;

    server = await new Promise((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const teacherToken = signToken({ sub: assignment.teacher_id, role: 'teacher', isHomeroomOf: [] });
    const studentToken = signToken({ sub: assignment.student_id, role: 'student', isHomeroomOf: [] });
    const teacherHeaders = { Authorization: `Bearer ${teacherToken}`, 'content-type': 'application/json' };
    const studentHeaders = { Authorization: `Bearer ${studentToken}` };

    const initial = await readJson(await fetch(
      `${baseUrl}/api/teacher/classes/${assignment.class_id}/assessment-topics`,
      { headers: teacherHeaders },
    ));
    assert(initial.response.ok && initial.payload.data.topics.length === 8, 'GET topik guru harus memuat 8 komponen');

    const codes = ['T1', 'T2', 'T3', 'U1', 'U2', 'U3', 'UTS', 'UAS'];
    const marker = `SMOKE-${Date.now()}`;
    const topics = codes.map((componentCode) => ({
      componentCode,
      topic: `${marker}-${componentCode}`,
    }));
    const saved = await readJson(await fetch(
      `${baseUrl}/api/teacher/classes/${assignment.class_id}/assessment-topics`,
      { method: 'PUT', headers: teacherHeaders, body: JSON.stringify({ topics }) },
    ));
    assert(saved.response.ok && saved.payload.data.savedCount === 8, 'PUT topik guru harus menyimpan 8 komponen');

    const studentTopics = await readJson(await fetch(`${baseUrl}/api/student/assessment-topics`, {
      headers: studentHeaders,
    }));
    const visibleTopics = studentTopics.payload.data.filter(
      (row) => row.class_id === assignment.class_id && row.subject_id === assignment.subject_id,
    );
    assert(studentTopics.response.ok && visibleTopics.length === 8, 'Siswa harus dapat membaca 8 topik mapelnya');
    assert(visibleTopics.every((row) => row.topic?.startsWith(marker)), 'Topik siswa tidak sesuai hasil simpan guru');

    const grades = await readJson(await fetch(`${baseUrl}/api/student/grades`, { headers: studentHeaders }));
    const gradeTopics = grades.payload.data.filter((row) => row.subject_id === assignment.subject_id);
    assert(grades.response.ok && gradeTopics.some((row) => row.topic?.startsWith(marker)), 'Topik harus ikut pada rincian nilai siswa');

    const academicData = await collectStudentAcademicData(assignment.student_id);
    const aiTopics = academicData.subjects.flatMap((subject) => Object.values(subject.topics));
    assert(aiTopics.some((topic) => topic?.startsWith(marker)), 'Konteks AI Insight harus memuat topik');

    console.log(JSON.stringify({
      teacherRead: 'ok',
      teacherWrite: 'ok',
      studentRead: 'ok',
      studentGradeTopics: 'ok',
      aiTopicContext: 'ok',
    }, null, 2));
  } finally {
    if (assignment) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'DELETE FROM assessment_topics WHERE class_id = $1 AND subject_id = $2',
          [assignment.class_id, assignment.subject_id],
        );
        for (const row of previousTopics) {
          await client.query(
            `INSERT INTO assessment_topics
               (id, class_id, subject_id, component_id, topic, updated_by_teacher_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [row.id, row.class_id, row.subject_id, row.component_id, row.topic, row.updated_by_teacher_id, row.updated_at],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    if (server) await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Smoke test topik gagal: ${error.message}`);
  process.exitCode = 1;
});

