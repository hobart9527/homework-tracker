-- Migration 066: Atomic increment for learning_events.duration_minutes
--
-- The JS path used to read duration_minutes then write
-- `existing + amount`, which lost concurrent updates. This RPC does the
-- arithmetic in a single SQL statement so two concurrent updates both apply.

CREATE OR REPLACE FUNCTION increment_learning_event_duration(
  event_id UUID,
  amount INT
)
RETURNS TABLE (
  id UUID,
  duration_minutes INT,
  raw_payload JSONB
)
LANGUAGE sql
AS $$
  UPDATE learning_events
  SET duration_minutes = COALESCE(learning_events.duration_minutes, 0) + amount
  WHERE learning_events.id = event_id
  RETURNING learning_events.id,
            learning_events.duration_minutes,
            learning_events.raw_payload;
$$;