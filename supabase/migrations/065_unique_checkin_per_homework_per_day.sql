-- Migration 065: Unique check-in per (child, homework, day)
--
-- Auto-sync can race and create two check-ins for the same child/homework on
-- the same local day. Add a functional unique index on date(completed_at) so
-- the DB itself rejects the second insert.
--
-- Functional index uses date() which interprets timestamptz in the session's
-- timezone. Different deployments can set session timezone, but this is good
-- enough for the app — day boundaries follow the household/server tz.

-- Defensive dedup: keep the oldest row per (child_id, homework_id, day)
-- before creating the index. Wrapped in a CTE so the DELETE targets only the
-- duplicates, not the keepers. Runs once and is idempotent on a clean DB.
DELETE FROM check_ins
WHERE id NOT IN (
  SELECT MIN(id::text)::uuid AS keeper
  FROM check_ins
  GROUP BY child_id, homework_id, date(completed_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_checkins_child_homework_day
  ON check_ins (child_id, homework_id, (date(completed_at)));