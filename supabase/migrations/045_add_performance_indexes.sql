-- Add missing performance indexes for common query patterns.
-- All use IF NOT EXISTS for idempotent re-runs.

-- 1. check_ins(child_id) — RLS subquery and per-child filtering
CREATE INDEX IF NOT EXISTS idx_check_ins_child_id ON check_ins(child_id);

-- 2. check_ins(completed_at) — monthly range queries for progress dashboards
CREATE INDEX IF NOT EXISTS idx_check_ins_completed_at ON check_ins(completed_at);

-- 3. check_ins(homework_id) — daily dedup detection
CREATE INDEX IF NOT EXISTS idx_check_ins_homework_id ON check_ins(homework_id);

-- 4. check_ins(child_id, completed_at DESC) — composite for monthly progress page
CREATE INDEX IF NOT EXISTS idx_check_ins_child_completed ON check_ins(child_id, completed_at DESC);

-- 5. homeworks(child_id) — RLS and per-child queries
CREATE INDEX IF NOT EXISTS idx_homeworks_child_id ON homeworks(child_id);

-- 6. homeworks(created_by) — parent dashboard
CREATE INDEX IF NOT EXISTS idx_homeworks_created_by ON homeworks(created_by);

-- 7. children(parent_id) — RLS and children listing
CREATE INDEX IF NOT EXISTS idx_children_parent_id ON children(parent_id);

-- 8. reading_quiz_attempts(child_id, created_at DESC) — reading progress queries
CREATE INDEX IF NOT EXISTS idx_reading_quiz_attempts_child ON reading_quiz_attempts(child_id, created_at DESC);

-- 9. Partial index: homeworks(is_active) WHERE is_active = true — active-only queries
CREATE INDEX IF NOT EXISTS idx_homeworks_active ON homeworks(is_active) WHERE is_active = true;
