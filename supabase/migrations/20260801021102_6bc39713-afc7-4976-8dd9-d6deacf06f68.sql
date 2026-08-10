-- =========================
-- MATRIZ DE PERMISOS
-- =========================
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  modulo text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, modulo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perms read" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "perms insert" ON public.role_permissions
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'administrador'));
CREATE POLICY "perms update" ON public.role_permissions
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));
CREATE POLICY "perms delete" ON public.role_permissions
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'administrador'));

CREATE TRIGGER trg_role_permissions_updated
  BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Semillas: administrador todo, tecnico crea/edita, consulta solo lectura
INSERT INTO public.role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
SELECT r.role, m.modulo,
       true,
       r.role IN ('administrador','tecnico'),
       r.role IN ('administrador','tecnico'),
       r.role = 'administrador'
FROM (VALUES ('administrador'::public.app_role), ('tecnico'), ('consulta')) AS r(role)
CROSS JOIN (VALUES ('instructivos'),('guardias'),('inventario'),('toners'),('tareas'),('credenciales')) AS m(modulo);

-- Credenciales: por defecto solo admin y tecnico las ven
UPDATE public.role_permissions SET can_view = false
 WHERE modulo = 'credenciales' AND role = 'consulta';

-- Modulo usuarios: solo administrador
INSERT INTO public.role_permissions (role, modulo, can_view, can_create, can_edit, can_delete) VALUES
  ('administrador','usuarios', true, true, true, true),
  ('tecnico','usuarios', false, false, false, false),
  ('consulta','usuarios', false, false, false, false);

-- =========================
-- FUNCION DE PERMISO
-- =========================
CREATE OR REPLACE FUNCTION public.has_perm(_user_id uuid, _modulo text, _accion text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.has_role(_user_id, 'administrador') THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.user_roles ur ON ur.role = rp.role
      WHERE ur.user_id = _user_id
        AND rp.modulo = _modulo
        AND CASE _accion
              WHEN 'view' THEN rp.can_view
              WHEN 'create' THEN rp.can_create
              WHEN 'edit' THEN rp.can_edit
              WHEN 'delete' THEN rp.can_delete
              ELSE false
            END
    )
  END
$$;

-- =========================
-- POLITICAS BASADAS EN LA MATRIZ
-- =========================

-- Instructivos
DROP POLICY IF EXISTS "folders read" ON public.wiki_folders;
DROP POLICY IF EXISTS "folders write" ON public.wiki_folders;
DROP POLICY IF EXISTS "folders update" ON public.wiki_folders;
DROP POLICY IF EXISTS "folders delete" ON public.wiki_folders;
CREATE POLICY "folders read" ON public.wiki_folders FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'instructivos','view'));
CREATE POLICY "folders write" ON public.wiki_folders FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'instructivos','create'));
CREATE POLICY "folders update" ON public.wiki_folders FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'instructivos','edit'));
CREATE POLICY "folders delete" ON public.wiki_folders FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'instructivos','delete'));

DROP POLICY IF EXISTS "docs read" ON public.wiki_docs;
DROP POLICY IF EXISTS "docs insert" ON public.wiki_docs;
DROP POLICY IF EXISTS "docs update" ON public.wiki_docs;
DROP POLICY IF EXISTS "docs delete" ON public.wiki_docs;
CREATE POLICY "docs read" ON public.wiki_docs FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'instructivos','view'));
CREATE POLICY "docs insert" ON public.wiki_docs FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'instructivos','create'));
CREATE POLICY "docs update" ON public.wiki_docs FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'instructivos','edit'));
CREATE POLICY "docs delete" ON public.wiki_docs FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'instructivos','delete'));

DROP POLICY IF EXISTS "att read" ON public.wiki_attachments;
DROP POLICY IF EXISTS "att write" ON public.wiki_attachments;
DROP POLICY IF EXISTS "att delete" ON public.wiki_attachments;
CREATE POLICY "att read" ON public.wiki_attachments FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'instructivos','view'));
CREATE POLICY "att write" ON public.wiki_attachments FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'instructivos','create'));
CREATE POLICY "att delete" ON public.wiki_attachments FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'instructivos','delete'));

