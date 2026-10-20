#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Nodara · actualización en servidor Linux (instalación directa o LXC de Proxmox)
#
#   sudo bash scripts/actualizar.sh            # trae main, compila, migra y reinicia
#   sudo bash scripts/actualizar.sh --sin-backup
#
# Pasos: backup de la base → git pull → npm ci → build → migraciones → reinicio.
# Si el build falla, el servicio sigue corriendo con la versión anterior.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nodara}"
HACER_BACKUP=true
[[ "${1:-}" == "--sin-backup" ]] && HACER_BACKUP=false

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarillo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
rojo() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
paso() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }

cd "$APP_DIR"
[[ -f package.json && -d .git ]] || { rojo "No encuentro el repositorio en $APP_DIR"; exit 1; }

# ── Servicio systemd: SERVICE_NAME, o el que corre desde esta carpeta, o syswiki/nodara
detectar_servicio() {
  if [[ -n "${SERVICE_NAME:-}" ]]; then echo "$SERVICE_NAME"; return; fi
  local u
  for u in $(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | sed 's/^●//'); do
    if [[ "$(systemctl show -p WorkingDirectory --value "$u" 2>/dev/null)" == "$APP_DIR" ]]; then echo "${u%.service}"; return; fi
  done
  for u in syswiki nodara; do
    systemctl cat "$u" >/dev/null 2>&1 && { echo "$u"; return; }
  done
}
SERVICIO="$(detectar_servicio || true)"

# ── Usuario dueño de la carpeta: git y npm corren como él (evita permisos rotos)
DUENO="$(stat -c %U "$APP_DIR")"
como_dueno() {
  if [[ "$(id -un)" == "$DUENO" ]]; then "$@"; else sudo -H -u "$DUENO" "$@"; fi
}

# ── Variables de entorno: .env de la carpeta, o el EnvironmentFile / Environment del servicio
cargar_env() {
  set -a
  if [[ -f "$APP_DIR/.env" ]]; then
    # shellcheck disable=SC1091
    . "$APP_DIR/.env"
  fi
  if [[ -n "$SERVICIO" ]]; then
    local f
    for f in $(systemctl show -p EnvironmentFiles --value "$SERVICIO" 2>/dev/null | grep -o '/[^ ]*' || true); do
      # shellcheck disable=SC1090
      [[ -r "$f" ]] && . "$f"
    done
    local linea
    linea="$(systemctl show -p Environment --value "$SERVICIO" 2>/dev/null || true)"
    [[ -n "$linea" ]] && eval "export $linea" 2>/dev/null || true
  fi
  set +a
}
cargar_env

verde "Nodara · actualización"
echo "  Carpeta:  $APP_DIR"
echo "  Rama:     $BRANCH"
echo "  Servicio: ${SERVICIO:-no encontrado}"
echo "  Usuario:  $DUENO"
[[ -n "${DATABASE_URL:-}" ]] || { rojo "Falta DATABASE_URL (no está en .env ni en el servicio)"; exit 1; }

# ── 1. Backup de la base
if $HACER_BACKUP; then
  paso "Backup de la base"
  if command -v pg_dump >/dev/null 2>&1; then
    mkdir -p "$BACKUP_DIR"
    archivo="$BACKUP_DIR/nodara-$(date +%Y%m%d-%H%M%S).sql.gz"
    if pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip > "$archivo"; then
      verde "  $archivo ($(du -h "$archivo" | cut -f1))"
      ls -1t "$BACKUP_DIR"/nodara-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f   # quedan los últimos 14
    else
      rm -f "$archivo"
      amarillo "  No se pudo hacer el backup (sigo igual). Revisá pg_dump y la versión de PostgreSQL."
    fi
  else
    amarillo "  pg_dump no está instalado: apt install postgresql-client (se omite el backup)"
  fi
fi

# ── 2. Código nuevo
paso "Descargando la última versión ($BRANCH)"
antes="$(como_dueno git rev-parse --short HEAD)"
como_dueno git fetch --prune origin "$BRANCH"
como_dueno git reset --hard "origin/$BRANCH"
despues="$(como_dueno git rev-parse --short HEAD)"
echo "  $antes → $despues"

# ── 3. Dependencias y build (se guarda el build anterior por si falla)
paso "Instalando dependencias"
como_dueno npm ci --no-audit --no-fund

paso "Compilando"
rm -rf dist.anterior
[[ -d dist ]] && cp -a dist dist.anterior
if ! como_dueno npm run build; then
  if [[ -d dist.anterior ]]; then rm -rf dist && mv dist.anterior dist; fi
  como_dueno git reset --hard "$antes" >/dev/null
  rojo "El build falló: se restauró la versión anterior ($antes). El servicio no se reinicia."
  exit 1
fi
rm -rf dist.anterior

# ── 4. Migraciones de base de datos
paso "Aplicando migraciones"
como_dueno env DATABASE_URL="$DATABASE_URL" DATABASE_SSL="${DATABASE_SSL:-false}" node scripts/init-db.mjs

# ── 5. Reinicio
if [[ -n "$SERVICIO" ]]; then
  paso "Reiniciando $SERVICIO"
  systemctl restart "$SERVICIO"
  sleep 3
  puerto="${PORT:-3090}"
  if curl -fsS "http://127.0.0.1:$puerto/api/system/health" >/dev/null 2>&1; then
    verde "  En línea en el puerto $puerto"
  else
    amarillo "  Revisá el estado: systemctl status $SERVICIO  /  journalctl -u $SERVICIO -n 50"
  fi
else
  amarillo "No encontré el servicio systemd: reiniciá Nodara a mano (o definí SERVICE_NAME)."
fi

verde "Listo: Nodara actualizado a $despues"
