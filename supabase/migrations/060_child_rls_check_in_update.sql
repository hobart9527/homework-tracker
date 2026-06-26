-- Migration 060: Child RLS check_in UPDATE policy
--
-- Fixes silent failure when child updates own check_ins
-- (e.g., adding a note after submission).
-- Existing child policies cover SELECT and INSERT but not UPDATE.
--
-- See: packet wave-20260626-162734 task t2-rls-migrations

DO $$ BEGIN
  CREATE POLICY "Child can update own check_ins"
    ON check_ins FOR UPDATE
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id))
    WITH CHECK (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
