-- Internal IT ticketing fields on tareas (module remains /tareas, UI branded as Tickets)

create sequence if not exists ticket_numero_seq;

-- Ensure sequence is ahead of existing rows if any numeric orden used
select setval(
  'ticket_numero_seq',
  greatest(1000, (select coalesce(max(orden), 0) from tareas) + 1000)
);

alter table tareas add column if not exists numero integer;
alter table tareas add column if not exists tipo text not null default 'pedido';
alter table tareas add column if not exists solicitante_id uuid references app_users(id) on delete set null;
alter table tareas add column if not exists solicitante_nombre text;
alter table tareas add column if not exists sector text;
alter table tareas add column if not exists categoria text;
alter table tareas add column if not exists canal text default 'sistema';
alter table tareas add column if not exists activo_id uuid references inventario(id) on delete set null;
alter table tareas add column if not exists resolucion text;
alter table tareas add column if not exists resuelto_en timestamptz;
alter table tareas add column if not exists cerrado_en timestamptz;

-- Backfill ticket numbers
update tareas
   set numero = nextval('ticket_numero_seq')
 where numero is null;

create unique index if not exists tareas_numero_uidx on tareas (numero);

-- Normalize legacy states toward ticket workflow
update tareas set estado = 'nuevo' where lower(estado) in ('pendiente', 'todo', 'open', 'nueva');
update tareas set estado = 'en_curso' where lower(estado) in ('en_progreso', 'en progreso', 'doing', 'progress');
update tareas set estado = 'esperando' where lower(estado) in ('en_revision', 'en revision', 'blocked', 'bloqueada');
update tareas set estado = 'cerrado' where lower(estado) in ('completada', 'hecha', 'done', 'closed');

create index if not exists tareas_estado_prioridad_idx on tareas (estado, prioridad, updated_at desc);
create index if not exists tareas_asignado_idx on tareas (asignado_a, estado);
