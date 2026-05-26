-- Add display_name to profiles for fast-path lookup in getStudioId()
-- The _shared.ts action selects this column to build studio names for new signups
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text;

-- Backfill from settings where the user has already set one
UPDATE public.profiles p
SET display_name = s.display_name
FROM public.settings s
WHERE s.user_id = p.id
  AND s.display_name IS NOT NULL;
