-- BATCH 3: Engagement tracking on completions + qualification status on groups

ALTER TABLE group_post_completions
  ADD COLUMN IF NOT EXISTS likes    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dms      integer NOT NULL DEFAULT 0;

ALTER TABLE facebook_groups
  ADD COLUMN IF NOT EXISTS qualification_status text NOT NULL DEFAULT 'active'
    CHECK (qualification_status IN ('active','disqualified_low_engagement','future_third_party'));
