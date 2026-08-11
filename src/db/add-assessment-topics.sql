-- Penyimpanan topik per kelas, mata pelajaran, dan komponen penilaian.
CREATE TABLE IF NOT EXISTS public.assessment_topics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id              UUID NOT NULL,
  subject_id            UUID NOT NULL,
  component_id          UUID NOT NULL REFERENCES public.assessment_components(id) ON DELETE RESTRICT,
  topic                 TEXT NOT NULL,
  updated_by_teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessment_topics_class_subject_fkey
    FOREIGN KEY (class_id, subject_id)
    REFERENCES public.class_subjects(class_id, subject_id)
    ON DELETE CASCADE,
  CONSTRAINT assessment_topics_class_subject_component_key
    UNIQUE (class_id, subject_id, component_id),
  CONSTRAINT assessment_topics_topic_check
    CHECK (char_length(btrim(topic)) BETWEEN 1 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_assessment_topics_component
  ON public.assessment_topics (component_id);
CREATE INDEX IF NOT EXISTS idx_assessment_topics_teacher
  ON public.assessment_topics (updated_by_teacher_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_assessment_topics_updated_at' AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_assessment_topics_updated_at
      BEFORE UPDATE ON public.assessment_topics
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.assessment_topics ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.assessment_topics
FROM anon, authenticated, service_role;

