ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS level_variant TEXT DEFAULT 'L2' CHECK (level_variant IN ('L1', 'L2', 'L3')),
  ADD COLUMN IF NOT EXISTS ib_theme TEXT DEFAULT 'T1' CHECK (ib_theme IN ('T1', 'T2', 'T3', 'T4', 'T5', 'T6')),
  ADD COLUMN IF NOT EXISTS text_type TEXT DEFAULT 'non-fiction' CHECK (text_type IN ('fiction', 'non-fiction', 'poetry', 'drama', 'media', 'academic'));

CREATE INDEX IF NOT EXISTS idx_reading_articles_level_variant ON reading_articles (level_variant);
