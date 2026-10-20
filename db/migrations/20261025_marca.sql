-- Marca por instalación: nombre, logo, color y pie de documentos (idempotente).
-- Si quedan vacíos, la app usa los valores de src/lib/brand.ts.
alter table app_settings add column if not exists org_nombre text;
alter table app_settings add column if not exists org_area text;
alter table app_settings add column if not exists org_logo text;
alter table app_settings add column if not exists color_primario text;
alter table app_settings add column if not exists pie_documentos text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_settings_color_primario_chk') then
    alter table app_settings add constraint app_settings_color_primario_chk
      check (color_primario is null or color_primario ~* '^#[0-9a-f]{6}$');
  end if;
end $$;
