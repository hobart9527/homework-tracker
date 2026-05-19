-- Migration: homework_type_groups
-- Description: Add primary category (一级分类) system for homework types.
-- Note: custom_homework_types table exists but is unused in code; left untouched.

-- 1. Create homework_type_groups table
CREATE TABLE IF NOT EXISTS homework_type_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (parent_id, name)
);

-- 2. Enable Row Level Security
ALTER TABLE homework_type_groups ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies — parents can only access their own groups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homework_type_groups' AND policyname = 'Parents can view own groups'
  ) THEN
    CREATE POLICY "Parents can view own groups"
      ON homework_type_groups FOR SELECT USING (parent_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homework_type_groups' AND policyname = 'Parents can insert own groups'
  ) THEN
    CREATE POLICY "Parents can insert own groups"
      ON homework_type_groups FOR INSERT WITH CHECK (parent_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homework_type_groups' AND policyname = 'Parents can update own groups'
  ) THEN
    CREATE POLICY "Parents can update own groups"
      ON homework_type_groups FOR UPDATE USING (parent_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'homework_type_groups' AND policyname = 'Parents can delete own groups'
  ) THEN
    CREATE POLICY "Parents can delete own groups"
      ON homework_type_groups FOR DELETE USING (parent_id = auth.uid());
  END IF;
END
$$;

-- 4. Add type_group_id to homeworks
ALTER TABLE homeworks
  ADD COLUMN IF NOT EXISTS type_group_id UUID REFERENCES homework_type_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_homeworks_type_group ON homeworks(type_group_id);

-- 5. Preset seed data note
-- Preset groups are per-parent and should be seeded by application logic.
-- Expected default groups per parent:
--   - 英文 (English)
--   - 中文 (Chinese)
--   - 数学 (Math)
--   - 兴趣 (Interest/Hobby)
