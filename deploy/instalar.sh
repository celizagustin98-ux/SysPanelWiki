#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Nodara · instalación desde cero en Debian 12 / Ubuntu 22.04+ (VM o LXC de Proxmox)
#
#   curl -fsSL https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/main/deploy/instalar.sh | sudo bash
#   (o)  sudo bash deploy/instalar.sh
#
# Instala Node.js 22, PostgreSQL, crea la base, clona el sistema en /opt/nodara,
# genera las claves, compila, aplica migraciones y deja el servicio systemd andando.
# Variables opcionales: APP_DIR, REPO_URL, BRANCH, PORT, SERVICE_NAME, APP_USER
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/nodara}"
REPO_URL="${REPO_URL:-https://github.com/celizagustin98-ux/SysPanelWiki.git}"
BRANCH="${BRANCH:-main}"
PORT="${PORT:-3090}"
SERVICE_NAME="${SERVICE_NAME:-nodara}"
APP_USER="${APP_USER:-nodara}"
DB_NAME="${DB_NAME:-nodara}"
DB_USER="${DB_USER:-nodara}"
STORAGE_DIR="${STORAGE_DIR:-/var/lib/nodara/storage}"

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
paso() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "Ejecutalo como root (sudo)." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

paso "Paquetes del sistema"
apt-get update -qq
apt-get install -y -qq sudo ca-certificates curl gnupg git openssl >/dev/null
# PostgreSQL: si el servidor ya tiene uno andando (de otros sistemas) se usa ese, no se instala otro.
if command -v pg_lsclusters >/dev/null && pg_lsclusters -h 2>/dev/null | grep -q online; then
  echo "  PostgreSQL ya instalado: se usa el existente."
  apt-get install -y -qq postgresql-client >/dev/null || true
else
  apt-get install -y -qq postgresql postgresql-client >/dev/null
fi

if ! command -v node >/dev/null; then
  paso "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
elif [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]]; then
  # No se actualiza solo: otros servicios del servidor podrían depender de esa versión.
  echo "Este servidor tiene Node $(node -v) y Nodara necesita 20 o superior." >&2
  echo "Actualizalo (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install nodejs) o usá Docker." >&2
  exit 1
fi
echo "  node $(node -v) · npm $(npm -v) · $(psql --version)"

paso "Usuario de sistema '$APP_USER'"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "/home/$APP_USER" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$STORAGE_DIR" /var/backups/nodara
chown -R "$APP_USER:$APP_USER" "$(dirname "$STORAGE_DIR")" /var/backups/nodara

paso "Base de datos PostgreSQL"
systemctl enable --now postgresql >/dev/null 2>&1 || true
DB_PASS="$(openssl rand -hex 24)"
PG_PORT="$(sudo -u postgres psql -tAc "show port" 2>/dev/null | tr -d ' ' || true)"
PG_PORT="${PG_PORT:-5432}"
if sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_USER'" | grep -q 1; then
  sudo -u postgres psql -qc "alter role $DB_USER with login password '$DB_PASS'"
else
  sudo -u postgres psql -qc "create role $DB_USER with login password '$DB_PASS'"
fi
sudo -u postgres psql -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1 \
  || sudo -u postgres psql -qc "create database $DB_NAME owner $DB_USER"
sudo -u postgres psql -q -d "$DB_NAME" -c "create extension if not exists pgcrypto" || true

paso "Código en $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch -q origin "$BRANCH"
  sudo -u "$APP_USER" git -C "$APP_DIR" reset -q --hard "origin/$BRANCH"
else
  mkdir -p "$APP_DIR"
  chown "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone -q --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

paso "Configuración (.env)"
if [[ -f "$APP_DIR/.env" ]]; then
  echo "  Ya existe $APP_DIR/.env: se conserva (solo se actualiza la clave de la base)."
  sed -i "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:$PG_PORT/$DB_NAME#" "$APP_DIR/.env"
else
  cat > "$APP_DIR/.env" <<ENV
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@127.0.0.1:$PG_PORT/$DB_NAME
DATABASE_SSL=false
SECRETS_ENCRYPTION_KEY=$(openssl rand -base64 48 | tr -d '\n')
PORT=$PORT
HOST=0.0.0.0
TZ=America/Argentina/Buenos_Aires
FILE_STORAGE_DIR=$STORAGE_DIR
ALLOW_PUBLIC_SIGNUP=false
MAINTENANCE_MODE=false
ENABLE_WEB_UPDATES=true
GITHUB_BRANCH=$BRANCH
SERVICE_NAME=$SERVICE_NAME
ENV
fi
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

paso "Dependencias y build (puede tardar unos minutos)"
cd "$APP_DIR"
sudo -u "$APP_USER" -H npm ci --no-audit --no-fund
sudo -u "$APP_USER" -H npm run build

paso "Migraciones"
sudo -u "$APP_USER" -H node scripts/init-db.mjs

paso "Servicio systemd '$SERVICE_NAME'"
sed -e "s#__APP_DIR__#$APP_DIR#g" -e "s#__APP_USER__#$APP_USER#g" deploy/systemd/nodara.service > "/etc/systemd/system/$SERVICE_NAME.service"
# El botón "Actualizar" reinicia el servicio: se permite solo ese comando sin contraseña.
echo "$APP_USER ALL=(root) NOPASSWD: /usr/bin/systemctl restart $SERVICE_NAME, /bin/systemctl restart $SERVICE_NAME" > "/etc/sudoers.d/$SERVICE_NAME"
chmod 440 "/etc/sudoers.d/$SERVICE_NAME"
systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME" >/dev/null
sleep 3

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if curl -fsS "http://127.0.0.1:$PORT/api/system/health" >/dev/null; then
  verde "
✔ Nodara instalado
  Abrí:  http://${IP:-localhost}:$PORT  y creá el primer usuario (queda como administrador).
  Actualizar:  sudo bash $APP_DIR/scripts/actualizar.sh
  Logs:        journalctl -u $SERVICE_NAME -f
  IMPORTANTE:  guardá una copia de $APP_DIR/.env (SECRETS_ENCRYPTION_KEY) fuera del servidor."
else
  echo "El servicio no respondió todavía. Revisá: journalctl -u $SERVICE_NAME -n 80" >&2
  exit 1
fi
