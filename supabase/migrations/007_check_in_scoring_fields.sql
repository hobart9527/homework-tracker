ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS awarded_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_scored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_late BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proof_type TEXT CHECK (proof_type IN ('photo', 'audio'));

UPDATE check_ins
SET
  submitted_at = COALESCE(submitted_at, completed_at, created_at, NOW()),
  awarded_points = CASE
    WHEN awarded_points = 0 AND points_earned > 0 THEN points_earned
    ELSE awarded_points
  END,
  is_scored = CASE
    WHEN points_earned > 0 THEN true
    ELSE is_scored
  END
WHERE
  submitted_at IS NULL
  OR (awarded_points = 0 AND points_earned > 0)
  OR (is_scored = false AND points_earned > 0);
