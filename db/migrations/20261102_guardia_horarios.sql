-- Guardias / Horarios: horario semanal de cada empleado y horas extras (idempotente).

-- Un registro por empleado y día de la semana (0 = lunes … 6 = domingo).
-- El segundo tramo (desde2/hasta2) es para el horario cortado. Si "hasta" es menor que "desde", termina al día siguiente.
create table if not exists guardia_horarios (
  id uuid primary key default gen_random_uuid(),
  operario_id uuid not null references guardia_operarios(id) on delete cascade,
  dia smallint not null check (dia between 0 and 6),
  desde time not null,
  hasta time not null,
  desde2 time,
  hasta2 time,
  updated_at timestamptz not null default now(),
  unique (operario_id, dia)
);

-- Horas extras: se liquidan con el período 21 → 20 junto con las guardias.
-- tipo '50' = día hábil, '100' = sábado, domingo o feriado.
create table if not exists guardia_horas_extras (
  id uuid primary key default gen_random_uuid(),
  operario_id uuid references guardia_operarios(id) on delete set null,
  operador_nombre text not null,
  fecha date not null,
  desde time not null,
  hasta time not null,
  horas numeric(6,2) not null check (horas > 0),
  tipo text not null default '50' check (tipo in ('50', '100')),
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists guardia_horas_extras_fecha_idx on guardia_horas_extras (fecha);
create index if not exists guardia_horas_extras_operario_idx on guardia_horas_extras (operario_id, fecha);
