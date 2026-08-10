# Intranet — Área de Sistemas

Aplicación web de Intranet y Wiki (TanStack Start + React + Tailwind + Shadcn UI) con backend en Lovable Cloud (Supabase).

---

## Despliegue en un servidor Linux (paso a paso)

Guía probada en **Ubuntu Server 22.04/24.04** o **Debian 12**. Ejecutar como usuario con `sudo`.

### 1. Preparar el servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential ufw
```

### 2. Instalar Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v      # v20.x
npm -v
```

(Opcional, más rápido) instalar **Bun**:

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
bun -v
```

### 3. Crear un usuario de despliegue (recomendado)

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG sudo deploy
sudo su - deploy
```

### 4. Configurar la clave SSH para GitHub

```bash
ssh-keygen -t ed25519 -C "servidor-intranet"
cat ~/.ssh/id_ed25519.pub
```

Copiá esa clave y pegala en GitHub → **Settings → SSH and GPG keys → New SSH key**
(o en el repo → **Settings → Deploy keys** si querés acceso de solo lectura).

Probá la conexión:

```bash
ssh -T git@github.com
```

### 5. Clonar tu repositorio

```bash
sudo mkdir -p /var/www && sudo chown -R $USER:$USER /var/www
cd /var/www

# Por SSH (recomendado, repos privados)
git clone git@github.com:celizagustin98-ux/SysPanelWiki.git intranet

# O por HTTPS (te pedirá usuario + token personal de GitHub)
# git clone https://github.com/celizagustin98-ux/SysPanelWiki.git intranet

cd intranet
```

### 6. Variables de entorno

Creá el archivo `.env` en la raíz del proyecto:

```bash
nano .env
```

Contenido:

```env
VITE_SUPABASE_URL=https://TU-PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
VITE_SUPABASE_PROJECT_ID=tu-project-id
SUPABASE_URL=https://TU-PROYECTO.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxx
GITHUB_TOKEN=ghp_xxxxxxxx        # para "Buscar actualización" en Configuración
```

> Las variables `VITE_*` se incorporan al navegador durante `npm run build`; las variables sin `VITE_` son necesarias para el renderizado del servidor. Usá los mismos valores en ambos pares. Nunca subas este archivo a Git (ya está en `.gitignore`).

Permisos:

```bash
chmod 600 .env
```

### 7. Instalar dependencias y compilar

```bash
npm install          # o: bun install
npm run build        # o: bun run build
```

### 8. Ejecutar la aplicación

```bash
npm run start
```

> En producción no uses `vite preview`: es únicamente para revisar una compilación local. `npm run start` ejecuta el servidor compilado de TanStack Start y permite abrir directamente rutas como `/auth` sin que aparezcan vacías.

Probá en el navegador: `http://IP-DEL-SERVIDOR:3000`

### 9. Mantenerla siempre encendida con PM2

```bash
sudo npm install -g pm2
cd /var/www/intranet
pm2 start "npm run start" --name intranet
pm2 save
pm2 startup systemd      # ejecutá el comando que imprime
pm2 logs intranet        # ver logs
```

Alternativa con **systemd** (`/etc/systemd/system/intranet.service`):

```ini
[Unit]
Description=Intranet Area de Sistemas
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/var/www/intranet
EnvironmentFile=/var/www/intranet/.env
ExecStart=/usr/bin/npm run start
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now intranet
sudo systemctl status intranet
```

### 10. Nginx como proxy inverso

