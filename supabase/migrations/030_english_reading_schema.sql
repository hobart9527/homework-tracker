-- English Graded Reading Schema
-- Adds reading_grade_level to children, and 4 new tables for the reading system

-- 1. Add reading_grade_level to children
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS reading_grade_level INTEGER;

-- 2. Create reading_articles table
CREATE TABLE IF NOT EXISTS reading_articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic_key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  category TEXT NOT NULL,
  grade_level INTEGER NOT NULL,
  word_count INTEGER DEFAULT 0,
  estimated_minutes INTEGER DEFAULT 5,
  difficulty INTEGER DEFAULT 3,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(topic_key, grade_level)
);

-- 3. Create reading_questions table
CREATE TABLE IF NOT EXISTS reading_questions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('main_idea', 'detail', 'inference', 'vocabulary', 'sequence')),
  options JSONB NOT NULL,
  correct_answer TEXT NOT NULL,
  difficulty INTEGER DEFAULT 3,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Create reading_assignments table
CREATE TABLE IF NOT EXISTS reading_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'recommended' CHECK (status IN ('recommended', 'in_progress', 'completed')),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_date DATE DEFAULT CURRENT_DATE,
  completed_at TIMESTAMPTZ,
  UNIQUE(child_id, article_id)
);

-- 5. Create reading_quiz_attempts table
CREATE TABLE IF NOT EXISTS reading_quiz_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES reading_assignments(id) ON DELETE SET NULL,
  answers JSONB NOT NULL,
  score INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  time_spent_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Enable RLS on all new tables
ALTER TABLE reading_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_quiz_attempts ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies

-- reading_articles: authenticated users can read published articles
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read published articles"
    ON reading_articles FOR SELECT
    USING (auth.role() = 'authenticated' AND status = 'published');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reading_questions: authenticated users can read questions
DO $$ BEGIN
  CREATE POLICY "Authenticated users can read questions"
    ON reading_questions FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reading_assignments: child can SELECT own; parent can SELECT through children table
DO $$ BEGIN
  CREATE POLICY "Child can view own assignments"
    ON reading_assignments FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can view children assignments"
    ON reading_assignments FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can create assignments"
    ON reading_assignments FOR INSERT
    WITH CHECK (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reading_quiz_attempts: child can SELECT + INSERT own attempts
DO $$ BEGIN
  CREATE POLICY "Child can view own quiz attempts"
    ON reading_quiz_attempts FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Child can create own quiz attempts"
    ON reading_quiz_attempts FOR INSERT
    WITH CHECK (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- reading_quiz_attempts: parent can view children attempts
DO $$ BEGIN
  CREATE POLICY "Parent can view children quiz attempts"
    ON reading_quiz_attempts FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NOTE: reading_grade_level defaults to NULL for new children; parents set it via settings. Existing children need manual update or will default to grade 3 in app logic.