-- Guardias
DROP POLICY IF EXISTS "guardias read" ON public.guardias;
DROP POLICY IF EXISTS "guardias insert" ON public.guardias;
DROP POLICY IF EXISTS "guardias update" ON public.guardias;
DROP POLICY IF EXISTS "guardias delete" ON public.guardias;
CREATE POLICY "guardias read" ON public.guardias FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'guardias','view'));
CREATE POLICY "guardias insert" ON public.guardias FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'guardias','create'));
CREATE POLICY "guardias update" ON public.guardias FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'guardias','edit'));
CREATE POLICY "guardias delete" ON public.guardias FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'guardias','delete'));

-- Inventario
DROP POLICY IF EXISTS "inv read" ON public.inventario;
DROP POLICY IF EXISTS "inv insert" ON public.inventario;
DROP POLICY IF EXISTS "inv update" ON public.inventario;
DROP POLICY IF EXISTS "inv delete" ON public.inventario;
CREATE POLICY "inv read" ON public.inventario FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'inventario','view'));
CREATE POLICY "inv insert" ON public.inventario FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'inventario','create'));
CREATE POLICY "inv update" ON public.inventario FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'inventario','edit'));
CREATE POLICY "inv delete" ON public.inventario FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'inventario','delete'));

-- Toners
DROP POLICY IF EXISTS "tm read" ON public.toner_modelos;
DROP POLICY IF EXISTS "tm insert" ON public.toner_modelos;
DROP POLICY IF EXISTS "tm update" ON public.toner_modelos;
DROP POLICY IF EXISTS "tm delete" ON public.toner_modelos;
CREATE POLICY "tm read" ON public.toner_modelos FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'toners','view'));
CREATE POLICY "tm insert" ON public.toner_modelos FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'toners','create'));
CREATE POLICY "tm update" ON public.toner_modelos FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'toners','edit'));
CREATE POLICY "tm delete" ON public.toner_modelos FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'toners','delete'));

DROP POLICY IF EXISTS "tu read" ON public.toner_unidades;
DROP POLICY IF EXISTS "tu insert" ON public.toner_unidades;
DROP POLICY IF EXISTS "tu update" ON public.toner_unidades;
DROP POLICY IF EXISTS "tu delete" ON public.toner_unidades;
CREATE POLICY "tu read" ON public.toner_unidades FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'toners','view'));
CREATE POLICY "tu insert" ON public.toner_unidades FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'toners','create'));
CREATE POLICY "tu update" ON public.toner_unidades FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'toners','edit'));
CREATE POLICY "tu delete" ON public.toner_unidades FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'toners','delete'));

DROP POLICY IF EXISTS "tmv read" ON public.toner_movimientos;
DROP POLICY IF EXISTS "tmv insert" ON public.toner_movimientos;
DROP POLICY IF EXISTS "tmv delete" ON public.toner_movimientos;
CREATE POLICY "tmv read" ON public.toner_movimientos FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'toners','view'));
CREATE POLICY "tmv insert" ON public.toner_movimientos FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'toners','create'));
CREATE POLICY "tmv delete" ON public.toner_movimientos FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'toners','delete'));

-- Tareas
DROP POLICY IF EXISTS "tareas read" ON public.tareas;
DROP POLICY IF EXISTS "tareas insert" ON public.tareas;
DROP POLICY IF EXISTS "tareas update" ON public.tareas;
DROP POLICY IF EXISTS "tareas delete" ON public.tareas;
CREATE POLICY "tareas read" ON public.tareas FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'tareas','view'));
CREATE POLICY "tareas insert" ON public.tareas FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'tareas','create'));
CREATE POLICY "tareas update" ON public.tareas FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'tareas','edit') OR asignado_a = auth.uid());
CREATE POLICY "tareas delete" ON public.tareas FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'tareas','delete'));

