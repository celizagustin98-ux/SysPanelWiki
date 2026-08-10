# SysPanelWiki

Panel web de intranet para el Area de Sistemas. Incluye wiki tecnica, guardias, inventario, toners, tareas, credenciales, usuarios, roles, auditoria y configuracion.

Stack de produccion:

- React 19 + TanStack Start
- Tailwind CSS + componentes Radix
- PostgreSQL propio
- Autenticacion de usuarios propia con sesiones persistidas en PostgreSQL
- Almacenamiento local configurable para adjuntos PDF

## Requisitos

- Node.js 22.12 o superior
- PostgreSQL 15 o superior
- `psql` disponible para inicializar el esquema

## Variables de entorno

Crear `.env` en la raiz del proyecto:

```env
DATABASE_URL=postgresql://sysintranet:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/SysIntranet
DATABASE_SSL=false
FILE_STORAGE_DIR=/var/lib/syspanelwiki/storage
GITHUB_TOKEN=ghp_xxxxx
```

`GITHUB_TOKEN` solo se usa para revisar releases/commits desde el modulo Configuracion. No es necesario para iniciar la aplicacion.

## Base de datos

Crear base y usuario:

```bash
sudo -u postgres psql
```

```sql
create database "SysIntranet";
create user sysintranet with encrypted password 'CAMBIA_ESTA_CLAVE';
grant all privileges on database "SysIntranet" to sysintranet;
```

Aplicar el esquema:

```bash
npm run db:init
```

El archivo [`db/schema.sql`](db/schema.sql) crea tablas, indices, permisos iniciales, sesiones, roles, configuracion y triggers necesarios para los modulos.

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

Por defecto el servidor escucha en el puerto que configure TanStack/Nitro. Para mantenerlo vivo se recomienda PM2 o systemd.

Ejemplo con PM2:

```bash
sudo npm install -g pm2
pm2 start "npm run start" --name syspanelwiki
pm2 save
pm2 startup systemd
```

Ejemplo de Nginx:

```nginx
server {
    listen 80;
    server_name intranet.tuempresa.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 50M;
}
```

## Primer usuario

Registrate desde la pantalla de acceso. El primer usuario creado queda como `administrador`; los siguientes quedan como `consulta` hasta que un administrador cambie su rol.

## Modulos incluidos

- Dashboard
- Instructivos con carpetas, editor y PDFs
- Guardias
- Inventario
- Toners con stock, movimientos y codigos correlativos
- Tareas con kanban, subtareas, comentarios e instructivos vinculados
- Credenciales
- Usuarios y roles
- Auditoria
- Configuracion y revision de versiones en GitHub
