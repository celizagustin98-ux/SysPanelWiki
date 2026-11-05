-- Paquete de agilidad: tickets, activos, tóners, oficina, guardias, instructivos, credenciales y general (idempotente).

-- ── Tickets: respuestas guardadas ──
create table if not exists ticket_respuestas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  texto text not null,
  usos integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── Tickets recurrentes (tareas periódicas que se crean solas) ──
create table if not exists ticket_recurrentes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  tipo text not null default 'mantenimiento',
  prioridad text not null default 'media',
  categoria text not null default 'Otro',
  sector text,
  asignado_a uuid references profiles(id) on delete set null,
  frecuencia text not null default 'mensual' check (frecuencia in ('diaria', 'semanal', 'quincenal', 'mensual', 'trimestral', 'anual')),
  proxima date not null default current_date,
  dias_para_vencer integer,
  activo boolean not null default true,
  ultima_creada timestamptz,
  ultimo_ticket_id uuid,
  created_at timestamptz not null default now()
);

-- ── Actualizaciones de sistemas: ticket abierto cuando la versión dio problemas ──
alter table sistema_actualizaciones add column if not exists ticket_id uuid references tareas(id) on delete set null;

-- ── Activos: mantenimiento preventivo ──
alter table inventario add column if not exists mant_cada_meses integer;
alter table inventario add column if not exists mant_proximo date;
create index if not exists inventario_mant_proximo_idx on inventario (mant_proximo) where mant_proximo is not null;

-- ── Tóners: qué impresora usa cada modelo y en qué impresora se instaló cada tóner ──
alter table inventario add column if not exists toner_modelo_id uuid references toner_modelos(id) on delete set null;
alter table toner_movimientos add column if not exists activo_id uuid references inventario(id) on delete set null;
create index if not exists toner_movimientos_activo_idx on toner_movimientos (activo_id, created_at desc) where activo_id is not null;
