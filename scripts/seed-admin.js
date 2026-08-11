// Membuat akun Administrator pertama (tidak ada endpoint signup — Admin dibuat lewat CLI).
// Usage: node scripts/seed-admin.js <email> <password> <name>
require('dotenv').config();
const { pool } = require('../src/db/pool');
const { hashPassword } = require('../src/utils/password');

async function main() {
  const [email, password, name] = process.argv.slice(2);
  if (!email || !password || !name) {
    console.log('Usage: node scripts/seed-admin.js <email> <password> "<name>"');
    process.exit(1);
  }
  await pool.query(
    'INSERT INTO administrators (name, email, password_hash) VALUES ($1, $2, $3)',
    [name, email, hashPassword(password)]
  );
  console.log(`Administrator "${name}" <${email}> berhasil dibuat.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
