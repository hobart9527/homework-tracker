CREATE TABLE IF NOT EXISTS voice_push_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voice_push_task_id UUID NOT NULL REFERENCES voice_push_tasks(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('retrying', 'failed', 'sent')),
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT voice_push_attempts_task_attempt_status_key UNIQUE (
    voice_push_task_id,
    attempt_number,
    status
  )
);

ALTER TABLE voice_push_attempts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view voice push attempts"
  ON voice_push_attempts
  FOR SELECT
  USING (
    voice_push_task_id IN (
      SELECT id
      FROM voice_push_tasks
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Child can view own voice push attempts"
  ON voice_push_attempts
  FOR SELECT
  USING (
    voice_push_task_id IN (
      SELECT id
      FROM voice_push_tasks
      WHERE child_id IN (SELECT id FROM children WHERE auth.uid() = id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
