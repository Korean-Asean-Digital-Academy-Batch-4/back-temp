const AppError = require('../utils/AppError');

// Batasi endpoint ke role tertentu: requireRole('admin'), requireRole('teacher','admin'), dst.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(AppError.forbidden());
    }
    next();
  };
}

// Khusus endpoint /homeroom/*: guru harus wali kelas dari classId pada param URL,
// kecuali admin (admin selalu boleh, sesuai matriks kewenangan §8.1).
function requireHomeroomOf(paramName = 'classId') {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    if (req.user.role !== 'teacher') return next(AppError.forbidden());
    const classId = req.params[paramName];
    const isHomeroom = (req.user.isHomeroomOf || []).includes(classId);
    if (!isHomeroom) {
      return next(AppError.forbidden('Anda bukan Wali Kelas untuk kelas ini'));
    }
    next();
  };
}

module.exports = { requireRole, requireHomeroomOf };
