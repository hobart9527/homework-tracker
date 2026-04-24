ALTER TABLE check_ins
  ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER;
