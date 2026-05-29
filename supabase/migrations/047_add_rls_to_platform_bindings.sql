-- Migration 047: Enable RLS on homework_type_bindings and platform_subject_mappings
-- These tables were created in migration 046 without RLS, making them publicly
-- readable and writable. This is a security vulnerability (rls_disabled_in_public).
--
-- Security model:
--   Both tables are reference/seed-data config tables (not per-user data).
--   All authenticated users may SELECT (read-only).
--   Only service_role may INSERT/UPDATE/DELETE (admin/cron scripts).
--   Unauthenticated (anon) access is fully blocked.

BEGIN;

-- ============================================================================
-- Table 1: homework_type_bindings
-- ============================================================================
ALTER TABLE homework_type_bindings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read homework_type_bindings"
    ON homework_type_bindings FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on homework_type_bindings"
    ON homework_type_bindings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Table 2: platform_subject_mappings
-- ============================================================================
ALTER TABLE platform_subject_mappings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can read platform_subject_mappings"
    ON platform_subject_mappings FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Service role full access on platform_subject_mappings"
    ON platform_subject_mappings FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
