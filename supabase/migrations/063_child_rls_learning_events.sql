-- Migration 063: Child RLS for learning_events
--
-- Children need to see their own learning events so the child landing page can
-- show synced platform activity (e.g. "📊 今日 IXL 完成 30 分钟").
--
-- Scope: rows owned by the authenticated child.

DO $$ BEGIN
  CREATE POLICY "Child can view own learning events"
    ON learning_events FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;