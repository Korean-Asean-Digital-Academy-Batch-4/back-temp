-- Rekonsiliasi project Supabase hasil duplikasi/import agar sesuai schema.sql.
-- Seluruh perubahan dijalankan oleh reconcile.js di dalam satu transaksi.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- NIP/NIS legacy pernah tersimpan sebagai angka. Simpan representasi lamanya agar
-- login/import lama tetap dapat dicocokkan setelah kolom utama menjadi TEXT.
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS nip_legacy_real REAL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS nis_legacy_bigint BIGINT;

DO $$
BEGIN
  IF (
    SELECT udt_name = 'float4'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'teachers' AND column_name = 'nip'
  ) THEN
    UPDATE public.teachers SET nip_legacy_real = nip WHERE nip_legacy_real IS NULL;
    ALTER TABLE public.teachers ALTER COLUMN nip TYPE TEXT
      USING trim(to_char(nip::numeric, 'FM999999999999999999999999999999'));
  END IF;

  IF (
    SELECT udt_name = 'int8'
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'nis'
  ) THEN
    UPDATE public.students SET nis_legacy_bigint = nis WHERE nis_legacy_bigint IS NULL;
    ALTER TABLE public.students ALTER COLUMN nis TYPE TEXT USING nis::text;
  END IF;
END;
$$;

-- Semua ID lama telah divalidasi sebagai UUID sebelum migrasi.
DO $$
DECLARE
  item RECORD;
  current_type TEXT;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('administrators', 'id'),
      ('teachers', 'id'),
      ('students', 'id'),
      ('academic_years', 'id'),
      ('semesters', 'id'), ('semesters', 'academic_year_id'),
      ('subjects', 'id'), ('subjects', 'teacher_id'),
      ('classes', 'id'), ('classes', 'semester_id'), ('classes', 'homeroom_teacher_id'),
      ('class_subjects', 'id'), ('class_subjects', 'class_id'), ('class_subjects', 'subject_id'),
      ('class_students', 'id'), ('class_students', 'class_id'), ('class_students', 'student_id'),
      ('assessment_components', 'id'),
      ('grades', 'id'), ('grades', 'student_id'), ('grades', 'class_id'),
      ('grades', 'subject_id'), ('grades', 'component_id'), ('grades', 'filled_by_teacher_id'),
      ('attendance_sessions', 'id'), ('attendance_sessions', 'class_id'),
      ('attendance_sessions', 'subject_id'), ('attendance_sessions', 'teacher_id'),
      ('attendance_records', 'id'), ('attendance_records', 'session_id'),
      ('attendance_records', 'student_id'),
      ('report_cards', 'id'), ('report_cards', 'class_id'), ('report_cards', 'student_id'),
      ('report_cards', 'semester_id'), ('report_cards', 'finalized_by'),
      ('report_cards', 'distributed_by')
    ) AS columns_to_convert(table_name, column_name)
  LOOP
    SELECT c.udt_name INTO current_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = item.table_name
      AND c.column_name = item.column_name;

    IF current_type IS DISTINCT FROM 'uuid' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE UUID USING nullif(btrim(%I::text), '''')::uuid',
        item.table_name, item.column_name, item.column_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Pulihkan tipe waktu yang sebelumnya tersimpan sebagai varchar.
DO $$
DECLARE
  item RECORD;
  current_type TEXT;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('administrators', 'created_at'),
      ('teachers', 'created_at'),
      ('students', 'created_at'),
      ('subjects', 'created_at'),
      ('classes', 'created_at'),
      ('grades', 'updated_at'),
      ('attendance_sessions', 'created_at'),
      ('attendance_records', 'updated_at'),
      ('report_cards', 'finalized_at'),
      ('report_cards', 'distributed_at'),
      ('report_cards', 'created_at')
    ) AS timestamp_columns(table_name, column_name)
  LOOP
    SELECT c.udt_name INTO current_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = item.table_name
      AND c.column_name = item.column_name;

    IF current_type IS DISTINCT FROM 'timestamptz' THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING nullif(btrim(%I::text), '''')::timestamptz',
        item.table_name, item.column_name, item.column_name
      );
    END IF;
  END LOOP;

  SELECT c.udt_name INTO current_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'attendance_sessions'
    AND c.column_name = 'session_date';

  IF current_type IS DISTINCT FROM 'date' THEN
    ALTER TABLE public.attendance_sessions ALTER COLUMN session_date TYPE DATE
      USING nullif(btrim(session_date::text), '')::date;
  END IF;
END;
$$;

ALTER TABLE public.assessment_components ALTER COLUMN weight_percent TYPE NUMERIC(5,2)
  USING weight_percent::numeric(5,2);
ALTER TABLE public.subjects ALTER COLUMN kkm TYPE NUMERIC(5,2)
  USING kkm::numeric(5,2);
ALTER TABLE public.grades ALTER COLUMN score TYPE NUMERIC(5,2)
  USING score::numeric(5,2);

