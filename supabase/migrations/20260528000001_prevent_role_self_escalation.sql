-- Prevent users from escalating their own role via any client-side path.
-- Role changes must be performed manually in the Supabase SQL Editor by an admin:
--
--   UPDATE profiles SET role = 'otb_staff'  WHERE email = 'user@example.com';
--   UPDATE profiles SET role = 'otb_admin'  WHERE email = 'user@example.com';
--   UPDATE profiles SET role = 'studio_owner' WHERE email = 'user@example.com';
--
-- This policy allows users to update their own profile row (e.g. display_name,
-- studio settings) but rejects any attempt to change their own role column.

CREATE POLICY "Users cannot update their own role"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (role = (SELECT role FROM profiles WHERE id = auth.uid()));
