-- Emails de la empresa: estado activo/inactivo (distinto de "quitado") e historial de cambios (idempotente).
alter table oficina_contactos add column if not exists vigente boolean not null default true;
alter table oficina_contactos add column if not exists inactivo_desde timestamptz;

-- Un registro por campo cambiado. Las claves se guardan cifradas igual que en la agenda (enc:v1:).
create table if not exists oficina_contactos_historial (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references oficina_contactos(id) on delete cascade,
  campo text not null,
  antes text,
  despues text,
  cifrado boolean not null default false,
  actor_id uuid,
  actor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists oficina_contactos_historial_contacto_idx on oficina_contactos_historial (contacto_id, created_at desc);
create index if not exists oficina_contactos_historial_fecha_idx on oficina_contactos_historial (created_at desc);
