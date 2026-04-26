-- Allow authenticated users to insert a studio they own
DROP POLICY IF EXISTS "Users can insert their own studio" ON studios;
CREATE POLICY "Users can insert their own studio"
  ON studios
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = auth.uid());

-- Allow authenticated users to read their own studios
DROP POLICY IF EXISTS "Users can select their own studios" ON studios;
CREATE POLICY "Users can select their own studios"
  ON studios
  FOR SELECT
  TO authenticated
  USING (owner_user_id = auth.uid());

-- Allow users to update their own profile row
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
