-- Correcciones detectadas en la auditoría del 19/10/2026 (idempotente)

-- 1) Secuencia de tickets: 20260831_tickets.sql la reinicia con max(orden) en cada db:init,
--    lo que hacía chocar el número de los tickets nuevos con los existentes.
select setval('ticket_numero_seq', greatest(1000, (select coalesce(max(numero), 0) from tareas)), true);

-- 2) Contar una vista de un instructivo no debe cambiar su fecha de actualización.
create or replace function touch_wiki_docs() returns trigger language plpgsql as $$
begin
  if (new.title, new.content, new.tags, new.folder_id) is distinct from (old.title, old.content, old.tags, old.folder_id) then
    new.updated_at = now();
  else
    new.updated_at = old.updated_at;
  end if;
  return new;
end;
$$;
drop trigger if exists wiki_docs_touch on wiki_docs;
create trigger wiki_docs_touch before update on wiki_docs for each row execute function touch_wiki_docs();

-- 3) Índices para las consultas más frecuentes.
create index if not exists audit_log_created_idx on audit_log (created_at desc);
create index if not exists audit_log_modulo_created_idx on audit_log (modulo, created_at desc);
create index if not exists guardias_hasta_idx on guardias (hasta);
create index if not exists inventario_updated_idx on inventario (updated_at desc);
create index if not exists toner_pedidos_created_idx on toner_pedidos (created_at desc);
