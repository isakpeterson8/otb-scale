-- Add slug column to education_library_items
ALTER TABLE education_library_items ADD COLUMN IF NOT EXISTS slug text;

-- Backfill slugs from titles
UPDATE education_library_items
SET slug = lower(
  replace(
    regexp_replace(title, '[^a-zA-Z0-9\s]', '', 'g'),
    ' ',
    '-'
  )
)
WHERE slug IS NULL;

-- Add uniqueness constraint
ALTER TABLE education_library_items ADD CONSTRAINT education_library_items_slug_key UNIQUE (slug);
