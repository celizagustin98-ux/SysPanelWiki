import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarClock,
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
import { PageHeader } from "@/components/AppShell";
import { coversNight, isVacacion, parseLocal } from "@/components/guardias/domain";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard · SysIntranet" },
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

// Estados que cierran un ticket (ver ESTADOS en components/tickets/constants.ts).
const ESTADOS_CERRADOS = ["resuelto", "cerrado", "cancelado", "hecha"];

function isAbierto(estado?: string | null) {
  return !ESTADOS_CERRADOS.includes((estado ?? "").toLowerCase());
}

function isCritico(t: TonerRow) {
  return n(t.stock) <= n(t.stock_minimo, 2);
}

function isAltaPrioridad(p?: string | null) {
  const v = (p ?? "").toLowerCase();
  return v === "alta" || v === "urgente" || v === "critica" || v === "crítica";
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
  const { user, profile, can } = useAuth();
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
            .select("id, titulo, estado, prioridad, vence_el, asignado_a") as Promise<{ data: TareaLite[] | null; error: unknown }>,
        ),
        safeList<TonerRow>(
          api.from("toner_modelos").select("id, nombre, stock, stock_minimo") as Promise<{
            data: TonerRow[] | null;
            error: unknown;
          }>,
        ),
        safeList<GuardiaLite>(
          // Solo guardias vigentes o futuras: antes traía las 120 más viejas y nunca encontraba la actual.
          api
            .from("guardias")
            .select("id, operador_nombre, desde, hasta, notas")
            .gte("hasta", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
            .order("desde")
            .limit(60) as Promise<{ data: GuardiaLite[] | null; error: unknown }>,
        ),
        safeList<TareaLite>(
          api
            .from("tareas")
            .select("id, titulo, estado, prioridad, vence_el")
            .eq("asignado_a", user?.id ?? "")
            .order("updated_at", { ascending: false })
            .limit(40) as Promise<{ data: TareaLite[] | null; error: unknown }>,
        ),
      ]);

      const abiertas = tareas.filter((t) => isAbierto(t.estado));
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
        sinAsignar: abiertas.filter((t) => !t.asignado_a).length,
        urgentes: urgentes.length,
        vencidas: vencidas.length,
        criticos,
        colaArea: abiertas
          .slice()
          .sort((a, b) => rank(a.prioridad) - rank(b.prioridad))
          .slice(0, 6),
        guardia: resolveGuardiaAhora(guardias, now),
        proximas: guardias
          .map((g) => ({ ...g, s: parseLocal(g.desde) ?? new Date(g.desde) }))
          .filter((g) => g.s > now && !isVacacion(g as never))
          .sort((a, b) => a.s.getTime() - b.s.getTime())
          .slice(1, 5)
          .map(({ operador_nombre, desde }) => ({ operador_nombre, desde })),
        misTareas: misTareas.filter((t) => isAbierto(t.estado)).slice(0, 8),
      };
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const guardia = data?.guardia ?? null;
  const saludo = saludoSegunHora();

  type Kpi = {
    label: string;
    value: number;
    detail: string;
    icon: typeof Ticket;
    to: string;
    tone: "ok" | "warn" | "crit" | "info";
  };
  const kpis: Kpi[] = [
    {
      label: "Tickets abiertos",
      value: data?.abiertas ?? 0,
      detail: `${data?.sinAsignar ?? 0} sin asignar`,
      icon: Ticket,
      to: "/tareas",
      tone: (data?.sinAsignar ?? 0) > 0 ? "warn" : "info",
    },
    {
      label: "Prioridad alta",
      value: data?.urgentes ?? 0,
      detail: "críticos y altos",
      icon: AlertTriangle,
      to: "/tareas",
      tone: (data?.urgentes ?? 0) > 0 ? "crit" : "ok",
    },
    {
      label: "Vencidos",
      value: data?.vencidas ?? 0,
      detail: "fecha límite superada",
      icon: Clock3,
      to: "/tareas",
      tone: (data?.vencidas ?? 0) > 0 ? "warn" : "ok",
    },
    {
      label: "Tóners críticos",
      value: data?.criticos ?? 0,
      detail: "bajo stock mínimo",
      icon: Printer,
      to: "/toners",
      tone: (data?.criticos ?? 0) > 0 ? "crit" : "ok",
    },
  ];

  const atajos = [
    { label: "Tickets", to: "/tareas", icon: ClipboardList, modulo: "tareas" as const },
    { label: "Tóners", to: "/toners", icon: Printer, modulo: "toners" as const },
    { label: "Instructivos", to: "/instructivos", icon: BookOpen, modulo: "instructivos" as const },
    { label: "Activos IT", to: "/inventario", icon: Boxes, modulo: "inventario" as const },
    { label: "Guardias", to: "/guardias", icon: CalendarClock, modulo: "guardias" as const },
    { label: "Credenciales", to: "/credenciales", icon: KeyRound, modulo: "credenciales" as const },
  ].filter((a) => can(a.modulo, "view"));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={fecha}
        title={`${saludo}, ${nombre}`}
        description="Estado del área en tiempo real: cola de tickets, guardia y stock crítico."
        action={
          <div className="flex items-center gap-2">
            {isFetching && !isLoading && (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="led" data-tone="info" data-pulse="true" /> Actualizando
              </span>
            )}
            {can("tareas", "view") && (
              <Button asChild size="sm">
                <Link to="/tareas">
                  <Ticket /> Ir a la bandeja
                </Link>
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 stagger">
        {kpis.map((k) => (
          <Link key={k.label} to={k.to} className="kpi-cell panel-hover group block">
            <div className="flex items-start justify-between gap-2">
              <p className="kpi-label flex items-center gap-2">
                <span className="led" data-tone={k.tone} data-pulse={k.tone === "crit"} />
                {k.label}
              </p>
              <k.icon className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
            </div>
            <p
              className={cn(
                "kpi-value",
                k.tone === "crit" && "text-crit",
                k.tone === "warn" && "text-[color-mix(in_oklab,var(--warn),var(--foreground)_20%)]",
              )}
            >
              {isLoading ? <span className="skeleton inline-block h-7 w-14 align-middle" /> : <CountUp value={k.value} />}
            </p>
            <p className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              {k.detail}
              <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            </p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GuardiaCard guardia={guardia} proximas={data?.proximas ?? []} loading={isLoading} canOpen={can("guardias", "view")} />

        <TicketList
          title="Asignados a vos"
          icon={UserRound}
          loading={isLoading}
          items={data?.misTareas ?? []}
          empty="No tenés tickets asignados. Buen momento para tomar uno de la cola."
        />

        <TicketList
          title="Cola del área"
          icon={ClipboardList}
          loading={isLoading}
          items={data?.colaArea ?? []}
          empty="Cola vacía: no hay tickets abiertos."
        />
      </div>

      {atajos.length > 0 && (
        <div>
          <p className="eyebrow mb-2.5">Accesos rápidos</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {atajos.map((a) => (
              <Link
                key={a.to}
                to={a.to}
                className="panel panel-hover group flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium"
              >
                <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <a.icon className="size-3.5" />
                </span>
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function saludoSegunHora(date = new Date()) {
  const h = date.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}

/** Número que cuenta desde 0 hasta el valor (respeta "reducir movimiento"). */
function CountUp({ value, duration = 700 }: { value: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      return;
    }
    const start = performance.now();
    const initial = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(initial + (value - initial) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown}</>;
}

function PanelHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Ticket;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <Icon className="size-4 text-primary" />
        {title}
      </p>
      {action}
    </div>
  );
}

function GuardiaCard({
  guardia,
  proximas,
  loading,
  canOpen,
}: {
  guardia: GuardiaEstado | null;
  proximas: { operador_nombre: string; desde: string }[];
  loading: boolean;
  canOpen: boolean;
}) {
  const now = Date.now();
  const s = guardia ? (parseLocal(guardia.desde) ?? new Date(guardia.desde)).getTime() : 0;
  const e = guardia ? (parseLocal(guardia.hasta) ?? new Date(guardia.hasta)).getTime() : 0;
  const progreso = guardia && guardia.modo === "activa" && e > s ? Math.min(100, Math.max(0, ((now - s) / (e - s)) * 100)) : 0;
  const restanteMin = guardia && guardia.modo === "activa" ? Math.max(0, Math.round((e - now) / 60000)) : 0;

  return (
    <div className="panel flex flex-col overflow-hidden">
      <PanelHeader
        icon={CalendarClock}
        title="Guardia"
        action={
          canOpen ? (
            <Link to="/guardias" className="text-xs font-medium text-primary hover:underline">
              Planilla
            </Link>
          ) : null
        }
      />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {loading ? (
          <div className="space-y-3">
            <div className="skeleton h-5 w-40" />
            <div className="skeleton h-3 w-28" />
            <div className="skeleton h-2 w-full" />
          </div>
        ) : guardia ? (
          <>
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/12 font-mono text-sm font-semibold text-primary ring-1 ring-primary/20">
                {guardia.operador_nombre
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")}
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold tracking-tight">{guardia.operador_nombre}</p>
                <p className="num text-xs text-muted-foreground">{fmtRango(guardia.desde, guardia.hasta)}</p>
              </div>
            </div>
            {guardia.modo === "activa" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-ok">
                    <span className="led" data-tone="ok" data-pulse="true" /> En turno
                  </span>
                  <span className="num text-muted-foreground">
                    termina en {Math.floor(restanteMin / 60)}h {String(restanteMin % 60).padStart(2, "0")}m
                  </span>
                </div>
                <div className="meter" style={{ ["--meter" as string]: "var(--ok)" }}>
                  <span style={{ width: `${progreso}%` }} />
                </div>
              </div>
            ) : (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-info/12 px-2 py-1 text-xs font-medium text-info">
                <span className="led" data-tone="info" />
                {guardia.modo === "hoy" ? "Asignado hoy" : "Próximo turno"}
              </span>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-start justify-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]">
              <span className="led" data-tone="warn" data-pulse="true" /> Sin cobertura cargada
            </span>
            <p className="text-xs text-muted-foreground">No hay un turno vigente ni próximo en la planilla.</p>
          </div>
        )}
        {!loading && proximas.length > 0 && (
          <div className="mt-auto border-t border-border/70 pt-3">
            <p className="eyebrow mb-2">Próximas</p>
            <ul className="space-y-1.5 stagger">
              {proximas.map((p) => {
                const d = parseLocal(p.desde) ?? new Date(p.desde);
                return (
                  <li key={p.desde + p.operador_nombre} className="flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate">{p.operador_nombre}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground first-letter:uppercase">
                      {format(d, "EEE dd/MM", { locale: es })}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

const PRIORIDAD_DOT: Record<string, "crit" | "warn" | "info" | undefined> = {
  critica: "crit",
  crítica: "crit",
  urgente: "crit",
  alta: "warn",
  media: "info",
};

function TicketList({
  title,
  icon,
  items,
  loading,
  empty,
}: {
  title: string;
  icon: typeof Ticket;
  items: TareaLite[];
  loading: boolean;
  empty: string;
}) {
  return (
    <div className="panel flex flex-col overflow-hidden">
      <PanelHeader
        icon={icon}
        title={title}
        action={<span className="num rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{items.length}</span>}
      />
      <div className="flex-1 p-1.5">
        {loading ? (
          <div className="space-y-2 p-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          <div className="stagger">
            {items.map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors hover:bg-accent/50"
              >
                <span className="led" data-tone={PRIORIDAD_DOT[(t.prioridad ?? "").toLowerCase()]} />
                <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                <span className="shrink-0 text-[11px] capitalize text-muted-foreground">{t.prioridad}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
