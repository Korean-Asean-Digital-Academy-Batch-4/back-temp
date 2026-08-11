require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const sql = fs.readFileSync(path.join(__dirname, 'reconcile-legacy-schema.sql'), 'utf8');
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    console.log('Merekonsiliasi schema Supabase hasil duplikasi ...');
    await client.query(sql);

    const verification = await client.query(`
      SELECT
        (SELECT count(*)::int FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = 'public' AND t.relname = ANY($1) AND c.contype = 'p') AS primary_keys,
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)
            AND column_name = 'id' AND udt_name = 'uuid') AS uuid_ids,
        (SELECT count(*)::int FROM information_schema.columns
          WHERE table_schema = 'public' AND is_nullable = 'YES'
            AND (table_name, column_name) IN (
              ('administrators', 'id'), ('teachers', 'id'), ('students', 'id'),
              ('academic_years', 'id'), ('semesters', 'id'), ('subjects', 'id'),
              ('classes', 'id'), ('class_subjects', 'id'), ('class_students', 'id'),
              ('assessment_components', 'id'), ('grades', 'id'),
              ('attendance_sessions', 'id'), ('attendance_records', 'id'),
              ('report_cards', 'id')
            )) AS nullable_ids
    `, [[
      'administrators', 'teachers', 'students', 'academic_years', 'semesters',
      'subjects', 'classes', 'class_subjects', 'class_students',
      'assessment_components', 'grades', 'attendance_sessions',
      'attendance_records', 'report_cards',
    ]]);

    const result = verification.rows[0];
    if (result.primary_keys !== 14 || result.uuid_ids !== 14 || result.nullable_ids !== 0) {
      throw new Error(
        `Verifikasi gagal: PK=${result.primary_keys}, UUID=${result.uuid_ids}, nullable IDs=${result.nullable_ids}`,
      );
    }

    await client.query('COMMIT');
    console.log('Rekonsiliasi selesai: 14 primary key UUID dan constraint aplikasi tersedia.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Rekonsiliasi gagal: ${error.message}`);
  process.exitCode = 1;
});
