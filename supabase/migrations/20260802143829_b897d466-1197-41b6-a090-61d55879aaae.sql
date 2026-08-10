-- profiles: restrict to self + admins
DROP POLICY IF EXISTS "profiles readable" ON public.profiles;
CREATE POLICY "profiles read own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'administrador'));

-- directory view without emails for assignee/author display
CREATE OR REPLACE VIEW public.profiles_directorio
  WITH (security_invoker = off) AS
  SELECT id, full_name, avatar_url FROM public.profiles;
GRANT SELECT ON public.profiles_directorio TO authenticated;

-- user_roles: own role or admins
DROP POLICY IF EXISTS "roles readable" ON public.user_roles;
CREATE POLICY "roles read own or admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'administrador'));

-- tarea_comentarios: scope to participants
DROP POLICY IF EXISTS "com read" ON public.tarea_comentarios;
CREATE POLICY "com read" ON public.tarea_comentarios
  FOR SELECT TO authenticated
  USING (
    autor_id = auth.uid()
    OR public.has_perm(auth.uid(), 'tareas', 'edit')
    OR EXISTS (
      SELECT 1 FROM public.tareas t
      WHERE t.id = tarea_comentarios.tarea_id
        AND (t.asignado_a = auth.uid() OR t.created_by = auth.uid())
    )
  );

-- credenciales: per-record scoping
ALTER TABLE public.credenciales ALTER COLUMN created_by SET DEFAULT auth.uid();
UPDATE public.credenciales SET created_by = COALESCE(created_by, (SELECT user_id FROM public.user_roles WHERE role = 'administrador' LIMIT 1));

DROP POLICY IF EXISTS "cred read" ON public.credenciales;
CREATE POLICY "cred read" ON public.credenciales
  FOR SELECT TO authenticated
  USING (
    public.has_perm(auth.uid(), 'credenciales', 'view')
    AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'))
  );

DROP POLICY IF EXISTS "cred update" ON public.credenciales;
CREATE POLICY "cred update" ON public.credenciales
  FOR UPDATE TO authenticated
  USING (
    public.has_perm(auth.uid(), 'credenciales', 'edit')
    AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'))
  )
  WITH CHECK (
    public.has_perm(auth.uid(), 'credenciales', 'edit')
    AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'))
  );

DROP POLICY IF EXISTS "cred delete" ON public.credenciales;
CREATE POLICY "cred delete" ON public.credenciales
  FOR DELETE TO authenticated
  USING (
    public.has_perm(auth.uid(), 'credenciales', 'delete')
    AND (created_by = auth.uid() OR public.has_role(auth.uid(), 'administrador'))
  );

DROP POLICY IF EXISTS "cred insert" ON public.credenciales;
CREATE POLICY "cred insert" ON public.credenciales
  FOR INSERT TO authenticated
  WITH CHECK (public.has_perm(auth.uid(), 'credenciales', 'create') AND created_by = auth.uid());

-- SECURITY DEFINER function exposure: no anon execution anywhere
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_perm(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_write(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generar_codigos_toner(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_perm(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generar_codigos_toner(uuid, integer) TO authenticated;

-- trigger-only functions must not be callable from the API at all
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.apply_toner_movimiento() FROM anon, authenticated, public;