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
  v_reset_at TIMESTAMPTZ;
  v_count INT;
  v_window_interval INTERVAL;
BEGIN
  v_window_interval := (p_window_ms || ' milliseconds')::INTERVAL;

  SELECT reset_at, count INTO v_reset_at, v_count
  FROM rate_limits WHERE key = p_key;

  IF v_reset_at IS NULL OR NOW() > v_reset_at THEN
    INSERT INTO rate_limits (key, count, reset_at)
    VALUES (p_key, 1, NOW() + v_window_interval)
    ON CONFLICT (key) DO UPDATE SET count = 1, reset_at = EXCLUDED.reset_at;
    RETURN TRUE;
  END IF;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  UPDATE rate_limits SET count = count + 1 WHERE key = p_key;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
