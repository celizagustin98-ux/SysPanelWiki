# Arquitectura de Nodara

Es una aplicación **fullstack** con [TanStack Start](https://tanstack.com/start): frontend y backend viven en
el mismo proyecto y se compilan juntos (`npm run build`). El frontend llama al backend mediante
*server functions* (RPC tipado) y algunos endpoints REST de `scripts/serve.mjs`.

```
SysPanelWiki/
├── db/                       BASE DE DATOS (PostgreSQL)
│   ├── schema.sql            esquema base
│   └── migrations/           cambios incrementales (idempotentes)
│
├── scripts/                  OPERACIÓN / SERVIDOR
│   ├── serve.mjs             servidor HTTP de producción: estáticos, /api/auth, /api/system,
│   │                         /api/updates, PDFs, rate-limit, CSP, modo mantenimiento
│   ├── init-db.mjs           aplica schema + migraciones (npm run db:init)
│   └── bump-version.mjs, write-build-info.mjs
│
├── src/
│   ├── backend/              BACKEND (solo corre en el servidor)
│   │   ├── core/
│   │   │   ├── db.ts             pool PostgreSQL, sesiones, contraseñas, permisos, archivos
│   │   │   ├── auth-middleware.ts  valida el token en server functions
│   │   │   ├── crypto-secrets.ts   cifrado AES-GCM de credenciales
│   │   │   └── error-page.ts, error-capture.ts
│   │   └── api/
│   │       ├── data.functions.ts      select/insert/update/delete con lista blanca de tablas + RPCs
│   │       └── usuarios.functions.ts  alta/baja/edición de usuarios (solo admin)
│   │
│   ├── lib/                  FRONTEND — lógica compartida
│   │   ├── api/client.ts     cliente de datos (api.from("tabla")…) que llama al backend
│   │   ├── api/auth-attacher.ts  agrega el token a cada server function
│   │   ├── auth.tsx          contexto de sesión, rol y permisos
│   │   ├── theme.tsx, utils.ts, error-reporting.ts
│   │   └── *-pdf.ts          generación de PDFs en el navegador
│   ├── components/           FRONTEND — componentes
│   │   ├── ui/               componentes base (shadcn/ui + Radix)
│   │   ├── tickets/, guardias/, instructivos/   componentes por módulo
│   │   └── AppShell.tsx      layout: sidebar, header, PageHeader, EmptyState
│   ├── routes/               FRONTEND — páginas (una por archivo, ruteo por nombre)
│   ├── hooks/                FRONTEND — hooks de React
│   ├── styles.css            tema (colores, sombras, animaciones)
│   │
│   ├── router.tsx, start.ts, server.ts   entradas del framework (no mover)
│   └── routeTree.gen.ts      generado automáticamente (no editar)
│
├── public/                   archivos estáticos (favicon, mantenimiento)
├── docs/                     documentación
└── .github/                  CI, plantillas de PR e issues
```

## Reglas

1. **Nada de `src/backend/` se importa desde componentes o páginas**, salvo las *server functions*
   (`*.functions.ts`), que el framework convierte en llamadas HTTP. El acceso a datos del front pasa
   siempre por `src/lib/api/client.ts`.
2. **Toda tabla nueva** se agrega en `db/migrations/` y en la lista blanca `TABLES`
   de `src/backend/api/data.functions.ts`, y en `MODULO_DE_TABLA` para que la cubra la matriz de permisos.
3. **Roles y permisos**: los roles viven en la tabla `roles` (3 del sistema + los que cree el administrador)
   y la matriz `role_permissions` define ver/crear/editar/eliminar por módulo. El front oculta lo que el
   rol no puede ver (`can()` / `puedeEscribir()` en `lib/auth.tsx`), pero la seguridad real está en el
   backend (`assertModulo`, `hasModulePermission`, `assertAdmin`).
5. **Tablas de datos**: usar `components/tabla/Tabla.tsx` (`useOrden`, `ThOrden`, `FiltroChips`,
   `exportarCsv`, `PieTabla`) para columnas ordenables, filtros rápidos y exportación a Excel.
4. **Ramas**: trabajar en `fix/…`, `feat/…` o `refactor/…` y entrar a `main` por pull request con
   el CI en verde. Producción se actualiza desde `main`.

## Flujo de una consulta

```
Página (routes/_app.toners.tsx)
  └─ api.from("toner_modelos").select(...)        src/lib/api/client.ts
       └─ apiSelect  (server function, HTTP POST)  src/backend/api/data.functions.ts
            ├─ requireSession / permisos           src/backend/core/db.ts
            └─ PostgreSQL
```
