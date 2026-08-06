-- Add child INSERT policy for reading_stats.
--
-- Background: quiz/submit/route.ts runs under the child session and does
-- `reading_stats.upsert(..., { onConflict: "child_id" })`. Migration 033 only
-- granted child SELECT + UPDATE (parent has ALL). On a child's FIRST ever
-- completed article there is no existing reading_stats row, so the upsert
-- needs INSERT — which RLS rejected silently (auto-level skipped).

DO $$ BEGIN
  CREATE POLICY "Child can create own reading stats"
    ON reading_stats FOR INSERT
    WITH CHECK (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
