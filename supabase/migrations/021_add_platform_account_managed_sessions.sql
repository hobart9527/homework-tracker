ALTER TABLE platform_accounts
ADD COLUMN IF NOT EXISTS managed_session_payload JSONB,
ADD COLUMN IF NOT EXISTS managed_session_captured_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS managed_session_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_sync_error_summary TEXT;
