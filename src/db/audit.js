require('dotenv').config();

const { Pool } = require('pg');

const EXPECTED_SCHEMA = {
  administrators: ['id', 'name', 'email', 'password_hash', 'created_at'],
  teachers: ['id', 'nip', 'name', 'password_hash', 'created_at'],
  students: ['id', 'nis', 'name', 'password_hash', 'created_at'],
  academic_years: ['id', 'name', 'is_active'],
  semesters: ['id', 'academic_year_id', 'name', 'is_active'],
  subjects: ['id', 'name', 'grade_level', 'kkm', 'teacher_id', 'created_at'],
  classes: ['id', 'name', 'grade_level', 'semester_id', 'homeroom_teacher_id', 'created_at'],
  class_subjects: ['id', 'class_id', 'subject_id'],
  class_students: ['id', 'class_id', 'student_id'],
  assessment_components: ['id', 'code', 'weight_percent', 'sort_order'],
  assessment_topics: ['id', 'class_id', 'subject_id', 'component_id', 'topic', 'updated_by_teacher_id', 'updated_at'],
  grades: ['id', 'student_id', 'class_id', 'subject_id', 'component_id', 'score', 'filled_by_teacher_id', 'updated_at'],
  attendance_sessions: ['id', 'class_id', 'subject_id', 'teacher_id', 'session_date', 'created_at'],
  attendance_records: ['id', 'session_id', 'student_id', 'status', 'updated_at'],
  report_cards: ['id', 'class_id', 'student_id', 'semester_id', 'status', 'general_note', 'finalized_by', 'finalized_at', 'distributed_by', 'distributed_at', 'created_at'],
};

const EXPECTED_INDEXES = [
  'idx_grades_class_subject',
  'idx_grades_student',
  'idx_classes_semester',
  'idx_class_students_student',
  'idx_attendance_sessions_class',
  'idx_report_cards_class',
  'idx_attendance_sessions_subject',
  'idx_classes_homeroom_teacher',
  'idx_grades_filled_by_teacher',
  'idx_report_cards_finalized_by',
  'idx_report_cards_distributed_by',
  'idx_assessment_topics_component',
  'idx_assessment_topics_teacher',
];

const UUID_COLUMNS = [
  ['administrators', 'id'], ['teachers', 'id'], ['students', 'id'],
  ['academic_years', 'id'], ['semesters', 'id'], ['semesters', 'academic_year_id'],
  ['subjects', 'id'], ['subjects', 'teacher_id'],
  ['classes', 'id'], ['classes', 'semester_id'], ['classes', 'homeroom_teacher_id'],
  ['class_subjects', 'id'], ['class_subjects', 'class_id'], ['class_subjects', 'subject_id'],
  ['class_students', 'id'], ['class_students', 'class_id'], ['class_students', 'student_id'],
  ['assessment_components', 'id'],
  ['assessment_topics', 'id'], ['assessment_topics', 'class_id'],
  ['assessment_topics', 'subject_id'], ['assessment_topics', 'component_id'],
  ['assessment_topics', 'updated_by_teacher_id'],
  ['grades', 'id'], ['grades', 'student_id'], ['grades', 'class_id'],
  ['grades', 'subject_id'], ['grades', 'component_id'], ['grades', 'filled_by_teacher_id'],
  ['attendance_sessions', 'id'], ['attendance_sessions', 'class_id'],
  ['attendance_sessions', 'subject_id'], ['attendance_sessions', 'teacher_id'],
  ['attendance_records', 'id'], ['attendance_records', 'session_id'],
  ['attendance_records', 'student_id'],
  ['report_cards', 'id'], ['report_cards', 'class_id'], ['report_cards', 'student_id'],
  ['report_cards', 'semester_id'], ['report_cards', 'finalized_by'],
  ['report_cards', 'distributed_by'],
];

const TIMESTAMP_COLUMNS = [
  ['administrators', 'created_at'], ['teachers', 'created_at'],
  ['students', 'created_at'], ['subjects', 'created_at'], ['classes', 'created_at'],
  ['grades', 'updated_at'], ['attendance_sessions', 'created_at'],
  ['attendance_records', 'updated_at'], ['report_cards', 'finalized_at'],
  ['assessment_topics', 'updated_at'],
  ['report_cards', 'distributed_at'], ['report_cards', 'created_at'],
];

