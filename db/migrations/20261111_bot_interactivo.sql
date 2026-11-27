-- Bot Sistema interactivo: cuentas de Telegram vinculadas, códigos para vincular y cola de envíos (idempotente).

-- Cada usuario puede vincular su Telegram para recibir sus avisos por privado y usar los botones del bot.
create table if not exists telegram_vinculos (
  user_id uuid primary key references profiles(id) on delete cascade,
  telegram_id text not null unique,
  telegram_usuario text,
  avisos_personales boolean not null default true,
  created_at timestamptz not null default now()
);

-- Código de un solo uso (10 minutos) que se genera en Mi perfil y se le manda al bot con /vincular.
create table if not exists telegram_codigos (
  codigo text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  expira timestamptz not null
);
delete from telegram_codigos where expira < now();

-- Cola: lo que surge fuera del horario de envío queda guardado y sale a la hora de inicio.
alter table bot_envios add column if not exists destino text;
alter table bot_envios add column if not exists html text;
alter table bot_envios add column if not exists botones jsonb;
alter table bot_envios add column if not exists pendiente boolean not null default false;
create index if not exists bot_envios_pendiente_idx on bot_envios (enviado_at) where pendiente;
