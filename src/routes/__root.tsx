import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
 type ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportSysWikiError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { BrandMark } from "@/components/brand/BrandMark";
import { AuthProvider } from "@/lib/auth";
import { useZonaVisible } from "@/lib/zona-visible";
import { ThemeProvider } from "@/lib/theme";
import { tituloConMarca, useMarca } from "@/lib/brand";

function StatusFrame({
  title,
  description,
  primaryLabel,
  onPrimary,
  secondaryHref = "/",
  secondaryLabel = "Ir al inicio",
  code,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary?: () => void;
  secondaryHref?: string;
  secondaryLabel?: string;
  code?: string;
}) {
  const marca = useMarca();
  return (
    <div className="grid min-h-[var(--av)] place-items-center px-4 py-10">
      <div className="panel w-full max-w-md px-6 py-8 text-center rise-in">
        <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <BrandMark className="size-7" />
          {marca.nombre}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {onPrimary ? (
            <button
              type="button"
              onClick={onPrimary}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-105"
            >
              {primaryLabel}
            </button>
          ) : null}
          <Link
            to={secondaryHref}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            {secondaryLabel}
          </Link>
        </div>
        {code ? <p className="mt-5 text-[11px] tracking-wide text-muted-foreground/70">{code}</p> : null}
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <StatusFrame
      title="Página no encontrada"
      description="La ruta no existe o fue movida. Volvé al panel o usá el menú lateral."
      primaryLabel="Ir al inicio"
      secondaryHref="/dashboard"
      secondaryLabel="Dashboard"
      code="HTTP 404"
    />
  );
}

// Después de una actualización, las pestañas abiertas piden partes de la versión anterior que ya
// no existen. En ese caso se recarga la página (como mucho una vez cada 10 s, para no entrar en bucle).
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function reloadOnStaleChunk(error: unknown) {
  if (typeof window === "undefined" || !CHUNK_ERROR.test(String((error as Error)?.message ?? error))) return false;
  try {
    const last = Number(sessionStorage.getItem("syswiki.chunk-reload") || 0);
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem("syswiki.chunk-reload", String(Date.now()));
  } catch {
    /* sin almacenamiento */
  }
  window.location.reload();
  return true;
}

if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadOnStaleChunk((event as Event & { payload?: unknown }).payload ?? "Failed to fetch dynamically imported module")) {
      event.preventDefault();
    }
  });
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    if (reloadOnStaleChunk(error)) return;
    reportSysWikiError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <StatusFrame
      title="El panel no cargó"
      description="Ocurrió un error inesperado. Podés reintentar o volver al inicio."
      primaryLabel="Reintentar"
      onPrimary={() => {
        router.invalidate();
        reset();
      }}
      code="Error de aplicación"
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Nodara | Área de Sistemas" },
      {
        name: "description",
        content: "Centro de operaciones del Área de Sistemas: tickets, inventario, tóners, guardias e instructivos.",
      },
      { property: "og:title", content: "Nodara | Área de Sistemas" },
      {
        property: "og:description",
        content: "Wiki operativa, guardias, inventario, toners, tareas y credenciales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#14171c" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "shortcut icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),

  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

// Aplica el tema guardado antes del primer pintado (evita el parpadeo claro/oscuro).
const THEME_BOOT = `try{var t=localStorage.getItem("intranet-theme");if(t==="light")document.documentElement.classList.remove("dark");else document.documentElement.classList.add("dark")}catch(e){}`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useZonaVisible();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <TituloConMarca />
          <Toaster richColors position="top-right" closeButton offset={{ top: 64, right: 16 }} />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

/** Los títulos de página dicen "· Nodara": se reemplaza por el nombre configurado de la organización. */
function TituloConMarca() {
  const marca = useMarca();
  useEffect(() => {
    const aplicar = () => {
      const nuevo = tituloConMarca(document.title, marca);
      if (nuevo !== document.title) document.title = nuevo;
    };
    aplicar();
    const obs = new MutationObserver(aplicar);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [marca]);
  return null;
}
