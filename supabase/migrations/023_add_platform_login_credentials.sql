ALTER TABLE platform_accounts
ADD COLUMN IF NOT EXISTS login_credentials_encrypted TEXT,
ADD COLUMN IF NOT EXISTS auto_login_enabled BOOLEAN NOT NULL DEFAULT false;
