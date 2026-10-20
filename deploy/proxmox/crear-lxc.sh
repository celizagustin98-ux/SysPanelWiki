#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Nodara · crea un contenedor LXC en Proxmox VE con todo instalado.
# Se ejecuta en el HOST de Proxmox (shell del nodo), como root:
#
#   bash crear-lxc.sh                       # valores por defecto
#   CTID=120 IP=192.168.1.50/24 GW=192.168.1.1 bash crear-lxc.sh
#
# Variables: CTID, HOSTNAME, STORAGE, BRIDGE, IP (dhcp o CIDR), GW, CORES, MEMORY, DISK,
#            TEMPLATE_STORAGE, PASSWORD (root del contenedor), BRANCH
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

command -v pct >/dev/null || { echo "Este script corre en el host de Proxmox VE (falta 'pct')." >&2; exit 1; }

CTID="${CTID:-$(pvesh get /cluster/nextid)}"
HOSTNAME="${HOSTNAME:-nodara}"
STORAGE="${STORAGE:-local-lvm}"
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
BRIDGE="${BRIDGE:-vmbr0}"
IP="${IP:-dhcp}"
GW="${GW:-}"
CORES="${CORES:-2}"
MEMORY="${MEMORY:-2048}"
DISK="${DISK:-16}"
BRANCH="${BRANCH:-main}"
PASSWORD="${PASSWORD:-$(openssl rand -base64 18)}"

echo "▸ Plantilla Debian 12"
pveam update >/dev/null
TEMPLATE="$(pveam available --section system | awk '/debian-12-standard/ {print $2}' | sort -V | tail -1)"
[[ -n "$TEMPLATE" ]] || { echo "No encontré la plantilla debian-12-standard" >&2; exit 1; }
pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE" || pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"

NET="name=eth0,bridge=$BRIDGE,ip=$IP"
[[ "$IP" != "dhcp" && -n "$GW" ]] && NET="$NET,gw=$GW"

echo "▸ Creando contenedor $CTID ($HOSTNAME)"
pct create "$CTID" "$TEMPLATE_STORAGE:vztmpl/$TEMPLATE" \
  --hostname "$HOSTNAME" \
  --cores "$CORES" --memory "$MEMORY" --swap 512 \
  --rootfs "$STORAGE:$DISK" \
  --net0 "$NET" \
  --unprivileged 1 --features nesting=1 \
  --onboot 1 --timezone America/Argentina/Buenos_Aires \
  --password "$PASSWORD"
pct start "$CTID"

echo "▸ Esperando red"
for _ in $(seq 1 30); do
  pct exec "$CTID" -- bash -c "getent hosts deb.debian.org >/dev/null" && break
  sleep 2
done

echo "▸ Instalando Nodara dentro del contenedor"
pct exec "$CTID" -- bash -c "apt-get update -qq && apt-get install -y -qq curl ca-certificates >/dev/null"
pct exec "$CTID" -- bash -c "curl -fsSL https://raw.githubusercontent.com/celizagustin98-ux/SysPanelWiki/$BRANCH/deploy/instalar.sh | BRANCH=$BRANCH bash"

IP_CT="$(pct exec "$CTID" -- hostname -I | awk '{print $1}')"
cat <<FIN

✔ Contenedor $CTID listo
  Nodara:        http://$IP_CT:3090
  Root del CT:   $PASSWORD   (guardala y cambiala con: pct exec $CTID -- passwd)
  Actualizar:    pct exec $CTID -- bash /opt/nodara/scripts/actualizar.sh
  Backup del CT: vzdump $CTID --mode snapshot --compress zstd
FIN
