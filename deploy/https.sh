#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
# Nodara · HTTPS en la red interna (necesario para la cámara del celular y las notificaciones)
#
#   sudo bash /opt/nodara/deploy/https.sh                 # usa la IP del servidor y el puerto 3443
#   sudo HTTPS_PORT=3443 HOSTS="172.20.1.134 nodara.local" bash deploy/https.sh
#
# Levanta Caddy como servicio propio (nodara-https) en un puerto aparte: no toca el 80/443 ni
# otros servicios ni otro Caddy que ya exista. Usa una autoridad interna: cada celular/PC tiene
# que confiar UNA vez en su certificado raíz, que queda en https://IP:3443/nodara-ca.crt
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail
cd /

HTTPS_PORT="${HTTPS_PORT:-3443}"
APP_PORT="${APP_PORT:-3090}"
HOSTS="${HOSTS:-$(hostname -I | awk '{print $1}')}"
DATA_DIR=/var/lib/nodara-https
CONF_DIR=/etc/nodara-https

verde() { printf '\033[1;32m%s\033[0m\n' "$*"; }
paso() { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "Ejecutalo como root (sudo)." >&2; exit 1; }

if ss -ltnH "sport = :$HTTPS_PORT" 2>/dev/null | grep -q . && ! systemctl is-active --quiet nodara-https; then
  echo "El puerto $HTTPS_PORT ya está en uso por otro servicio. Elegí otro: HTTPS_PORT=8443 bash $0" >&2
  exit 1
fi

paso "Caddy"
if ! command -v caddy >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg >/dev/null
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
  # El paquete trae un servicio "caddy" en el puerto 80: si no lo usaba nadie, se apaga.
  if [[ "$(grep -cv '^\s*#\|^\s*$' /etc/caddy/Caddyfile 2>/dev/null || echo 0)" -le 3 ]]; then
    systemctl disable --now caddy >/dev/null 2>&1 || true
  fi
fi
echo "  $(caddy version | head -1)"

paso "Configuración ($HOSTS → puerto $HTTPS_PORT)"
mkdir -p "$DATA_DIR" "$CONF_DIR"
SITIOS=""
for h in $HOSTS; do SITIOS+="https://$h:$HTTPS_PORT, "; done
SITIOS="${SITIOS%, }"
PRIMERO="$(awk '{print $1}' <<<"$HOSTS")"
cat > "$CONF_DIR/Caddyfile" <<CADDY
{
	admin off
	storage file_system $DATA_DIR
	skip_install_trust
	auto_https disable_redirects
	default_sni $PRIMERO
}

$SITIOS {
	tls internal
	encode gzip
	# Certificado raíz para instalar en celulares y PCs (una sola vez)
	handle /nodara-ca.crt {
		root * $DATA_DIR/pki/authorities/local
		rewrite * /root.crt
		header Content-Type application/x-x509-ca-cert
		file_server
	}
	reverse_proxy 127.0.0.1:$APP_PORT
}
CADDY
caddy fmt --overwrite "$CONF_DIR/Caddyfile" >/dev/null 2>&1 || true
caddy validate --config "$CONF_DIR/Caddyfile" --adapter caddyfile >/dev/null

cat > /etc/systemd/system/nodara-https.service <<UNIT
[Unit]
Description=Nodara · HTTPS interno (Caddy)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=$(command -v caddy) run --config $CONF_DIR/Caddyfile --adapter caddyfile
Restart=always
RestartSec=5
Environment=XDG_DATA_HOME=$DATA_DIR
AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now nodara-https >/dev/null
systemctl restart nodara-https
sleep 3

if curl -fsSk "https://127.0.0.1:$HTTPS_PORT/api/system/health" --resolve "$PRIMERO:$HTTPS_PORT:127.0.0.1" >/dev/null 2>&1 \
  || curl -fsSk "https://$PRIMERO:$HTTPS_PORT/api/system/health" >/dev/null 2>&1; then
  verde "
✔ HTTPS activo:  https://$PRIMERO:$HTTPS_PORT
  1. En cada celular/PC descargá e instalá el certificado raíz:  https://$PRIMERO:$HTTPS_PORT/nodara-ca.crt
     · Android: Ajustes → Seguridad → Cifrado y credenciales → Instalar certificado → Certificado de CA
     · iPhone: abrir el archivo → Ajustes → Perfil descargado → Instalar; luego General → Información →
       Ajustes de confianza de certificados → activarlo
     · Windows: doble clic → Instalar certificado → Equipo local → Entidades de certificación raíz de confianza
  2. En Nodara → Configuración → General → 'Dirección impresa en el QR' poné  https://$PRIMERO:$HTTPS_PORT
     y reimprimí las etiquetas viejas."
else
  echo "Caddy no respondió. Revisá: journalctl -u nodara-https -n 50" >&2
  exit 1
fi
