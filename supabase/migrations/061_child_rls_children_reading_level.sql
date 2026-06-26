-- Migration 061: Child RLS children UPDATE policy (reading level columns)
--
-- Fixes silent failure when child's auto-level bump writes
-- `reading_level_zh / _en / _zh_max / _en_max` columns.
-- Existing children policies cover parent SELECT and parent ALL only.
--
-- NOTE: Postgres RLS does not support column-level UPDATE policies.
-- This policy allows the child to UPDATE any column on their own row.
-- The trust boundary is enforced at the API layer:
--   /api/reading/quiz/submit constructs the update object with ONLY
--   the four reading_level keys (reading_level_zh, reading_level_en,
--   reading_level_zh_max, reading_level_en_max).
-- That server-side guard prevents child from modifying other columns.
--
-- See: packet wave-20260626-162734 task t2-rls-migrations
-- See also: task t1 (API-level column guard in /api/reading/quiz/submit)

DO $$ BEGIN
  CREATE POLICY "Child can update own reading level"
    ON children FOR UPDATE
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
