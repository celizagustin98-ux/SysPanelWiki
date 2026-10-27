-- Perfil de cada usuario: foto, puesto y datos de contacto (idempotente).
-- La foto se guarda ya recortada y achicada (JPEG ~256 px) como data URL en profiles.avatar_url.
alter table profiles add column if not exists cargo text;
alter table profiles add column if not exists telefono text;
alter table profiles add column if not exists interno text;
alter table profiles add column if not exists sobre_mi text;
alter table profiles add column if not exists avatar_url text;
alter table profiles add column if not exists updated_at timestamptz;

-- Fotos viejas que no sean una imagen embebida se descartan antes de la restricción.
update profiles set avatar_url = null
 where avatar_url is not null and avatar_url !~ '^data:image/(jpeg|png|webp);base64,';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_url_chk') then
    alter table profiles add constraint profiles_avatar_url_chk
      check (avatar_url is null or (avatar_url ~ '^data:image/(jpeg|png|webp);base64,' and length(avatar_url) <= 400000));
  end if;
end $$;