-- Default yang dibutuhkan seluruh endpoint create/import.
ALTER TABLE public.administrators ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.teachers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.students ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.academic_years ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.semesters ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.subjects ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.classes ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.class_subjects ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.class_students ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.assessment_components ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.grades ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.attendance_sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.attendance_records ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.report_cards ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.administrators ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.teachers ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.students ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.subjects ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.classes ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.grades ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.attendance_sessions ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.attendance_records ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.report_cards ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.academic_years ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE public.semesters ALTER COLUMN is_active SET DEFAULT false;
ALTER TABLE public.subjects ALTER COLUMN kkm SET DEFAULT 75;
ALTER TABLE public.attendance_records ALTER COLUMN status SET DEFAULT 'Alpa';
ALTER TABLE public.report_cards ALTER COLUMN status SET DEFAULT 'Draft';

-- Kolom wajib sesuai kontrak backend.
ALTER TABLE public.administrators
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN email SET NOT NULL, ALTER COLUMN password_hash SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.teachers
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN nip SET NOT NULL,
  ALTER COLUMN name SET NOT NULL, ALTER COLUMN password_hash SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.students
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN nis SET NOT NULL,
  ALTER COLUMN name SET NOT NULL, ALTER COLUMN password_hash SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.academic_years
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.semesters
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN academic_year_id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL, ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.subjects
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN grade_level SET NOT NULL, ALTER COLUMN kkm SET NOT NULL,
  ALTER COLUMN teacher_id SET NOT NULL, ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.classes
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN grade_level SET NOT NULL, ALTER COLUMN semester_id SET NOT NULL,
  ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.class_subjects
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN class_id SET NOT NULL,
  ALTER COLUMN subject_id SET NOT NULL;
ALTER TABLE public.class_students
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN class_id SET NOT NULL,
  ALTER COLUMN student_id SET NOT NULL;
ALTER TABLE public.assessment_components
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN code SET NOT NULL,
  ALTER COLUMN weight_percent SET NOT NULL, ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE public.grades
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN student_id SET NOT NULL,
  ALTER COLUMN class_id SET NOT NULL, ALTER COLUMN subject_id SET NOT NULL,
  ALTER COLUMN component_id SET NOT NULL, ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.attendance_sessions
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN class_id SET NOT NULL,
  ALTER COLUMN subject_id SET NOT NULL, ALTER COLUMN teacher_id SET NOT NULL,
  ALTER COLUMN session_date SET NOT NULL, ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.attendance_records
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN session_id SET NOT NULL,
  ALTER COLUMN student_id SET NOT NULL, ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.report_cards
  ALTER COLUMN id SET NOT NULL, ALTER COLUMN class_id SET NOT NULL,
  ALTER COLUMN student_id SET NOT NULL, ALTER COLUMN semester_id SET NOT NULL,
  ALTER COLUMN status SET NOT NULL, ALTER COLUMN created_at SET NOT NULL;

-- Helper idempoten untuk constraint.
CREATE OR REPLACE FUNCTION pg_temp.ensure_constraint(
  target_table TEXT,
  constraint_name TEXT,
  constraint_definition TEXT
) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = constraint_name
      AND conrelid = format('public.%I', target_table)::regclass
  ) THEN
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I %s',
      target_table, constraint_name, constraint_definition
    );
  END IF;
END;
$$;

