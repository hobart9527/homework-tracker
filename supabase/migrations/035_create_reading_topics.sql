-- Reading Topics: single source of truth for the curated topic catalog.
-- Replaces the four hardcoded topic lists previously embedded in:
--   - scripts/reading-content-pipeline.mjs (CURATED_NEWS, 10 entries)
--   - scripts/seed-reading-content.mjs (TOPICS, 60 rows / 35 unique topics)
--   - scripts/seed-chinese-reading-content.mjs (CHINESE_SEED_TOPICS, 30 entries)
--   - src/app/api/reading/refresh-news/route.ts (CURATED_NEWS, 33 entries)
-- See .planning/reading-pipeline-task-plan.md §3.1 for the frozen contract.

-- 1. Create the reading_topics table
CREATE TABLE IF NOT EXISTS reading_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('zh', 'en')),
  category TEXT NOT NULL,
  source_text TEXT,                                   -- nullable for zh (no fixed source text)
  source_url TEXT,
  target_grades INT[] NOT NULL DEFAULT '{}',
  image_tier TEXT DEFAULT 'standard',                 -- reserved for P2 model-tier routing
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (topic_key, language)
);

-- 2. Indexes for the two main query patterns
CREATE INDEX IF NOT EXISTS reading_topics_lang_status
  ON reading_topics (language, status);

CREATE INDEX IF NOT EXISTS reading_topics_category
  ON reading_topics (category);

-- 3. Auto-update updated_at on row changes.
-- A reusable trigger function may already exist in the schema; create one
-- scoped to this table to avoid colliding with prior migrations.
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

-- 4. Row Level Security
ALTER TABLE reading_topics ENABLE ROW LEVEL SECURITY;

-- 4a. authenticated role: read active topics (public catalog)
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read active topics"
    ON reading_topics FOR SELECT
    USING (auth.role() = 'authenticated' AND status = 'active');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4b. service_role: full access for cron pipelines and admin scripts
DO $$ BEGIN
  CREATE POLICY "Service role full access on reading_topics"
    ON reading_topics FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
