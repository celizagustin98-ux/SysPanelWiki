import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  KeyRound,
  Printer,
  Ticket,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/AppShell";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard | SysPanelWiki" },
      {
        name: "description",
        content: "Alertas operativas, guardia del día y cola de trabajo.",
      },
    ],
  }),
  component: Dashboard,
});

type TareaLite = {
  id: string;
  titulo: string;
  estado: string;
  prioridad: string;
  vence_el?: string | null;
  asignado_a?: string | null;
};

type TonerRow = {
  id?: string;
  nombre: string;
  stock: number | string | null;
  stock_minimo: number | string | null;
};

function hoyLabel() {
  return new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function prettyName(raw?: string | null) {
  const first = (raw ?? "").trim().split(/\s+/)[0] || "equipo";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function n(value: unknown, fallback = 0) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function isCritico(t: TonerRow) {
  return n(t.stock) <= n(t.stock_minimo, 2);
}

function isAltaPrioridad(p?: string | null) {
  const v = (p ?? "").toLowerCase();
  return v === "alta" || v === "urgente" || v === "critica" || v === "crítica";
}

function prioridadTone(p: string) {
  if (isAltaPrioridad(p)) return "bg-destructive/15 text-destructive border-destructive/30";
  if ((p ?? "").toLowerCase() === "media")
    return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
}

async function safeList<T>(promise: Promise<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await promise;
    if (error) return [];
    return (data ?? []) as T[];
  } catch {
    return [];
  }
}

function Dashboard() {
  const { user, profile } = useAuth();
  const nombre = prettyName(profile?.full_name);
  const fecha = hoyLabel().charAt(0).toUpperCase() + hoyLabel().slice(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: async () => {
      const now = new Date();
      const nowIso = now.toISOString();
      const today = nowIso.slice(0, 10);

      const [tareas, toners, guardias, misTareas] = await Promise.all([
        safeList<TareaLite>(
          api
            .from("tareas")
            .select("id, titulo, estado, prioridad, vence_el, asignado_a")
            .neq("estado", "hecha") as Promise<{ data: TareaLite[] | null; error: unknown }>,
        ),
        safeList<TonerRow>(
          api.from("toner_modelos").select("id, nombre, stock, stock_minimo") as Promise<{
            data: TonerRow[] | null;
            error: unknown;
          }>,
        ),
        safeList<{ operador_nombre: string; desde: string; hasta: string }>(
          api
            .from("guardias")
            .select("operador_nombre, desde, hasta")
            .lte("desde", nowIso)
            .gte("hasta", nowIso)
            .order("desde")
            .limit(1) as Promise<{
            data: { operador_nombre: string; desde: string; hasta: string }[] | null;
            error: unknown;
          }>,
        ),
        safeList<TareaLite>(
          api
            .from("tareas")
            .select("id, titulo, estado, prioridad, vence_el")
            .eq("asignado_a", user?.id ?? "")
            .neq("estado", "hecha")
            .limit(8) as Promise<{ data: TareaLite[] | null; error: unknown }>,
        ),
      ]);

      const abiertas = tareas.filter((t) => (t.estado ?? "").toLowerCase() !== "hecha");
      const urgentes = abiertas.filter((t) => isAltaPrioridad(t.prioridad));
      const vencidas = abiertas.filter(
        (t) => t.vence_el && String(t.vence_el).slice(0, 10) < today,
      );
      const criticos = toners.filter(isCritico).length;

      const rank = (p: string) => {
        if (isAltaPrioridad(p)) return 0;
        if ((p ?? "").toLowerCase() === "media") return 1;
        return 2;
      };

      return {
        abiertas: abiertas.length,
        urgentes: urgentes.length,
        vencidas: vencidas.length,
        criticos,
        colaArea: abiertas
          .slice()
          .sort((a, b) => rank(a.prioridad) - rank(b.prioridad))
          .slice(0, 6),
        guardia: guardias[0] ?? null,
        misTareas: misTareas.slice(0, 8),
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const criticalCount = data?.criticos ?? 0;
  const urgentes = data?.urgentes ?? 0;
  const vencidas = data?.vencidas ?? 0;
  const abiertas = data?.abiertas ?? 0;
  const sinGuardia = !isLoading && !data?.guardia;

  type AlertItem = { key: string; text: string; to: string; tone: "danger" | "warn" };
  const alerts: AlertItem[] = [];
  if (criticalCount > 0) {
    alerts.push({
      key: "toners",
      text: `${criticalCount} tóner${criticalCount === 1 ? "" : "s"} bajo mínimo`,
      to: "/toners",
      tone: "danger",
    });
  }
  if (urgentes > 0) {
    alerts.push({
      key: "urgentes",
      text: `${urgentes} ticket${urgentes === 1 ? "" : "s"} de prioridad alta`,
      to: "/tareas",
      tone: "danger",
    });
  }
  if (vencidas > 0) {
    alerts.push({
      key: "vencidas",
      text: `${vencidas} con fecha vencida`,
      to: "/tareas",
      tone: "warn",
    });
  }
  if (sinGuardia) {
    alerts.push({
      key: "guardia",
      text: "Sin cobertura de guardia ahora",
      to: "/guardias",
      tone: "warn",
    });
  }

  const kpis = [
    {
      label: "Abiertos",
      value: abiertas,
      detail: "tickets / tareas",
      icon: Ticket,
      to: "/tareas",
      alert: abiertas >= 10,
    },
    {
      label: "Urgentes",
      value: urgentes,
      detail: vencidas > 0 ? `${vencidas} vencidos` : "prioridad alta",
      icon: AlertTriangle,
      to: "/tareas",
      alert: urgentes > 0 || vencidas > 0,
    },
    {
      label: "Tóners críticos",
      value: criticalCount,
      detail: "bajo mínimo",
      icon: Printer,
      to: "/toners",
      alert: criticalCount > 0,
    },
  ] as const;

  const atajos = [
    { label: "Tickets", to: "/tareas", icon: ClipboardList },
    { label: "Tóners", to: "/toners", icon: Printer },
    { label: "Instructivos", to: "/instructivos", icon: BookOpen },
    { label: "Inventario", to: "/inventario", icon: Boxes },
    { label: "Guardias", to: "/guardias", icon: CalendarClock },
    { label: "Credenciales", to: "/credenciales", icon: KeyRound },
  ] as const;

  return (
    <div className="space-y-5">
      <PageHeader title={`Hola, ${nombre}`} description={fecha} />

      {isLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-muted/40" />
      ) : alerts.length > 0 ? (
        <div className="flex flex-col gap-2">
          {alerts.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-accent/40",
                a.tone === "danger"
                  ? "border-destructive/35 bg-destructive/8 text-destructive"
                  : "border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 font-medium">{a.text}</span>
              <span className="text-xs opacity-80">Ver →</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          Sin alertas operativas
          {isFetching && <span className="ml-auto text-[11px]">Actualizando…</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="size-4 text-primary" /> Guardia ahora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.guardia ? (
              <div className="space-y-2">
                <p className="text-lg font-semibold">{data.guardia.operador_nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(data.guardia.desde).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  {" → "}
                  {new Date(data.guardia.hasta).toLocaleString("es-AR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs text-primary">
                  <CheckCircle2 className="size-3.5" /> En turno
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No hay guardia activa.</p>
                <Button asChild size="sm" variant="outline">
                  <Link to="/guardias">Ver guardias</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <Clock3 className="size-4 text-primary" /> Para vos
              </CardTitle>
              <Link to="/tareas" className="text-xs font-medium text-primary hover:underline">
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {(data?.misTareas ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No tenés ítems asignados
              </p>
            )}
            {(data?.misTareas ?? []).map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                    prioridadTone(t.prioridad),
                  )}
                >
                  {t.prioridad}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <ClipboardList className="size-4 text-primary" /> Cola del área
              </CardTitle>
              <Link to="/tareas" className="text-xs font-medium text-primary hover:underline">
                Abrir cola
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-1">
            {(data?.colaArea ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Cola vacía</p>
            )}
            {(data?.colaArea ?? []).map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                <span
                  className={cn(
                    "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                    prioridadTone(t.prioridad),
                  )}
                >
                  {t.prioridad}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to}>
            <Card
              className={cn(
                "panel h-full transition-colors hover:border-primary/40",
                k.alert && "border-destructive/35",
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {k.label}
                  </p>
                  <k.icon
                    className={cn("size-4", k.alert ? "text-destructive" : "text-muted-foreground")}
                  />
                </div>
                <p
                  className={cn(
                    "mt-2 text-3xl font-semibold tabular-nums",
                    k.alert && "text-destructive",
                  )}
                >
                  {isLoading ? "—" : k.value}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{k.detail}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Accesos rápidos
        </p>
        <div className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Button key={a.to} asChild size="sm" variant="secondary" className="h-8">
              <Link to={a.to}>
                <a.icon className="size-3.5" />
                {a.label}
              </Link>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
