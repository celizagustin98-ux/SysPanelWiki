DROP VIEW IF EXISTS public.profiles_directorio;

CREATE OR REPLACE FUNCTION public.directorio_usuarios()
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
$$;

REVOKE EXECUTE ON FUNCTION public.directorio_usuarios() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.directorio_usuarios() TO authenticated;