-- EduTrack Supabase hardening.
-- Arsitektur aplikasi: Frontend -> Express API -> PostgreSQL.
-- Tidak ada akses tabel langsung dari browser melalui Supabase Data API.

-- Pulihkan helper dan trigger yang dapat tidak ikut saat project diduplikasi.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_grades_updated_at' AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_grades_updated_at
      BEFORE UPDATE ON public.grades
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_attendance_records_updated_at' AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_attendance_records_updated_at
      BEFORE UPDATE ON public.attendance_records
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;

  IF to_regclass('public.assessment_topics') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_assessment_topics_updated_at' AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_assessment_topics_updated_at
      BEFORE UPDATE ON public.assessment_topics
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()';
  END IF;
END;
$$;

-- Tutup tabel aplikasi dari role Data API Supabase yang membawa kunci publik.
REVOKE ALL PRIVILEGES ON TABLE
  public.administrators,
  public.teachers,
  public.students,
  public.academic_years,
  public.semesters,
  public.subjects,
  public.classes,
  public.class_subjects,
  public.class_students,
  public.assessment_components,
  public.assessment_topics,
  public.grades,
  public.attendance_sessions,
  public.attendance_records,
  public.report_cards
FROM anon, authenticated, service_role;

-- Fungsi trigger tidak perlu dapat dipanggil melalui REST/RPC.
REVOKE EXECUTE ON FUNCTION public.set_updated_at()
FROM PUBLIC, anon, authenticated, service_role;

-- Tabel baru harus private secara default sampai diberi grant eksplisit.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES
  FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES
  FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS
  FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Defense in depth. Backend memakai koneksi server-side milik postgres.
ALTER TABLE public.administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_cards ENABLE ROW LEVEL SECURITY;

-- Indeks foreign key yang diperlukan untuk JOIN dan operasi referensial.
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_subject
  ON public.attendance_sessions (subject_id);
CREATE INDEX IF NOT EXISTS idx_classes_homeroom_teacher
  ON public.classes (homeroom_teacher_id);
CREATE INDEX IF NOT EXISTS idx_grades_filled_by_teacher
  ON public.grades (filled_by_teacher_id);
CREATE INDEX IF NOT EXISTS idx_report_cards_finalized_by
  ON public.report_cards (finalized_by);
CREATE INDEX IF NOT EXISTS idx_report_cards_distributed_by
  ON public.report_cards (distributed_by);
CREATE INDEX IF NOT EXISTS idx_assessment_topics_component
  ON public.assessment_topics (component_id);
CREATE INDEX IF NOT EXISTS idx_assessment_topics_teacher
  ON public.assessment_topics (updated_by_teacher_id);
