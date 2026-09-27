-- 070_reading_articles_ib_fields_and_raz_trigger.sql
-- Add IB MYP fields (genre, author_purpose, cultural_connection) to reading_articles
-- and auto-sync raz_level from grade_level on insert/update.

BEGIN;

-- 1. Add missing IB MYP metadata columns to reading_articles
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS genre TEXT;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS author_purpose TEXT;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS cultural_connection TEXT;

-- 2. Trigger function to auto-derive raz_level if omitted
CREATE OR REPLACE FUNCTION sync_reading_articles_raz_level()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raz_level IS NULL AND NEW.grade_level IS NOT NULL THEN
    NEW.raz_level := 'L' || LEAST(GREATEST(NEW.grade_level, 1), 12)::TEXT;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_reading_articles_raz_level ON reading_articles;
CREATE TRIGGER trg_sync_reading_articles_raz_level
  BEFORE INSERT OR UPDATE OF grade_level, raz_level
  ON reading_articles
  FOR EACH ROW
  EXECUTE FUNCTION sync_reading_articles_raz_level();

-- 3. Backfill any existing articles that have NULL raz_level
UPDATE reading_articles
SET raz_level = 'L' || LEAST(GREATEST(grade_level, 1), 12)::TEXT
WHERE raz_level IS NULL AND grade_level IS NOT NULL;

COMMIT;
