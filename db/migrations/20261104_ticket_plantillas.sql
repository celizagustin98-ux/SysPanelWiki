-- Tickets: plantillas para pedidos comunes (idempotente).
create table if not exists ticket_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  titulo text not null,
  descripcion text,
  tipo text not null default 'pedido',
  prioridad text not null default 'media',
  categoria text not null default 'Otro',
  created_at timestamptz not null default now()
);

insert into ticket_plantillas (nombre, titulo, descripcion, tipo, prioridad, categoria) values
  ('Alta de usuario', 'Alta de usuario: ', E'Nombre y apellido:\nSector / puesto:\nAccesos que necesita (correo, sistema, carpetas):\nFecha de ingreso:', 'pedido', 'media', 'Accesos'),
  ('Baja de usuario', 'Baja de usuario: ', E'Nombre y apellido:\nÚltimo día:\nQué hacer con el correo y los archivos:', 'pedido', 'alta', 'Accesos'),
  ('Impresora no imprime', 'Impresora no imprime - ', E'Sector / impresora:\nQué mensaje muestra:\n¿Afecta a todo el sector?', 'incidente', 'alta', 'Impresora'),
  ('Sin internet / red', 'Sin conexión de red - ', E'Sector / puesto:\n¿Es un solo equipo o varios?\nDesde cuándo:', 'incidente', 'critica', 'Red'),
  ('Cambio de tóner', 'Cambio de tóner - ', E'Impresora / sector:\nModelo de tóner:', 'pedido', 'baja', 'Impresora'),
  ('Restablecer contraseña', 'Restablecer contraseña de ', E'Usuario:\nSistema (correo, Windows, otro):', 'pedido', 'media', 'Accesos')
on conflict (nombre) do nothing;
