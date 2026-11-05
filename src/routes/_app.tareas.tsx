import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, PenLine, Search, Timer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn, formatFecha } from "@/lib/utils";
import { clicDeFila } from "@/lib/fila-clic";
import {
  type Ticket as TicketT,
  estadoLabel,
  isArchivedClosed,
  sortTickets,
  ticketLabel,
  tiempoRelativo,
  initials,
  ESTADOS,
  ESTADO_COLOR,
  colorEstado,
} from "@/components/tickets/constants";
import { ReopenDialog } from "@/components/tickets/ReopenDialog";
import { TicketDetail } from "@/components/tickets/TicketDetail";
import { NuevoTicket } from "@/components/tickets/NuevoTicket";
import { SLA_HORAS, calcularSla } from "@/components/tickets/sla";

export const Route = createFileRoute("/_app/tareas")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { ticket?: string } => (typeof s.ticket === "string" ? { ticket: s.ticket } : {}),
  head: () => ({
    meta: [
      { title: "Tickets · Nodara" },
      { name: "description", content: "Bandeja de trabajo interna de sistemas." },
      { property: "og:title", content: "Tickets | Nodara" },
    ],
  }),
  component: TicketsPage,
});

type Vista = "metricas" | "activos" | "historial";

const PRIO_BADGE: Record<string, string> = {
  critica: "bg-crit/12 text-crit",
  alta: "bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]",
  media: "bg-muted text-muted-foreground",
  baja: "bg-muted text-muted-foreground",
};
const PRIO_LABEL: Record<string, string> = {
  critica: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
const ESTADO_BADGE: Record<string, string> = Object.fromEntries(
  Object.entries(ESTADO_COLOR).map(([k, c]) => [k, cn("ring-1 ring-inset", c.chip)]),
);

/** Qué tickets se ven: todos, los que tengo asignados o los que abrí yo. */
type Alcance = "todos" | "asignados" | "creados";
const ALCANCES: { key: Alcance; label: string; hint: string }[] = [
  { key: "todos", label: "Todos", hint: "Todos los tickets del área" },
  { key: "asignados", label: "Mis tickets", hint: "Los que tengo asignados" },
  { key: "creados", label: "Cargados por mí", hint: "Los tickets que cargué yo" },
];
const ALCANCE_KEY = "nodara.tickets.alcance";

/** Orden en que se muestran los estados activos en la barra de distribución. */
const ESTADOS_BARRA = ["nuevo", "asignado", "en_curso", "esperando", "resuelto"] as const;

function formatDay(iso?: string | null) {
  if (!iso) return "";
  return formatFecha(iso, { day: "2-digit", month: "short" });
}

function TicketsPage() {
  const { user, profile, puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("tareas");
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("activos");
  const [alcance, setAlcanceState] = useState<Alcance>(() => {
    try {
      const v = localStorage.getItem(ALCANCE_KEY);
      return ALCANCES.some((a) => a.key === v) ? (v as Alcance) : "todos";
    } catch {
      return "todos";
    }
  });
  const setAlcance = (a: Alcance) => {
    setAlcanceState(a);
    try {
      localStorage.setItem(ALCANCE_KEY, a);
    } catch {
      /* sin almacenamiento */
    }
  };
  const [q, setQ] = useState("");
  const { ticket: ticketParam } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(ticketParam ?? null);
  useEffect(() => {
    if (ticketParam) setSelectedId(ticketParam);
  }, [ticketParam]);
  const [reopenId, setReopenId] = useState<string | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tareas"],
    queryFn: async () => {
      // Solo los activos: el historial se consulta por mes (antes se traía todo el historial siempre).
      const { data, error } = await api
        .from("tareas")
        .select("*")
        .neq("estado", "cerrado")
        .neq("estado", "cancelado")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as TicketT[];
    },
  });

  const { data: perfiles = [] } = useQuery({
    queryKey: ["profiles-directorio"],
    queryFn: async () => {
      const { data } = await api.rpc("directorio_usuarios");
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const nombre = (id: string | null) =>
    perfiles.find((p) => p.id === id)?.full_name ?? (id ? "Usuario" : "Sin asignar");

  const openTickets = useMemo(() => tickets.filter((t) => !isArchivedClosed(t.estado)), [tickets]);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const mesKey = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}`;
  const { data: historyTickets = [], isLoading: loadingHist } = useQuery({
    queryKey: ["tareas", "historial", mesKey],
    queryFn: async () => {
      const desde = new Date(mes.getFullYear(), mes.getMonth(), 1);
      const hasta = new Date(mes.getFullYear(), mes.getMonth() + 1, 1, 0, 0, 0, -1);
      const { data, error } = await api
        .from("tareas")
        .select("*")
        .gte("cerrado_en", desde.toISOString())
        .lte("cerrado_en", hasta.toISOString())
        .order("cerrado_en", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as TicketT[]).filter((t) => isArchivedClosed(t.estado));
    },
  });

  const esMio = (t: TicketT) => {
    if (alcance === "asignados") return t.asignado_a === user?.id;
    if (alcance === "creados") return t.solicitante_id === user?.id;
    return true;
  };

  const applyQ = (todos: TicketT[]) => {
    const list = todos.filter(esMio);
    const term = q.trim().toLowerCase();
    if (!term) return sortTickets(list);
    return sortTickets(
      list.filter((t) =>
        [
          ticketLabel(t),
          t.titulo,
          t.descripcion,
          t.sector,
          t.categoria,
          t.solicitante_nombre,
          t.tipo,
          ...(t.etiquetas || []),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      ),
    );
  };

  const list = useMemo(() => applyQ(openTickets), [openTickets, q, alcance, user?.id]);
  const hist = useMemo(() => applyQ(historyTickets), [historyTickets, q, alcance, user?.id]);

  const groups = useMemo(() => {
    const sinAsignar = list.filter((t) => !t.asignado_a);
    const enProgreso = list.filter(
      (t) => t.asignado_a && (t.estado === "asignado" || t.estado === "en_curso"),
    );
    const pendiente = list.filter((t) => t.asignado_a && t.estado === "esperando");
    const resueltos = list.filter((t) => t.estado === "resuelto");
    const otros = list.filter(
      (t) =>
        !sinAsignar.includes(t) &&
        !enProgreso.includes(t) &&
        !pendiente.includes(t) &&
        !resueltos.includes(t),
    );
    const fueraSla = list.filter((t) => calcularSla(t)?.tono === "crit");
    return [
      {
        key: "sla",
        title: "Fuera de SLA",
        hint: "Pasaron el plazo para tomarlos o resolverlos según su prioridad.",
        dot: "bg-crit",
        items: fueraSla,
      },
      {
        key: "sin",
        title: "Sin asignar",
        hint: "Tickets que todavía necesitan una persona responsable.",
        dot: ESTADO_COLOR.nuevo.punto,
        items: sinAsignar,
      },
      {
        key: "prog",
        title: "Asignados y trabajando",
        hint: "Tickets con responsable, esperando empezar o en trabajo.",
        dot: ESTADO_COLOR.en_curso.punto,
        items: enProgreso,
      },
      {
        key: "esp",
        title: "En espera",
        hint: "Tickets en espera de información o una dependencia.",
        dot: ESTADO_COLOR.esperando.punto,
        items: pendiente,
      },
      {
        key: "res",
        title: "Resueltos sin terminar",
        hint: "Resueltos que falta dar por terminados.",
        dot: ESTADO_COLOR.resuelto.punto,
        items: resueltos,
      },
      {
        key: "otros",
        title: "Otros",
        hint: "Resto de estados activos.",
        dot: "bg-muted-foreground",
        items: otros,
      },
    ];
  }, [list]);

  const porEstado = useMemo(
    () => ESTADOS_BARRA.map((key) => ({ key, n: list.filter((t) => t.estado === key).length })),
    [list],
  );

  // Un grupo a la vez y paginado: evita la lista eterna de tickets.
  const [grupoSel, setGrupoSel] = useState<string>("todos");
  const [pagina, setPagina] = useState(1);
  useEffect(() => setPagina(1), [grupoSel, q, alcance]);
  const POR_PAGINA = 15;
  const grupoActual = groups.find((g) => g.key === grupoSel);
  const visibles = grupoActual ? grupoActual.items : list;
  const paginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaSegura = Math.min(pagina, paginas);
  const enPagina = visibles.slice((paginaSegura - 1) * POR_PAGINA, paginaSegura * POR_PAGINA);

  const counts = useMemo(() => {
    // Los filtros cuentan sobre lo que se está mirando: activos o el mes del historial.
    const base = vista === "activos" ? openTickets : historyTickets;
    return {
      todos: base.length,
      asignados: base.filter((t) => t.asignado_a === user?.id).length,
      creados: base.filter((t) => t.solicitante_id === user?.id).length,
      total: openTickets.length,
      historial: historyTickets.length,
    };
  }, [openTickets, historyTickets, vista, user?.id]);

  // Si viene por link (ej. desde un activo) y no está en las listas cargadas, se busca suelto.
  const { data: ticketSuelto } = useQuery({
    queryKey: ["tareas", "uno", selectedId],
    enabled: !!selectedId && !tickets.some((t) => t.id === selectedId) && !historyTickets.some((t) => t.id === selectedId),
    queryFn: async () => {
      const { data } = await api.from("tareas").select("*").eq("id", selectedId!).maybeSingle();
      return (data as TicketT | null) ?? null;
    },
  });
  const selected = selectedId
    ? (tickets.find((t) => t.id === selectedId) ?? historyTickets.find((t) => t.id === selectedId) ?? ticketSuelto ?? null)
    : null;
  const reopenTarget = reopenId
    ? (tickets.find((t) => t.id === reopenId) ?? historyTickets.find((t) => t.id === reopenId))
    : null;

  const refetch = () => qc.invalidateQueries({ queryKey: ["tareas"] });

  const patchTicket = async (id: string, values: Record<string, unknown>, msg?: string) => {
    const { error } = await api.from("tareas").update(values).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (msg) toast.success(msg);
    refetch();
  };

  const autoasignar = async (t: TicketT) => {
    if (!user?.id) return;
    await patchTicket(
      t.id,
      {
        asignado_a: user.id,
        estado: t.estado === "nuevo" ? "asignado" : t.estado === "asignado" ? "en_curso" : t.estado,
      },
      "Ticket asignado a vos",
    );
  };

  const reopenTicket = async (id: string, mode: "nuevo" | "asignar", asignado?: string) => {
    const payload: Record<string, unknown> = { cerrado_en: null, resuelto_en: null };
    if (mode === "nuevo") {
      payload.estado = "nuevo";
      payload.asignado_a = null;
    } else {
      payload.estado = "asignado";
      payload.asignado_a = asignado ?? null;
    }
    const { error } = await api.from("tareas").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(mode === "nuevo" ? "Reabierto" : "Reabierto y asignado");
    setReopenId(null);
    setVista("activos");
    refetch();
  };


  return (
    <div className="page-content">
      <PageHeader
        title="Bandeja de tickets"
        description="Qué está sin asignar, qué está en curso y qué necesita respuesta."
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Buscar por número, título, sector…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {canWrite && (
              <NuevoTicket
                perfiles={perfiles}
                userId={user?.id}
                userName={profile?.full_name}
                onDone={(id) => {
                  refetch();
                  if (id) setSelectedId(id);
                }}
              />
            )}
          </div>
        }
      />

      {vista !== "metricas" && (
      <div className="mb-3 grid gap-2.5 sm:grid-cols-3 stagger">
        <KpiCard
          icon={<ClipboardList className="size-4" />}
          tone="ok"
          value={counts.todos}
          title="Todos"
          activo={alcance === "todos"}
          onClick={() => setAlcance("todos")}
          hint={vista === "activos" ? "Todos los tickets activos del área" : "Todos los cerrados del mes"}
        />
        <KpiCard
          icon={<CheckCircle2 className="size-4" />}
          tone="info"
          value={counts.asignados}
          title="Mis tickets"
          activo={alcance === "asignados"}
          onClick={() => setAlcance("asignados")}
          hint={vista === "activos" ? "Los que tenés que resolver vos" : "Los que resolviste vos este mes"}
        />
        <KpiCard
          icon={<PenLine className="size-4" />}
          tone="warn"
          value={counts.creados}
          title="Cargados por mí"
          activo={alcance === "creados"}
          onClick={() => setAlcance("creados")}
          hint={vista === "activos" ? "Los que cargaste vos y siguen activos" : "Los que cargaste vos, cerrados este mes"}
        />
      </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
        <button
          type="button"
          onClick={() => setVista("activos")}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
            vista === "activos"
              ? "bg-primary/12 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ClipboardList className="size-3.5" />
          Activos
          <span
            className={cn(
              "num inline-flex min-w-5 justify-center rounded px-1.5 text-[11px] font-semibold",
              vista === "activos" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {counts.total}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setVista("historial")}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
            vista === "historial"
              ? "bg-primary/12 text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Historial
          <span
            className={cn(
              "num inline-flex min-w-5 justify-center rounded px-1.5 text-[11px] font-semibold",
              vista === "historial" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
            )}
          >
            {counts.historial}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setVista("metricas")}
          className={cn(
            "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
            vista === "metricas" ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <BarChart3 className="size-3.5" />
          Métricas
        </button>
      </div>
        {vista !== "metricas" && (
        <div role="group" aria-label="Qué tickets ver" className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1 shadow-xs">
          {ALCANCES.map((a) => (
            <button
              key={a.key}
              type="button"
              title={a.hint}
              aria-pressed={alcance === a.key}
              onClick={() => setAlcance(a.key)}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
                alcance === a.key ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {a.label}
              <span
                className={cn(
                  "num inline-flex min-w-5 justify-center rounded px-1.5 text-[11px] font-semibold",
                  alcance === a.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {counts[a.key]}
              </span>
            </button>
          ))}
        </div>
        )}
      </div>

      {vista === "activos" && (
        <>
          <div className="panel mb-3 p-3">
            <div className="mb-2 flex h-3 gap-0.5 overflow-hidden rounded-full bg-muted">
              {porEstado.map((e) =>
                e.n ? (
                  <span
                    key={e.key}
                    title={`${estadoLabel(e.key)}: ${e.n}`}
                    className={cn("transition-[width] duration-700", colorEstado(e.key).barra)}
                    style={{ width: `${(e.n / Math.max(1, list.length)) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-muted-foreground">
              {porEstado.map((e) => (
                <span key={e.key} className="inline-flex items-center gap-1.5">
                  <span className={cn("size-2.5 rounded-sm", colorEstado(e.key).punto)} />
                  {estadoLabel(e.key)}
                  <span className="num font-semibold text-foreground">{e.n}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {[{ key: "todos", title: "Todos", dot: "bg-foreground/40", items: list }, ...groups.filter((g) => (g.key !== "otros" && g.key !== "sla") || g.items.length)].map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGrupoSel(g.key)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    grupoSel === g.key ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border/60 bg-muted/25 hover:border-primary/40",
                  )}
                >
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <span className={cn("size-1.5 shrink-0 rounded-full", g.dot)} />
                    {g.title}
                  </p>
                  <p className="num mt-0.5 text-lg font-semibold">{g.items.length}</p>
                </button>
              ))}
            </div>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl" />
              ))}
            </div>
          )}

          {!isLoading && visibles.length === 0 && (
            <div className="panel px-6 py-10 text-center text-sm text-muted-foreground">
              {list.length
                ? "No hay tickets en este grupo."
                : alcance === "asignados"
                  ? "No tenés tickets activos asignados."
                  : alcance === "creados"
                    ? "No hay tickets activos cargados por vos."
                    : "Nada en la bandeja activa."}
            </div>
          )}

          {!isLoading && visibles.length > 0 && (
            <>
              <TicketTable
                items={enPagina}
                canWrite={!!canWrite}
                nombre={nombre}
                onOpen={setSelectedId}
                onPatch={patchTicket}
                onAuto={autoasignar}
              />
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {grupoActual ? grupoActual.hint : "Todos los tickets activos."} · {visibles.length} en total
                </span>
                {paginas > 1 && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" className="h-7" disabled={paginaSegura <= 1} onClick={() => setPagina(paginaSegura - 1)}>
                      Anterior
                    </Button>
                    <span className="num px-2">
                      {paginaSegura} / {paginas}
                    </span>
                    <Button size="sm" variant="outline" className="h-7" disabled={paginaSegura >= paginas} onClick={() => setPagina(paginaSegura + 1)}>
                      Siguiente
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {vista === "metricas" && <MetricasTecnicos nombre={nombre} />}

      {vista === "historial" && (
        <HistorialMes
          mes={mes}
          onMes={setMes}
          tickets={hist}
          total={historyTickets.length}
          loading={loadingHist}
          filtrando={!!q.trim()}
          nombre={nombre}
          canWrite={!!canWrite}
          onOpen={setSelectedId}
          onReopen={setReopenId}
        />
      )}

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="flex h-[min(calc(var(--av)*0.92),900px)] max-w-[min(1180px,96vw)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(1180px,96vw)] [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Detalle del ticket</DialogTitle>
          {selected && (
            <TicketDetail
              ticket={selected}
              perfiles={perfiles}
              canWrite={!!canWrite}
              userId={user?.id}
              onRefresh={refetch}
              onClose={() => setSelectedId(null)}
              onReopen={() => setReopenId(selected.id)}
            />
          )}
        </DialogContent>
      </Dialog>

      <ReopenDialog
        open={!!reopenTarget}
        ticket={reopenTarget}
        perfiles={perfiles}
        onClose={() => setReopenId(null)}
        onConfirm={reopenTicket}
      />
    </div>
  );
}

function TicketTable({
  items,
  canWrite,
  nombre,
  onOpen,
  onPatch,
  onAuto,
}: {
  items: TicketT[];
  canWrite: boolean;
  nombre: (id: string | null) => string;
  onOpen: (id: string) => void;
  onPatch: (id: string, values: Record<string, unknown>, msg?: string) => Promise<void>;
  onAuto: (t: TicketT) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-panel)]">
      <div className="hidden grid-cols-[minmax(0,1.7fr)_88px_120px_140px_100px_110px] gap-2 border-b border-border/50 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
        <span>Ticket</span>
        <span>Prioridad</span>
        <span>Estado</span>
        <span>Responsable</span>
        <span>Actividad</span>
        <span className="text-right">Acción</span>
      </div>
      {items.map((t, i) => (
        <div
          key={t.id}
          onClick={(e) => clicDeFila(e, () => onOpen(t.id))}
          className={cn(
            "fila-clic relative grid grid-cols-1 gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1.7fr)_88px_120px_140px_100px_110px] lg:items-center",
            i > 0 && "border-t border-border/40",
          )}
        >
          <span aria-hidden className={cn("absolute inset-y-2 left-0 w-1 rounded-r-full", colorEstado(t.estado).barra)} />
          <button type="button" className="min-w-0 text-left" onClick={() => onOpen(t.id)}>
            <p className="truncate text-[14px] font-semibold tracking-tight">{t.titulo}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-mono">{ticketLabel(t)}</span>
              {t.solicitante_nombre && (
                <>
                  <span>·</span>
                  <span>Solicita {t.solicitante_nombre}</span>
                </>
              )}
              {(t.etiquetas || []).slice(0, 2).map((tag) => (
                <span key={tag} className="rounded-full bg-muted px-1.5 py-px text-[10px]">
                  #{tag}
                </span>
              ))}
              {t.categoria && (
                <span className="rounded-full bg-muted px-1.5 py-px text-[10px]">#{t.categoria.toLowerCase()}</span>
              )}
            </p>
          </button>

          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                PRIO_BADGE[t.prioridad] ?? PRIO_BADGE.media,
              )}
            >
              {PRIO_LABEL[t.prioridad] ?? t.prioridad}
            </span>
            <SlaChip t={t} />
          </div>

          <div className="min-w-0">
            {canWrite ? (
              <Select
                value={t.estado}
                onValueChange={(v) => {
                  const payload: Record<string, unknown> = { estado: v };
                  if (v === "resuelto") payload.resuelto_en = new Date().toISOString();
                  if (v === "cerrado" || v === "cancelado") payload.cerrado_en = new Date().toISOString();
                  void onPatch(t.id, payload);
                }}
              >
                <SelectTrigger
                  className={cn(
                    "h-8 w-full max-w-[130px] rounded-full border-0 text-xs font-medium",
                    ESTADO_BADGE[t.estado],
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e.key} value={e.key}>
                      <span className="inline-flex items-center gap-2">
                        <span className={cn("size-2 rounded-full", colorEstado(e.key).punto)} />
                        {e.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", ESTADO_BADGE[t.estado])}>
                {estadoLabel(t.estado)}
              </span>
            )}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            {t.asignado_a ? (
              <>
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold">
                  {initials(nombre(t.asignado_a))}
                </span>
                <span className="truncate text-xs">{nombre(t.asignado_a)}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">Sin asignar</span>
            )}
          </div>

          <div className="text-xs text-muted-foreground">
            <p>{formatDay(t.updated_at ?? t.created_at) || tiempoRelativo(t.updated_at)}</p>
            {t.vence_el && <p className="text-[11px] text-crit">{formatDay(t.vence_el)}</p>}
          </div>

          <div className="flex justify-end gap-1.5">
            {canWrite && !t.asignado_a && (
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => void onAuto(t)}>
                Autoasignar
              </Button>
            )}
            {t.asignado_a && (
              <span className="inline-flex items-center rounded-full bg-warn/12 px-2.5 py-1 text-[11px] font-medium text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]">
                Asignado
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Plazo del SLA: verde con tiempo de sobra, ámbar en el último cuarto, rojo vencido. */
function SlaChip({ t }: { t: TicketT }) {
  const sla = calcularSla(t);
  if (!sla) return null;
  return (
    <span
      title={`SLA ${PRIO_LABEL[t.prioridad] ?? t.prioridad}: ${SLA_HORAS[t.prioridad]?.respuesta ?? 8} h para tomarlo y ${SLA_HORAS[t.prioridad]?.resolucion ?? 72} h para resolverlo`}
      className={cn(
        "inline-flex w-fit items-center gap-1 text-[10.5px] font-medium leading-tight",
        sla.tono === "crit" ? "text-crit" : sla.tono === "warn" ? "text-warn" : "text-muted-foreground",
      )}
    >
      <Timer className="size-3 shrink-0" />
      {sla.texto}
    </span>
  );
}

type MetricaTecnico = {
  id: string;
  resueltos?: number;
  horas_mediana?: number | null;
  horas_promedio?: number | null;
  en_sla?: number;
  abiertos?: number;
  vencidos?: number;
};

function horasLegibles(h?: number | null) {
  if (h == null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toLocaleString("es-AR", { maximumFractionDigits: 1 })} h`;
  return `${Math.round(h / 24)} d`;
}

/** Métricas por técnico: resueltos, tiempo de resolución, cumplimiento del SLA y carga actual. */
function MetricasTecnicos({ nombre }: { nombre: (id: string | null) => string }) {
  const [dias, setDias] = useState(30);
  const { data: filas = [], isLoading } = useQuery({
    queryKey: ["tareas", "metricas", dias],
    queryFn: async () => {
      const { data, error } = await api.rpc("metricas_tickets", { _dias: dias });
      if (error) throw error;
      return (data ?? []) as MetricaTecnico[];
    },
  });
  const ordenadas = [...filas].sort((a, b) => (b.resueltos ?? 0) - (a.resueltos ?? 0) || (b.abiertos ?? 0) - (a.abiertos ?? 0));
  const tot = ordenadas.reduce(
    (s, f) => ({ resueltos: s.resueltos + (f.resueltos ?? 0), enSla: s.enSla + (f.en_sla ?? 0), abiertos: s.abiertos + (f.abiertos ?? 0), vencidos: s.vencidos + (f.vencidos ?? 0) }),
    { resueltos: 0, enSla: 0, abiertos: 0, vencidos: 0 },
  );
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

  return (
    <section className="space-y-4 rise-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
          {[
            [7, "7 días"],
            [30, "30 días"],
            [90, "90 días"],
            [365, "12 meses"],
          ].map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(Number(d))}
              className={cn(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition",
                dias === d ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          SLA de resolución: urgente {SLA_HORAS.critica.resolucion} h · alta {SLA_HORAS.alta.resolucion} h · media {SLA_HORAS.media.resolucion} h · baja{" "}
          {SLA_HORAS.baja.resolucion / 24} días
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-4">
        <StatTile label="Resueltos" value={tot.resueltos} />
        <StatTile label="Dentro del SLA" value={pct(tot.enSla, tot.resueltos)} />
        <StatTile label="Abiertos ahora" value={tot.abiertos} />
        <StatTile label="Vencidos ahora" value={tot.vencidos} />
      </div>

      <div className="overflow-x-auto rounded-2xl bg-card shadow-[var(--shadow-panel)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-border/50 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left">Técnico</th>
              <th className="px-3 py-2 text-right">Resueltos</th>
              <th className="px-3 py-2 text-right">Tiempo típico</th>
              <th className="px-3 py-2 text-right">Promedio</th>
              <th className="px-3 py-2 text-right">En SLA</th>
              <th className="px-3 py-2 text-right">Abiertos</th>
              <th className="px-4 py-2 text-right">Vencidos</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="p-4">
                  <div className="skeleton h-10" />
                </td>
              </tr>
            )}
            {!isLoading && ordenadas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No hay tickets con responsable en este rango.
                </td>
              </tr>
            )}
            {ordenadas.map((f) => {
              const enSla = f.resueltos ? Math.round(((f.en_sla ?? 0) / f.resueltos) * 100) : null;
              return (
                <tr key={f.id} className="border-t border-border/40">
                  <td className="px-4 py-2.5 font-medium">{nombre(f.id)}</td>
                  <td className="num px-3 py-2.5 text-right">{f.resueltos ?? 0}</td>
                  <td className="num px-3 py-2.5 text-right">{horasLegibles(f.horas_mediana)}</td>
                  <td className="num px-3 py-2.5 text-right text-muted-foreground">{horasLegibles(f.horas_promedio)}</td>
                  <td className={cn("num px-3 py-2.5 text-right font-semibold", enSla == null ? "text-muted-foreground" : enSla >= 80 ? "text-ok" : enSla >= 60 ? "text-warn" : "text-crit")}>
                    {enSla == null ? "—" : `${enSla}%`}
                  </td>
                  <td className="num px-3 py-2.5 text-right">{f.abiertos ?? 0}</td>
                  <td className={cn("num px-4 py-2.5 text-right", f.vencidos ? "font-semibold text-crit" : "text-muted-foreground")}>{f.vencidos ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        "Tiempo típico" es la mediana: la mitad de los tickets se resolvió en menos tiempo. Se cuenta desde que se creó el ticket hasta que se marcó resuelto.
      </p>
    </section>
  );
}

function KpiCard({
  icon,
  tone,
  value,
  title,
  hint,
  activo,
  onClick,
}: {
  icon: ReactNode;
  tone: "ok" | "warn" | "info";
  value: number;
  title: string;
  hint: string;
  activo?: boolean;
  onClick?: () => void;
}) {
  const toneClass = { ok: "bg-ok/12 text-ok", warn: "bg-warn/14 text-warn", info: "bg-info/12 text-info" }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      title={activo ? "Filtro aplicado" : "Filtrar la lista"}
      className={cn("kpi-cell text-left transition hover:ring-1 hover:ring-primary/30", activo && "ring-2 ring-primary")}
    >
      <div className="flex items-center justify-between">
        <p className="kpi-label">{title}</p>
        <div className={cn("grid size-8 place-items-center rounded-lg", toneClass)}>{icon}</div>
      </div>
      <p className="kpi-value">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}


const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function duracion(t: TicketT) {
  const fin = t.cerrado_en || t.resuelto_en;
  if (!fin || !t.created_at) return null;
  const ms = new Date(fin).getTime() - new Date(t.created_at).getTime();
  return ms > 0 ? ms : null;
}

function fmtDuracion(ms: number | null) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${Math.round(h / 24)} días`;
}

/** Historial mensual: navegación mes a mes, resumen y listado de cerrados/cancelados. */
function HistorialMes({
  mes,
  onMes,
  tickets,
  total,
  loading,
  filtrando,
  nombre,
  canWrite,
  onOpen,
  onReopen,
}: {
  mes: Date;
  onMes: (d: Date) => void;
  tickets: TicketT[];
  total: number;
  loading: boolean;
  filtrando: boolean;
  nombre: (id: string | null) => string;
  canWrite: boolean;
  onOpen: (id: string) => void;
  onReopen: (id: string) => void;
}) {
  const hoy = new Date();
  const esMesActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();
  const mover = (delta: number) => onMes(new Date(mes.getFullYear(), mes.getMonth() + delta, 1));

  const resumen = useMemo(() => {
    const cerrados = tickets.filter((t) => t.estado === "cerrado");
    const tiempos = cerrados.map(duracion).filter((x): x is number => x != null).sort((a, b) => a - b);
    const mediana = tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null;
    const contar = (key: (t: TicketT) => string) => {
      const m = new Map<string, number>();
      for (const t of tickets) m.set(key(t), (m.get(key(t)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    return {
      cerrados: cerrados.length,
      cancelados: tickets.length - cerrados.length,
      mediana,
      porCategoria: contar((t) => t.categoria || "Sin categoría").slice(0, 6),
      porTecnico: contar((t) => nombre(t.asignado_a)).slice(0, 6),
    };
  }, [tickets, nombre]);

  // Agrupado por día de cierre
  const porDia = useMemo(() => {
    const m = new Map<string, TicketT[]>();
    for (const t of tickets) {
      const d = new Date(t.cerrado_en || t.updated_at || t.created_at || "");
      const key = Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
      m.set(key, [...(m.get(key) ?? []), t]);
    }
    return [...m.entries()];
  }, [tickets]);

  const maxCat = Math.max(1, ...resumen.porCategoria.map(([, n]) => n));
  const maxTec = Math.max(1, ...resumen.porTecnico.map(([, n]) => n));

  return (
    <section className="space-y-5 rise-in">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-1 shadow-xs">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => mover(-1)} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <p className="min-w-40 text-center text-sm font-semibold capitalize">
            {MESES[mes.getMonth()]} {mes.getFullYear()}
          </p>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => mover(1)} disabled={esMesActual} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {!esMesActual && (
          <Button variant="outline" size="sm" onClick={() => onMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1))}>
            Ir al mes actual
          </Button>
        )}
        {filtrando && (
          <span className="text-xs text-muted-foreground">
            Mostrando {tickets.length} de {total} por la búsqueda
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 stagger">
        <StatTile label="Cerrados" value={loading ? "—" : resumen.cerrados} tone="ok" hint="resueltos y cerrados" />
        <StatTile label="Cancelados" value={loading ? "—" : resumen.cancelados} hint="sin resolución" />
        <StatTile label="Tiempo típico" value={loading ? "—" : fmtDuracion(resumen.mediana)} hint="de apertura a cierre (mediana)" />
        <StatTile label="Total del mes" value={loading ? "—" : tickets.length} hint="tickets archivados" />
      </div>

      {tickets.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Ranking titulo="Por categoría" items={resumen.porCategoria} max={maxCat} color="var(--info)" />
          <Ranking titulo="Por técnico" items={resumen.porTecnico} max={maxTec} color="var(--primary)" />
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="empty-state panel bg-grid">
          <p className="text-sm font-semibold">Sin tickets archivados en {MESES[mes.getMonth()]}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">Usá las flechas para recorrer otros meses.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {porDia.map(([dia, items]) => (
            <div key={dia}>
              <p className="eyebrow mb-2 first-letter:uppercase">
                {dia} · {items.length}
              </p>
              <div className="panel divide-y divide-border/60 overflow-hidden">
                {items.map((t) => (
                  <div key={t.id} onClick={(e) => clicDeFila(e, () => onOpen(t.id))} className="fila-clic flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="led" data-tone={t.estado === "cerrado" ? "ok" : undefined} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{t.titulo}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        <span className="num">{ticketLabel(t)}</span>
                        {t.categoria ? ` · ${t.categoria}` : ""}
                        {t.sector ? ` · ${t.sector}` : ""}
                        {t.solicitante_nombre ? ` · ${t.solicitante_nombre}` : ""}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ESTADO_BADGE[t.estado])}>
                      {estadoLabel(t.estado)}
                    </span>
                    <span className="hidden w-32 truncate text-xs text-muted-foreground sm:block">{nombre(t.asignado_a)}</span>
                    <span className="num hidden w-16 text-right text-xs text-muted-foreground md:block" title="Tiempo de apertura a cierre">
                      {fmtDuracion(duracion(t))}
                    </span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="outline" className="h-8" onClick={() => onOpen(t.id)}>
                        Ver
                      </Button>
                      {canWrite && (
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => onReopen(t.id)}>
                          Reabrir
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Ranking({ titulo, items, max, color }: { titulo: string; items: [string, number][]; max: number; color: string }) {
  return (
    <div className="panel p-4">
      <p className="eyebrow mb-3">{titulo}</p>
      <div className="space-y-2.5">
        {items.map(([label, n]) => (
          <div key={label} className="grid grid-cols-[minmax(0,9rem)_1fr_2rem] items-center gap-3 text-[13px]">
            <span className="truncate">{label}</span>
            <div className="meter" style={{ ["--meter" as string]: color }}>
              <span style={{ width: `${(n / max) * 100}%` }} />
            </div>
            <span className="num text-right text-xs text-muted-foreground">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
