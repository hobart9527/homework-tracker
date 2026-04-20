CREATE TABLE IF NOT EXISTS learning_event_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  learning_event_id UUID NOT NULL REFERENCES learning_events(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL CHECK (review_status IN ('unmatched', 'resolved')),
  review_reason TEXT NOT NULL CHECK (
    review_reason IN ('no_candidate_homeworks', 'no_matching_homework')
  ),
  review_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_event_reviews_learning_event_key UNIQUE (learning_event_id)
);

ALTER TABLE learning_event_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Parent can view learning event reviews"
  ON learning_event_reviews
  FOR SELECT
  USING (
    learning_event_id IN (
      SELECT id
      FROM learning_events
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can manage learning event reviews"
  ON learning_event_reviews
  FOR ALL
  USING (
    learning_event_id IN (
      SELECT id
      FROM learning_events
      WHERE child_id IN (
        SELECT id
        FROM children
        WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)
      )
    )
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
