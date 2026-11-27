-- Checklist de tareas dentro de cada ticket (sobre tarea_subtareas) (idempotente).
alter table tarea_subtareas add column if not exists orden integer not null default 0;
alter table tarea_subtareas add column if not exists hecha_por_nombre text;
alter table tarea_subtareas add column if not exists hecha_at timestamptz;
create index if not exists tarea_subtareas_tarea_idx on tarea_subtareas (tarea_id, orden, created_at);

-- Plantillas y tickets programados pueden traer su checklist armado.
alter table ticket_plantillas add column if not exists checklist text[] not null default '{}';
alter table ticket_recurrentes add column if not exists checklist text[] not null default '{}';
