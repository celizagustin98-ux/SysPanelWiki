# Nodara · imagen de producción (Node 22 + build de TanStack Start)
# Uso: docker compose up -d --build   (ver docs/INSTALACION.md)

# ── 1. Dependencias y build ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG GIT_COMMIT=""
RUN npm run build \
 && if [ -n "$GIT_COMMIT" ]; then node -e "const f='build-info.json';const b=JSON.parse(require('fs').readFileSync(f));b.commit=process.argv[1];require('fs').writeFileSync(f,JSON.stringify(b,null,2))" "$GIT_COMMIT"; fi \
 && npm prune --omit=dev --no-audit --no-fund

# ── 2. Imagen final, solo lo necesario para correr ──────────────────────
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3090 \
    FILE_STORAGE_DIR=/data/storage \
    ENABLE_WEB_UPDATES=false
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini postgresql-client \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data/storage && chown -R node:node /data
COPY --from=build --chown=node:node /app/package.json /app/build-info.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/db ./db
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node deploy/docker/entrypoint.sh /usr/local/bin/nodara-entrypoint
RUN chmod +x /usr/local/bin/nodara-entrypoint
USER node
VOLUME ["/data/storage"]
EXPOSE 3090
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3090)+'/api/system/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--", "nodara-entrypoint"]
CMD ["node", "scripts/serve.mjs"]
