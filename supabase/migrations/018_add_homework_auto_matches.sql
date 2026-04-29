CREATE TABLE IF NOT EXISTS homework_auto_matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homework_id UUID NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  learning_event_id UUID NOT NULL REFERENCES learning_events(id) ON DELETE CASCADE,
  match_rule TEXT NOT NULL,
  match_result TEXT NOT NULL CHECK (
    match_result IN (
      'auto_completed',
      'partially_completed',
      'unmatched',
      'supporting_evidence',
      'already_completed'
    )
  ),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  triggered_check_in_id UUID REFERENCES check_ins(id) ON DELETE SET NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT homework_auto_matches_homework_event_key UNIQUE (homework_id, learning_event_id)
);

ALTER TABLE homework_auto_matches ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view homework auto matches"
  ON homework_auto_matches
  FOR SELECT
  USING (
    homework_id IN (
      SELECT id
      FROM homeworks
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can manage homework auto matches"
  ON homework_auto_matches
  FOR ALL
  USING (
    homework_id IN (
      SELECT id
      FROM homeworks
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
