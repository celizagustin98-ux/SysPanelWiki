-- Clave de visualización: se pide para ver o copiar cualquier clave guardada (idempotente).
alter table app_settings add column if not exists clave_ver_hash text;
alter table app_settings add column if not exists clave_ver_actualizada timestamptz;

-- Emails de la empresa: usuario y clave (cifrada) de cada casilla.
alter table oficina_contactos add column if not exists usuario text;
alter table oficina_contactos add column if not exists secreto text;
alter table oficina_contactos add column if not exists last_revealed_at timestamptz;
