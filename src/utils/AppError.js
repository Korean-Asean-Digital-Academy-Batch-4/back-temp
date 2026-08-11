class AppError extends Error {
  constructor(statusCode, message, errors = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
  }

  static badRequest(message, errors) { return new AppError(400, message, errors); }
  static unauthorized(message = 'Belum masuk / token tidak valid') { return new AppError(401, message); }
  static forbidden(message = 'Anda tidak berwenang melakukan aksi ini') { return new AppError(403, message); }
  static notFound(message = 'Data tidak ditemukan') { return new AppError(404, message); }
  static conflict(message, errors) { return new AppError(409, message, errors); }
  static unprocessable(message, errors) { return new AppError(422, message, errors); }
}

module.exports = AppError;
