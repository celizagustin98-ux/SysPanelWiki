# Instalación y actualización de Nodara

Hay tres formas de instalar Nodara. Todas usan PostgreSQL y aplican las migraciones solas.

| Opción | Ideal para | Actualizar |
|---|---|---|
| **A. Docker Compose** | Cualquier Linux con Docker | `git pull && docker compose up -d --build` |
| **B. Proxmox VE (LXC)** | Servidores Proxmox | `pct exec <ID> -- bash /opt/nodara/scripts/actualizar.sh` |
| **C. Linux directo** (Debian/Ubuntu, VM) | Servidor dedicado o VM | `sudo bash /opt/nodara/scripts/actualizar.sh` o el botón **Actualizar** |

Requisitos mínimos: 2 vCPU, 2 GB de RAM y 10 GB de disco.

---

## A. Docker Compose

```bash
git clone https://github.com/celizagustin98-ux/SysPanelWiki.git nodara
cd nodara
cp .env.example .env
nano .env    # completar POSTGRES_PASSWORD y SECRETS_ENCRYPTION_KEY
docker compose up -d --build
```

- Para generar la clave de cifrado: `openssl rand -base64 48`.
- Abrí `http://IP-del-servidor:3090` y creá el primer usuario, que queda como **administrador**.
- Los datos quedan en los volúmenes `pgdata` (base) y `storage` (adjuntos y PDFs).

**Actualizar**

```bash
cd nodara && git pull && docker compose up -d --build
```

**Backup**

```bash
docker compose exec -T db pg_dump -U nodara nodara | gzip > nodara-$(date +%F).sql.gz
docker run --rm -v nodara_storage:/d -v "$PWD":/b alpine tar czf /b/storage-$(date +%F).tgz -C /d .
```

> En Docker el botón "Actualizar" de Configuración queda desactivado: se actualiza con `docker compose`.

---

## B. Proxmox VE (contenedor LXC)

En la **shell del nodo Proxmox**, como root:

```bash
curl -fsSL https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/main/deploy/proxmox/crear-lxc.sh -o crear-lxc.sh
bash crear-lxc.sh
```

El script descarga la plantilla Debian 12, crea un contenedor no privilegiado (2 vCPU, 2 GB y 16 GB), instala Nodara y muestra la URL. Podés ajustar los valores:

```bash
CTID=120 IP=192.168.1.50/24 GW=192.168.1.1 STORAGE=local-zfs MEMORY=4096 bash crear-lxc.sh
```

- **Actualizar:** `pct exec 120 -- bash /opt/nodara/scripts/actualizar.sh`, o el botón **Actualizar** dentro del sistema.
- **Backup completo:** `vzdump 120 --mode snapshot --compress zstd`. También podés programarlo en *Datacenter → Backup*.

¿Preferís una VM? Creá una VM con Debian 12 o Ubuntu 24.04 y seguí la opción C.

---

## C. Linux directo (Debian 12 / Ubuntu 22.04+)

```bash
curl -fsSL https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/main/deploy/instalar.sh | sudo bash
```

El instalador:

1. Instala Node.js 22 y PostgreSQL.
2. Crea la base con una clave aleatoria.
3. Clona el sistema en `/opt/nodara`.
4. Genera `.env` con la clave de cifrado.
5. Compila y aplica las migraciones.
6. Deja andando el servicio `nodara`.

**Actualizar**

```bash
sudo bash /opt/nodara/scripts/actualizar.sh
```

`actualizar.sh` hace un backup de la base en `/var/backups/nodara` (conserva los últimos 14) y trae `main`. Después instala las dependencias y compila; si el build falla, vuelve a la versión anterior. Al final aplica las migraciones y reinicia el servicio.

### Reinstalar desde cero (borra la instalación vieja)

Elimina el servicio, la carpeta, la base y los adjuntos de SysWiki/Nodara, y después instala limpio. No toca PostgreSQL, Docker ni otros servicios. Antes de borrar muestra la lista de lo que va a eliminar y pide escribir `BORRAR`.

```bash
curl -fsSL https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/main/deploy/reinstalar.sh -o reinstalar.sh
sudo bash reinstalar.sh
```

---

## Mantenimiento

| Tarea | Comando |
|---|---|
| Ver logs | `journalctl -u nodara -f` (Docker: `docker compose logs -f app`) |
| Reiniciar | `systemctl restart nodara` (Docker: `docker compose restart app`) |
| Aplicar migraciones a mano | `node scripts/init-db.mjs` |
| Modo mantenimiento | `MAINTENANCE_MODE=true` en `.env` y reiniciar |
| Restaurar un backup | `gunzip -c backup.sql.gz \| psql "$DATABASE_URL"` |

**Muy importante:** guardá una copia de `.env` fuera del servidor. Sin `SECRETS_ENCRYPTION_KEY` no se pueden leer las credenciales guardadas en el módulo Credenciales.

### HTTPS (necesario para escanear con la cámara del celular)

La cámara del navegador y las notificaciones de escritorio solo funcionan con HTTPS. En la red interna:

```bash
sudo bash /opt/nodara/deploy/https.sh
```

El script levanta un Caddy propio (servicio `nodara-https`) en el puerto **3443**, sin tocar el 80/443 ni otros servicios. Después:

1. En cada celular o PC instalá una vez el certificado raíz: `https://IP:3443/nodara-ca.crt`.
2. En **Configuración → General → Etiquetas y escaneo QR**, en "Dirección impresa en el QR", poné `https://IP:3443`.
3. Reimprimí las etiquetas viejas.

Si ya tenés un proxy (Nginx Proxy Manager, Traefik), apuntalo a `127.0.0.1:3090` y usá esa dirección en el paso 2.

### Etiquetas QR

- **Impresora:** térmica de rollo de 57 mm (o 80 mm, se elige en Configuración) o una impresora común con hojas A4 autoadhesivas.
- **Configuración de la impresora en el sistema operativo:** papel de 57 mm de ancho, márgenes en 0 y escala 100 %.
- **Formatos:** "Rollo estándar" (60 mm de alto) para equipos grandes y "Rollo mini" (24 mm de alto) para notebooks, celulares y switches.
