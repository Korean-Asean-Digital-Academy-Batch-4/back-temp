const { verifyToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

// Mengisi req.user dari JWT: { id, role, isHomeroomOf: [classId,...] }
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized());
  }
  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(AppError.unauthorized('Token tidak valid atau kedaluwarsa'));
  }
}

module.exports = { authenticate };