```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/intranet
```

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

    client_max_body_size 50M;   # permite subir PDFs grandes a la Wiki
}
```

```bash
sudo ln -s /etc/nginx/sites-available/intranet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 11. Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 12. HTTPS (si el dominio es público)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d intranet.tuempresa.com
```

---

## Base de datos: PostgreSQL — `SysIntranet`

El motor de base de datos es **PostgreSQL**. La base de la aplicación se llama **`SysIntranet`**.

### ¿Se crea sola o hay que crear algo?

Depende de dónde la ejecutes:

| Escenario | ¿Se crea sola? | Qué tenés que hacer |
| --- | --- | --- |
| **Backend gestionado (Lovable Cloud)** | Sí | Nada. La base PostgreSQL, las tablas, funciones, políticas de seguridad y el bucket de archivos ya están creados y se actualizan solos con cada migración. |
| **Servidor propio (PostgreSQL autoalojado)** | No | Tenés que instalar PostgreSQL, crear la base `SysIntranet` y su usuario, y aplicar las migraciones de `supabase/migrations/` una sola vez. Después la app funciona sola. |

> Resumen: **las tablas nunca se crean solas al iniciar la app**. Se crean al aplicar las migraciones (automático en el backend gestionado, manual una única vez si autoalojás).

### Crear la base en un servidor propio (comandos exactos)

**1) Instalar PostgreSQL**

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
psql --version
```

**2) Crear el usuario y la base `SysIntranet`**

```bash
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE sysintranet WITH LOGIN PASSWORD 'CAMBIA_ESTA_CLAVE';
CREATE DATABASE "SysIntranet" OWNER sysintranet;
GRANT ALL PRIVILEGES ON DATABASE "SysIntranet" TO sysintranet;
SQL
```

**3) Crear extensiones y roles que usan las migraciones**

```bash
sudo -u postgres psql -d SysIntranet -v ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles que las migraciones referencian en los GRANT / políticas
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
SQL
```

> El nombre `SysIntranet` lleva mayúsculas, por eso **siempre va entre comillas dobles** en SQL y sin comillas en la línea de comandos (`psql -d SysIntranet`).

### Aplicar las migraciones (tablas, funciones y permisos)

Las migraciones están versionadas en el repositorio, en orden cronológico. Se aplican **una sola vez**, en orden alfabético (que es el cronológico):

```bash
cd /var/www/intranet
for f in $(ls -1 supabase/migrations/*.sql | sort); do
  echo ">>> Aplicando $f"
  sudo -u postgres psql -d SysIntranet -v ON_ERROR_STOP=1 -f "$f" || { echo "FALLÓ en $f"; break; }
done
```

Alternativa conectándose con el usuario de la aplicación (sin `sudo`):

```bash
export PGPASSWORD='CAMBIA_ESTA_CLAVE'
for f in $(ls -1 supabase/migrations/*.sql | sort); do
  psql -h 127.0.0.1 -U sysintranet -d SysIntranet -v ON_ERROR_STOP=1 -f "$f" || break
done
unset PGPASSWORD
```

Si usás la CLI de Supabase en el servidor:

```bash
supabase db push --db-url "postgresql://sysintranet:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/SysIntranet"
```


Esto crea: perfiles y roles (`profiles`, `user_roles`, `role_permissions`), wiki (`wiki_folders`, `wiki_docs`, `wiki_attachments`), guardias, inventario, tóners (`toner_modelos`, `toner_unidades`, `toner_movimientos`), tareas (con subtareas y comentarios), credenciales y `app_settings`, junto con las funciones de permisos y las reglas de acceso por fila.

### Verificar que quedó bien

```bash
sudo -u postgres psql -d SysIntranet -c '\dt public.*'
```

### Cadena de conexión

```env
DATABASE_URL=postgresql://sysintranet:CAMBIA_ESTA_CLAVE@127.0.0.1:5432/SysIntranet
```

### Copia de seguridad y restauración

```bash
pg_dump -U sysintranet -h 127.0.0.1 -Fc SysIntranet > backup_SysIntranet_$(date +%F).dump
pg_restore -U sysintranet -h 127.0.0.1 -d SysIntranet --clean backup_SysIntranet_2026-01-01.dump
```

### Nuevas versiones

Cuando traés una versión nueva con `git pull`, revisá si hay archivos nuevos en `supabase/migrations/` y aplicá solo esos (mismo comando de arriba). En el backend gestionado se aplican automáticamente.

---

## Primer usuario administrador

### 1. Regla automática (recomendado)

**El primer usuario que se registra queda como `administrador` automáticamente.** Lo hace el trigger `on_auth_user_created` → función `handle_new_user()`: crea el perfil y, si es el primer perfil de la base, le asigna el rol `administrador`; a partir del segundo, el rol es `consulta`.

