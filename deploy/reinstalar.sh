#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Nodara · reinstalación limpia: elimina la instalación vieja de SysWiki/Nodara
# (servicio, carpeta, base de datos y adjuntos) y vuelve a instalar desde cero.
#
#   curl -fsSL https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/main/deploy/reinstalar.sh -o reinstalar.sh
#   sudo bash reinstalar.sh
#
# Solo toca lo que es de SysWiki/Nodara: el proceso del puerto 3090, servicios y contenedores
# con "syswiki" o "nodara" en el nombre, sus carpetas y su base de datos. NO desinstala
# PostgreSQL, Docker, Node ni ningún otro servicio. Antes de borrar muestra la lista y pide
# confirmación.  Variables: PORT (3090), SOLO_DESINSTALAR=true, BRANCH (main)
# ─────────────────────────────────────────────────────────────────────────
set -uo pipefail

PORT="${PORT:-3090}"
BRANCH="${BRANCH:-main}"
PATRON='syswiki|nodara'
PATRON_CARPETA='syswiki|nodara|syspanel'

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
amarillo() { printf '\033[1;33m%s\033[0m\n' "$*"; }
rojo() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; }
paso() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { rojo "Ejecutalo como root: sudo bash reinstalar.sh"; exit 1; }

SERVICIOS=()
CARPETAS=()
CONTENEDORES=()
VOLUMENES=()
BASES=()
ROLES=()
PM2_APPS=()
PIDS=()

agregar() { # agregar NOMBRE_ARRAY valor (sin duplicados ni vacíos)
  local -n arr="$1"
  [[ -z "$2" ]] && return
  local x
  for x in "${arr[@]}"; do [[ "$x" == "$2" ]] && return; done
  arr+=("$2")
}

# ── 1. Detección ──────────────────────────────────────────────────────────
paso "Buscando la instalación vieja"

