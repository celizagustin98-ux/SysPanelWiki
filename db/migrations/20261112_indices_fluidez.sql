-- Índices para las consultas más frecuentes (detalle del ticket, consumo de tóners, tendencias, bot) (idempotente).
create index if not exists tarea_comentarios_tarea_idx on tarea_comentarios (tarea_id, created_at);
create index if not exists tarea_instructivos_tarea_idx on tarea_instructivos (tarea_id);
create index if not exists toner_movimientos_created_idx on toner_movimientos (created_at desc);
create index if not exists tareas_created_idx on tareas (created_at desc);
create index if not exists tareas_vence_abiertos_idx on tareas (vence_el) where estado not in ('resuelto', 'cerrado', 'cancelado');
create index if not exists audit_log_accion_created_idx on audit_log (accion, created_at desc);
create index if not exists inventario_asignaciones_item_idx on inventario_asignaciones (inventario_id, desde desc);
create index if not exists bot_envios_evento_idx on bot_envios (evento, enviado_at desc);
