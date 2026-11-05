-- Bot Sistema: registro de cada aviso enviado (la clave evita mandar dos veces lo mismo) (idempotente).
create table if not exists bot_envios (
  clave text primary key,
  evento text not null,
  texto text,
  ok boolean,
  error text,
  enviado_at timestamptz not null default now()
);
create index if not exists bot_envios_fecha_idx on bot_envios (enviado_at desc);

-- Lo viejo no sirve para nada: se limpia solo lo de más de 90 días.
delete from bot_envios where enviado_at < now() - interval '90 days';
