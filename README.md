# SysWiki Panel

Wiki operativa con modulos de gestion para sistemas internos. Es una aplicacion propia con backend server-side, autenticacion propia y base PostgreSQL.

## Modulos

- Dashboard
- Instructivos/wiki con carpetas, editor y adjuntos PDF
- Guardias
- Inventario
- Toners con stock, movimientos y codigos correlativos
- Tareas con tablero, subtareas, comentarios e instructivos vinculados
- Credenciales
- Usuarios, roles y permisos
- Auditoria
- Configuracion y revision de versiones desde GitHub

## Stack

- React 19
- TanStack Start
- Tailwind CSS
- PostgreSQL 15+
- Sesiones y roles persistidos en PostgreSQL
- Almacenamiento local configurable para adjuntos

## Configuracion

Copiar `.env.example` a `.env` y ajustar valores:

```env
DATABASE_URL=postgresql://syswiki:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/syswiki
DATABASE_SSL=false
FILE_STORAGE_DIR=./storage
GITHUB_REPO=celizagustin98-ux/SysPanelWiki
```

## PostgreSQL local

Con Docker:

```bash
docker compose up -d postgres
npm run db:init
```

Sin Docker, crear una base PostgreSQL y luego ejecutar:

```bash
npm run db:init
```

El script `db:init` usa `DATABASE_URL` y aplica `db/schema.sql`; no requiere tener `psql` instalado.

## Desarrollo

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`.

## Produccion

```bash
npm ci
npm run build
npm run start
```

El primer usuario registrado obtiene rol `administrador`. Los siguientes usuarios quedan como `consulta` hasta que un administrador les asigne otro rol.

## Archivos persistentes

Los adjuntos PDF se guardan en `FILE_STORAGE_DIR`. En produccion usar un directorio persistente y respaldado, por ejemplo `/var/lib/syswiki/storage`.
