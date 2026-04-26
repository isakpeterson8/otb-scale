-- cadence_enrollments: tracks school email cadence sequences
CREATE TABLE IF NOT EXISTS cadence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES school_outreach(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  opening_template text NOT NULL,
  current_email_number int DEFAULT 1,
  email_1_sent_at timestamptz,
  email_2_sent_at timestamptz,
  email_3_sent_at timestamptz,
  email_4_sent_at timestamptz,
  email_2_due_at timestamptz,
  email_3_due_at timestamptz,
  email_4_due_at timestamptz,
  status text DEFAULT 'active',
  removed_at timestamptz,
  removal_reason text,
  gmail_thread_id text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cadence_enrollments_school_id_idx ON cadence_enrollments(school_id);
CREATE INDEX IF NOT EXISTS cadence_enrollments_user_id_idx ON cadence_enrollments(user_id);
CREATE INDEX IF NOT EXISTS cadence_enrollments_status_idx ON cadence_enrollments(status);

ALTER TABLE cadence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own cadence enrollments"
  ON cadence_enrollments
  FOR ALL
  USING (auth.uid() = user_id);

-- settings: per-user studio and email preferences
CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  display_name text,
  studio_name text,
  location text,
  phone text,
  instruments text,
  sender_name text,
  reply_to_email text,
  gmail_send_enabled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own settings"
  ON settings
  FOR ALL
  USING (auth.uid() = user_id);
