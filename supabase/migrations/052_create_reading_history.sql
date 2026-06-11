-- Migration 052: Create reading_history table
--
-- Tracks per-child quiz attempts on reading articles for the L1/L2/L3
-- level-variant reading system.
--
-- Columns derived from usage in src/lib/reading/progression.ts and
-- src/lib/reading/level-router.ts.
--
-- Usage:
--   progression.ts recordAttempt()  -> INSERT INTO reading_history
--   progression.ts getProgress()    -> SELECT ... FROM reading_history WHERE child_id = ?
--   level-router.ts drawArticle()   -> SELECT ... FROM reading_history WHERE child_id = ?
--
-- Security model:
--   Child  -> SELECT own rows (child_id matches auth.uid())
--   Parent -> SELECT children rows (through children.parent_id join)
--   Service role -> full access (admin/cron scripts)

BEGIN;

-- ============================================================================
-- 1) Create reading_history table
-- ============================================================================

CREATE TABLE IF NOT EXISTS reading_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  level_variant TEXT NOT NULL CHECK (level_variant IN ('L1', 'L2', 'L3')),
  correct_count INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  difficulty_feel INTEGER,
  completed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2) Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_reading_history_child_id
  ON reading_history (child_id);

CREATE INDEX IF NOT EXISTS idx_reading_history_child_completed
  ON reading_history (child_id, completed_at DESC);

-- ============================================================================
-- 3) Row Level Security
-- ============================================================================

ALTER TABLE reading_history ENABLE ROW LEVEL SECURITY;

-- Child can read own rows
DO $$ BEGIN
  CREATE POLICY "Child can read own reading_history"
    ON reading_history FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Parent can read children rows
DO $$ BEGIN
  CREATE POLICY "Parent can read children reading_history"
    ON reading_history FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service role full access
DO $$ BEGIN
  CREATE POLICY "Service role full access on reading_history"
    ON reading_history FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
