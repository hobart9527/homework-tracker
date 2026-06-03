-- Performance indexes for homework-tracker
CREATE INDEX IF NOT EXISTS idx_reading_questions_article ON reading_questions(article_id);
CREATE INDEX IF NOT EXISTS idx_reading_assignments_child_status_date ON reading_assignments(child_id, status, assigned_date DESC);
CREATE INDEX IF NOT EXISTS idx_reading_articles_status_category ON reading_articles(status, category);
CREATE INDEX IF NOT EXISTS idx_platform_sync_jobs_status_retry ON platform_sync_jobs(status, next_retry_at) WHERE status = 'failed';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reading_quiz_attempts_child_date ON reading_quiz_attempts(child_id, created_at DESC);
