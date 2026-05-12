-- W6-T1: Add summary TEXT and classical_quote JSONB to reading_articles.
-- These columns were added to the remote Supabase instance via Management API
-- during Wave 6-T1 to fix schema drift. This migration ensures idempotent
-- reproducibility for fresh installs.
--
-- Idempotent: safe to re-run (ALTER TABLE ... ADD COLUMN IF NOT EXISTS).

BEGIN;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS summary TEXT;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS classical_quote JSONB;

COMMIT;

-- Rollback (manual, do not execute as part of forward migration):
--   ALTER TABLE reading_articles
--     DROP COLUMN IF EXISTS summary,
--     DROP COLUMN IF EXISTS classical_quote;
