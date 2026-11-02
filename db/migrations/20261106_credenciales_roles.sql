-- Credenciales: limitar cada credencial a ciertos roles (idempotente).
-- Vacío o null = la ven todos los roles con permiso en Credenciales. El administrador ve todas.
alter table credenciales add column if not exists roles_permitidos text[];
-- Fecha del último cambio de la clave (para avisar las que llevan mucho tiempo sin cambiarse).
alter table credenciales add column if not exists last_rotated_at timestamptz;
update credenciales set last_rotated_at = coalesce(updated_at, created_at) where last_rotated_at is null;
