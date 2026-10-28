-- Pedidos de compra con seguimiento por ítem + agenda de contactos (idempotente).

-- ── Seguimiento de cada ítem: cuánto se compró, cuánto llegó, a quién y a qué precio ──
alter table insumos_items add column if not exists cantidad_comprada numeric(12, 2) not null default 0;
alter table insumos_items add column if not exists cantidad_recibida numeric(12, 2) not null default 0;
alter table insumos_items add column if not exists cancelado boolean not null default false;
alter table insumos_items add column if not exists proveedor text;
alter table insumos_items add column if not exists precio_real numeric(14, 2);
alter table insumos_items add column if not exists comprado_at timestamptz;
alter table insumos_items add column if not exists recibido_at timestamptz;
alter table insumos_items add column if not exists nota_compra text;

-- Ítems que ya estaban tildados como comprados: se toman como comprados completos.
update insumos_items set cantidad_comprada = cantidad
 where comprado and cantidad_comprada = 0;

-- Pedidos que figuraban recibidos: sus ítems también.
update insumos_items i set cantidad_recibida = i.cantidad_comprada
  from insumos_pedidos p
 where p.id = i.pedido_id and p.estado = 'recibido' and i.cantidad_recibida = 0;

alter table insumos_pedidos add column if not exists cerrado_at timestamptz;
alter table insumos_pedidos add column if not exists actualizado_at timestamptz;

-- ── Historial de cada pedido (lo escribe solo el servidor) ──
create table if not exists insumos_pedido_eventos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references insumos_pedidos(id) on delete cascade,
  item_id uuid references insumos_items(id) on delete set null,
  tipo text not null default 'nota',
  texto text not null,
  autor_id uuid references app_users(id) on delete set null,
  autor_nombre text,
  created_at timestamptz not null default now()
);
create index if not exists insumos_pedido_eventos_pedido_idx on insumos_pedido_eventos (pedido_id, created_at desc);

-- ── Agenda: proveedores y correos de la empresa ──
create table if not exists oficina_contactos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'proveedor',
  nombre text not null,
  rubro text,
  contacto text,
  email text,
  telefono text,
  whatsapp text,
  web text,
  direccion text,
  cuit text,
  notas text,
  favorito boolean not null default false,
  activo boolean not null default true,
  created_by_nombre text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists oficina_contactos_tipo_idx on oficina_contactos (activo, tipo, nombre);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oficina_contactos_tipo_chk') then
    alter table oficina_contactos add constraint oficina_contactos_tipo_chk check (tipo in ('proveedor', 'empresa'));
  end if;
end $$;
