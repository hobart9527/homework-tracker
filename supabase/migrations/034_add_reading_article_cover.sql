-- Add cover_image_url column to reading_articles for AI-generated cover images
BEGIN;

ALTER TABLE reading_articles
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- RLS policy for cover_image_url (same as article visibility)
-- Articles are publicly readable, cover URL is generated on-demand

COMMIT;
