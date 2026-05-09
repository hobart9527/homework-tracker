-- ============================================================================
-- Reading Pipeline Migrations — Combined Script
-- Run this in Supabase Dashboard → SQL Editor (New query)
-- ============================================================================
-- This file combines migrations 035 + 036 + 037 into a single idempotent script.
-- Safe to re-run. All statements use IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 035: reading_topics table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reading_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('zh', 'en')),
  category TEXT NOT NULL,
  source_text TEXT,
  source_url TEXT,
  target_grades INT[] NOT NULL DEFAULT '{}',
  image_tier TEXT DEFAULT 'standard',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic_key, language)
);

CREATE INDEX IF NOT EXISTS reading_topics_lang_status ON reading_topics (language, status);
CREATE INDEX IF NOT EXISTS reading_topics_category ON reading_topics (category);

CREATE OR REPLACE FUNCTION reading_topics_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reading_topics_set_updated_at ON reading_topics;
CREATE TRIGGER reading_topics_set_updated_at
  BEFORE UPDATE ON reading_topics
  FOR EACH ROW
  EXECUTE FUNCTION reading_topics_set_updated_at();

ALTER TABLE reading_topics ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read active topics"
    ON reading_topics FOR SELECT
    USING (auth.role() = 'authenticated' AND status = 'active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on reading_topics"
    ON reading_topics FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 036: reading_article_illustrations table + reading-media Storage bucket
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reading_article_illustrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  paragraph_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  source_url TEXT,
  source TEXT CHECK (source IN ('minimax', 'pollinations')),
  scene_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reading_article_illustrations_article
  ON reading_article_illustrations (article_id, paragraph_index);

ALTER TABLE reading_article_illustrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read illustrations"
    ON reading_article_illustrations FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role manages illustrations"
    ON reading_article_illustrations FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('reading-media', 'reading-media', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DO $$ BEGIN
  CREATE POLICY "reading-media public read"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'reading-media');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- ---------------------------------------------------------------------------
-- 037: reading_articles extras + quota table + atomic RPC
-- ---------------------------------------------------------------------------

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS scene_description TEXT;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS cover_source TEXT;

DO $$ BEGIN
  ALTER TABLE reading_articles
    ADD CONSTRAINT reading_articles_cover_source_check
    CHECK (cover_source IS NULL OR cover_source IN ('minimax', 'pollinations'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS cover_source_url TEXT;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS quality_issues JSONB;

CREATE TABLE IF NOT EXISTS reading_image_quota_daily (
  date DATE PRIMARY KEY,
  used_count INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 50
);

ALTER TABLE reading_image_quota_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages quota"
    ON reading_image_quota_daily FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION increment_minimax_quota(p_date DATE, p_limit INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  current_used INTEGER;
BEGIN
  INSERT INTO reading_image_quota_daily (date, used_count, daily_limit)
  VALUES (p_date, 0, p_limit)
  ON CONFLICT (date) DO NOTHING;

  UPDATE reading_image_quota_daily
     SET used_count = used_count + 1
   WHERE date = p_date
     AND used_count < p_limit
  RETURNING used_count INTO current_used;

  RETURN current_used IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
