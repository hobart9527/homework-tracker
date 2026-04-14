-- Function to look up child by name (bypasses RLS for login page)
CREATE OR REPLACE FUNCTION public.get_child_by_name(name_param TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  avatar TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT c.id, c.name, c.avatar
  FROM public.children c
  WHERE LOWER(c.name) = LOWER(name_param)
$$;

GRANT EXECUTE ON FUNCTION public.get_child_by_name(TEXT) TO anon;
