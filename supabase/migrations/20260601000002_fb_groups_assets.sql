-- BATCH 2: Post copy/image asset library per group + last_used_asset_id on completions

CREATE TABLE IF NOT EXISTS group_post_assets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid        NOT NULL REFERENCES facebook_groups(id) ON DELETE CASCADE,
  type       text        NOT NULL CHECK (type IN ('copy','image')),
  content    text        NOT NULL,
  label      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS group_post_assets_group_id_idx
  ON group_post_assets (group_id);

ALTER TABLE group_post_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Studio members can manage group post assets"
  ON group_post_assets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.facebook_groups fg
      JOIN public.profiles p ON p.studio_id = fg.studio_id
      WHERE fg.id = group_post_assets.group_id AND p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.facebook_groups fg
      JOIN public.studios s ON s.id = fg.studio_id
      WHERE fg.id = group_post_assets.group_id AND s.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.facebook_groups fg
      JOIN public.profiles p ON p.studio_id = fg.studio_id
      WHERE fg.id = group_post_assets.group_id AND p.id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.facebook_groups fg
      JOIN public.studios s ON s.id = fg.studio_id
      WHERE fg.id = group_post_assets.group_id AND s.owner_user_id = auth.uid()
    )
  );

ALTER TABLE group_post_completions
  ADD COLUMN IF NOT EXISTS last_used_asset_id uuid REFERENCES group_post_assets(id) ON DELETE SET NULL;
