-- Operarios del módulo Guardias (plantel editable)
create table if not exists guardia_operarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  code text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  created_at timestamptz not null default now(),
  unique (nombre),
  unique (code)
);

create index if not exists guardia_operarios_activo_orden_idx
  on guardia_operarios (activo, orden, nombre);

-- Semilla del equipo actual (idempotente)
insert into guardia_operarios (nombre, code, activo, orden)
values
  ('CELIZ AGUSTIN', 'A', true, 1),
  ('CORDOBA SANTINO', 'S', true, 2),
  ('SANTILLAN KEVIN', 'K', true, 3),
  ('SILETTO JOSE', 'J', true, 4)
on conflict (nombre) do nothing;
