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

## [1.3.0] — oficial actual

Base estable del panel interno (dashboard, tickets, tóners, instructivos, inventario, etc.).

### Incluye (ciclo reciente)

- Tóners: inventario en tiempo real, pedidos a proveedor, PDF de solicitud, recepción con confirmación/cantidades parciales.
- Tickets: rediseño tipo mesa de sistemas (cola prioritaria, detalle al click).
- Instructivos: rediseño wiki operativa, create optimista, tabs contenido/PDF.

### Cómo publicar la próxima

```bash
# patch 1.3.0 → 1.3.1
npm run version:fix

# minor 1.3.0 → 1.4.0
npm run version:module

git add package.json CHANGELOG.md
git commit -m "chore: release X.Y.Z"
git push
```
