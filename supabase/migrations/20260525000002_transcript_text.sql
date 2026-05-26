-- Transcript text stored alongside each video item
ALTER TABLE public.education_library_items
  ADD COLUMN IF NOT EXISTS transcript_text text;

-- Flag items that are placeholders (video not yet filmed / being re-recorded)
ALTER TABLE public.education_library_items
  ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;
