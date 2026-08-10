CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_nombre text NOT NULL DEFAULT '',
  actor_email text NOT NULL DEFAULT '',
  modulo text NOT NULL,
  accion text NOT NULL,
  entidad_id text,
  entidad_desc text NOT NULL DEFAULT '',
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_id);
CREATE INDEX audit_log_modulo_idx ON public.audit_log (modulo);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo administradores leen la auditoria"
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'));

CREATE OR REPLACE FUNCTION public.log_audit(_modulo text, _accion text, _entidad_id text, _entidad_desc text, _detalle jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _nombre text := ''; _email text := '';
BEGIN
  SELECT COALESCE(full_name,''), COALESCE(email,'') INTO _nombre, _email
    FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_log (actor_id, actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle)
  VALUES (auth.uid(), COALESCE(_nombre,''), COALESCE(_email,''), _modulo, _accion, _entidad_id, COALESCE(_entidad_desc,''), COALESCE(_detalle,'{}'::jsonb));
END; $$;

REVOKE ALL ON FUNCTION public.log_audit(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_wiki_docs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('instructivos', 'crear', NEW.id::text, NEW.title, jsonb_build_object('title', NEW.title));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_audit('instructivos', 'editar', NEW.id::text, NEW.title,
      jsonb_build_object('title_anterior', OLD.title, 'title_nuevo', NEW.title,
                         'contenido_cambio', (OLD.content IS DISTINCT FROM NEW.content)));
    RETURN NEW;
  ELSE
    PERFORM public.log_audit('instructivos', 'eliminar', OLD.id::text, OLD.title, jsonb_build_object('title', OLD.title));
    RETURN OLD;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.audit_wiki_docs() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_wiki_docs
AFTER INSERT OR UPDATE OR DELETE ON public.wiki_docs
FOR EACH ROW EXECUTE FUNCTION public.audit_wiki_docs();

CREATE OR REPLACE FUNCTION public.audit_inventario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('inventario', 'crear', NEW.id::text, NEW.codigo || ' — ' || NEW.nombre, jsonb_build_object('estado', NEW.estado));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_audit('inventario', 'editar', NEW.id::text, NEW.codigo || ' — ' || NEW.nombre,
      jsonb_build_object('estado_anterior', OLD.estado, 'estado_nuevo', NEW.estado,
                         'asignado_anterior', OLD.asignado_a, 'asignado_nuevo', NEW.asignado_a));
    RETURN NEW;
  ELSE
    PERFORM public.log_audit('inventario', 'eliminar', OLD.id::text, OLD.codigo || ' — ' || OLD.nombre,
      jsonb_build_object('estado', OLD.estado, 'sector', OLD.sector));
    RETURN OLD;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.audit_inventario() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_inventario
AFTER INSERT OR UPDATE OR DELETE ON public.inventario
FOR EACH ROW EXECUTE FUNCTION public.audit_inventario();

CREATE OR REPLACE FUNCTION public.audit_credenciales()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('credenciales', 'crear', NEW.id::text, NEW.servicio, '{}'::jsonb);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.log_audit('credenciales', 'editar', NEW.id::text, NEW.servicio,
      jsonb_build_object('secreto_cambio', (OLD.secreto IS DISTINCT FROM NEW.secreto)));
    RETURN NEW;
  ELSE
    PERFORM public.log_audit('credenciales', 'eliminar', OLD.id::text, OLD.servicio, '{}'::jsonb);
    RETURN OLD;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.audit_credenciales() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_credenciales
AFTER INSERT OR UPDATE OR DELETE ON public.credenciales
FOR EACH ROW EXECUTE FUNCTION public.audit_credenciales();

CREATE OR REPLACE FUNCTION public.audit_toner_modelos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit('toners', 'crear', NEW.id::text, NEW.nombre, '{}'::jsonb);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit('toners', 'eliminar', OLD.id::text, OLD.nombre, jsonb_build_object('stock', OLD.stock));
    RETURN OLD;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.audit_toner_modelos() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_toner_modelos
AFTER INSERT OR DELETE ON public.toner_modelos
FOR EACH ROW EXECUTE FUNCTION public.audit_toner_modelos();

CREATE OR REPLACE FUNCTION public.audit_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _dest text := '';
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(email, id::text) INTO _dest FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.log_audit('usuarios', 'asignar_rol', NEW.user_id::text, COALESCE(_dest, NEW.user_id::text),
      jsonb_build_object('rol', NEW.role));
    RETURN NEW;
  ELSE
    SELECT COALESCE(email, id::text) INTO _dest FROM public.profiles WHERE id = OLD.user_id;
    PERFORM public.log_audit('usuarios', 'quitar_rol', OLD.user_id::text, COALESCE(_dest, OLD.user_id::text),
      jsonb_build_object('rol', OLD.role));
    RETURN OLD;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.audit_user_roles() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_user_roles();

CREATE OR REPLACE FUNCTION public.audit_actores()
RETURNS TABLE(actor_id uuid, actor_nombre text, actor_email text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT a.actor_id, a.actor_nombre, a.actor_email
  FROM public.audit_log a
  WHERE public.has_role(auth.uid(), 'administrador') AND a.actor_id IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.audit_actores() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_actores() TO authenticated;