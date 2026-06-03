CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_max_requests INT,
  p_window_ms INT
) RETURNS BOOLEAN AS $$
DECLARE
  v_window_interval INTERVAL;
BEGIN
  v_window_interval := (p_window_ms || ' milliseconds')::INTERVAL;

  -- Attempt 1: atomically increment if within valid window and under limit
  UPDATE rate_limits
  SET count = count + 1
  WHERE key = p_key
    AND reset_at > NOW()
    AND count < p_max_requests;

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- Serialize reset/insert for same key with advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_key));

  -- Recheck after lock
  UPDATE rate_limits
  SET count = count + 1
  WHERE key = p_key
    AND reset_at > NOW()
    AND count < p_max_requests;

  IF FOUND THEN
    RETURN TRUE;
  END IF;

  -- Insert new or reset expired/over-limit row
  INSERT INTO rate_limits (key, count, reset_at)
  VALUES (p_key, 1, NOW() + v_window_interval)
  ON CONFLICT (key) DO UPDATE
  SET count = 1, reset_at = EXCLUDED.reset_at
  WHERE rate_limits.reset_at <= NOW() OR rate_limits.count >= p_max_requests;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
