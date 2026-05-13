-- Content Routing Fields for reading pipeline v2
-- Adds source tracking and content completeness to reading_topics,
-- and content_source routing tag to reading_articles.
-- See docs/pipeline-refactor-plan.md §三 for the frozen contract.
--
-- Rollback:
--   ALTER TABLE reading_topics DROP COLUMN IF EXISTS source, source_image_url, source_quality_score, content_completeness;
--   ALTER TABLE reading_articles DROP COLUMN IF EXISTS content_source;

-- 1. reading_topics: source and image routing fields
ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS source_image_url TEXT;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS source_quality_score FLOAT DEFAULT 0;

ALTER TABLE reading_topics
  ADD COLUMN IF NOT EXISTS content_completeness TEXT DEFAULT 'unknown';

-- 2. reading_articles: route tag
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS content_source TEXT DEFAULT 'llm';

-- 3. Index for source-based queries (pipeline routing)
CREATE INDEX IF NOT EXISTS idx_reading_topics_source
  ON reading_topics (source)
  WHERE source IS NOT NULL;

-- 4. Backfill source from topic_key prefixes (best-effort for existing data)
--    Handled by application-level script; noted here for reference.
