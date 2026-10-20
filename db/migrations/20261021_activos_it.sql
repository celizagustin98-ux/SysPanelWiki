-- Activos IT: planilla técnica, compra/garantía, reparaciones y asignaciones (idempotente)

alter table inventario add column if not exists hostname text;
alter table inventario add column if not exists ip text;
alter table inventario add column if not exists mac text;
alter table inventario add column if not exists sistema_operativo text;
alter table inventario add column if not exists specs jsonb not null default '{}'::jsonb;
alter table inventario add column if not exists proveedor text;
alter table inventario add column if not exists nro_factura text;
alter table inventario add column if not exists fecha_compra date;
alter table inventario add column if not exists costo numeric(14, 2);
alter table inventario add column if not exists garantia_hasta date;
alter table inventario add column if not exists asignado_desde timestamptz;

create index if not exists inventario_codigo_idx on inventario (codigo);
create index if not exists inventario_ip_idx on inventario (ip);
create index if not exists inventario_estado_idx on inventario (estado);

-- Reparaciones y mantenimientos (como "Maintenances" de Snipe-IT)
create table if not exists inventario_reparaciones (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventario(id) on delete cascade,
  tipo text not null default 'reparacion',
  titulo text not null,
  detalle text,
  proveedor text,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  costo numeric(14, 2),
  resultado text,
  created_by uuid references app_users(id) on delete set null,
  created_by_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists inventario_reparaciones_item_idx on inventario_reparaciones (inventario_id, fecha_inicio desc);

-- Historial de asignaciones (checkout / checkin)
create table if not exists inventario_asignaciones (
  id uuid primary key default gen_random_uuid(),
  inventario_id uuid not null references inventario(id) on delete cascade,
  asignado_a text not null,
  sector text,
  desde timestamptz not null default now(),
  hasta timestamptz,
  notas text,
  notas_devolucion text,
  actor_id uuid references app_users(id) on delete set null,
  actor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists inventario_asignaciones_item_idx on inventario_asignaciones (inventario_id, desde desc);
