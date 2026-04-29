CREATE TABLE IF NOT EXISTS voice_push_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  homework_id UUID NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  check_in_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  attachment_id UUID NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'sent', 'failed')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  failure_reason TEXT,
  last_attempted_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE voice_push_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view voice push tasks"
  ON voice_push_tasks
  FOR SELECT
  USING (
    child_id IN (
      SELECT id
      FROM children
      WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Child can create own voice push tasks"
  ON voice_push_tasks
  FOR INSERT
  WITH CHECK (
    child_id IN (SELECT id FROM children WHERE auth.uid() = id)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Child can view own voice push tasks"
  ON voice_push_tasks
  FOR SELECT
  USING (
    child_id IN (SELECT id FROM children WHERE auth.uid() = id)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
