-- Oficina → Historial de actualizaciones de otros sistemas (idempotente).
-- Cada fila es una versión que el desarrollador entregó y que el área subió (o tiene que subir).
create table if not exists sistema_actualizaciones (
  id uuid primary key default gen_random_uuid(),
  sistema text not null,
  version text,
  titulo text not null,
  fecha date not null default current_date,
  hora text,
  estado text not null default 'subido' check (estado in ('pendiente', 'subido', 'con_problemas', 'revertido')),
  ambiente text not null default 'produccion' check (ambiente in ('produccion', 'prueba')),
  capas text[] not null default '{}',
  -- [{ "modulo": "Usuarios", "tipo": "nuevo|mejora|correccion|quitado", "detalle": "…" }]
  cambios jsonb not null default '[]'::jsonb,
  desarrollador text,
  aviso_fecha date,
  mensaje_original text,
  requiere_corte boolean not null default false,
  corte_minutos integer,
  respaldo_previo boolean not null default false,
  pruebas text,
  incidencias text,
  como_revertir text,
  subido_por_nombre text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sistema_actualizaciones_fecha_idx on sistema_actualizaciones (fecha desc, created_at desc);
create index if not exists sistema_actualizaciones_sistema_idx on sistema_actualizaciones (sistema);

-- Los adjuntos (capturas, notas de la versión) también pueden colgar de una actualización.
alter table adjuntos drop constraint if exists adjuntos_entidad_check;
alter table adjuntos add constraint adjuntos_entidad_check check (entidad in ('activo', 'ticket', 'actualizacion'));
