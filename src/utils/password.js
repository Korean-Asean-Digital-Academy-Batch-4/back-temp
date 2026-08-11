const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // tanpa karakter ambigu

// Kata sandi awal dibuat sistem, TANPA syarat kerumitan (PRD §6.1.3) — tetap acak & unik per akun.
function generateInitialPassword(length = env.initialPasswordLength) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function comparePassword(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

module.exports = { generateInitialPassword, hashPassword, comparePassword };
