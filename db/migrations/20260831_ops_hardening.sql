-- SysIntranet operational hardening migration
-- Safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)

create table if not exists wiki_doc_revisions (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references wiki_docs(id) on delete cascade,
  title text not null,
  content text not null default '',
  tags text[] not null default '{}',
  created_by uuid references app_users(id) on delete set null,
  created_by_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists wiki_doc_revisions_doc_idx
  on wiki_doc_revisions (doc_id, created_at desc);

alter table wiki_docs add column if not exists owner_id uuid references app_users(id) on delete set null;
alter table wiki_docs add column if not exists status text not null default 'publicado';
alter table wiki_docs add column if not exists review_by date;

alter table inventario add column if not exists asignado_user_id uuid references app_users(id) on delete set null;
alter table inventario add column if not exists checkout_at timestamptz;
alter table inventario add column if not exists checkout_notas text;

alter table credenciales add column if not exists last_rotated_at timestamptz;
alter table credenciales add column if not exists last_revealed_at timestamptz;

alter table tareas add column if not exists estado_normalizado text;

-- Normalize common task states
update tareas set estado = 'pendiente' where lower(estado) in ('todo', 'open', 'nueva');
update tareas set estado = 'en_curso' where lower(estado) in ('doing', 'progress', 'en progreso');
update tareas set estado = 'hecha' where lower(estado) in ('done', 'closed', 'completada');
update tareas set estado = 'bloqueada' where lower(estado) in ('blocked', 'block');

create index if not exists tareas_asignado_estado_idx on tareas (asignado_a, estado);
create index if not exists inventario_estado_idx on inventario (estado);
