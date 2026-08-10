
-- ROLES
CREATE TYPE public.app_role AS ENUM ('administrador','tecnico','consulta');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('administrador','tecnico'))
$$;

CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "roles readable" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN (SELECT count(*) FROM public.profiles) <= 1 THEN 'administrador'::public.app_role ELSE 'consulta'::public.app_role END);
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- WIKI
CREATE TABLE public.wiki_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.wiki_folders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wiki_folders TO authenticated;
GRANT ALL ON public.wiki_folders TO service_role;
ALTER TABLE public.wiki_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders read" ON public.wiki_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "folders write" ON public.wiki_folders FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "folders update" ON public.wiki_folders FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "folders delete" ON public.wiki_folders FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));

CREATE TABLE public.wiki_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES public.wiki_folders(id) ON DELETE SET NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  views integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wiki_docs TO authenticated;
GRANT ALL ON public.wiki_docs TO service_role;
ALTER TABLE public.wiki_docs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "docs read" ON public.wiki_docs FOR SELECT TO authenticated USING (true);
CREATE POLICY "docs insert" ON public.wiki_docs FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "docs update" ON public.wiki_docs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "docs delete" ON public.wiki_docs FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER wiki_docs_touch BEFORE UPDATE ON public.wiki_docs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.wiki_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.wiki_docs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wiki_attachments TO authenticated;
GRANT ALL ON public.wiki_attachments TO service_role;
ALTER TABLE public.wiki_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "att read" ON public.wiki_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "att write" ON public.wiki_attachments FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "att delete" ON public.wiki_attachments FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

-- GUARDIAS
CREATE TABLE public.guardias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operador_nombre text NOT NULL,
  desde timestamptz NOT NULL,
  hasta timestamptz NOT NULL,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guardias TO authenticated;
GRANT ALL ON public.guardias TO service_role;
ALTER TABLE public.guardias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "guardias read" ON public.guardias FOR SELECT TO authenticated USING (true);
CREATE POLICY "guardias insert" ON public.guardias FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "guardias update" ON public.guardias FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "guardias delete" ON public.guardias FOR DELETE TO authenticated USING (public.can_write(auth.uid()));

-- INVENTARIO
CREATE TABLE public.inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'hardware',
  marca text,
  modelo text,
  numero_serie text,
  estado text NOT NULL DEFAULT 'nuevo',
  asignado_a text,
  sector text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario TO authenticated;
GRANT ALL ON public.inventario TO service_role;
ALTER TABLE public.inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv read" ON public.inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "inv insert" ON public.inventario FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "inv update" ON public.inventario FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "inv delete" ON public.inventario FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER inv_touch BEFORE UPDATE ON public.inventario FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- TONERS
CREATE TABLE public.toner_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  marca text,
  prefijo text NOT NULL,
  correlativo integer NOT NULL DEFAULT 0,
  stock integer NOT NULL DEFAULT 0,
  stock_minimo integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.toner_modelos TO authenticated;
GRANT ALL ON public.toner_modelos TO service_role;
ALTER TABLE public.toner_modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tm read" ON public.toner_modelos FOR SELECT TO authenticated USING (true);
CREATE POLICY "tm insert" ON public.toner_modelos FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "tm update" ON public.toner_modelos FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "tm delete" ON public.toner_modelos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));

CREATE TABLE public.toner_unidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.toner_modelos(id) ON DELETE CASCADE,
  codigo text NOT NULL UNIQUE,
  estado text NOT NULL DEFAULT 'en_stock',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.toner_unidades TO authenticated;
GRANT ALL ON public.toner_unidades TO service_role;
ALTER TABLE public.toner_unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tu read" ON public.toner_unidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "tu insert" ON public.toner_unidades FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "tu update" ON public.toner_unidades FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "tu delete" ON public.toner_unidades FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));

