-- RAZ Level Reading System Migration
-- Migrates from grade_level (G1-G6) to RAZ L1-L12 system
--
-- RAZ Level Mapping:
-- L1  = RAZ aa-A  (G1, age 6-7)     - 50-100 words, simple sight words
-- L2  = RAZ B-C   (G2, age 7-8)     - 100-200 words, basic sentences
-- L3  = RAZ D-F   (G3, age 8-9)     - 200-400 words, paragraph text
-- L4  = RAZ G-I   (G4, age 9-10)    - 300-600 words, multi-paragraph
-- L5  = RAZ J-L   (G5, age 10-11)  - 500-800 words, complex sentences
-- L6  = RAZ M-P   (G6, age 11-12)  - 600-1000 words, academic style
-- L7  = RAZ Q-R   (G7, age 12-13)  - 800-1200 words, formal writing
-- L8  = RAZ S-T   (G8, age 13-14)  - 1000-1400 words, analytical
-- L9  = RAZ U-V   (G9, age 14-15)  - 1200-1600 words, abstract concepts
-- L10 = RAZ W-X   (G10, age 15-16) - 1400-1800 words, critical reading
-- L11 = RAZ Y-Z   (G11, age 16-17) - 1600-2000 words, synthesis
-- L12 = RAZ Z1-Z2 (G12, age 17-18) - 1800-2500 words, expert level
--
-- Advancement Rule:
-- Child advances to next level when:
--   1. Has read 15+ articles at current level
--   2. Achieved accuracy streak >= 80% on 3 consecutive articles
--
-- HSK Reference (for Chinese articles):
--   L1-2  ~= HSK 1 (beginner)
--   L3-4  ~= HSK 2 (elementary)
--   L5-6  ~= HSK 3-4 (intermediate)
--   L7-8  ~= HSK 5 (upper-intermediate)
--   L9-10 ~= HSK 5-6 (advanced)
--   L11-12 ~= HSK 6+ (proficient)

BEGIN;

-- 1. Add reading_level column to children (replaces reading_grade_level INTEGER)
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS reading_level TEXT DEFAULT 'L3'
  CHECK (reading_level IN (
    'L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12'
  ));

-- 2. Copy existing reading_grade_level values to reading_level
-- G1 -> L1, G2 -> L2, ..., G6 -> L6
UPDATE children
SET reading_level = 'L' || reading_grade_level::TEXT
WHERE reading_grade_level IS NOT NULL
  AND reading_level IS NULL;

-- 2b. Set default 'L3' for children with no reading_grade_level
UPDATE children
SET reading_level = 'L3'
WHERE reading_level IS NULL;

-- 3. Add raz_level to reading_articles (replaces grade_level INTEGER)
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS raz_level TEXT
  CHECK (raz_level IN (
    'L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12'
  ));

-- 4. Copy existing grade_level to raz_level
UPDATE reading_articles
SET raz_level = 'L' || grade_level::TEXT
WHERE grade_level IS NOT NULL
  AND raz_level IS NULL;

-- 5. Set default raz_level for articles with NULL grade_level
UPDATE reading_articles
SET raz_level = 'L3'
WHERE raz_level IS NULL;

-- 6. Create reading_stats table for tracking child reading progress
CREATE TABLE IF NOT EXISTS reading_stats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  total_articles_read INTEGER DEFAULT 0,
  articles_at_current_level INTEGER DEFAULT 0,
  accuracy_streak INTEGER DEFAULT 0,
  last_article_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(child_id)
);

-- 7. Enable RLS on reading_stats
ALTER TABLE reading_stats ENABLE ROW LEVEL SECURITY;

-- 8. RLS policies for reading_stats
DO $$ BEGIN
  CREATE POLICY "Child can view own reading stats"
    ON reading_stats FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can view children reading stats"
    ON reading_stats FOR SELECT
    USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Child can update own reading stats"
    ON reading_stats FOR UPDATE
    USING (child_id IN (SELECT id FROM children WHERE auth.uid() = id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Parent can manage children reading stats"
    ON reading_stats FOR ALL
    USING (child_id IN (SELECT id FROM children WHERE parent_id IN (SELECT id FROM parents WHERE auth.uid() = id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Add index on child_id for reading_stats queries
CREATE INDEX IF NOT EXISTS idx_reading_stats_child_id ON reading_stats(child_id);

-- 10. Add index on raz_level for article browsing
CREATE INDEX IF NOT EXISTS idx_reading_articles_raz_level ON reading_articles(raz_level) WHERE raz_level IS NOT NULL;

COMMIT;

-- Note: reading_grade_level column is kept for backward compatibility.
-- New code should use reading_level instead.
-- raz_level in reading_articles takes precedence over grade_level when both are present.