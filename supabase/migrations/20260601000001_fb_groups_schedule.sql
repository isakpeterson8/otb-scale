-- BATCH 1: Add posting schedule to facebook_groups + group_post_completions table

ALTER TABLE facebook_groups
  ADD COLUMN IF NOT EXISTS post_frequency text
    CHECK (post_frequency IN ('daily','weekly','biweekly','monthly','bimonthly')),
  ADD COLUMN IF NOT EXISTS post_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS post_week_pattern text
    CHECK (post_week_pattern IN ('a_week','b_week','both'));

CREATE TABLE IF NOT EXISTS group_post_completions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid        NOT NULL REFERENCES facebook_groups(id) ON DELETE CASCADE,
  studio_id    uuid        NOT NULL,
  date         date        NOT NULL,
  completed_by text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, date)
);

CREATE INDEX IF NOT EXISTS group_post_completions_studio_date_idx
  ON group_post_completions (studio_id, date);

ALTER TABLE group_post_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Studio members can manage group post completions"
  ON group_post_completions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND studio_id = group_post_completions.studio_id
    )
    OR EXISTS (
      SELECT 1 FROM public.studios
      WHERE id = group_post_completions.studio_id AND owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND studio_id = group_post_completions.studio_id
    )
    OR EXISTS (
      SELECT 1 FROM public.studios
      WHERE id = group_post_completions.studio_id AND owner_user_id = auth.uid()
    )
  );
