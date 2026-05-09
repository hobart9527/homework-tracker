-- Wave 1 / W1-T2: Reading article illustrations table + reading-media Storage bucket
-- Frozen contract: .planning/reading-pipeline-task-plan.md §3.2 + §3.4
-- Idempotent: safe to re-run.

BEGIN;

-- 1. reading_article_illustrations table (frozen schema §3.2)
CREATE TABLE IF NOT EXISTS reading_article_illustrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  paragraph_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,                                  -- Supabase Storage URL after upload
  source_url TEXT,                                          -- external CDN URL kept for traceability
  source TEXT CHECK (source IN ('minimax', 'pollinations')),
  scene_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Index for paragraph-ordered lookup per article
CREATE INDEX IF NOT EXISTS reading_article_illustrations_article
  ON reading_article_illustrations (article_id, paragraph_index);

-- 3. Enable RLS
ALTER TABLE reading_article_illustrations ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies
-- Public read for authenticated users (mirrors reading_articles authenticated-read pattern)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read illustrations"
    ON reading_article_illustrations FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- service_role bypasses RLS by default in Supabase, so no explicit ALL policy is needed.
-- Keeping an explicit policy for clarity and audit:
DO $$ BEGIN
  CREATE POLICY "Service role manages illustrations"
    ON reading_article_illustrations FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Storage bucket: reading-media
-- Path layout: covers/{articleId}.webp, illustrations/{articleId}/{paragraphIndex}.webp
-- Public read; service_role write only.
INSERT INTO storage.buckets (id, name, public)
VALUES ('reading-media', 'reading-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- 6. Storage policies on storage.objects scoped to bucket_id = 'reading-media'
-- Public read (anon + authenticated), since the bucket is public
DO $$ BEGIN
  CREATE POLICY "reading-media public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'reading-media');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- service_role write/update/delete (bucket is service-role-write only)
DO $$ BEGIN
  CREATE POLICY "reading-media service role insert"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'reading-media' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "reading-media service role update"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'reading-media' AND auth.role() = 'service_role')
    WITH CHECK (bucket_id = 'reading-media' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "reading-media service role delete"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'reading-media' AND auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
