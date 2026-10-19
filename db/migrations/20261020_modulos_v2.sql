-- Módulos v2 (idempotente)

-- Instructivos estilo Drive: descripción corta del documento y tamaño del PDF.
alter table wiki_docs add column if not exists descripcion text;
alter table wiki_attachments add column if not exists file_size integer;
alter table wiki_attachments add column if not exists created_by uuid references app_users(id) on delete set null;
create index if not exists wiki_folders_parent_idx on wiki_folders (parent_id);

-- Tóners: ciclo de vida de cada código pegado (en_stock -> usado).
alter table toner_unidades add column if not exists usado_at timestamptz;
alter table toner_unidades add column if not exists usado_sector text;
alter table toner_unidades add column if not exists usado_por_nombre text;
alter table toner_unidades add column if not exists movimiento_id uuid references toner_movimientos(id) on delete set null;
create index if not exists toner_unidades_estado_idx on toner_unidades (modelo_id, estado, codigo);

-- Tickets: historial por mes.
create index if not exists tareas_cerrado_idx on tareas (cerrado_en desc);
create index if not exists tareas_resuelto_idx on tareas (resuelto_en desc);

-- Tickets cerrados antes de registrar cerrado_en: se ubican en el mes de su última actualización.
update tareas
   set cerrado_en = coalesce(updated_at, created_at)
 where estado in ('cerrado', 'cancelado')
   and cerrado_en is null;