const EXPECTED_TYPES = new Map([
  ...UUID_COLUMNS.map(([table, column]) => [`${table}.${column}`, ['uuid']]),
  ...TIMESTAMP_COLUMNS.map(([table, column]) => [`${table}.${column}`, ['timestamptz']]),
  ['teachers.nip', ['text', 'varchar']],
  ['students.nis', ['text', 'varchar']],
  ['subjects.kkm', ['numeric']],
  ['assessment_components.weight_percent', ['numeric']],
  ['grades.score', ['numeric']],
  ['attendance_sessions.session_date', ['date']],
]);

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL wajib diisi');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const tableNames = Object.keys(EXPECTED_SCHEMA);
    const [columns, security, privileges, indexes, triggers, constraints, quality] = await Promise.all([
      pool.query(`
        SELECT table_name, column_name, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY($1)
        ORDER BY table_name, ordinal_position
      `, [tableNames]),
      pool.query(`
        SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1)
        ORDER BY c.relname
      `, [tableNames]),
      pool.query(`
        SELECT grantee, table_name, privilege_type
        FROM information_schema.role_table_grants
        WHERE table_schema = 'public'
          AND table_name = ANY($1)
          AND grantee = ANY($2)
          AND privilege_type = ANY($3)
        ORDER BY grantee, table_name, privilege_type
      `, [tableNames, ['anon', 'authenticated', 'service_role'], ['SELECT', 'INSERT', 'UPDATE', 'DELETE']]),
      pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = ANY($1)
      `, [EXPECTED_INDEXES]),
      pool.query(`
        SELECT tgname
        FROM pg_trigger
        WHERE tgname = ANY($1) AND NOT tgisinternal
      `, [['trg_grades_updated_at', 'trg_attendance_records_updated_at', 'trg_assessment_topics_updated_at']]),
      pool.query(`
        SELECT contype, count(*)::int AS count
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = ANY($1)
        GROUP BY contype
      `, [tableNames]),
      pool.query(`
        SELECT
          (SELECT count(*) FROM academic_years WHERE is_active)::int AS active_academic_years,
          (SELECT count(*) FROM semesters WHERE is_active)::int AS active_semesters,
          (SELECT count(*) FROM assessment_components)::int AS component_count,
          (SELECT coalesce(sum(weight_percent), 0) FROM assessment_components)::numeric AS component_weight,
          (SELECT count(*) FROM assessment_topics)::int AS assessment_topic_count,
          (SELECT count(*) FROM assessment_topics
            WHERE topic <> btrim(topic) OR char_length(btrim(topic)) NOT BETWEEN 1 AND 100
          )::int AS invalid_assessment_topics,
          (SELECT count(*) FROM class_subjects cs
            JOIN classes c ON c.id = cs.class_id
            JOIN subjects s ON s.id = cs.subject_id
            WHERE c.grade_level <> s.grade_level)::int AS class_subject_grade_mismatch,
          (SELECT count(*) FROM grades g
            WHERE NOT EXISTS (
              SELECT 1 FROM class_students cs
              WHERE cs.class_id = g.class_id AND cs.student_id = g.student_id
            ))::int AS grade_student_not_enrolled,
          (SELECT count(*) FROM grades g
            WHERE NOT EXISTS (
              SELECT 1 FROM class_subjects cs
              WHERE cs.class_id = g.class_id AND cs.subject_id = g.subject_id
            ))::int AS grade_subject_not_assigned,
          (SELECT count(*) FROM attendance_sessions ses
            JOIN subjects s ON s.id = ses.subject_id
            WHERE ses.teacher_id <> s.teacher_id)::int AS attendance_teacher_mismatch,
          (SELECT count(*) FROM attendance_sessions ses
            JOIN class_students cs ON cs.class_id = ses.class_id
            LEFT JOIN attendance_records ar
              ON ar.session_id = ses.id AND ar.student_id = cs.student_id
            WHERE ar.id IS NULL)::int AS attendance_missing_records,
          (SELECT count(*) FROM attendance_records ar
            JOIN attendance_sessions ses ON ses.id = ar.session_id
            WHERE NOT EXISTS (
              SELECT 1 FROM class_students cs
              WHERE cs.class_id = ses.class_id AND cs.student_id = ar.student_id
            ))::int AS attendance_unenrolled_records
      `),
    ]);

    const actualColumns = new Map();
    for (const row of columns.rows) {
      if (!actualColumns.has(row.table_name)) actualColumns.set(row.table_name, new Map());
      actualColumns.get(row.table_name).set(row.column_name, row.udt_name);
    }

    const missingTables = tableNames.filter((name) => !actualColumns.has(name));
    const missingColumns = {};
    for (const [table, expected] of Object.entries(EXPECTED_SCHEMA)) {
      const actual = actualColumns.get(table) || new Map();
      const missing = expected.filter((column) => !actual.has(column));
      if (missing.length) missingColumns[table] = missing;
    }

    const typeMismatches = [];
    for (const [key, allowedTypes] of EXPECTED_TYPES) {
      const [table, column] = key.split('.');
      const actualType = actualColumns.get(table)?.get(column);
      if (actualType && !allowedTypes.includes(actualType)) {
        typeMismatches.push({ column: key, expected: allowedTypes, actual: actualType });
      }
    }

    const rlsEnabled = security.rows.filter((row) => row.rls_enabled).length;
    const existingIndexes = new Set(indexes.rows.map((row) => row.indexname));
    const missingIndexes = EXPECTED_INDEXES.filter((name) => !existingIndexes.has(name));
    const rowCounts = {};
    for (const table of tableNames) {
      const result = await pool.query(`SELECT count(*)::int AS count FROM public.${table}`);
      rowCounts[table] = result.rows[0].count;
    }

    const result = {
      schema: { expectedTables: tableNames.length, missingTables, missingColumns, typeMismatches },
      data: { rowCounts, ...quality.rows[0] },
      security: {
        rlsEnabled,
        rlsExpected: tableNames.length,
        exposedPrivilegeCount: privileges.rowCount,
      },
      indexes: { missing: missingIndexes },
      triggers: { available: triggers.rows.map((row) => row.tgname).sort(), expected: 3 },
      constraints: Object.fromEntries(constraints.rows.map((row) => [row.contype, row.count])),
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Audit gagal: ${error.message}`);
  process.exitCode = 1;
});
