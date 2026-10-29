-- Usuarios: estado (activo/suspendido), último acceso y alta (idempotente).
alter table app_users add column if not exists activo boolean not null default true;
alter table app_users add column if not exists suspendido_at timestamptz;
alter table app_users add column if not exists suspendido_motivo text;
alter table app_users add column if not exists ultimo_acceso timestamptz;

-- Último acceso inicial: el último login registrado en auditoría.
update app_users u
   set ultimo_acceso = a.ult
  from (select actor_id, max(created_at) as ult from audit_log where accion = 'login' group by actor_id) a
 where a.actor_id = u.id and u.ultimo_acceso is null;
