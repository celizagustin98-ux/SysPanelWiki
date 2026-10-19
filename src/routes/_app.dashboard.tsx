import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
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
import { format, startOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/AppShell";
import { coversNight, isVacacion, parseLocal } from "@/components/guardias/domain";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard | SysIntranet" },
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

type GuardiaLite = {
  id?: string;
  operador_nombre: string;
  desde: string;
  hasta: string;
  notas?: string | null;
};

type GuardiaEstado = {
  operador_nombre: string;
  desde: string;
  hasta: string;
  modo: "activa" | "hoy" | "proxima";
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

function resolveGuardiaAhora(rows: GuardiaLite[], now = new Date()): GuardiaEstado | null {
  const parsed = rows
    .map((g) => {
      const s = parseLocal(g.desde) ?? new Date(g.desde);
      const e = parseLocal(g.hasta) ?? new Date(g.hasta);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
      if (isVacacion(g as any)) return null;
      return { ...g, s, e };
    })
    .filter(Boolean) as Array<GuardiaLite & { s: Date; e: Date }>;

  if (parsed.length === 0) return null;

  const activa = parsed.find((g) => g.s <= now && g.e >= now);
  if (activa) {
    return {
      operador_nombre: activa.operador_nombre,
      desde: activa.desde,
      hasta: activa.hasta,
      modo: "activa",
    };
  }

  const hoy = startOfDay(now);
  const deHoy = parsed.find((g) => coversNight(g, hoy));
  if (deHoy) {
    return {
      operador_nombre: deHoy.operador_nombre,
      desde: deHoy.desde,
      hasta: deHoy.hasta,
      modo: "hoy",
    };
  }

  const proximas = parsed.filter((g) => g.s > now).sort((a, b) => a.s.getTime() - b.s.getTime());
  if (proximas[0]) {
    return {
      operador_nombre: proximas[0].operador_nombre,
      desde: proximas[0].desde,
      hasta: proximas[0].hasta,
      modo: "proxima",
    };
  }

  return null;
}

function fmtRango(desde: string, hasta: string) {
  const s = parseLocal(desde) ?? new Date(desde);
  const e = parseLocal(hasta) ?? new Date(hasta);
  const a = format(s, "dd/MM HH:mm", { locale: es });
  const b = format(e, "dd/MM HH:mm", { locale: es });
  return `${a} → ${b}`;
}

function Dashboard() {
  const { user, profile } = useAuth();
  const nombre = prettyName(profile?.full_name);
  const fecha = hoyLabel().charAt(0).toUpperCase() + hoyLabel().slice(1);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: async () => {
      const now = new Date();
      const today = format(now, "yyyy-MM-dd");

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
        safeList<GuardiaLite>(
          api
            .from("guardias")
            .select("id, operador_nombre, desde, hasta, notas")
            .order("desde")
            .limit(120) as Promise<{ data: GuardiaLite[] | null; error: unknown }>,
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
        guardia: resolveGuardiaAhora(guardias, now),
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
  if (!isLoading && !data?.guardia) {
    alerts.push({
      key: "guardia",
      text: "Sin cobertura de guardia cargada",
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

  const guardia = data?.guardia ?? null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader title={`Hola, ${nombre}`} description={fecha} />

      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="group block">
            <Card
              className={cn(
                "h-full border-border/80 bg-card/90 shadow-sm transition-all duration-150",
                "hover:border-primary/35 hover:shadow-md",
                k.alert && "border-destructive/40 bg-destructive/[0.04]",
              )}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    {k.label}
                  </p>
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-lg border",
                      k.alert
                        ? "border-destructive/25 bg-destructive/10 text-destructive"
                        : "border-border bg-muted/50 text-muted-foreground group-hover:border-primary/30 group-hover:text-primary",
                    )}
                  >
                    <k.icon className="size-4" />
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-3 text-3xl font-semibold tabular-nums tracking-tight sm:text-[2rem]",
                    k.alert && "text-destructive",
                  )}
                >
                  {isLoading ? "—" : k.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{k.detail}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {isLoading ? (
        <div className="h-11 animate-pulse rounded-xl bg-muted/40" />
      ) : alerts.length > 0 ? (
        <div className="grid gap-2">
          {alerts.map((a) => (
            <Link
              key={a.key}
              to={a.to}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-colors",
                a.tone === "danger"
                  ? "border-destructive/30 bg-destructive/[0.07] text-destructive hover:bg-destructive/12"
                  : "border-amber-500/30 bg-amber-500/[0.08] text-amber-900 hover:bg-amber-500/15 dark:text-amber-200",
              )}
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 font-medium">{a.text}</span>
              <span className="inline-flex items-center gap-1 text-xs opacity-80">
                Ver <ArrowRight className="size-3.5" />
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-xl border border-border/70 bg-muted/25 px-3.5 py-2.5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          Sin alertas operativas
          {isFetching && <span className="ml-auto text-[11px]">Actualizando…</span>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                <UserRound className="size-3.5" />
              </span>
              Guardia ahora
            </CardTitle>
          </CardHeader>
          <CardContent>
            {guardia ? (
              <div className="space-y-3">
                <div>
                  <p className="text-lg font-semibold tracking-tight">{guardia.operador_nombre}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtRango(guardia.desde, guardia.hasta)}
                  </p>
                </div>
                {guardia.modo === "activa" && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                    <CheckCircle2 className="size-3.5" /> En turno
                  </div>
                )}
                {guardia.modo === "hoy" && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-700 dark:text-sky-300">
                    <CalendarClock className="size-3.5" /> Asignado hoy
                  </div>
                )}
                {guardia.modo === "proxima" && (
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" /> Próximo turno
                  </div>
                )}
                <Button asChild size="sm" variant="outline" className="mt-1 h-8">
                  <Link to="/guardias">Abrir planilla</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No hay turnos cargados en la planilla.</p>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link to="/guardias">Cargar en planilla</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                  <Clock3 className="size-3.5" />
                </span>
                Para vos
              </CardTitle>
              <Link to="/tareas" className="text-xs font-medium text-primary hover:underline">
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {(data?.misTareas ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tenés ítems asignados
              </p>
            )}
            {(data?.misTareas ?? []).map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{t.titulo}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize",
                    prioridadTone(t.prioridad),
                  )}
                >
                  {t.prioridad}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/90 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                  <ClipboardList className="size-3.5" />
                </span>
                Cola del área
              </CardTitle>
              <Link to="/tareas" className="text-xs font-medium text-primary hover:underline">
                Abrir cola
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-0.5">
            {(data?.colaArea ?? []).length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Cola vacía</p>
            )}
            {(data?.colaArea ?? []).map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="min-w-0 flex-1 truncate font-medium">{t.titulo}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold capitalize",
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

      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          Accesos rápidos
        </p>
        <div className="flex flex-wrap gap-2">
          {atajos.map((a) => (
            <Button
              key={a.to}
              asChild
              size="sm"
              variant="secondary"
              className="h-9 rounded-lg border border-border/60 bg-card/80 shadow-xs hover:border-primary/30 hover:bg-accent/60"
            >
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
