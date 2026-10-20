# Nodara — Centro de operaciones IT

Wiki operativa con modulos de gestion para sistemas internos. Es una aplicacion propia con backend server-side, autenticacion propia y base PostgreSQL.

## Módulos

- **Dashboard**: resumen operativo y alertas.
- **Tickets**: mesa de ayuda con prioridades, comentarios, adjuntos y equipo vinculado.
- **Activos IT**: planilla técnica por equipo, reparaciones, asignaciones y controles. Etiquetas QR para rollo térmico de 57/80 mm o A4; al escanear, acciones rápidas para Sistemas y reporte de fallas sin cuenta para cualquier usuario. Auditoría física por sector con informe PDF, alta con etiquetas preimpresas y ubicación física dentro del sector.
- **Tóners**: stock, códigos correlativos, movimientos y pedidos al proveedor.
- **Guardias**: turnos, operarios y liquidación con feriados.
- **Instructivos**: carpetas, documentos y PDFs.
- **Oficina**: teléfonos internos y pedido de insumos con historial mensual.
- **Credenciales**: bóveda cifrada (AES-GCM) con auditoría de cada lectura.
- **Auditoría**: registro de cambios.
- **Configuración**: usuarios, roles personalizables con permisos por módulo, feriados, reporte mensual y depuración de datos.

## Instalación

Docker, Proxmox (LXC) o Linux directo: ver [`docs/INSTALACION.md`](docs/INSTALACION.md).

```bash
# Actualizar una instalación existente
sudo bash scripts/actualizar.sh
```

## Stack

- React 19
- TanStack Start
- Tailwind CSS
- PostgreSQL 14+ · Node.js 20+ (recomendado 22)
- Sesiones y roles persistidos en PostgreSQL
- Almacenamiento local configurable para adjuntos

## Estructura

```
db/            Base de datos: schema.sql + migrations/
scripts/       Servidor (serve.mjs), migraciones (init-db.mjs) y actualización (actualizar.sh)
deploy/        Docker, Proxmox LXC, instalador Linux y servicio systemd
src/backend/   BACKEND: conexión PostgreSQL, sesiones, permisos, API (server functions)
src/routes/    FRONTEND: páginas
src/components FRONTEND: componentes (ui/ base + uno por módulo)
src/lib/       FRONTEND: cliente de API, auth, tema, PDFs
.github/       CI y plantillas de PR / issues
```

Detalle y reglas: [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Desarrollo

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Archivos persistentes

Los adjuntos PDF se guardan en `FILE_STORAGE_DIR`. En produccion usar un directorio persistente y respaldado, por ejemplo `/var/lib/syswiki/storage`.
