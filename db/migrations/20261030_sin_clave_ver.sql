-- Se quitó la clave de visualización: las claves siguen cifradas y se ven con el ojito (idempotente).
alter table app_settings drop column if exists clave_ver_hash;
alter table app_settings drop column if exists clave_ver_actualizada;
