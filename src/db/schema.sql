-- ============================================================================
-- EduTrack — PostgreSQL Schema (MVP)
-- Turunan teknis dari PRD.md (EDU-2026-001, v3.0)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- untuk gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Helper: trigger updated_at otomatis
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Akun
-- ---------------------------------------------------------------------------
CREATE TABLE administrators (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teachers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nip           TEXT NOT NULL UNIQUE,          -- login
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,                 -- kata sandi awal dibuat sistem
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE students (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nis           TEXT NOT NULL UNIQUE,          -- login, kunci pencocokan import
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Periode akademik
-- ---------------------------------------------------------------------------
CREATE TABLE academic_years (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL UNIQUE,              -- cth "2026/2027"
  is_active BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE semesters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  name             TEXT NOT NULL CHECK (name IN ('Ganjil', 'Genap')),
  is_active        BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (academic_year_id, name)
);

-- ---------------------------------------------------------------------------
-- Mata pelajaran (lapis 1 & 2: per jenjang + 1 guru pengampu)
-- ---------------------------------------------------------------------------
CREATE TABLE subjects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,                   -- cth "Biologi"
  grade_level TEXT NOT NULL CHECK (grade_level IN ('X', 'XI', 'XII')),
  kkm         NUMERIC(5,2) NOT NULL DEFAULT 75, -- dapat diubah Administrator
  teacher_id  UUID NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, grade_level)
);
COMMENT ON COLUMN subjects.teacher_id IS
  'UNIQUE karena satu guru hanya mengampu tepat satu mata pelajaran pada tepat satu jenjang (§8.2)';

-- ---------------------------------------------------------------------------
-- Kelas (lapis 3) + Wali Kelas
-- ---------------------------------------------------------------------------
CREATE TABLE classes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,           -- cth "X IPA 3"
  grade_level         TEXT NOT NULL CHECK (grade_level IN ('X', 'XI', 'XII')),
  semester_id         UUID NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  homeroom_teacher_id UUID REFERENCES teachers(id) ON DELETE RESTRICT, -- wali kelas
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, semester_id)
);

-- Mata pelajaran (+ guru, implisit via subjects.teacher_id) yang diajarkan di kelas ini
CREATE TABLE class_subjects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  UNIQUE (class_id, subject_id)
);
COMMENT ON TABLE class_subjects IS
  'Validasi wajib di service layer: classes.grade_level HARUS SAMA DENGAN subjects.grade_level (§8.2)';

-- Siswa terdaftar di kelas (via unggah Excel, NIS sbg kunci pencocokan)
CREATE TABLE class_students (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id   UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  UNIQUE (class_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Komponen penilaian (templat bawaan, SATU set untuk seluruh sekolah — §8.3)
-- ---------------------------------------------------------------------------
CREATE TABLE assessment_components (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,          -- T1, T2, T3, U1, U2, U3, UTS, UAS
  weight_percent NUMERIC(5,2) NOT NULL,
  sort_order     INT NOT NULL
);

INSERT INTO assessment_components (code, weight_percent, sort_order) VALUES
  ('T1',  6, 1), ('T2',  6, 2), ('T3',  6, 3),
  ('U1', 10, 4), ('U2', 10, 5), ('U3', 10, 6),
  ('UTS', 26, 7), ('UAS', 26, 8);
-- Total harus tepat 100%. Diverifikasi lewat: SELECT sum(weight_percent) FROM assessment_components; --> 100

-- Topik materi yang diajarkan untuk setiap komponen pada satu mapel di satu kelas.
CREATE TABLE assessment_topics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id              UUID NOT NULL,
  subject_id            UUID NOT NULL,
  component_id          UUID NOT NULL REFERENCES assessment_components(id) ON DELETE RESTRICT,
  topic                 TEXT NOT NULL CHECK (char_length(btrim(topic)) BETWEEN 1 AND 100),
  updated_by_teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (class_id, subject_id)
    REFERENCES class_subjects(class_id, subject_id) ON DELETE CASCADE,
  UNIQUE (class_id, subject_id, component_id)
);
CREATE TRIGGER trg_assessment_topics_updated_at BEFORE UPDATE ON assessment_topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_assessment_topics_component ON assessment_topics (component_id);
CREATE INDEX idx_assessment_topics_teacher ON assessment_topics (updated_by_teacher_id);

-- ---------------------------------------------------------------------------
-- Nilai
-- ---------------------------------------------------------------------------
CREATE TABLE grades (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id           UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  class_id             UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  subject_id           UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  component_id         UUID NOT NULL REFERENCES assessment_components(id) ON DELETE RESTRICT,
  score                NUMERIC(5,2),            -- NULL = belum lengkap. JANGAN default 0 (§8.3)
  filled_by_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, component_id),
  CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);
