# Changelog — SysPanelWiki

Formato basado en Keep a Changelog y SemVer (`MAJOR.MINOR.PATCH`).

## Criterio de versiones

| Tipo | Comando | Cuándo |
|------|---------|--------|
| **PATCH** `x.y.Z` | `npm run version:fix` | Fixes, UI polish, performance. Sin cambiar flujos. |
| **MINOR** `x.Y.0` | `npm run version:module` | Módulo nuevo o rediseño grande; compatible. |
| **MAJOR** `X.0.0` | `npm run version:official` | Hito de producto o cambio disruptivo. |

Reglas:

1. Cada deploy a producción debería llevar un bump (mínimo patch).
2. Un minor por entrega de módulo coherente.
3. Major solo para hitos o cambios que rompen compatibilidad.
4. La versión vive en `package.json` y se graba en `build-info.json` al hacer `npm run build`.
5. `npm run version:*` actualiza `package.json` **y crea un commit** con el mensaje `chore(release): vX.Y.Z (patch|minor|major)`.

## [1.4.0] — 2026-09-03

### Added / Changed
- **Tickets**: cola prioritaria, detalle al click, filtros compactos.
- **Instructivos**: wiki operativa, create optimista, tabs Contenido/PDF, recientes.
- **Configuración**: versión del sistema visible (commit + build), criterio SemVer con próximos patch/minor/major.
- **Versionado**: `bump-version.mjs` genera commit automático con la versión en el mensaje.

### Tóners (ciclo 1.3.x → 1.4.0)
- Inventario en tiempo real, pedidos a proveedor, PDF, recepción con confirmación/parcial.

## [1.3.0] — oficial previa

Base estable del panel interno.

### Cómo publicar la próxima

```bash
npm run version:fix    # o version:module / version:official
git push
# en servidor: git pull / reset + npm run build + restart
```