Pasos por interfaz:

1. Abrí la app (`http://IP-DEL-SERVIDOR:3000` o tu dominio) — te lleva a `/auth`.
2. Elegí **Crear cuenta**, completá nombre, correo y contraseña (o usá **Continuar con Google**).
3. Iniciá sesión: ya vas a ver en el menú lateral **Usuarios** y **Configuración** (solo visibles para administradores).

> Importante: hacé este registro **antes** de que se registre nadie más. Si se adelantó otra persona, usá el punto 3.

### 2. Verificar que quedó como administrador

```bash
sudo -u postgres psql -d SysIntranet -c \
  "SELECT p.email, ur.role FROM public.profiles p JOIN public.user_roles ur ON ur.user_id = p.id ORDER BY p.created_at;"
```

Debe mostrar tu correo con `administrador`.

### 3. Asignar el rol administrador a mano (si hizo falta)

Por SQL, reemplazando el correo:

```bash
sudo -u postgres psql -d SysIntranet -v ON_ERROR_STOP=1 <<'SQL'
DELETE FROM public.user_roles
 WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'tu.correo@empresa.com');

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'administrador'::public.app_role
  FROM public.profiles WHERE email = 'tu.correo@empresa.com';
SQL
```

### 4. Alta de los demás usuarios (desde la interfaz)

Ya como administrador:

- **Usuarios** → **Nuevo usuario**: cargás nombre, correo, contraseña y rol (`administrador`, `tecnico` o `consulta`). También podés editar nombre/contraseña o eliminar cuentas.
- Cambiar el rol de alguien existente: selector de rol en su fila (usa la función `set_user_role`, que impide quitarte tu propio rol de administrador).

### 5. Permisos por rol

- **Configuración → Permisos por rol**: matriz con **Ver / Crear / Editar / Eliminar** por módulo (instructivos, guardias, inventario, tóners, tareas, credenciales, usuarios) para `tecnico` y `consulta`.
- El rol **administrador siempre tiene todos los permisos** y no es editable en la matriz (la función `has_perm` devuelve `true` para administradores).
- Para "solo lectura", dejá únicamente **Ver** activado en los módulos que correspondan.

Consulta rápida de la matriz por consola:

```bash
sudo -u postgres psql -d SysIntranet -c \
  "SELECT role, modulo, can_view, can_create, can_edit, can_delete FROM public.role_permissions ORDER BY role, modulo;"
```


---


## Actualizar la aplicación (nueva versión desde GitHub)

```bash
cd /var/www/intranet
git pull origin main
npm install
npm run build
pm2 restart intranet        # o: sudo systemctl restart intranet
```

Script opcional `deploy.sh`:

```bash
#!/usr/bin/env bash
set -e
cd /var/www/intranet
git pull origin main
npm ci
npm run build
pm2 restart intranet
echo "Despliegue completado: $(git rev-parse --short HEAD)"
```

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## Desarrollo local

```bash
git clone git@github.com:celizagustin98-ux/SysPanelWiki.git
cd SysPanelWiki
npm install
npm run dev      # http://localhost:8080
```

## Comandos útiles

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Compilar para producción |
| `npm run lint` | Analizar el código |
| `pm2 logs intranet` | Ver logs en vivo |
| `pm2 restart intranet` | Reiniciar la app |
| `git pull origin main` | Traer la última versión |

## Problemas frecuentes

- **`Permission denied (publickey)`** al clonar: la clave SSH del servidor no está cargada en GitHub (paso 4).
- **Página en blanco / error 502**: la app no está corriendo → `pm2 logs intranet`.
- **Login vacío en `/auth`**: comprobá que PM2 ejecute `npm run start`, no `vite preview`; luego corré `npm run build && pm2 restart intranet --update-env`.
- **Variables `undefined`**: falta alguno de los pares `VITE_SUPABASE_*` / `SUPABASE_*`, o hay que recompilar (`npm run build`) tras editar `.env`.
- **No suben PDFs**: aumentar `client_max_body_size` en Nginx.
