-- Add a tsvector search column + GIN index on Video.
-- Run after `prisma db push` with: psql "$DATABASE_URL" -f prisma/migrations/001_tsvector.sql
ALTER TABLE "Video"
  ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B')
  ) STORED;

CREATE INDEX IF NOT EXISTS video_search_idx ON "Video" USING GIN (search);
