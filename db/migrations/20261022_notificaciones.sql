-- Notificaciones personales (idempotente)
create table if not exists notificaciones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  tipo text not null default 'info',
  titulo text not null,
  cuerpo text,
  link text,
  leida boolean not null default false,
  actor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists notificaciones_user_idx on notificaciones (user_id, leida, created_at desc);

-- Limpieza: se conservan 90 días
delete from notificaciones where created_at < now() - interval '90 days';
