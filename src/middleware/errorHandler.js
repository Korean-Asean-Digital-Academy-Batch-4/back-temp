const AppError = require('../utils/AppError');
const { fail } = require('../utils/response');

function notFoundHandler(req, res) {
  return fail(res, 404, 'Endpoint tidak ditemukan');
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return fail(res, err.statusCode, err.message, err.errors);
  }

  // Konflik unique constraint Postgres
  if (err.code === '23505') {
    return fail(res, 409, 'Data sudah ada / duplikat', { detail: err.detail });
  }
  // Foreign key violation
  if (err.code === '23503') {
    return fail(res, 400, 'Referensi data tidak valid', { detail: err.detail });
  }

  console.error(err); // eslint-disable-line no-console
  return fail(res, 500, 'Terjadi kesalahan pada server');
}

module.exports = { notFoundHandler, errorHandler };
