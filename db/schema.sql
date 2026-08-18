create extension if not exists pgcrypto;

do $$ begin
  create type app_role as enum ('administrador','tecnico','consulta');
exception when duplicate_object then null;
end $$;

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token_hash text primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists profiles (
  id uuid primary key references app_users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  username text unique,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  role app_role not null,
  unique (user_id, role)
);

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role app_role not null,
  modulo text not null,
  can_view boolean not null default true,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role, modulo)
);

create table if not exists wiki_folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references wiki_folders(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists wiki_docs (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid references wiki_folders(id) on delete set null,
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  views integer not null default 0,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists wiki_attachments (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references wiki_docs(id) on delete cascade,
  file_name text not null,
  file_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists guardias (
  id uuid primary key default gen_random_uuid(),
  operador_id uuid references app_users(id) on delete set null,
  operador_nombre text not null,
  desde timestamptz not null,
  hasta timestamptz not null,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists inventario (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  nombre text not null,
  categoria text not null default 'hardware',
  planta text,
  marca text,
  modelo text,
  numero_serie text,
  estado text not null default 'nuevo',
  asignado_a text,
  sector text,
  rubro text,
  tipo text,
  descripcion text,
  cantidad integer not null default 1,
  propiedad text,
  ultima_vez_controlada date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table inventario add column if not exists planta text;
alter table inventario add column if not exists rubro text;
alter table inventario add column if not exists tipo text;
alter table inventario add column if not exists descripcion text;
alter table inventario add column if not exists cantidad integer not null default 1;
alter table inventario add column if not exists propiedad text;
alter table inventario add column if not exists ultima_vez_controlada date;

update inventario
   set descripcion = coalesce(nullif(descripcion, ''), nombre),
       rubro = coalesce(nullif(rubro, ''), categoria),
       tipo = coalesce(nullif(tipo, ''), modelo),
       cantidad = greatest(1, coalesce(cantidad, 1))
 where descripcion is null
    or rubro is null
    or tipo is null
    or cantidad is null
    or cantidad < 1;

create index if not exists inventario_busqueda_idx
  on inventario (planta, sector, rubro, tipo, propiedad);

create table if not exists toner_modelos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  marca text,
  prefijo text not null,
  correlativo integer not null default 0,
  stock integer not null default 0,
  stock_minimo integer not null default 2,
  created_at timestamptz not null default now()
);

create table if not exists toner_unidades (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references toner_modelos(id) on delete cascade,
  codigo text not null unique,
  estado text not null default 'en_stock',
  generado_por uuid references app_users(id) on delete set null,
  generado_por_nombre text,
  lote_generacion_id uuid,
  created_at timestamptz not null default now()
);

alter table toner_unidades add column if not exists generado_por uuid references app_users(id) on delete set null;
alter table toner_unidades add column if not exists generado_por_nombre text;
alter table toner_unidades add column if not exists lote_generacion_id uuid;

create table if not exists toner_movimientos (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null references toner_modelos(id) on delete cascade,
  tipo text not null,
  cantidad integer not null default 1,
  sector text,
  responsable text,
  toner_codigo text,
  toner_entra text,
  toner_sale text,
  notas text,
  created_at timestamptz not null default now()
);

alter table toner_movimientos add column if not exists toner_codigo text;
alter table toner_movimientos add column if not exists toner_entra text;
alter table toner_movimientos add column if not exists toner_sale text;

create table if not exists tareas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  estado text not null default 'pendiente',
  prioridad text not null default 'media',
  etiquetas text[] not null default '{}',
  estimacion_horas numeric,
  asignado_a uuid references app_users(id) on delete set null,
  vence_el date,
  orden integer not null default 0,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists tarea_subtareas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  titulo text not null,
  hecha boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists tarea_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references tareas(id) on delete cascade,
  autor_id uuid not null references app_users(id) on delete cascade,
  contenido text not null,
  created_at timestamptz not null default now()
);

create table if not exists tarea_instructivos (
  tarea_id uuid not null references tareas(id) on delete cascade,
  doc_id uuid not null references wiki_docs(id) on delete cascade,
  primary key (tarea_id, doc_id)
);

create table if not exists credenciales (
  id uuid primary key default gen_random_uuid(),
  servicio text not null,
  categoria text not null default 'infraestructura',
  usuario text,
  secreto text,
  ip text,
  url text,
  notas text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists app_settings (
  singleton boolean primary key default true check (singleton),
  version_actual text not null default 'V 0.1 beta',
  github_repo text not null default 'celizagustin98-ux/SysPanelWiki',
  ultima_revision timestamptz,
  ultima_actualizacion timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references app_users(id) on delete set null,
  actor_nombre text,
  actor_email text,
  modulo text not null,
  accion text not null,
  entidad_id text,
  entidad_desc text,
  detalle jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_id);
create index if not exists audit_log_modulo_idx on audit_log (modulo);

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_users_touch on app_users;
create trigger app_users_touch before update on app_users for each row execute function touch_updated_at();
drop trigger if exists role_permissions_touch on role_permissions;
create trigger role_permissions_touch before update on role_permissions for each row execute function touch_updated_at();
drop trigger if exists wiki_docs_touch on wiki_docs;
create trigger wiki_docs_touch before update on wiki_docs for each row execute function touch_updated_at();
drop trigger if exists inventario_touch on inventario;
create trigger inventario_touch before update on inventario for each row execute function touch_updated_at();
drop trigger if exists tareas_touch on tareas;
create trigger tareas_touch before update on tareas for each row execute function touch_updated_at();
drop trigger if exists credenciales_touch on credenciales;
create trigger credenciales_touch before update on credenciales for each row execute function touch_updated_at();
drop trigger if exists app_settings_touch on app_settings;
create trigger app_settings_touch before update on app_settings for each row execute function touch_updated_at();

create or replace function apply_toner_movimiento() returns trigger language plpgsql as $$
begin
  update toner_modelos
     set stock = greatest(
       0,
       stock + case
         when new.tipo in ('entrada', 'cargar') then new.cantidad
         when new.tipo in ('salida', 'consumo') then -new.cantidad
         else 0
       end
     )
   where id = new.modelo_id;

  return new;
end;
$$;

drop trigger if exists toner_mov_stock on toner_movimientos;
create trigger toner_mov_stock after insert on toner_movimientos for each row execute function apply_toner_movimiento();

insert into app_settings (singleton) values (true)
on conflict (singleton) do nothing;

update app_settings
   set version_actual = 'V 0.1 beta'
 where singleton = true
   and (version_actual is null or version_actual = 'v1.0.0' or version_actual ~ '^[a-f0-9]{7,40}$');

insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select r.role::app_role, m.modulo, true, true, true, true
from (values ('administrador')) r(role)
cross join (values
  ('instructivos'), ('guardias'), ('inventario'), ('toners'), ('tareas'), ('credenciales'), ('oficina'), ('usuarios')
) m(modulo)
on conflict (role, modulo) do nothing;

insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select r.role::app_role, m.modulo, true, true, true, false
from (values ('tecnico')) r(role)
cross join (values
  ('instructivos'), ('guardias'), ('inventario'), ('toners'), ('tareas'), ('credenciales'), ('oficina')
) m(modulo)
on conflict (role, modulo) do nothing;

insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select r.role::app_role, m.modulo, true, false, false, false
from (values ('consulta')) r(role)
cross join (values
  ('instructivos'), ('guardias'), ('inventario'), ('toners'), ('tareas'), ('oficina')
) m(modulo)
on conflict (role, modulo) do nothing;
