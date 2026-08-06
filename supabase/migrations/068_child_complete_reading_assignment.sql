-- Allow child to mark their own reading assignment as completed.
--
-- Background: quiz/submit/route.ts runs under the child session
-- (createClient) and updates reading_assignments.status='completed'.
-- The original migration 030 only granted child SELECT on assignments —
-- no UPDATE policy. The UPDATE silently failed (RLS rejection, error
-- unchecked), leaving assignments stuck at "recommended" forever.

DO $$ BEGIN
  CREATE POLICY "Child can complete own assignments"
    ON reading_assignments FOR UPDATE
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id))
    WITH CHECK (
      child_id IN (SELECT id FROM children WHERE auth.uid() = id)
      -- only allow the transition to completed; never allow child to
      -- reassign or un-complete
      AND status = 'completed'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
