-- Migration 064: Child RLS for platform_accounts
--
-- Children need to see their own platform account metadata (status,
-- external_account_ref) so the child landing page can show "已连接 IXL".
--
-- Scope: rows whose child_id matches the authenticated child.

DO $$ BEGIN
  CREATE POLICY "Child can view own platform accounts"
    ON platform_accounts FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;