CREATE TABLE public.toner_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id uuid NOT NULL REFERENCES public.toner_modelos(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  cantidad integer NOT NULL DEFAULT 1,
  sector text,
  responsable text,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.toner_movimientos TO authenticated;
GRANT ALL ON public.toner_movimientos TO service_role;
ALTER TABLE public.toner_movimientos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmv read" ON public.toner_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "tmv insert" ON public.toner_movimientos FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "tmv delete" ON public.toner_movimientos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));

CREATE OR REPLACE FUNCTION public.apply_toner_movimiento() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.toner_modelos
     SET stock = GREATEST(0, stock + CASE WHEN NEW.tipo = 'entrada' THEN NEW.cantidad ELSE -NEW.cantidad END)
   WHERE id = NEW.modelo_id;
  RETURN NEW;
END; $$;
CREATE TRIGGER toner_mov_stock AFTER INSERT ON public.toner_movimientos
FOR EACH ROW EXECUTE FUNCTION public.apply_toner_movimiento();

CREATE OR REPLACE FUNCTION public.generar_codigos_toner(_modelo_id uuid, _cantidad integer)
RETURNS SETOF text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _prefijo text; _start integer; i integer; _codigo text;
BEGIN
  IF NOT public.can_write(auth.uid()) THEN RAISE EXCEPTION 'No autorizado'; END IF;
  UPDATE public.toner_modelos SET correlativo = correlativo + _cantidad
   WHERE id = _modelo_id RETURNING prefijo, correlativo - _cantidad INTO _prefijo, _start;
  IF _prefijo IS NULL THEN RAISE EXCEPTION 'Modelo inexistente'; END IF;
  FOR i IN 1.._cantidad LOOP
    _codigo := _prefijo || '-' || lpad((_start + i)::text, 4, '0');
    INSERT INTO public.toner_unidades (modelo_id, codigo) VALUES (_modelo_id, _codigo);
    RETURN NEXT _codigo;
  END LOOP;
END; $$;

-- TAREAS
CREATE TABLE public.tareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descripcion text,
  estado text NOT NULL DEFAULT 'pendiente',
  prioridad text NOT NULL DEFAULT 'media',
  etiquetas text[] NOT NULL DEFAULT '{}',
  estimacion_horas numeric,
  asignado_a uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  vence_el date,
  orden integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tareas TO authenticated;
GRANT ALL ON public.tareas TO service_role;
ALTER TABLE public.tareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tareas read" ON public.tareas FOR SELECT TO authenticated USING (true);
CREATE POLICY "tareas insert" ON public.tareas FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "tareas update" ON public.tareas FOR UPDATE TO authenticated USING (public.can_write(auth.uid()) OR asignado_a = auth.uid());
CREATE POLICY "tareas delete" ON public.tareas FOR DELETE TO authenticated USING (public.can_write(auth.uid()));
CREATE TRIGGER tareas_touch BEFORE UPDATE ON public.tareas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.tarea_subtareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  hecha boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarea_subtareas TO authenticated;
GRANT ALL ON public.tarea_subtareas TO service_role;
ALTER TABLE public.tarea_subtareas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub read" ON public.tarea_subtareas FOR SELECT TO authenticated USING (true);
CREATE POLICY "sub all" ON public.tarea_subtareas FOR ALL TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

CREATE TABLE public.tarea_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  autor_id uuid NOT NULL,
  contenido text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarea_comentarios TO authenticated;
GRANT ALL ON public.tarea_comentarios TO service_role;
ALTER TABLE public.tarea_comentarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "com read" ON public.tarea_comentarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "com insert" ON public.tarea_comentarios FOR INSERT TO authenticated WITH CHECK (autor_id = auth.uid());
CREATE POLICY "com delete" ON public.tarea_comentarios FOR DELETE TO authenticated USING (autor_id = auth.uid() OR public.has_role(auth.uid(),'administrador'));

CREATE TABLE public.tarea_instructivos (
  tarea_id uuid NOT NULL REFERENCES public.tareas(id) ON DELETE CASCADE,
  doc_id uuid NOT NULL REFERENCES public.wiki_docs(id) ON DELETE CASCADE,
  PRIMARY KEY (tarea_id, doc_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarea_instructivos TO authenticated;
GRANT ALL ON public.tarea_instructivos TO service_role;
ALTER TABLE public.tarea_instructivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ti read" ON public.tarea_instructivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "ti all" ON public.tarea_instructivos FOR ALL TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()));

-- CREDENCIALES
CREATE TABLE public.credenciales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  servicio text NOT NULL,
  categoria text NOT NULL DEFAULT 'infraestructura',
  usuario text,
  secreto text,
  ip text,
  url text,
  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credenciales TO authenticated;
GRANT ALL ON public.credenciales TO service_role;
ALTER TABLE public.credenciales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cred read" ON public.credenciales FOR SELECT TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "cred insert" ON public.credenciales FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()));
CREATE POLICY "cred update" ON public.credenciales FOR UPDATE TO authenticated USING (public.can_write(auth.uid()));
CREATE POLICY "cred delete" ON public.credenciales FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'administrador'));
CREATE TRIGGER cred_touch BEFORE UPDATE ON public.credenciales FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
