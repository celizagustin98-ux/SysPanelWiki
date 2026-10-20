#!/bin/sh
# Aplica el esquema y las migraciones pendientes antes de arrancar Nodara.
set -e

if [ -z "$SECRETS_ENCRYPTION_KEY" ]; then
  echo "ERROR: falta SECRETS_ENCRYPTION_KEY (generala con: openssl rand -base64 48)" >&2
  exit 1
fi

if [ "${SKIP_DB_INIT:-false}" != "true" ]; then
  node scripts/init-db.mjs
fi

exec "$@"
