require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const APP_TABLES = [
  'administrators', 'teachers', 'students', 'academic_years', 'semesters',
  'subjects', 'classes', 'class_subjects', 'class_students',
  'assessment_components', 'grades', 'attendance_sessions',
  'attendance_records', 'report_cards', 'assessment_topics',
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const sql = fs.readFileSync(path.join(__dirname, 'security-hardening.sql'), 'utf8');
  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    console.log('Menerapkan hardening Supabase EduTrack ...');
    await client.query(sql);

    const verification = await client.query(`
      SELECT
        count(*) FILTER (WHERE c.relrowsecurity)::int AS rls_enabled_count,
        count(*) FILTER (
          WHERE has_table_privilege('anon', c.oid, 'SELECT')
             OR has_table_privilege('anon', c.oid, 'INSERT')
             OR has_table_privilege('anon', c.oid, 'UPDATE')
             OR has_table_privilege('anon', c.oid, 'DELETE')
             OR has_table_privilege('authenticated', c.oid, 'SELECT')
             OR has_table_privilege('authenticated', c.oid, 'INSERT')
             OR has_table_privilege('authenticated', c.oid, 'UPDATE')
             OR has_table_privilege('authenticated', c.oid, 'DELETE')
             OR has_table_privilege('service_role', c.oid, 'SELECT')
             OR has_table_privilege('service_role', c.oid, 'INSERT')
             OR has_table_privilege('service_role', c.oid, 'UPDATE')
             OR has_table_privilege('service_role', c.oid, 'DELETE')
        )::int AS exposed_table_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname = ANY($1)
    `, [APP_TABLES]);

    const supportingObjects = await client.query(`
      SELECT
        (SELECT count(*)::int
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = ANY($1)) AS index_count,
        (SELECT count(*)::int
          FROM pg_trigger
          WHERE tgname = ANY($2) AND NOT tgisinternal) AS trigger_count
    `, [[
      'idx_attendance_sessions_subject',
      'idx_classes_homeroom_teacher',
      'idx_grades_filled_by_teacher',
      'idx_report_cards_finalized_by',
      'idx_report_cards_distributed_by',
      'idx_assessment_topics_component',
      'idx_assessment_topics_teacher',
    ], ['trg_grades_updated_at', 'trg_attendance_records_updated_at', 'trg_assessment_topics_updated_at']]);

    const result = verification.rows[0];
    const objects = supportingObjects.rows[0];
    if (
      result.rls_enabled_count !== APP_TABLES.length
      || result.exposed_table_count !== 0
      || objects.index_count !== 7
      || objects.trigger_count !== 3
    ) {
      throw new Error(
        `Verifikasi gagal: RLS=${result.rls_enabled_count}, exposed=${result.exposed_table_count}, `
        + `indexes=${objects.index_count}, triggers=${objects.trigger_count}`,
      );
    }
    await client.query('COMMIT');
    console.log(
      `Hardening selesai: ${result.rls_enabled_count} tabel memakai RLS, `
      + '0 tabel terekspos, 7 indeks dan 3 trigger tersedia.',
    );
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Hardening gagal: ${error.message}`);
  process.exitCode = 1;
});
