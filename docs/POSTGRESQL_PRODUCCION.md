# Instructivo PostgreSQL para Nodara

Este instructivo deja una base PostgreSQL propia, controlada por vos, lista para usar con Nodara.

## 1. Requisitos

- PostgreSQL 15 o superior. Recomendado: PostgreSQL 16.
- Node.js 22.12 o superior para ejecutar el proyecto.
- Acceso de administrador al servidor donde va a vivir la base.
- Un directorio persistente para adjuntos, por ejemplo `/var/lib/syswiki/storage`.

## 2. Opcion rapida para pruebas locales con Docker

Usa esta opcion para probar en tu PC o en un servidor de desarrollo.

```bash
docker compose up -d postgres
cp .env.example .env
npm install
npm run db:init
npm run dev
```

La base queda disponible en:

```env
DATABASE_URL=postgresql://syswiki:cambia_esta_clave@127.0.0.1:5432/syswiki
DATABASE_SSL=false
```

Importante: para produccion no uses la clave de ejemplo.

## 3. Instalacion recomendada en servidor Linux

Ejemplo para Ubuntu/Debian:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Verificar estado:

```bash
sudo systemctl status postgresql
```

## 4. Crear usuario y base de datos

Entrar como usuario administrador de PostgreSQL:

```bash
sudo -u postgres psql
```

Dentro de `psql`, crear usuario y base. Cambia la clave por una fuerte:

```sql
create user syswiki with password 'CAMBIA_ESTA_CLAVE_LARGA';
create database syswiki owner syswiki;
grant all privileges on database syswiki to syswiki;
\c syswiki
create extension if not exists pgcrypto;
\q
```

Formato recomendado para la clave:

- Minimo 24 caracteres.
- Letras, numeros y simbolos.
- No reutilizar claves personales.

## 5. Configurar variables del proyecto

Crear `.env` desde el ejemplo:

```bash
cp .env.example .env
```

Editar `.env`:

```env
DATABASE_URL=postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@127.0.0.1:5432/syswiki
DATABASE_SSL=false
FILE_STORAGE_DIR=/var/lib/syswiki/storage
GITHUB_REPO=celizagustin98-ux/SysPanelWiki
```

Si la base esta en otro servidor:

```env
DATABASE_URL=postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@IP_O_HOST:5432/syswiki
```

Si usas un proveedor administrado que exige SSL:

```env
DATABASE_SSL=true
```

## 6. Inicializar las tablas del sistema

Desde la carpeta del proyecto:

```bash
npm install
npm run db:init
```

El comando aplica `db/schema.sql` y crea:

- Usuarios, sesiones y perfiles.
- Roles: `administrador`, `tecnico`, `consulta`.
- Permisos por modulo.
- Wiki e instructivos.
- Guardias.
- Inventario.
- Toners, stock y movimientos.
- Tareas, subtareas, comentarios e instructivos vinculados.
- Credenciales.
- Configuracion.
- Auditoria.

El script se puede ejecutar mas de una vez; usa `create table if not exists` y no borra datos.

## 7. Crear el directorio de adjuntos

```bash
sudo mkdir -p /var/lib/syswiki/storage
sudo chown -R $USER:$USER /var/lib/syswiki/storage
chmod 750 /var/lib/syswiki/storage
```

Ese directorio debe incluirse en backups porque guarda adjuntos PDF y archivos subidos.

## 8. Prueba de conexion

Si tenes `psql` instalado:

```bash
psql "postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@127.0.0.1:5432/syswiki" -c "select now();"
```

Ver tablas principales:

```bash
psql "postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@127.0.0.1:5432/syswiki" -c "\dt"
```

## 9. Primer usuario administrador

El primer usuario que se registre en el panel obtiene rol `administrador`.

Despues, los usuarios nuevos quedan como `consulta` hasta que un administrador les asigne otro rol desde el modulo de usuarios/roles.

## 10. Backup diario recomendado

Crear carpeta de backups:

```bash
sudo mkdir -p /var/backups/syswiki
sudo chown -R $USER:$USER /var/backups/syswiki
chmod 750 /var/backups/syswiki
```

Backup manual de la base:

```bash
pg_dump "postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@127.0.0.1:5432/syswiki" \
  --format=custom \
  --file="/var/backups/syswiki/syswiki-$(date +%F).dump"
```

Backup manual de adjuntos:

```bash
tar -czf "/var/backups/syswiki/storage-$(date +%F).tar.gz" /var/lib/syswiki/storage
```

Automatizacion diaria con cron:

```bash
crontab -e
```

Agregar:

```cron
15 2 * * * pg_dump "postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@127.0.0.1:5432/syswiki" --format=custom --file="/var/backups/syswiki/syswiki-$(date +\%F).dump"
25 2 * * * tar -czf "/var/backups/syswiki/storage-$(date +\%F).tar.gz" /var/lib/syswiki/storage
```

## 11. Restaurar un backup

Crear una base limpia:

```bash
sudo -u postgres createdb syswiki_restore
```

Restaurar:

```bash
pg_restore \
  --dbname="postgresql://syswiki:CAMBIA_ESTA_CLAVE_LARGA@127.0.0.1:5432/syswiki_restore" \
  --clean \
  --if-exists \
  "/var/backups/syswiki/syswiki-AAAA-MM-DD.dump"
```

Restaurar adjuntos:

```bash
sudo tar -xzf "/var/backups/syswiki/storage-AAAA-MM-DD.tar.gz" -C /
```

## 12. Seguridad minima recomendada

- No subir `.env` a GitHub.
- Usar una clave fuerte para el usuario `syswiki`.
- No usar el usuario `postgres` en la aplicacion.
- Abrir el puerto `5432` solo si la app esta en otro servidor.
- Si se abre `5432`, limitar por firewall a la IP del servidor de la app.
- Activar SSL si la base esta fuera del mismo servidor o red privada.
- Hacer backups diarios y probar restauracion una vez al mes.
- Rotar claves si se compartieron por chat o correo.

## 13. Comandos utiles de control

Ver conexiones activas:

```sql
select datname, usename, application_name, client_addr, state
from pg_stat_activity
where datname = 'syswiki';
```

Ver tamanio de la base:

```sql
select pg_size_pretty(pg_database_size('syswiki'));
```

Ver tablas mas grandes:

```sql
select
  schemaname,
  relname,
  pg_size_pretty(pg_total_relation_size(relid)) as total
from pg_catalog.pg_statio_user_tables
order by pg_total_relation_size(relid) desc;
```

Ver ultimos eventos de auditoria:

```sql
select created_at, actor_email, modulo, accion, entidad_desc
from audit_log
order by created_at desc
limit 50;
```

## 14. Checklist de produccion

- PostgreSQL instalado o proveedor administrado contratado.
- Base `syswiki` creada.
- Usuario `syswiki` creado con clave fuerte.
- `.env` configurado con `DATABASE_URL`.
- `DATABASE_SSL=true` si corresponde.
- `npm run db:init` ejecutado correctamente.
- `FILE_STORAGE_DIR` creado y persistente.
- Backup automatico configurado.
- Restauracion probada.
- Primer usuario registrado y confirmado como administrador.
