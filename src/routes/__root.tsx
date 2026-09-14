import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportSysWikiError } from "../lib/error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";

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
  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="panel w-full max-w-md px-6 py-8 text-center rise-in">
        <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-[10px] font-bold text-primary-foreground">
            SI
          </span>
          SysIntranet
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
      title="Pagina no encontrada"
      description="La ruta no existe o fue movida. Volve al panel o usa el menu lateral."
      primaryLabel="Ir al inicio"
      secondaryHref="/dashboard"
      secondaryLabel="Dashboard"
      code="HTTP 404"
    />
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportSysWikiError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <StatusFrame
      title="El panel no cargo"
      description="Ocurrio un error inesperado. Podes reintentar o volver al inicio."
      primaryLabel="Reintentar"
      onPrimary={() => {
        router.invalidate();
        reset();
      }}
      code="Error de aplicacion"
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "SysIntranet | Area Wiki" },
      {
        name: "description",
        content: "Wiki operativa para sistemas: guardias, inventario, toners y tareas.",
      },
      { property: "og:title", content: "SysIntranet | Area Wiki" },
      {
        property: "og:description",
        content: "Wiki operativa, guardias, inventario, toners, tareas y credenciales.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0b1220" },
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

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className="dark">
      <head>
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

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
          <Toaster richColors position="top-right" closeButton />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
