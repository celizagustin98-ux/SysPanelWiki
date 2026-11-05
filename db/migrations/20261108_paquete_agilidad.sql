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
