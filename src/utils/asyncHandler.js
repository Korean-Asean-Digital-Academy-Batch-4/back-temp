// Membungkus route handler async supaya error-nya otomatis diteruskan ke errorHandler.
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