SELECT pg_temp.ensure_constraint('administrators', 'administrators_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('teachers', 'teachers_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('students', 'students_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('academic_years', 'academic_years_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('semesters', 'semesters_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('subjects', 'subjects_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('classes', 'classes_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('class_subjects', 'class_subjects_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('class_students', 'class_students_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('assessment_components', 'assessment_components_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('grades', 'grades_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('attendance_sessions', 'attendance_sessions_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('attendance_records', 'attendance_records_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_pkey', 'PRIMARY KEY (id)');

SELECT pg_temp.ensure_constraint('administrators', 'administrators_email_key', 'UNIQUE (email)');
SELECT pg_temp.ensure_constraint('teachers', 'teachers_nip_key', 'UNIQUE (nip)');
SELECT pg_temp.ensure_constraint('students', 'students_nis_key', 'UNIQUE (nis)');
SELECT pg_temp.ensure_constraint('academic_years', 'academic_years_name_key', 'UNIQUE (name)');
SELECT pg_temp.ensure_constraint('semesters', 'semesters_academic_year_name_key', 'UNIQUE (academic_year_id, name)');
SELECT pg_temp.ensure_constraint('subjects', 'subjects_teacher_id_key', 'UNIQUE (teacher_id)');
SELECT pg_temp.ensure_constraint('subjects', 'subjects_name_grade_level_key', 'UNIQUE (name, grade_level)');
SELECT pg_temp.ensure_constraint('classes', 'classes_name_semester_key', 'UNIQUE (name, semester_id)');
SELECT pg_temp.ensure_constraint('class_subjects', 'class_subjects_class_subject_key', 'UNIQUE (class_id, subject_id)');
SELECT pg_temp.ensure_constraint('class_students', 'class_students_class_student_key', 'UNIQUE (class_id, student_id)');
SELECT pg_temp.ensure_constraint('assessment_components', 'assessment_components_code_key', 'UNIQUE (code)');
SELECT pg_temp.ensure_constraint('grades', 'grades_student_subject_component_key', 'UNIQUE (student_id, subject_id, component_id)');
SELECT pg_temp.ensure_constraint('attendance_sessions', 'attendance_sessions_teacher_class_date_key', 'UNIQUE (teacher_id, class_id, session_date)');
SELECT pg_temp.ensure_constraint('attendance_records', 'attendance_records_session_student_key', 'UNIQUE (session_id, student_id)');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_student_semester_key', 'UNIQUE (student_id, semester_id)');

SELECT pg_temp.ensure_constraint('semesters', 'semesters_name_check', $$CHECK (name IN ('Ganjil', 'Genap'))$$);
SELECT pg_temp.ensure_constraint('subjects', 'subjects_grade_level_check', $$CHECK (grade_level IN ('X', 'XI', 'XII'))$$);
SELECT pg_temp.ensure_constraint('subjects', 'subjects_kkm_check', 'CHECK (kkm >= 0 AND kkm <= 100)');
SELECT pg_temp.ensure_constraint('classes', 'classes_grade_level_check', $$CHECK (grade_level IN ('X', 'XI', 'XII'))$$);
SELECT pg_temp.ensure_constraint('assessment_components', 'assessment_components_weight_check', 'CHECK (weight_percent >= 0 AND weight_percent <= 100)');
SELECT pg_temp.ensure_constraint('grades', 'grades_score_check', 'CHECK (score IS NULL OR (score >= 0 AND score <= 100))');
SELECT pg_temp.ensure_constraint('attendance_records', 'attendance_records_status_check', $$CHECK (status IN ('Hadir', 'Izin', 'Sakit', 'Alpa'))$$);
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_status_check', $$CHECK (status IN ('Draft', 'Finalized', 'Distributed'))$$);

SELECT pg_temp.ensure_constraint('semesters', 'semesters_academic_year_fkey', 'FOREIGN KEY (academic_year_id) REFERENCES public.academic_years(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('subjects', 'subjects_teacher_fkey', 'FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('classes', 'classes_semester_fkey', 'FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('classes', 'classes_homeroom_teacher_fkey', 'FOREIGN KEY (homeroom_teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('class_subjects', 'class_subjects_class_fkey', 'FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE');
SELECT pg_temp.ensure_constraint('class_subjects', 'class_subjects_subject_fkey', 'FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('class_students', 'class_students_class_fkey', 'FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE');
SELECT pg_temp.ensure_constraint('class_students', 'class_students_student_fkey', 'FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('grades', 'grades_student_fkey', 'FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('grades', 'grades_class_fkey', 'FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('grades', 'grades_subject_fkey', 'FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('grades', 'grades_component_fkey', 'FOREIGN KEY (component_id) REFERENCES public.assessment_components(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('grades', 'grades_filled_by_teacher_fkey', 'FOREIGN KEY (filled_by_teacher_id) REFERENCES public.teachers(id) ON DELETE SET NULL');
SELECT pg_temp.ensure_constraint('attendance_sessions', 'attendance_sessions_class_fkey', 'FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE');
SELECT pg_temp.ensure_constraint('attendance_sessions', 'attendance_sessions_subject_fkey', 'FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('attendance_sessions', 'attendance_sessions_teacher_fkey', 'FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('attendance_records', 'attendance_records_session_fkey', 'FOREIGN KEY (session_id) REFERENCES public.attendance_sessions(id) ON DELETE CASCADE');
SELECT pg_temp.ensure_constraint('attendance_records', 'attendance_records_student_fkey', 'FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_class_fkey', 'FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_student_fkey', 'FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_semester_fkey', 'FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE RESTRICT');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_finalized_by_fkey', 'FOREIGN KEY (finalized_by) REFERENCES public.teachers(id)');
SELECT pg_temp.ensure_constraint('report_cards', 'report_cards_distributed_by_fkey', 'FOREIGN KEY (distributed_by) REFERENCES public.teachers(id)');

CREATE INDEX IF NOT EXISTS idx_grades_class_subject ON public.grades (class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_grades_student ON public.grades (student_id);
CREATE INDEX IF NOT EXISTS idx_classes_semester ON public.classes (semester_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON public.class_students (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON public.attendance_sessions (class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_report_cards_class ON public.report_cards (class_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_subject ON public.attendance_sessions (subject_id);
CREATE INDEX IF NOT EXISTS idx_classes_homeroom_teacher ON public.classes (homeroom_teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_filled_by_teacher ON public.grades (filled_by_teacher_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_finalized_by ON public.report_cards (finalized_by);
CREATE INDEX IF NOT EXISTS idx_report_cards_distributed_by ON public.report_cards (distributed_by);

