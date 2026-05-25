-- Migration 046: Homework platform binding refactor
-- Adds homework_type_bindings and platform_subject_mappings tables
-- to support per-type platform binding and subject-to-homework matching.

-- ---------------------------------------------------------------------------
-- Table 1: homework_type_bindings
-- Maps each homework type (built-in or custom) to its allowed platforms,
-- match keywords, and UI sort order.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS homework_type_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id TEXT NOT NULL,
  is_builtin BOOLEAN NOT NULL DEFAULT true,
  group_id TEXT NOT NULL,
  allowed_platforms TEXT[] NOT NULL DEFAULT '{}',
  match_keywords TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type_id)
);

COMMENT ON TABLE homework_type_bindings IS 'Platform binding config and match keywords per homework type.';
COMMENT ON COLUMN homework_type_bindings.type_id IS 'Builtin ID (e.g. english_reading) or custom type UUID.';
COMMENT ON COLUMN homework_type_bindings.allowed_platforms IS 'Empty array = no platform binding allowed.';

-- ---------------------------------------------------------------------------
-- Table 2: platform_subject_mappings
-- Platform-native subject → homework type mapping for precise auto-checkin.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_subject_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  platform_subject TEXT NOT NULL,
  type_id TEXT NOT NULL,
  is_builtin BOOLEAN NOT NULL DEFAULT true,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_subject, type_id)
);

COMMENT ON TABLE platform_subject_mappings IS 'Maps platform-native subjects to homework types for auto-checkin.';

-- ---------------------------------------------------------------------------
-- Index for fast subject lookups during sync
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_platform_subject_lookup
  ON platform_subject_mappings (platform, platform_subject);

-- ---------------------------------------------------------------------------
-- Seed: homework_type_bindings
-- ---------------------------------------------------------------------------
INSERT INTO homework_type_bindings (type_id, is_builtin, group_id, allowed_platforms, match_keywords, sort_order)
VALUES
  -- English
  ('english_reading', true, 'group_english', ARRAY['raz-kids','epic','khan-academy'], ARRAY['reading','read','phonics','book','story','literacy'], 0),
  ('english_course', true, 'group_english', ARRAY['khan-academy','ixl'], ARRAY['course','lesson','grammar','vocabulary','ela','language arts','writing','listening'], 1),
  ('english_practice', true, 'group_english', ARRAY['ixl','khan-academy'], ARRAY['practice','exercise','worksheet','quiz','test','spelling','drill'], 2),
  ('english_custom', true, 'group_english', ARRAY[]::TEXT[], ARRAY['english','英文'], 3),
  -- Chinese (platforms reserved, empty for now)
  ('chinese_reading', true, 'group_chinese', ARRAY[]::TEXT[], ARRAY['阅读','read','朗读','中文','故事','古诗','经典'], 0),
  ('chinese_course', true, 'group_chinese', ARRAY[]::TEXT[], ARRAY['课程','course','lesson','grammar','写作','语文'], 1),
  ('chinese_practice', true, 'group_chinese', ARRAY[]::TEXT[], ARRAY['练习','practice','exercise','worksheet','生字','字词','听写'], 2),
  ('chinese_custom', true, 'group_chinese', ARRAY[]::TEXT[], ARRAY['中文','Chinese','语文'], 3),
  -- Math
  ('math_practice', true, 'group_math', ARRAY['ixl','khan-academy'], ARRAY['math','mathematics','数学','algebra','geometry','arithmetic','calculation'], 0),
  ('math_course', true, 'group_math', ARRAY['khan-academy','ixl'], ARRAY['math','mathematics','数学','course','lesson'], 1),
  ('math_custom', true, 'group_math', ARRAY[]::TEXT[], ARRAY['math','数学'], 2),
  -- Interest (no platforms)
  ('interest_piano', true, 'group_interest', ARRAY[]::TEXT[], ARRAY['piano','钢琴','keyboard','keys'], 0),
  ('interest_vocal', true, 'group_interest', ARRAY[]::TEXT[], ARRAY['vocal','singing','声乐','唱歌','voice'], 1),
  ('interest_ea', true, 'group_interest', ARRAY[]::TEXT[], ARRAY['drama','theatre','theater','ea','表演','acting'], 2),
  ('interest_dance', true, 'group_interest', ARRAY[]::TEXT[], ARRAY['dance','dancing','舞蹈','ballet','芭蕾'], 3),
  ('interest_drums', true, 'group_interest', ARRAY[]::TEXT[], ARRAY['drum','drumming','架子鼓','percussion'], 4),
  ('interest_custom', true, 'group_interest', ARRAY[]::TEXT[], ARRAY['interest','兴趣'], 5)
ON CONFLICT (type_id) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  allowed_platforms = EXCLUDED.allowed_platforms,
  match_keywords = EXCLUDED.match_keywords,
  sort_order = EXCLUDED.sort_order;

-- ---------------------------------------------------------------------------
-- Seed: platform_subject_mappings
-- ---------------------------------------------------------------------------
INSERT INTO platform_subject_mappings (platform, platform_subject, type_id, confidence)
VALUES
  ('ixl', 'Math', 'math_practice', 0.9),
  ('ixl', 'Math', 'math_course', 0.8),
  ('ixl', 'Language Arts', 'english_practice', 0.9),
  ('ixl', 'Language Arts', 'english_course', 0.8),
  ('khan-academy', 'math', 'math_practice', 0.95),
  ('khan-academy', 'math', 'math_course', 0.9),
  ('khan-academy', 'humanities', 'chinese_reading', 0.5),
  ('raz-kids', 'reading', 'english_reading', 0.95),
  ('epic', 'reading', 'english_reading', 0.9)
ON CONFLICT (platform, platform_subject, type_id) DO UPDATE SET
  confidence = EXCLUDED.confidence;
