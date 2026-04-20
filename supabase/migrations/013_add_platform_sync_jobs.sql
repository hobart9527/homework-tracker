CREATE TABLE IF NOT EXISTS platform_sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform_account_id UUID NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
  trigger_mode TEXT NOT NULL CHECK (trigger_mode IN ('scheduled', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'attention_required')),
  window_key TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_summary TEXT,
  raw_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT platform_sync_jobs_account_window_key UNIQUE (platform_account_id, window_key)
);

ALTER TABLE platform_sync_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view platform sync jobs"
  ON platform_sync_jobs
  FOR SELECT
  USING (
    platform_account_id IN (
      SELECT id
      FROM platform_accounts
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can manage platform sync jobs"
  ON platform_sync_jobs
  FOR ALL
  USING (
    platform_account_id IN (
      SELECT id
      FROM platform_accounts
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  )
  WITH CHECK (
    platform_account_id IN (
      SELECT id
      FROM platform_accounts
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
