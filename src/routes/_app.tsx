import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { RefreshCw, ServerCrash } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, error, retry } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Se recuerda adónde iba (ej. la planilla de un activo escaneado) para volver después del login.
    if (!loading && !session && !error)
      navigate({ to: "/auth", search: { redirect: window.location.pathname + window.location.search }, replace: true });
  }, [loading, session, error, navigate]);

  if (error && !session) return <BootError message={error} onRetry={retry} />;
  if (loading || !session) return <BootSkeleton />;

  return <AppShell />;
}

/** Esqueleto con la forma del sistema: se percibe más rápido que un texto de "cargando". */
function BootSkeleton() {
  return (
    <div className="flex min-h-dvh bg-background" aria-busy="true" aria-label="Cargando Nodara">
      <aside className="hidden w-[248px] shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="space-y-1.5">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="h-2 w-16 rounded bg-white/5" />
          </div>
        </div>
        <div className="h-9 rounded-lg bg-white/5" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 rounded-md bg-white/[0.04]" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </aside>
      <div className="flex-1 space-y-6 p-6 lg:p-8">
        <div className="space-y-2">
          <div className="skeleton h-3 w-28" />
          <div className="skeleton h-7 w-64" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-28" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-72 lg:col-span-2" />
          <div className="skeleton h-72" />
        </div>
      </div>
    </div>
  );
}

function BootError({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background bg-grid px-4">
      <div className="panel w-full max-w-md p-7 text-center rise-in">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <ServerCrash className="size-6" />
        </div>
        <p className="eyebrow">Sin conexión</p>
        <h1 className="mt-1 text-lg font-semibold">No se pudo conectar con el servidor</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{message}</p>
        <Button className="mt-6" onClick={() => void onRetry()}>
          <RefreshCw /> Reintentar
        </Button>
      </div>
    </div>
  );
}
