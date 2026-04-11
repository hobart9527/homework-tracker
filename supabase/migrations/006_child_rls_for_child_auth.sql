-- Allow children to view their own profile in the children table
CREATE POLICY "Child can view own profile" ON children FOR SELECT USING (auth.uid() = id);
