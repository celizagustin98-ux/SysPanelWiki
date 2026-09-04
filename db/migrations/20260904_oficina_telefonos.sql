-- Directorio de teléfonos internos (módulo Oficina)
create table if not exists oficina_telefonos (
  id uuid primary key default gen_random_uuid(),
  sector text not null,
  nombre text not null,
  interno text not null,
  notas text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists oficina_telefonos_sector_idx
  on oficina_telefonos (activo, sector, orden, nombre);

create index if not exists oficina_telefonos_interno_idx
  on oficina_telefonos (interno);

create index if not exists oficina_telefonos_busqueda_idx
  on oficina_telefonos (sector, nombre, interno);

-- Semilla de ejemplo (pocos registros por sector para validar UI)
insert into oficina_telefonos (sector, nombre, interno, notas, orden)
select v.sector, v.nombre, v.interno, v.notas, v.orden
from (values
  ('Consultorios', 'Cons. 1', '2501', null, 1),
  ('Consultorios', 'Cons. 2', '2502', null, 2),
  ('Consultorios', 'Cons. 10', '2510', null, 10),
  ('Secretarías', 'Recepción Deheza', '2900', null, 1),
  ('Secretarías', 'Secretaria Gris', '2610', null, 2),
  ('Secretarías', 'Secretaria Azul', '2922', null, 3),
  ('Admisión', 'Grupo', '2590', null, 1),
  ('Admisión', 'Admisión 1 (Gabriela)', '2591', null, 2),
  ('Admisión', 'Admisión 2', '2592', null, 3),
  ('Guardia', 'Secretaria', '2600', null, 1),
  ('Guardia', 'Derivaciones', '2601', '452-9630', 2),
  ('Guardia', 'Sala Médicos', '2603', null, 3),
  ('Diagnóstico por imágenes', 'Sala informes - Imágenes', '2612', null, 1),
  ('Diagnóstico por imágenes', 'Tomógrafo', '2615', null, 2),
  ('Diagnóstico por imágenes', 'Resonador', '2620', null, 3),
  ('Administración', 'Cotizaciones (Maxi)', '2715', null, 1),
  ('Administración', 'Compras (Sabri)', '2722', null, 2),
  ('Administración', 'Caja PB', '2727', null, 3),
  ('Sistemas', 'Grupo', '2790', null, 1),
  ('Sistemas', 'Santino', '2797', null, 2),
  ('Sistemas', 'Kevin', '2796', null, 3),
  ('Sistemas', 'Agustín', '2793', null, 4),
  ('Quirófanos', 'Secretaria (Stefania)', '2151', null, 1),
  ('Quirófanos', 'Quirófano 1', '2161', null, 2),
  ('Quirófanos', 'Quirófano 2', '2162', null, 3),
  ('Piso 1 Internado', 'UTI - Médicos', '2110', null, 1),
  ('Piso 1 Internado', 'UTI - Enfermería', '2111', null, 2),
  ('Turnos', 'Central de Turnos (Emanuel)', '2795', null, 1),
  ('Turnos', 'Turnos Pared (Deheza)', '2917', null, 2),
  ('RRHH', 'RRHH Marta', '2760', null, 1),
  ('RRHH', 'Recepción RRHH', '2762', null, 2)
) as v(sector, nombre, interno, notas, orden)
where not exists (select 1 from oficina_telefonos limit 1);
