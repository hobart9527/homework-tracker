CREATE TABLE IF NOT EXISTS message_routing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  homework_id UUID REFERENCES homeworks(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('wechat_group', 'telegram_chat')),
  recipient_ref TEXT NOT NULL,
  recipient_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_routing_rules_child_channel
ON message_routing_rules (child_id, channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_routing_rules_homework
ON message_routing_rules (homework_id);

ALTER TABLE message_routing_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view routing rules for own children"
  ON message_routing_rules
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
  CREATE POLICY "Parent can insert routing rules for own children"
  ON message_routing_rules
  FOR INSERT
  WITH CHECK (
    child_id IN (
      SELECT id
      FROM children
      WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can update routing rules for own children"
  ON message_routing_rules
  FOR UPDATE
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
  CREATE POLICY "Parent can delete routing rules for own children"
  ON message_routing_rules
  FOR DELETE
  USING (
    child_id IN (
      SELECT id
      FROM children
      WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
