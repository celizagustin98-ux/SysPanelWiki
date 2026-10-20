-- v4: roles personalizables, permiso de Auditoría y registro de migraciones (idempotente)

-- ── Roles ────────────────────────────────────────────────────────────────
create table if not exists roles (
  clave text primary key,
  nombre text not null,
  descripcion text,
  color text not null default 'slate',
  sistema boolean not null default false,
  orden int not null default 100,
  created_at timestamptz not null default now()
);

insert into roles (clave, nombre, descripcion, color, sistema, orden) values
  ('administrador', 'Administrador', 'Control total: usuarios, roles, configuración y todos los módulos.', 'rose', true, 1),
  ('tecnico', 'Técnico', 'Operación diaria del área: tickets, activos, tóners, guardias.', 'sky', true, 2),
  ('consulta', 'Consulta', 'Solo lectura para consultar información.', 'slate', true, 3)
on conflict (clave) do nothing;

-- El rol pasa de enum fijo a texto con referencia a la tabla roles.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'user_roles' and column_name = 'role' and data_type = 'USER-DEFINED') then
    alter table user_roles alter column role type text using role::text;
  end if;
  if exists (select 1 from information_schema.columns where table_name = 'role_permissions' and column_name = 'role' and data_type = 'USER-DEFINED') then
    alter table role_permissions alter column role type text using role::text;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_roles_role_fk') then
    alter table user_roles add constraint user_roles_role_fk foreign key (role) references roles(clave) on update cascade on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'role_permissions_role_fk') then
    delete from role_permissions where role not in (select clave from roles);
    alter table role_permissions add constraint role_permissions_role_fk foreign key (role) references roles(clave) on update cascade on delete cascade;
  end if;
end $$;

-- Auditoría y Reportes pasan a ser módulos de la matriz (por defecto solo administrador).
insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select r.clave, m, r.clave = 'administrador', false, false, false
from roles r cross join (values ('auditoria'), ('reportes')) x(m)
on conflict (role, modulo) do nothing;

-- Todo rol tiene una fila por módulo (los nuevos módulos arrancan sin acceso).
insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
select r.clave, m, r.clave = 'administrador', r.clave = 'administrador', r.clave = 'administrador', r.clave = 'administrador'
from roles r cross join (values ('instructivos'), ('guardias'), ('inventario'), ('toners'), ('tareas'), ('credenciales'), ('oficina'), ('usuarios')) x(m)
on conflict (role, modulo) do nothing;

-- ── Registro de migraciones aplicadas (lo usa scripts/init-db.mjs) ───────
create table if not exists schema_migrations (
  archivo text primary key,
  aplicada_at timestamptz not null default now()
);

-- ── Limpieza de datos sin valor ──────────────────────────────────────────
delete from app_sessions where expires_at < now();
delete from notificaciones where leida and created_at < now() - interval '30 days';
