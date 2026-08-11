const { pool } = require('../../db/pool');
const { comparePassword } = require('../../utils/password');
const { signToken } = require('../../utils/jwt');
const { ok, fail } = require('../../utils/response');
const AppError = require('../../utils/AppError');

// identifier: email (Administrator) | NIP (Guru) | NIS (Siswa)
async function login(req, res) {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    throw AppError.badRequest('identifier dan password wajib diisi');
  }

  const normalizedIdentifier = String(identifier).trim();
  const isNumericIdentifier = /^\d+$/.test(normalizedIdentifier);
  const legacyNip = isNumericIdentifier ? Number(normalizedIdentifier) : null;
  const legacyNis = isNumericIdentifier ? normalizedIdentifier : null;

  const admin = await pool.query('SELECT * FROM administrators WHERE email = $1', [normalizedIdentifier]);
  if (admin.rows.length) {
    return respondIfValid(res, admin.rows[0], password, 'admin', buildAdminProfile);
  }

  const teacher = await pool.query(
    'SELECT * FROM teachers WHERE nip = $1 OR nip_legacy_real = $2',
    [normalizedIdentifier, Number.isFinite(legacyNip) ? legacyNip : null]
  );
  if (teacher.rows.length) {
    return respondIfValidTeacher(res, teacher.rows[0], password);
  }

  const student = await pool.query(
    'SELECT * FROM students WHERE nis = $1 OR nis_legacy_bigint = $2',
    [normalizedIdentifier, legacyNis]
  );
  if (student.rows.length) {
    return respondIfValid(res, student.rows[0], password, 'student', (u) => ({
      id: u.id, name: u.name, nis: u.nis,
    }));
  }

  return fail(res, 401, 'NIP/NIS/email atau kata sandi salah');
}

async function respondIfValid(res, user, password, role, buildProfile) {
  if (!comparePassword(password, user.password_hash)) {
    return fail(res, 401, 'NIP/NIS/email atau kata sandi salah');
  }
  const token = signToken({ sub: user.id, role, isHomeroomOf: [] });
  const academicPeriod = await getActiveAcademicPeriod();
  return ok(res, {
    token,
    role,
    profile: { ...buildProfile(user), academicPeriod },
  }, 'Berhasil masuk');
}

async function respondIfValidTeacher(res, teacher, password) {
  if (!comparePassword(password, teacher.password_hash)) {
    return fail(res, 401, 'NIP/NIS/email atau kata sandi salah');
  }
  const homeroomClasses = await pool.query(
    'SELECT id FROM classes WHERE homeroom_teacher_id = $1',
    [teacher.id]
  );
  const isHomeroomOf = homeroomClasses.rows.map((r) => r.id);
  const academicPeriod = await getActiveAcademicPeriod();
  const token = signToken({ sub: teacher.id, role: 'teacher', isHomeroomOf });
  return ok(res, {
    token,
    role: 'teacher',
    profile: {
      id: teacher.id,
      name: teacher.name,
      nip: teacher.nip,
      isHomeroom: isHomeroomOf.length > 0,
      homeroomClassId: isHomeroomOf[0] || null,
      academicPeriod,
    },
  }, 'Berhasil masuk');
}

async function getActiveAcademicPeriod() {
  const { rows } = await pool.query(
    `SELECT ay.name AS academic_year, sem.name AS semester
     FROM semesters sem
     JOIN academic_years ay ON ay.id = sem.academic_year_id
     WHERE sem.is_active = true AND ay.is_active = true
     ORDER BY ay.name DESC
     LIMIT 1`,
  );
  return rows.length
    ? { academicYear: rows[0].academic_year, semester: rows[0].semester }
    : null;
}

function buildAdminProfile(u) {
  return { id: u.id, name: u.name, email: u.email };
}

module.exports = { login };
