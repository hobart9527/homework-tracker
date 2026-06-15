-- Migration: reading_article_chapters
-- Chapterized content for Grade 4+ reading articles.
-- Each chapter is a short (200-300 word) segment with its own heading.
-- Supports the two-phase generation pipeline (outline → per-chapter content).

CREATE TABLE IF NOT EXISTS reading_article_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES reading_articles(id) ON DELETE CASCADE,
  index smallint NOT NULL CHECK (index >= 0),
  heading text NOT NULL,
  content text NOT NULL,
  word_count int NOT NULL DEFAULT 0 CHECK (word_count >= 0),
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(article_id, index)
);

CREATE INDEX IF NOT EXISTS idx_reading_article_chapters_article
  ON reading_article_chapters(article_id, index);

COMMENT ON TABLE reading_article_chapters IS
  'Per-chapter content for Grade 4+ multi-chapter reading articles.';
COMMENT ON COLUMN reading_article_chapters.index IS
  'Chapter order within the article (0-based).';
COMMENT ON COLUMN reading_article_chapters.word_count IS
  'Number of words (English) or CJK characters (Chinese) in this chapter.';

ALTER TABLE reading_article_chapters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reading_article_chapters_select_authenticated"
  ON reading_article_chapters
  FOR SELECT
  TO authenticated
  USING (true);
