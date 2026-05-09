-- Chinese Graded Reading: add language and pinyin_content to reading_articles

-- 1. Add language field: 'en' or 'zh'
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en'
  CHECK (language IN ('en', 'zh'));

-- 2. Add pinyin_content field for Chinese ruby annotation
ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS pinyin_content TEXT;

-- 3. Set default language for existing rows
UPDATE reading_articles SET language = 'en' WHERE language IS NULL;

-- 4. Add index for language-based queries (performance)
CREATE INDEX IF NOT EXISTS idx_reading_articles_language ON reading_articles(language) WHERE language IS NOT NULL;

-- 5. Optional: add language + category compound index for filtered browsing
CREATE INDEX IF NOT EXISTS idx_reading_articles_language_category
  ON reading_articles(language, category)
  WHERE language IS NOT NULL;
