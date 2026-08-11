const { parse } = require('csv-parse/sync');
const { pool } = require('../../db/pool');
const { ok, created } = require('../../utils/response');
const AppError = require('../../utils/AppError');
const { generateInitialPassword, hashPassword } = require('../../utils/password');

// ---- Guru -------------------------------------------------------------

async function createTeacher(req, res) {
  const { name } = req.body;
  const nip = normalizeNumericIdentifier(req.body.nip, 'NIP');
  if (!name) throw AppError.badRequest('nip dan name wajib diisi');
  await ensureTeacherIdentifierAvailable(nip);
  const plainPassword = generateInitialPassword();
  const { rows } = await pool.query(
    'INSERT INTO teachers (nip, name, password_hash) VALUES ($1, $2, $3) RETURNING id, nip, name, created_at',
    [nip, name, hashPassword(plainPassword)]
  );
  return created(res, { ...rows[0], initialPassword: plainPassword }, 'Akun Guru berhasil dibuat');
}

async function importTeachers(req, res) {
  const rows = parseCsv(req, ['Nama', 'NIP']);
  const result = await bulkInsert(rows, async (row, index) => {
    const name = (row['Nama'] || '').trim();
    const nip = normalizeNumericIdentifier(row['NIP'], 'NIP', Error);
    if (!name) throw new Error('Nama kosong');
    await ensureTeacherIdentifierAvailable(nip);
    const plainPassword = generateInitialPassword();
    await pool.query(
      'INSERT INTO teachers (nip, name, password_hash) VALUES ($1, $2, $3)',
      [nip, name, hashPassword(plainPassword)]
    );
  });
  return ok(res, result, `${result.createdCount} dari ${rows.length} akun berhasil dibuat`);
}

async function listTeachers(req, res) {
  const { query } = req.query;
  const params = [];
  let where = '';
  if (query) {
    params.push(`%${query}%`);
    where = 'WHERE name ILIKE $1 OR nip ILIKE $1';
  }
  const { rows } = await pool.query(
    `SELECT id, nip, name, created_at FROM teachers ${where} ORDER BY name`,
    params
  );
  return ok(res, { items: rows, meta: { total: rows.length } });
}

async function resetTeacherPassword(req, res) {
  const { id } = req.params;
  const plainPassword = generateInitialPassword();
  const { rowCount } = await pool.query(
    'UPDATE teachers SET password_hash = $1 WHERE id = $2',
    [hashPassword(plainPassword), id]
  );
  if (!rowCount) throw AppError.notFound('Guru tidak ditemukan');
  return ok(res, { newPassword: plainPassword }, 'Kata sandi berhasil direset');
}

// ---- Siswa --------------------------------------------------------------

async function createStudent(req, res) {
  const { name } = req.body;
  const nis = normalizeNumericIdentifier(req.body.nis, 'NIS');
  if (!name) throw AppError.badRequest('nis dan name wajib diisi');
  await ensureStudentIdentifierAvailable(nis);
  const plainPassword = generateInitialPassword();
  const { rows } = await pool.query(
    'INSERT INTO students (nis, name, password_hash) VALUES ($1, $2, $3) RETURNING id, nis, name, created_at',
    [nis, name, hashPassword(plainPassword)]
  );
  return created(res, { ...rows[0], initialPassword: plainPassword }, 'Akun Siswa berhasil dibuat');
}

async function importStudents(req, res) {
  const rows = parseCsv(req, ['Nama', 'NIS']);
  const result = await bulkInsert(rows, async (row) => {
    const name = (row['Nama'] || '').trim();
    const nis = normalizeNumericIdentifier(row['NIS'], 'NIS', Error);
    if (!name) throw new Error('Nama kosong');
    await ensureStudentIdentifierAvailable(nis);
    const plainPassword = generateInitialPassword();
    await pool.query(
      'INSERT INTO students (nis, name, password_hash) VALUES ($1, $2, $3)',
      [nis, name, hashPassword(plainPassword)]
    );
  });
  return ok(res, result, `${result.createdCount} dari ${rows.length} akun berhasil dibuat`);
}

async function listStudents(req, res) {
  const { query } = req.query;
  const params = [];
  let where = '';
  if (query) {
    params.push(`%${query}%`);
    where = 'WHERE name ILIKE $1 OR nis ILIKE $1';
  }
  const { rows } = await pool.query(
    `SELECT id, nis, name, created_at FROM students ${where} ORDER BY name`,
    params
  );
  return ok(res, { items: rows, meta: { total: rows.length } });
}

async function resetStudentPassword(req, res) {
  const { id } = req.params;
  const plainPassword = generateInitialPassword();
  const { rowCount } = await pool.query(
    'UPDATE students SET password_hash = $1 WHERE id = $2',
    [hashPassword(plainPassword), id]
  );
  if (!rowCount) throw AppError.notFound('Siswa tidak ditemukan');
  return ok(res, { newPassword: plainPassword }, 'Kata sandi berhasil direset');
}

// ---- Helper ---------------------------------------------------------------

function parseCsv(req, expectedColumns) {
  if (!req.file) throw AppError.badRequest('Berkas CSV wajib diunggah (field "file")');
  let records;
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    throw AppError.badRequest('Berkas CSV tidak dapat dibaca: ' + err.message);
  }
  const missingCols = expectedColumns.filter((c) => !(c in (records[0] || {})));
  if (records.length && missingCols.length) {
    throw AppError.badRequest(`Kolom berikut tidak ditemukan pada berkas: ${missingCols.join(', ')}`);
  }
  return records;
}

async function bulkInsert(rows, insertOneRow) {
  let createdCount = 0;
  const failedRows = [];
  for (let i = 0; i < rows.length; i++) {
    try {
      await insertOneRow(rows[i], i);
      createdCount++;
    } catch (err) {
      const reason = err.code === '23505' ? 'sudah terdaftar' : err.message;
      failedRows.push({ row: i + 2, reason }); // +2: header + 1-based index
    }
  }
  return { createdCount, failedRows };
}

function normalizeNumericIdentifier(value, label, ErrorType = null) {
  const normalized = String(value ?? '').trim();
  const message = normalized ? `${label} hanya boleh berisi angka` : `${label} kosong`;
  if (!normalized || !/^\d+$/.test(normalized)) {
    if (ErrorType) throw new ErrorType(message);
    throw AppError.badRequest(message);
  }
  return normalized;
}

async function ensureTeacherIdentifierAvailable(nip) {
  const legacy = Number(nip);
  const existing = await pool.query(
    'SELECT 1 FROM teachers WHERE nip = $1 OR nip_legacy_real = $2 LIMIT 1',
    [nip, Number.isFinite(legacy) ? legacy : null]
  );
  if (existing.rowCount) throw AppError.conflict('NIP sudah terdaftar');
}

async function ensureStudentIdentifierAvailable(nis) {
  const existing = await pool.query(
    'SELECT 1 FROM students WHERE nis = $1 OR nis_legacy_bigint = $2 LIMIT 1',
    [nis, nis]
  );
  if (existing.rowCount) throw AppError.conflict('NIS sudah terdaftar');
}

module.exports = {
  createTeacher, importTeachers, listTeachers, resetTeacherPassword,
  createStudent, importStudents, listStudents, resetStudentPassword,
};
