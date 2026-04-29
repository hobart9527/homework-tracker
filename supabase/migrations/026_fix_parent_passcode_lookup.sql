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
  SELECT
    p.id,
    p.passcode,
    p.reminder_cutoff_time,
    p.auto_remind_parent,
    p.auto_remind_child,
    p.quiet_hours_start,
    p.quiet_hours_end,
    p.created_at
  FROM public.parents p
  WHERE p.passcode = passcode_param
  ORDER BY
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = p.id
          AND u.email = p.id::TEXT || '@parent.local'
      ) THEN 0
      ELSE 1
    END,
    p.created_at DESC
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_parent_by_passcode(TEXT) TO anon;
