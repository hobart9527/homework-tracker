-- Function to look up parent by passcode (bypasses RLS for login page)
CREATE OR REPLACE FUNCTION public.get_parent_by_passcode(passcode_param TEXT)
RETURNS TABLE (
  id UUID,
  passcode TEXT,
  reminder_cutoff_time TEXT,
  auto_remind_parent BOOLEAN,
  auto_remind_child BOOLEAN,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT p.id, p.passcode, p.reminder_cutoff_time, p.auto_remind_parent, p.auto_remind_child, p.quiet_hours_start, p.quiet_hours_end, p.created_at
  FROM public.parents p
  WHERE p.passcode = passcode_param
  LIMIT 1
$$;

-- Allow anonymous users to call this function (it's already SECURITY DEFINER)
-- Grant execute on the function to anon role
GRANT EXECUTE ON FUNCTION public.get_parent_by_passcode(TEXT) TO anon;
