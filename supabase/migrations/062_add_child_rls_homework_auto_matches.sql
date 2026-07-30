-- Migration 062: Child RLS for homework_auto_matches
--
-- Children need to see which learning event auto-completed a check-in so the
-- child landing page can show "✨ 自动完成 · IXL · …" badges.
--
-- Scope: rows linked to a homework owned by the authenticated child. This
-- also covers rows where triggered_check_in_id is null but the homework
-- itself belongs to the child (matches the parent policy style at 018:25-39).

DO $$ BEGIN
  CREATE POLICY "Child can view own auto matches"
    ON homework_auto_matches FOR SELECT
    USING (
      homework_id IN (
        SELECT id FROM homeworks
        WHERE child_id IN (SELECT id FROM children WHERE auth.uid() = id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;