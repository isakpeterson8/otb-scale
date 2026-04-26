ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS gmail_access_token text,
  ADD COLUMN IF NOT EXISTS gmail_refresh_token text,
  ADD COLUMN IF NOT EXISTS gmail_token_expiry timestamptz;