# Proceso que escucha en el puerto
if command -v ss >/dev/null; then
  for pid in $(ss -ltnpH "sport = :$PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u); do
    agregar PIDS "$pid"
    cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    echo "  Puerto $PORT → pid $pid  ($cmd) en $cwd"
    if [[ "$cmd" == *docker-proxy* ]]; then
      echo "    (lo publica Docker: se busca el contenedor)"
    elif [[ "$cwd" =~ $PATRON_CARPETA || "${cwd,,}" =~ $PATRON_CARPETA ]]; then
      agregar CARPETAS "$cwd"
    elif [[ -n "$cwd" ]]; then
      amarillo "    la carpeta $cwd no tiene 'syswiki' en el nombre: no se borra"
    fi
    unidad="$(grep -o '[^/]*\.service' "/proc/$pid/cgroup" 2>/dev/null | head -1 || true)"
    [[ -n "$unidad" && "$unidad" != "user@"* && "$unidad" != "docker.service" && "$unidad" != "containerd.service" ]] && agregar SERVICIOS "${unidad%.service}"
  done
fi

# Servicios systemd con el nombre
for u in $(systemctl list-unit-files --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -iE "$PATRON"); do
  agregar SERVICIOS "${u%.service}"
done
for s in "${SERVICIOS[@]}"; do
  wd="$(systemctl show -p WorkingDirectory --value "$s" 2>/dev/null || true)"
  [[ "${wd,,}" =~ $PATRON_CARPETA ]] && agregar CARPETAS "$wd"
done

# Carpetas conocidas
for d in /opt/syswiki /opt/nodara /var/lib/syswiki /var/lib/nodara /srv/syswiki /home/*/syswiki /root/syswiki /root/SysPanelWiki /home/*/SysPanelWiki; do
  [[ -d "$d" ]] && agregar CARPETAS "$d"
done

# PM2
if command -v pm2 >/dev/null; then
  for n in $(pm2 jlist 2>/dev/null | grep -oE '"name":"[^"]*"' | cut -d'"' -f4 | grep -iE "$PATRON"); do agregar PM2_APPS "$n"; done
fi

# Docker
if command -v docker >/dev/null; then
  for c in $(docker ps -a --format '{{.Names}}' 2>/dev/null | grep -iE "$PATRON"); do agregar CONTENEDORES "$c"; done
  for c in $(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep -E ":$PORT->" | awk '{print $1}'); do agregar CONTENEDORES "$c"; done
  for v in $(docker volume ls -q 2>/dev/null | grep -iE "$PATRON"); do agregar VOLUMENES "$v"; done
fi

# Base de datos: la del .env de cada carpeta encontrada + las que se llamen syswiki/nodara
LOCAL_PG=false
if command -v psql >/dev/null && id postgres >/dev/null 2>&1 && sudo -u postgres psql -tAc "select 1" >/dev/null 2>&1; then
  LOCAL_PG=true
fi
for d in "${CARPETAS[@]}"; do
  [[ -f "$d/.env" ]] || continue
  url="$(grep -E '^DATABASE_URL=' "$d/.env" | head -1 | cut -d= -f2- | tr -d '"'"'")"
  [[ -z "$url" ]] && continue
  hostdb="$(sed -E 's#^[a-z]+://([^:@/]*(:[^@/]*)?@)?([^:/]+).*#\3#' <<<"$url")"
  base="$(sed -E 's#^.*/([^/?]+)(\?.*)?$#\1#' <<<"$url")"
  usuario="$(sed -E 's#^[a-z]+://([^:@/]+).*#\1#' <<<"$url")"
  echo "  .env en $d → base '$base' (usuario '$usuario') en $hostdb"
  if [[ "$hostdb" =~ ^(127\.0\.0\.1|localhost|::1)$ ]]; then
    agregar BASES "$base"
    agregar ROLES "$usuario"
  fi
done
if $LOCAL_PG; then
  for b in $(sudo -u postgres psql -tAc "select datname from pg_database where datname ~* '$PATRON'"); do agregar BASES "$b"; done
  for r in $(sudo -u postgres psql -tAc "select rolname from pg_roles where rolname ~* '$PATRON'"); do agregar ROLES "$r"; done
fi

# ── 2. Resumen y confirmación ─────────────────────────────────────────────
paso "Se va a ELIMINAR"
lista() { local t="$1"; shift; if (($#)); then echo "  $t:"; printf '     - %s\n' "$@"; fi; }
lista "Servicios systemd" "${SERVICIOS[@]}"
lista "Apps PM2" "${PM2_APPS[@]}"
lista "Contenedores Docker" "${CONTENEDORES[@]}"
lista "Volúmenes Docker" "${VOLUMENES[@]}"
lista "Bases PostgreSQL (local)" "${BASES[@]}"
lista "Usuarios PostgreSQL" "${ROLES[@]}"
lista "Carpetas" "${CARPETAS[@]}"
lista "Procesos en el puerto $PORT" "${PIDS[@]}"
total=$(( ${#SERVICIOS[@]} + ${#PM2_APPS[@]} + ${#CONTENEDORES[@]} + ${#VOLUMENES[@]} + ${#BASES[@]} + ${#CARPETAS[@]} + ${#PIDS[@]} ))
((total == 0)) && echo "  (no se encontró nada de SysWiki/Nodara)"
echo
amarillo "PostgreSQL, Docker, Node y el resto de los servicios NO se tocan."
amarillo "Esto no se puede deshacer."
printf 'Escribí BORRAR para continuar: '
read -r resp </dev/tty || resp=""
[[ "$resp" == "BORRAR" ]] || { rojo "Cancelado. No se borró nada."; exit 1; }

# ── 3. Eliminación ────────────────────────────────────────────────────────
paso "Eliminando"
for s in "${SERVICIOS[@]}"; do
  echo "  servicio $s"
  systemctl disable --now "$s" >/dev/null 2>&1 || true
  rm -f "/etc/systemd/system/$s.service" "/lib/systemd/system/$s.service" "/etc/sudoers.d/$s"
  rm -rf "/etc/systemd/system/$s.service.d"
done
systemctl daemon-reload
systemctl reset-failed >/dev/null 2>&1 || true

for a in "${PM2_APPS[@]}"; do echo "  pm2 $a"; pm2 delete "$a" >/dev/null 2>&1 || true; done
((${#PM2_APPS[@]})) && pm2 save >/dev/null 2>&1 || true

for c in "${CONTENEDORES[@]}"; do echo "  contenedor $c"; docker rm -f "$c" >/dev/null 2>&1 || true; done
for v in "${VOLUMENES[@]}"; do echo "  volumen $v"; docker volume rm "$v" >/dev/null 2>&1 || true; done

for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
sleep 2
for pid in "${PIDS[@]}"; do kill -9 "$pid" 2>/dev/null || true; done

if $LOCAL_PG; then
  for b in "${BASES[@]}"; do
    echo "  base $b"
    sudo -u postgres psql -qc "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$b' and pid <> pg_backend_pid()" >/dev/null 2>&1 || true
    sudo -u postgres psql -qc "drop database if exists \"$b\"" || amarillo "    no se pudo borrar la base $b"
  done
  for r in "${ROLES[@]}"; do
    [[ "$r" == "postgres" ]] && continue
    # Solo si no es dueño de otras bases (podría ser de otro sistema)
    otras="$(sudo -u postgres psql -tAc "select count(*) from pg_database d join pg_roles r on r.oid = d.datdba where r.rolname = '$r'")"
    if [[ "${otras:-0}" == "0" ]]; then
      echo "  usuario postgres $r"
      sudo -u postgres psql -qc "drop role if exists \"$r\"" || amarillo "    no se pudo borrar el usuario $r"
    else
      amarillo "  se conserva el usuario $r: es dueño de otras bases"
    fi
  done
fi

for d in "${CARPETAS[@]}"; do
  case "$d" in
    /|/opt|/srv|/home|/root|/var|/var/lib|/usr|/etc) amarillo "  se omite $d (carpeta del sistema)";;
    *)
      if [[ "${d,,}" =~ $PATRON_CARPETA ]]; then echo "  carpeta $d"; rm -rf "$d"
      else amarillo "  se omite $d (no es de SysWiki/Nodara)"; fi;;
  esac
done
rm -rf /var/backups/syswiki /tmp/syswiki-update.log

if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
  rojo "El puerto $PORT sigue ocupado: revisá con  ss -ltnp 'sport = :$PORT'"
  exit 1
fi
verde "Instalación vieja eliminada. Puerto $PORT libre."

[[ "${SOLO_DESINSTALAR:-false}" == "true" ]] && exit 0

# ── 4. Instalación nueva ──────────────────────────────────────────────────
paso "Instalando Nodara desde cero"
curl -fsSL "https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/$BRANCH/deploy/instalar.sh" -o /tmp/nodara-instalar.sh
PORT="$PORT" BRANCH="$BRANCH" bash /tmp/nodara-instalar.sh
