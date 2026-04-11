-- Add icon field to homeworks for direct icon override
ALTER TABLE homeworks ADD COLUMN IF NOT EXISTS required_checkpoint_type TEXT;

-- Add comment
COMMENT ON COLUMN homeworks.required_checkpoint_type IS 'Required check-in proof type: photo, screenshot, audio, or null (no requirement)';
