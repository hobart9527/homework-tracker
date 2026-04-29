CREATE TABLE IF NOT EXISTS platform_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ixl', 'khan-academy', 'raz-kids', 'epic')),
  external_account_ref TEXT NOT NULL,
  auth_mode TEXT NOT NULL DEFAULT 'account_password_managed_session',
  status TEXT NOT NULL DEFAULT 'attention_required' CHECK (status IN ('attention_required', 'active', 'syncing', 'failed')),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT platform_accounts_child_platform_account_key UNIQUE (child_id, platform, external_account_ref)
);

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('ixl', 'khan-academy', 'raz-kids', 'epic')),
  platform_account_id UUID NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL,
  local_date_key DATE NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  subject TEXT,
  duration_minutes INTEGER,
  score NUMERIC,
  completion_state TEXT,
  source_ref TEXT NOT NULL,
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT learning_events_account_source_key UNIQUE (platform_account_id, source_ref)
);

ALTER TABLE platform_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can manage platform accounts"
  ON platform_accounts
  FOR ALL
  USING (
    child_id IN (
      SELECT id
      FROM children
      WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
    )
  )
  WITH CHECK (
    child_id IN (
      SELECT id
      FROM children
      WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can view learning events"
  ON learning_events
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
  CREATE POLICY "Parent can insert learning events"
  ON learning_events
  FOR INSERT
  WITH CHECK (
    child_id IN (
      SELECT id
      FROM children
      WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