DROP POLICY IF EXISTS "sub read" ON public.tarea_subtareas;
DROP POLICY IF EXISTS "sub all" ON public.tarea_subtareas;
CREATE POLICY "sub read" ON public.tarea_subtareas FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'tareas','view'));
CREATE POLICY "sub insert" ON public.tarea_subtareas FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'tareas','create'));
CREATE POLICY "sub update" ON public.tarea_subtareas FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'tareas','edit'));
CREATE POLICY "sub delete" ON public.tarea_subtareas FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'tareas','delete'));

DROP POLICY IF EXISTS "com read" ON public.tarea_comentarios;
DROP POLICY IF EXISTS "com insert" ON public.tarea_comentarios;
DROP POLICY IF EXISTS "com delete" ON public.tarea_comentarios;
CREATE POLICY "com read" ON public.tarea_comentarios FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'tareas','view'));
CREATE POLICY "com insert" ON public.tarea_comentarios FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid() AND public.has_perm(auth.uid(),'tareas','view'));
CREATE POLICY "com delete" ON public.tarea_comentarios FOR DELETE TO authenticated USING (autor_id = auth.uid() OR public.has_perm(auth.uid(),'tareas','delete'));

DROP POLICY IF EXISTS "ti read" ON public.tarea_instructivos;
DROP POLICY IF EXISTS "ti all" ON public.tarea_instructivos;
CREATE POLICY "ti read" ON public.tarea_instructivos FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'tareas','view'));
CREATE POLICY "ti insert" ON public.tarea_instructivos FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'tareas','edit'));
CREATE POLICY "ti delete" ON public.tarea_instructivos FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'tareas','edit'));

-- Credenciales
DROP POLICY IF EXISTS "cred read" ON public.credenciales;
DROP POLICY IF EXISTS "cred insert" ON public.credenciales;
DROP POLICY IF EXISTS "cred update" ON public.credenciales;
DROP POLICY IF EXISTS "cred delete" ON public.credenciales;
CREATE POLICY "cred read" ON public.credenciales FOR SELECT TO authenticated USING (public.has_perm(auth.uid(),'credenciales','view'));
CREATE POLICY "cred insert" ON public.credenciales FOR INSERT TO authenticated WITH CHECK (public.has_perm(auth.uid(),'credenciales','create'));
CREATE POLICY "cred update" ON public.credenciales FOR UPDATE TO authenticated USING (public.has_perm(auth.uid(),'credenciales','edit'));
CREATE POLICY "cred delete" ON public.credenciales FOR DELETE TO authenticated USING (public.has_perm(auth.uid(),'credenciales','delete'));

-- Generador de codigos: usar permiso de toners
CREATE OR REPLACE FUNCTION public.generar_codigos_toner(_modelo_id uuid, _cantidad integer)
 RETURNS SETOF text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _prefijo text; _start integer; i integer; _codigo text;
BEGIN
  IF NOT public.has_perm(auth.uid(), 'toners', 'create') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.toner_modelos SET correlativo = correlativo + _cantidad
   WHERE id = _modelo_id RETURNING prefijo, correlativo - _cantidad INTO _prefijo, _start;
  IF _prefijo IS NULL THEN RAISE EXCEPTION 'Modelo inexistente'; END IF;
  FOR i IN 1.._cantidad LOOP
    _codigo := _prefijo || '-' || lpad((_start + i)::text, 4, '0');
    INSERT INTO public.toner_unidades (modelo_id, codigo) VALUES (_modelo_id, _codigo);
    RETURN NEXT _codigo;
  END LOOP;
END; $function$;

-- =========================
-- CONFIGURACION DE LA APP
-- =========================
CREATE TABLE public.app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true UNIQUE,
  version_actual text NOT NULL DEFAULT 'v1.0.0',
  github_repo text NOT NULL DEFAULT 'celizagustin98-ux/SysIntranet',
  ultima_revision timestamptz,
  ultima_actualizacion timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings read" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings insert" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'administrador'));
CREATE POLICY "settings update" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'administrador')) WITH CHECK (public.has_role(auth.uid(),'administrador'));

CREATE TRIGGER trg_app_settings_updated
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.app_settings (singleton) VALUES (true);