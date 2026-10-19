## Qué cambia

<!-- Breve descripción del cambio y por qué. -->

## Área

- [ ] Frontend (`src/routes`, `src/components`, `src/lib`)
- [ ] Backend (`src/backend`, `scripts/serve.mjs`)
- [ ] Base de datos (`db/`) — ¿requiere `npm run db:init` en producción?

## Verificación

- [ ] `npm run build` pasa
- [ ] Probado en local o staging
- [ ] Si cambia la BD: migración nueva en `db/migrations/` (idempotente)

⚠️ Todo lo que llega a `main` se instala con el botón "Actualizar" de producción.
