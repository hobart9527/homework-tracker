-- W0b: Audio storage bucket for Chinese read-along feature.
-- Creates the reading-audios bucket if not present, and applies RLS for
-- public read + service-role write.

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES ('reading-audios', 'reading-audios', true, ARRAY['audio/mpeg', 'audio/mp3'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: public read on objects within this bucket
DO $$ BEGIN
  CREATE POLICY "Public read on reading-audios"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'reading-audios');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS: service_role full access (cron pipelines + admin scripts)
DO $$ BEGIN
  CREATE POLICY "Service role write on reading-audios"
    ON storage.objects FOR ALL
    USING (bucket_id = 'reading-audios' AND auth.role() = 'service_role')
    WITH CHECK (bucket_id = 'reading-audios' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Rollback hint:
--   DELETE FROM storage.buckets WHERE id = 'reading-audios';
--   DROP POLICY IF EXISTS "Public read on reading-audios" ON storage.objects;
--   DROP POLICY IF EXISTS "Service role write on reading-audios" ON storage.objects;
