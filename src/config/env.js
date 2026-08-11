require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Environment variable ${name} wajib diisi`);
  return v;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:4000',
  databaseUrl: required('DATABASE_URL'),
  databasePoolMax: parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  initialPasswordLength: parseInt(process.env.INITIAL_PASSWORD_LENGTH || '8', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  fileUploadMaxSizeMb: parseInt(process.env.FILE_UPLOAD_MAX_SIZE_MB || '5', 10),
  aiModel: process.env.AI_MODEL || 'gemini-2.0-flash',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  aiRequestTimeoutMs: parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '15000', 10),
};
