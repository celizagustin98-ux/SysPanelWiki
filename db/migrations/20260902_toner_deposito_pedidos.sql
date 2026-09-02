-- Toner depot: unified stock movements + supplier orders

create sequence if not exists toner_pedido_numero_seq;
select setval('toner_pedido_numero_seq', greatest(100, (select coalesce(max(1), 0) from toner_modelos)));

create table if not exists toner_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero integer not null default nextval('toner_pedido_numero_seq'),
  estado text not null default 'borrador',
  proveedor text,
  notas text,
  created_by uuid references app_users(id) on delete set null,
  created_by_nombre text,
  enviado_at timestamptz,
  recibido_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists toner_pedidos_numero_uidx on toner_pedidos (numero);

create table if not exists toner_pedido_items (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references toner_pedidos(id) on delete cascade,
  modelo_id uuid not null references toner_modelos(id) on delete restrict,
  cantidad integer not null check (cantidad > 0),
  stock_al_pedir integer,
  cantidad_recibida integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists toner_pedido_items_pedido_idx on toner_pedido_items (pedido_id);

-- Stock trigger: ingreso/uso + reposicion descuenta
create or replace function apply_toner_movimiento() returns trigger language plpgsql as $$
begin
  update toner_modelos
     set stock = greatest(
       0,
       stock + case
         when new.tipo in ('entrada', 'cargar', 'ingreso') then new.cantidad
         when new.tipo in ('salida', 'consumo', 'uso', 'reposicion') then -new.cantidad
         when new.tipo = 'ajuste' then new.cantidad
         else 0
       end
     )
   where id = new.modelo_id;
  return new;
end;
$$;

drop trigger if exists toner_mov_stock on toner_movimientos;
create trigger toner_mov_stock after insert on toner_movimientos for each row execute function apply_toner_movimiento();
