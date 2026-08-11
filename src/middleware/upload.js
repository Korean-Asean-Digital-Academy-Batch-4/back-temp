const multer = require('multer');
const env = require('../config/env');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.fileUploadMaxSizeMb * 1024 * 1024 },
});

module.exports = upload;