CREATE TRIGGER trg_grades_updated_at BEFORE UPDATE ON grades
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_grades_class_subject ON grades (class_id, subject_id);
CREATE INDEX idx_grades_student ON grades (student_id);

-- ---------------------------------------------------------------------------
-- Presensi
-- ---------------------------------------------------------------------------
CREATE TABLE attendance_sessions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id     UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  subject_id   UUID NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id   UUID NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  session_date DATE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, class_id, session_date) -- §8.4 poin 1
);

CREATE TABLE attendance_records (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  status     TEXT NOT NULL DEFAULT 'Alpa' CHECK (status IN ('Hadir', 'Izin', 'Sakit', 'Alpa')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
CREATE TRIGGER trg_attendance_records_updated_at BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
COMMENT ON TABLE attendance_records IS
  'Backend WAJIB insert baris utk seluruh siswa kelas (status Alpa) saat sesi dibuat, dalam satu transaksi (§8.4 poin 2)';

-- ---------------------------------------------------------------------------
-- Rapor semester
-- ---------------------------------------------------------------------------
CREATE TABLE report_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        UUID NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  semester_id     UUID NOT NULL REFERENCES semesters(id) ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Finalized', 'Distributed')),
  general_note    TEXT,                          -- catatan umum Wali Kelas
  finalized_by    UUID REFERENCES teachers(id),
  finalized_at    TIMESTAMPTZ,
  distributed_by  UUID REFERENCES teachers(id),
  distributed_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester_id)
);

-- ---------------------------------------------------------------------------
-- Indeks tambahan untuk query umum
-- ---------------------------------------------------------------------------
CREATE INDEX idx_classes_semester ON classes (semester_id);
CREATE INDEX idx_class_students_student ON class_students (student_id);
CREATE INDEX idx_attendance_sessions_class ON attendance_sessions (class_id, session_date);
CREATE INDEX idx_report_cards_class ON report_cards (class_id, semester_id);
CREATE INDEX idx_attendance_sessions_subject ON attendance_sessions (subject_id);
CREATE INDEX idx_classes_homeroom_teacher ON classes (homeroom_teacher_id);
CREATE INDEX idx_grades_filled_by_teacher ON grades (filled_by_teacher_id);
CREATE INDEX idx_report_cards_finalized_by ON report_cards (finalized_by);
CREATE INDEX idx_report_cards_distributed_by ON report_cards (distributed_by);

-- Defense in depth untuk instalasi PostgreSQL/Supabase.
ALTER TABLE administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;

-- Untuk Supabase, jalankan `npm run harden:security` setelah migrasi agar
-- privilege Data API dan default privilege juga dicabut.

-- ---------------------------------------------------------------------------
-- Catatan implementasi (bukan bagian skema, hanya pengingat tim)
-- ---------------------------------------------------------------------------
-- 1. Persentase kehadiran DIHITUNG, bukan disimpan sebagai kolom:
--      hadir% = count(status IN ('Hadir','Izin','Sakit')) / count(*) di attendance_records
--               yang session-nya milik subject tsb, dibagi per mata pelajaran (§8.4).
-- 2. Nilai akhir mata pelajaran juga DIHITUNG saat baca, bukan disimpan:
--      final = SUM(score * weight_percent) / 100  -- HANYA jika seluruh 8 komponen terisi.
-- 3. Tidak ada tabel audit/riwayat perubahan nilai maupun presensi (sesuai PRD §8.4 poin 3-4).
-- 4. Tidak ada tabel untuk AI Insight — hasil AI tidak disimpan (NG14).
