const env = require('../config/env');
const { pool } = require('../db/pool');

// Menghimpun data akademik siswa semester berjalan: nilai per mapel+topik(komponen),
// KKM, kelengkapan penilaian, dan persentase kehadiran per mapel (§8.5 poin 1).
async function collectStudentAcademicData(studentId) {
  const gradesRes = await pool.query(
    `
    SELECT sub.name AS subject_name, sub.grade_level, sub.kkm,
           ac.code AS component_code, at.topic, g.score
    FROM class_students cs
    JOIN class_subjects csub ON csub.class_id = cs.class_id
    JOIN subjects sub ON sub.id = csub.subject_id
    CROSS JOIN assessment_components ac
    LEFT JOIN assessment_topics at
      ON at.class_id = cs.class_id AND at.subject_id = sub.id AND at.component_id = ac.id
    LEFT JOIN grades g
      ON g.class_id = cs.class_id AND g.subject_id = sub.id
     AND g.student_id = cs.student_id AND g.component_id = ac.id
    WHERE cs.student_id = $1
    ORDER BY sub.name, ac.sort_order
    `,
    [studentId]
  );

  const attendanceRes = await pool.query(
    `
    SELECT sub.name AS subject_name, sub.grade_level,
           count(*) FILTER (WHERE ar.status IN ('Hadir','Izin','Sakit')) AS present_count,
           count(*) AS total_count
    FROM class_students cs
    JOIN class_subjects csub ON csub.class_id = cs.class_id
    JOIN subjects sub ON sub.id = csub.subject_id
    JOIN attendance_sessions ats ON ats.class_id = cs.class_id AND ats.subject_id = sub.id
    JOIN attendance_records ar ON ar.session_id = ats.id AND ar.student_id = cs.student_id
    WHERE cs.student_id = $1
    GROUP BY sub.name, sub.grade_level
    `,
    [studentId]
  );

  const bySubject = {};
  for (const row of gradesRes.rows) {
    const key = `${row.subject_name} ${row.grade_level}`;
    if (!bySubject[key]) {
      bySubject[key] = { subject: key, kkm: Number(row.kkm), components: {}, topics: {} };
    }
    bySubject[key].components[row.component_code] = row.score === null ? null : Number(row.score);
    bySubject[key].topics[row.component_code] = row.topic || null;
  }
  for (const row of attendanceRes.rows) {
    const key = `${row.subject_name} ${row.grade_level}`;
    if (bySubject[key]) {
      const total = Number(row.total_count);
      const present = Number(row.present_count);
      bySubject[key].attendancePercent = total > 0 ? Math.round((present / total) * 100) : null;
    }
  }

  const subjects = Object.values(bySubject);
  const isPartialData = subjects.some((s) =>
    Object.values(s.components).some((score) => score === null)
  );

  return { subjects, isPartialData };
}

// Larangan bagi AI (§8.6): tidak menghitung nilai resmi, tidak mengubah data apapun,
// hanya membaca data siswa yang bersangkutan (dijamin oleh studentId dari token, bukan input).
async function generateInsight(studentId) {
  const { subjects, isPartialData } = await collectStudentAcademicData(studentId);

  if (!env.geminiApiKey) {
    const err = new Error('AI belum dikonfigurasi (GEMINI_API_KEY kosong)');
    err.isAiFailure = true;
    throw err;
  }

  const prompt = buildPrompt(subjects);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.aiRequestTimeoutMs);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.aiModel}:generateContent?key=${env.geminiApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const err = new Error(`AI provider error: ${response.status}`);
      err.isAiFailure = true;
      throw err;
    }
    const data = await response.json();
    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || '')
      .join('\n')
      .trim();
    return parseAiText(text, isPartialData);
  } catch (err) {
    err.isAiFailure = true;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(subjects) {
  return `Kamu berperan sebagai konsultan pendidikan untuk seorang siswa SMA di Indonesia.
Berikut data akademik siswa pada semester berjalan (JSON):
${JSON.stringify(subjects, null, 2)}

Tugasmu:
1. Tulis SATU paragraf rangkuman capaian siswa (bahasa Indonesia, profesional, memotivasi).
2. Lanjutkan dengan poin-poin ringkas: hal yang perlu ditingkatkan beserta alasannya.
3. Tutup dengan TEPAT DUA pilihan tindakan yang realistis, format "Opsi A: ..." dan "Opsi B: ...".
Jangan hitung nilai akhir resmi, jangan membuat prediksi kelulusan atau diagnosis apapun.
Gunakan nama topik pada setiap komponen untuk memberi saran belajar yang spesifik berdasarkan skor siswa.
Jika topik belum diisi, jangan mengarang topik. Kaitkan presensi rendah sebagai kemungkinan penyebab nilai rendah bila relevan, bukan sebagai peringatan.`;
}

function parseAiText(text, isPartialData) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const paragraph = lines.find((l) => !l.startsWith('-') && !l.startsWith('Opsi')) || text;
  const bullets = lines.filter((l) => l.startsWith('-')).map((l) => l.replace(/^-\s*/, ''));
  const actionOptions = lines.filter((l) => /^opsi\s*[ab]/i.test(l));
  return {
    generatedAt: new Date().toISOString(),
    isPartialData,
    recommendationParagraph: paragraph,
    bullets,
    actionOptions,
  };
}

module.exports = { collectStudentAcademicData, buildPrompt, generateInsight };
