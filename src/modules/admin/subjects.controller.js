const { pool } = require('../../db/pool');
const { ok, created } = require('../../utils/response');
const AppError = require('../../utils/AppError');

async function createSubject(req, res) {
  const { name, gradeLevel, kkm, teacherId } = req.body;
  if (!name || !gradeLevel || !teacherId) {
    throw AppError.badRequest('name, gradeLevel, dan teacherId wajib diisi');
  }
  if (!['X', 'XI', 'XII'].includes(gradeLevel)) {
    throw AppError.badRequest('gradeLevel harus salah satu dari X, XI, XII');
  }

  // §8.2: satu guru hanya mengampu tepat satu mata pelajaran pada tepat satu jenjang.
  const existing = await pool.query(
    `SELECT s.name, s.grade_level, t.name AS teacher_name
     FROM subjects s JOIN teachers t ON t.id = s.teacher_id
     WHERE s.teacher_id = $1`,
    [teacherId]
  );
  if (existing.rows.length) {
    const e = existing.rows[0];
    throw AppError.conflict(
      `${e.teacher_name} sudah mengampu ${e.name} ${e.grade_level}, satu guru hanya dapat mengampu satu mata pelajaran`
    );
  }

  const { rows } = await pool.query(
    `INSERT INTO subjects (name, grade_level, kkm, teacher_id)
     VALUES ($1, $2, COALESCE($3, 75), $4) RETURNING *`,
    [name, gradeLevel, kkm ?? null, teacherId]
  );
  return created(res, rows[0], 'Mata pelajaran berhasil dibuat');
}

async function listSubjects(req, res) {
  const { gradeLevel } = req.query;
  const params = [];
  let where = '';
  if (gradeLevel) {
    params.push(gradeLevel);
    where = 'WHERE s.grade_level = $1';
  }
  const { rows } = await pool.query(
    `SELECT s.*, t.name AS teacher_name, t.nip AS teacher_nip
     FROM subjects s JOIN teachers t ON t.id = s.teacher_id
     ${where} ORDER BY s.name`,
    params
  );
  return ok(res, rows);
}

async function updateSubject(req, res) {
  const { id } = req.params;
  const { kkm, teacherId } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (kkm !== undefined) { fields.push(`kkm = $${idx++}`); values.push(kkm); }
  if (teacherId !== undefined) {
    const clash = await pool.query(
      'SELECT id FROM subjects WHERE teacher_id = $1 AND id <> $2',
      [teacherId, id]
    );
    if (clash.rows.length) {
      throw AppError.conflict('Guru tersebut sudah mengampu mata pelajaran lain');
    }
    fields.push(`teacher_id = $${idx++}`); values.push(teacherId);
  }
  if (!fields.length) throw AppError.badRequest('Tidak ada field yang diubah');

  values.push(id);
  const { rows } = await pool.query(
    `UPDATE subjects SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!rows.length) throw AppError.notFound('Mata pelajaran tidak ditemukan');
  return ok(res, rows[0], 'Mata pelajaran berhasil diubah');
}

module.exports = { createSubject, listSubjects, updateSubject };
