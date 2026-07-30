-- Migration 065: Unique check-in per (child, homework, day)
--
-- Auto-sync can race and create two check-ins for the same child/homework on
-- the same UTC day. Add a functional unique index so the DB itself rejects
-- the second insert.
--
-- Uses ((completed_at AT TIME ZONE 'UTC')::date) instead of plain date()
-- because PostgreSQL refuses IMMUTABLE indexes on date(timestamptz)
-- (session-timezone-dependent). UTC is a constant timezone, so the cast is
-- IMMUTABLE and index-safe.

-- Defensive dedup: keep the oldest row per (child_id, homework_id, UTC day)
-- before creating the index. Runs once and is idempotent on a clean DB.
DELETE FROM check_ins
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid AS keeper
  FROM check_ins
  GROUP BY child_id, homework_id, ((completed_at AT TIME ZONE 'UTC')::date)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_child_homework_day
  ON check_ins (child_id, homework_id, ((completed_at AT TIME ZONE 'UTC')::date));
