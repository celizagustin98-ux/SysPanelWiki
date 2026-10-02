-- Performance + session hygiene indexes (safe to re-run)

create index if not exists app_sessions_expires_idx on app_sessions (expires_at);

create index if not exists tareas_estado_idx on tareas (estado);
create index if not exists tareas_asignado_idx on tareas (asignado_a);
create index if not exists tareas_updated_idx on tareas (updated_at desc);
create index if not exists tareas_solicitante_idx on tareas (solicitante_id);

create index if not exists wiki_docs_folder_idx on wiki_docs (folder_id);
create index if not exists wiki_docs_updated_idx on wiki_docs (updated_at desc);

create index if not exists wiki_attachments_doc_idx on wiki_attachments (doc_id);

create index if not exists toner_unidades_modelo_idx on toner_unidades (modelo_id);
create index if not exists toner_movimientos_modelo_idx on toner_movimientos (modelo_id, created_at desc);

create index if not exists guardias_desde_idx on guardias (desde, hasta);

-- Cleanup expired sessions immediately once
delete from app_sessions where expires_at < now();
