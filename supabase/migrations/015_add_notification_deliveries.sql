CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel TEXT NOT NULL,
  recipient_ref TEXT NOT NULL,
  template TEXT NOT NULL,
  payload_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedup_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view notification deliveries"
  ON notification_deliveries
  FOR SELECT
  USING (auth.uid() IN (SELECT id FROM parents));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can manage notification deliveries"
  ON notification_deliveries
  FOR ALL
  USING (auth.uid() IN (SELECT id FROM parents))
  WITH CHECK (auth.uid() IN (SELECT id FROM parents));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
