require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const sql = fs.readFileSync(path.join(__dirname, 'add-assessment-topics.sql'), 'utf8');
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(sql);
    const verification = await client.query(`
      SELECT
        to_regclass('public.assessment_topics') IS NOT NULL AS table_exists,
        (SELECT count(*)::int FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname IN ('idx_assessment_topics_component', 'idx_assessment_topics_teacher')) AS index_count,
        (SELECT count(*)::int FROM pg_trigger
          WHERE tgname = 'trg_assessment_topics_updated_at' AND NOT tgisinternal) AS trigger_count
    `);
    const result = verification.rows[0];
    if (!result.table_exists || result.index_count !== 2 || result.trigger_count !== 1) {
      throw new Error(`Verifikasi gagal: table=${result.table_exists}, indexes=${result.index_count}, trigger=${result.trigger_count}`);
    }
    await client.query('COMMIT');
    console.log('Migrasi assessment_topics selesai: tabel, 2 indeks, trigger, dan RLS tersedia.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Migrasi assessment_topics gagal: ${error.message}`);
  process.exitCode = 1;
});

