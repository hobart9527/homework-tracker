-- Topic Packs v2: introduces topic_packs catalog and extends reading_topics
-- with pack ordering, recommended levels, freshness, age gating, and content
-- warnings. Frozen contract: see .planning/topic-matrix-v2.md §5a, §5b, §5e.
--
-- Notes:
--   * language is constrained to 'zh' or 'en'; mixed-language packs ('zh+en')
--     are explicitly forbidden per Q6 resolution in §0.1.
--   * topic_packs is a public catalog (no per-row status); authenticated users
--     may SELECT all rows. Service role retains full access.
--   * Mirrors RLS, trigger, and idempotency patterns from migration 035.

-- 1. topic_packs table (per §5a)
CREATE TABLE IF NOT EXISTS topic_packs (
  pack_id TEXT PRIMARY KEY,
  pack_name_zh TEXT NOT NULL,
  pack_name_en TEXT NOT NULL,
  category TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('zh', 'en')),
  recommended_levels TEXT[] NOT NULL,
  description TEXT,
  total_articles INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Auto-update updated_at on topic_packs row changes
CREATE OR REPLACE FUNCTION topic_packs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS topic_packs_set_updated_at ON topic_packs;
CREATE TRIGGER topic_packs_set_updated_at
  BEFORE UPDATE ON topic_packs
  FOR EACH ROW
  EXECUTE FUNCTION topic_packs_set_updated_at();

-- 3. Row Level Security on topic_packs
ALTER TABLE topic_packs ENABLE ROW LEVEL SECURITY;

-- 3a. authenticated role: read all topic_packs (public catalog, no status column)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read topic_packs"
    ON topic_packs FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3b. service_role: full access for cron pipelines and admin scripts
DO $$ BEGIN
  CREATE POLICY "Service role full access on topic_packs"
    ON topic_packs FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Extend reading_topics with v2 fields (per §5b)
ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS pack_id TEXT REFERENCES topic_packs(pack_id) ON DELETE SET NULL;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS pack_order INT;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS recommended_levels TEXT[] DEFAULT '{}';

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS category_v2 TEXT;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS freshness_until TIMESTAMPTZ;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS age_min_level TEXT;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS content_warnings TEXT[] DEFAULT '{}';

-- 5. Index for pack-ordered lookups (per §5e)
CREATE INDEX IF NOT EXISTS idx_reading_topics_pack_order
  ON reading_topics (pack_id, pack_order)
  WHERE pack_id IS NOT NULL;

-- Rollback (manual, do not execute as part of forward migration):
-- DROP TABLE IF EXISTS topic_packs CASCADE;
-- ALTER TABLE reading_topics
--   DROP COLUMN IF EXISTS pack_id,
--   DROP COLUMN IF EXISTS pack_order,
--   DROP COLUMN IF EXISTS recommended_levels,
--   DROP COLUMN IF EXISTS category_v2,
--   DROP COLUMN IF EXISTS freshness_until,
--   DROP COLUMN IF EXISTS age_min_level,
--   DROP COLUMN IF EXISTS content_warnings;
-- DROP INDEX IF EXISTS idx_reading_topics_pack_order;
-- DROP FUNCTION IF EXISTS topic_packs_set_updated_at();
