-- Migration: add child read access to homework_type_groups
-- Children need to read homework_type_groups via FK join to identify
-- the language group (中文/英文) of their homeworks. Without this,
-- the auto-checkin on reading completion silently fails.

-- Ensure RLS is enabled (idempotent)
ALTER TABLE homework_type_groups ENABLE ROW LEVEL SECURITY;

-- Allow child to SELECT groups that belong to their parent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'homework_type_groups'
      AND policyname = 'Child can view parent groups'
  ) THEN
    CREATE POLICY "Child can view parent groups"
      ON homework_type_groups
      FOR SELECT
      USING (
        parent_id IN (
          SELECT parent_id FROM children WHERE auth.uid() = id
        )
      );
  END IF;
END
$$;
