-- Fix child login to be case-insensitive
CREATE OR REPLACE FUNCTION public.get_child_by_name(name_param TEXT)
RETURNS TABLE (
  id UUID,
  parent_id UUID,
  name TEXT,
  avatar TEXT,
  age INTEGER,
  gender TEXT,
  password_hash TEXT,
  points INTEGER,
  streak_days INTEGER,
  last_check_in TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT c.id, c.parent_id, c.name, c.avatar, c.age, c.gender, c.password_hash, c.points, c.streak_days, c.last_check_in, c.created_at
  FROM public.children c
  WHERE LOWER(c.name) = LOWER(name_param)
$$;
