-- Wave 1 / W1-T2: reading_articles extras + MiniMax daily image quota table + atomic RPC
-- Frozen contract: .planning/reading-pipeline-task-plan.md §3.3 + §3.5
-- Idempotent: safe to re-run.

BEGIN;

-- 1. reading_articles extras (frozen §3.3) — additive only, no destructive change
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS scene_description TEXT;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS cover_source TEXT;

-- Add CHECK constraint for cover_source separately (IF NOT EXISTS via DO block to remain idempotent)
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

-- 2. reading_image_quota_daily table (frozen §3.5)
CREATE TABLE IF NOT EXISTS reading_image_quota_daily (
  date DATE PRIMARY KEY,
  used_count INTEGER NOT NULL DEFAULT 0,
  daily_limit INTEGER NOT NULL DEFAULT 50
);

-- 3. RLS: service_role only (quota is internal accounting)
ALTER TABLE reading_image_quota_daily ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role manages quota"
    ON reading_image_quota_daily FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Atomic increment RPC (frozen §3.5)
--
-- Race-condition protection:
--   - UPDATE ... WHERE used_count < daily_limit RETURNING used_count is performed in a
--     single statement, holding a row-level lock on the matching row for the duration
--     of the UPDATE. Concurrent callers serialize on that lock; only one observes the
--     pre-image where used_count < daily_limit when the limit is one slot away.
--   - Callers that lose the race see RETURNING produce no row, so current_used stays
--     NULL and the function returns false (quota exhausted), letting the app fall back
--     to Pollinations.
--   - The leading INSERT ... ON CONFLICT DO NOTHING seeds today's row idempotently
--     without touching used_count if the row already exists.
--
-- Returns: true  -> slot consumed, caller may call MiniMax
--          false -> quota exhausted, caller must fall back
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
     AND used_count < daily_limit
  RETURNING used_count INTO current_used;

  RETURN current_used IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
