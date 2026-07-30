-- Migration 049: Add IXL ELA subject mappings
-- IXL activities scraped with subject "ela" get L1-matched to
-- english_practice / english_course types.

INSERT INTO platform_subject_mappings (platform, platform_subject, type_id, confidence)
VALUES
  ('ixl', 'ela', 'english_practice', 0.9),
  ('ixl', 'ela', 'english_course', 0.8)
ON CONFLICT (platform, platform_subject, type_id) DO UPDATE SET confidence = EXCLUDED.confidence;
