-- v3: insumos, feriados editables, adjuntos y ticket ↔ activo (idempotente)

-- ── Pedido de insumos ──
create sequence if not exists insumos_pedido_seq;

create table if not exists insumos_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null unique default nextval('insumos_pedido_seq'),
  estado text not null default 'enviado',
  destinatario text not null default 'Compras',
  solicitante_nombre text,
  notas text,
  total_estimado numeric(14, 2) not null default 0,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  aprobado_at timestamptz,
  comprado_at timestamptz,
  recibido_at timestamptz
);
create index if not exists insumos_pedidos_created_idx on insumos_pedidos (created_at desc);

create table if not exists insumos_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references insumos_pedidos(id) on delete cascade,
  descripcion text not null,
  cantidad numeric(12, 2) not null default 1,
  unidad text not null default 'u.',
  link text,
  precio_estimado numeric(14, 2),
  sector text,
  prioridad text not null default 'normal',
  notas text,
  comprado boolean not null default false,
  created_by uuid references app_users(id) on delete set null,
  created_by_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists insumos_items_pedido_idx on insumos_items (pedido_id, created_at);

-- ── Feriados editables (los fines de semana se calculan aparte) ──
create table if not exists feriados (
  fecha date primary key,
  nombre text not null default 'Feriado',
  created_at timestamptz not null default now()
);

insert into feriados (fecha, nombre)
select make_date(y, m, d), n
from generate_series(2025, 2027) y
cross join (values
  (1, 1, 'Año Nuevo'),
  (3, 24, 'Día de la Memoria'),
  (4, 2, 'Malvinas'),
  (5, 1, 'Día del Trabajador'),
  (5, 25, 'Revolución de Mayo'),
  (6, 20, 'Día de la Bandera'),
  (7, 9, 'Día de la Independencia'),
  (12, 8, 'Inmaculada Concepción'),
  (12, 25, 'Navidad')
) f(m, d, n)
on conflict (fecha) do nothing;

insert into feriados (fecha, nombre) values
  ('2025-03-03', 'Carnaval'), ('2025-03-04', 'Carnaval'), ('2025-04-17', 'Jueves Santo'),
  ('2025-04-18', 'Viernes Santo'), ('2025-06-16', 'Paso a la Inmortalidad de Güemes'),
  ('2025-08-15', 'Feriado puente'), ('2025-11-17', 'Día de la Soberanía Nacional'),
  ('2025-11-21', 'Feriado puente'), ('2025-12-24', 'Nochebuena'), ('2025-12-26', 'Feriado puente'),
  ('2026-02-16', 'Carnaval'), ('2026-02-17', 'Carnaval'), ('2026-03-23', 'Feriado puente'),
  ('2026-04-03', 'Viernes Santo'), ('2026-06-15', 'Paso a la Inmortalidad de Güemes'),
  ('2026-08-17', 'Paso a la Inmortalidad de San Martín'), ('2026-10-12', 'Diversidad Cultural'),
  ('2026-11-20', 'Día de la Soberanía Nacional'), ('2026-11-23', 'Feriado puente'),
  ('2027-03-29', 'Feriado'), ('2027-03-30', 'Feriado')
on conflict (fecha) do nothing;

-- ── Adjuntos (activos y tickets) ──
create table if not exists adjuntos (
  id uuid primary key default gen_random_uuid(),
  entidad text not null check (entidad in ('activo', 'ticket')),
  entidad_id uuid not null,
  file_name text not null,
  file_path text not null,
  file_size integer,
  mime text,
  descripcion text,
  created_by uuid references app_users(id) on delete set null,
  created_by_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists adjuntos_entidad_idx on adjuntos (entidad, entidad_id, created_at desc);

-- ── Ticket ↔ activo (la columna activo_id ya existe en tareas) ──
create index if not exists tareas_activo_idx on tareas (activo_id);

-- ── Permisos por defecto (no pisa lo ya configurado) ──
-- El servidor ahora aplica la matriz de permisos: se asegura que cada rol tenga filas.
insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select 'tecnico'::app_role, m, true, true, true, true
from unnest(array['instructivos','guardias','inventario','toners','tareas','credenciales','oficina','usuarios']) m
on conflict (role, modulo) do nothing;

insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select 'consulta'::app_role, m, m <> 'credenciales', false, false, false
from unnest(array['instructivos','guardias','inventario','toners','tareas','credenciales','oficina','usuarios']) m
on conflict (role, modulo) do nothing;
