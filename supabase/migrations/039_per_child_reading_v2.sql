-- Migration 039: Per-Child Reading v2
-- Adds per-child bilingual reading-level fields, audio (TTS read-along) fields,
-- recommendation/personalization fields, and a recommend-pool index.
--
-- Authoritative spec: .planning/topic-matrix-v2.md  §5c, §5d, §5e
--
-- Scope:
--   1) ALTER children: bilingual reading levels (en/zh + caps), TTS/pinyin toggles,
--      category priorities, interest signals, last-categories rotation memory.
--   2) ALTER reading_articles: pack linkage (denormalized, no FK by design),
--      Chinese TTS audio fields, content warnings.
--   3) Index reading_articles for the recommendation pool query.
--   4) One-time idempotent backfill: copy children.reading_level -> reading_level_en
--      only when reading_level_en is still default ('L3'), to preserve existing
--      per-child level after migration 033.
--
-- Hard rules:
--   * All ADD COLUMN statements use IF NOT EXISTS.
--   * CREATE INDEX uses IF NOT EXISTS.
--   * No new RLS policies (existing children/reading_articles RLS still applies).
--   * No foreign key from reading_articles.pack_id -> topic_packs (intentional).

BEGIN;

-- ============================================================================
-- 1) children: per-child reading-level + audio + personalization fields (§5c)
-- ============================================================================

-- English reading level (RAZ L1-L12)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS reading_level_en TEXT DEFAULT 'L3'
  CHECK (reading_level_en IN (
    'L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12'
  ));

-- English reading level cap (parent-set ceiling; nullable = no cap)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS reading_level_en_max TEXT;

-- Chinese reading level (RAZ-aligned L1-L12; HSK reference in 033)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS reading_level_zh TEXT DEFAULT 'L3'
  CHECK (reading_level_zh IN (
    'L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12'
  ));

-- Chinese reading level cap (parent-set ceiling; nullable = no cap)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS reading_level_zh_max TEXT;

-- TTS read-along toggle for Chinese articles
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS audio_zh_enabled BOOLEAN DEFAULT TRUE;

-- Pinyin display toggle for Chinese articles
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS pinyin_enabled BOOLEAN DEFAULT TRUE;

-- Per-category recommendation weight overrides ({ category_key: weight })
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS category_priorities JSONB DEFAULT '{}'::jsonb;

-- Interest signal (decayed engagement scores per topic/category)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS interest_signal JSONB DEFAULT '{}'::jsonb;

-- Recently shown categories (rotation memory; FIFO managed by app layer)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS last_categories TEXT[] DEFAULT '{}';


-- ============================================================================
-- 2) reading_articles: pack linkage + audio + content warnings (§5d)
-- ============================================================================

-- Topic-pack id (denormalized; intentionally NO FK to topic_packs to allow
-- pack rotation/replacement without cascading article cleanup).
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS pack_id TEXT;

-- Order of this article within its pack (nullable for non-pack articles)
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS pack_order INT;

-- Chinese TTS audio asset URL (read-along)
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS audio_zh_url TEXT;

-- Word/sentence-level alignment for read-along highlighting
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS audio_zh_alignment JSONB;

-- TTS voice identifier used to generate audio_zh_url
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS audio_zh_voice TEXT;

-- Content warning tags (e.g. {'mild_violence','scary_imagery'}); empty = none
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS content_warnings TEXT[] DEFAULT '{}';


-- ============================================================================
-- 3) Recommendation-pool index (§5e)
-- ============================================================================

-- Partial index for the hot recommend-pool query:
--   SELECT ... FROM reading_articles
--    WHERE status = 'published' AND language = ? AND raz_level = ?
CREATE INDEX IF NOT EXISTS idx_reading_articles_recommend_pool
  ON reading_articles (status, language, raz_level)
  WHERE status = 'published';


-- ============================================================================
-- 4) One-time backfill (idempotent)
-- ============================================================================
-- Copy legacy single reading_level -> reading_level_en, but ONLY for rows
-- still at the default ('L3'). This guard makes the statement safe to re-run
-- and prevents overwriting any value set after 039 has run.
UPDATE children
SET reading_level_en = reading_level
WHERE reading_level IS NOT NULL
  AND reading_level_en = 'L3';

COMMIT;

-- ============================================================================
-- Rollback (DO NOT EXECUTE; reference only)
-- ============================================================================
-- BEGIN;
-- DROP INDEX IF EXISTS idx_reading_articles_recommend_pool;
--
-- ALTER TABLE reading_articles DROP COLUMN IF EXISTS content_warnings;
-- ALTER TABLE reading_articles DROP COLUMN IF EXISTS audio_zh_voice;
-- ALTER TABLE reading_articles DROP COLUMN IF EXISTS audio_zh_alignment;
-- ALTER TABLE reading_articles DROP COLUMN IF EXISTS audio_zh_url;
-- ALTER TABLE reading_articles DROP COLUMN IF EXISTS pack_order;
-- ALTER TABLE reading_articles DROP COLUMN IF EXISTS pack_id;
--
-- ALTER TABLE children DROP COLUMN IF EXISTS last_categories;
-- ALTER TABLE children DROP COLUMN IF EXISTS interest_signal;
-- ALTER TABLE children DROP COLUMN IF EXISTS category_priorities;
-- ALTER TABLE children DROP COLUMN IF EXISTS pinyin_enabled;
-- ALTER TABLE children DROP COLUMN IF EXISTS audio_zh_enabled;
-- ALTER TABLE children DROP COLUMN IF EXISTS reading_level_zh_max;
-- ALTER TABLE children DROP COLUMN IF EXISTS reading_level_zh;
-- ALTER TABLE children DROP COLUMN IF EXISTS reading_level_en_max;
-- ALTER TABLE children DROP COLUMN IF EXISTS reading_level_en;
-- COMMIT;
