-- Guardias / Horarios: períodos de liquidación cerrados (idempotente).
-- Con el período cerrado, el servidor no deja cargar, editar ni borrar guardias ni horas extras de esas fechas.
create table if not exists guardia_periodos_cerrados (
  desde date primary key,
  hasta date not null,
  cerrado_por uuid,
  cerrado_por_nombre text,
  cerrado_at timestamptz not null default now(),
  -- Totales al momento del cierre (guardias y horas extras por empleado).
  resumen jsonb
);
