-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom Homework Types (parent-created)
CREATE TABLE IF NOT EXISTS custom_homework_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  default_points INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Parent profiles
CREATE TABLE IF NOT EXISTS parents (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  passcode TEXT NOT NULL,
  reminder_cutoff_time TEXT DEFAULT '20:00',
  auto_remind_parent BOOLEAN DEFAULT true,
  auto_remind_child BOOLEAN DEFAULT false,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Child profiles
CREATE TABLE IF NOT EXISTS children (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  age INTEGER,
  gender TEXT CHECK (gender IN ('female', 'male')),
  password_hash TEXT NOT NULL,
  points INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_check_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Homework definitions
CREATE TABLE IF NOT EXISTS homeworks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  type_id UUID REFERENCES custom_homework_types(id) ON DELETE SET NULL,
  type_name TEXT NOT NULL,
  type_icon TEXT NOT NULL DEFAULT '📝',
  title TEXT NOT NULL,
  description TEXT,
  repeat_type TEXT NOT NULL CHECK (repeat_type IN ('daily', 'weekly', 'interval', 'once')),
  repeat_days INTEGER[],
  repeat_interval INTEGER,
  repeat_start_date DATE,
  repeat_end_date DATE,
  point_value INTEGER NOT NULL DEFAULT 3,
  estimated_minutes INTEGER,
  daily_cutoff_time TEXT,
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Check-ins
CREATE TABLE IF NOT EXISTS check_ins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  homework_id UUID NOT NULL REFERENCES homeworks(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  points_earned INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_in_id UUID NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('photo', 'audio')),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE children ENABLE ROW LEVEL SECURITY;
ALTER TABLE homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_homework_types ENABLE ROW LEVEL SECURITY;

-- Parent policies
DO $$ BEGIN
  CREATE POLICY "Parents can view own data" ON parents FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parents can update own data" ON parents FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Children policies
DO $$ BEGIN
  CREATE POLICY "Parent can view children" ON children FOR SELECT USING (parent_id IN (SELECT id FROM parents WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parent can manage children" ON children FOR ALL USING (parent_id IN (SELECT id FROM parents WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Homework policies
DO $$ BEGIN
  CREATE POLICY "Parent can view homeworks" ON homeworks FOR SELECT USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parent can manage homeworks" ON homeworks FOR ALL USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can view own homeworks" ON homeworks FOR SELECT USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Check-in policies
DO $$ BEGIN
  CREATE POLICY "Parent can view check_ins" ON check_ins FOR SELECT USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parent can manage check_ins" ON check_ins FOR ALL USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can view own check_ins" ON check_ins FOR SELECT USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can create check_ins" ON check_ins FOR INSERT WITH CHECK (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Custom homework types policies
DO $$ BEGIN
  CREATE POLICY "Parent can manage custom types" ON custom_homework_types FOR ALL USING (parent_id IN (SELECT id FROM parents WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Attachment policies
DO $$ BEGIN
  CREATE POLICY "Parent can view attachments" ON attachments FOR SELECT USING (check_in_id IN (SELECT id FROM check_ins WHERE child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can view own attachments" ON attachments FOR SELECT USING (check_in_id IN (SELECT id FROM check_ins WHERE child_id IN (SELECT id FROM children WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can upload attachments" ON attachments FOR INSERT WITH CHECK (check_in_id IN (SELECT id FROM check_ins WHERE child_id IN (SELECT id FROM children WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public) VALUES ('attachments', 'attachments', false) ON CONFLICT (id) DO NOTHING;

-- Storage policies
DO $$ BEGIN
  CREATE POLICY "Parent can upload attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.uid() IN (SELECT id FROM parents));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Parent can view attachments" ON storage.objects FOR SELECT USING (bucket_id = 'attachments' AND auth.uid() IN (SELECT id FROM parents));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can upload own attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'attachments' AND auth.uid() IN (SELECT id FROM children));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Child can view own attachments" ON storage.objects FOR SELECT USING (bucket_id = 'attachments' AND auth.uid() IN (SELECT id FROM children));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
