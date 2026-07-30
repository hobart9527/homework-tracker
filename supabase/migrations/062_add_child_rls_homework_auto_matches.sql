-- Migration 062: Child RLS for homework_auto_matches
--
-- Children need to see which learning event auto-completed a check-in so the
-- child landing page can show "✨ 自动完成 · IXL · …" badges.
--
-- Scope: rows whose triggered_check_in_id references the child's own check_ins.

DO $$ BEGIN
  CREATE POLICY "Child can view own auto matches"
    ON homework_auto_matches FOR SELECT
    USING (
      triggered_check_in_id IN (
        SELECT id FROM check_ins
        WHERE child_id IN (SELECT id FROM children WHERE auth.uid() = id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
