import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Search } from "lucide-react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn, formatFecha } from "@/lib/utils";
import {
  type Ticket as TicketT,
  estadoLabel,
  isArchivedClosed,
  sortTickets,
  ticketLabel,
  tiempoRelativo,
  initials,
  ESTADOS,
} from "@/components/tickets/constants";
import { ReopenDialog } from "@/components/tickets/ReopenDialog";
import { TicketDetail } from "@/components/tickets/TicketDetail";
import { NuevoTicket } from "@/components/tickets/NuevoTicket";

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

type Vista = "activos" | "historial";

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
const ESTADO_BADGE: Record<string, string> = {
  nuevo: "bg-info/12 text-info",
  asignado: "bg-chart-4/12 text-chart-4",
  en_curso: "bg-info/12 text-info",
  esperando: "bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]",
  resuelto: "bg-ok/12 text-ok",
  cerrado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground",
};

function progressBucket(estado: string): "nuevo" | "progreso" | "espera" | "resuelto" {
  if (estado === "nuevo") return "nuevo";
  if (estado === "esperando") return "espera";
  if (estado === "resuelto" || estado === "cerrado" || estado === "cancelado") return "resuelto";
  return "progreso";
}

function formatDay(iso?: string | null) {
  if (!iso) return "";
  return formatFecha(iso, { day: "2-digit", month: "short" });
}

function TicketsPage() {
  const { user, profile, puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("tareas");
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("activos");
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

  const applyQ = (list: TicketT[]) => {
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

  const list = useMemo(() => applyQ(openTickets), [openTickets, q]);
  const hist = useMemo(() => applyQ(historyTickets), [historyTickets, q]);

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
    return [
      {
        key: "sin",
        title: "Sin asignar",
        hint: "Tickets que todavía necesitan una persona responsable.",
        dot: "bg-muted-foreground/50",
        items: sinAsignar,
      },
      {
        key: "prog",
        title: "En progreso",
        hint: "Tickets con trabajo activo y seguimiento en curso.",
        dot: "bg-info",
        items: enProgreso,
      },
      {
        key: "esp",
        title: "Pendiente de respuesta",
        hint: "Tickets en espera de información o una dependencia.",
        dot: "bg-warn",
        items: pendiente,
      },
      {
        key: "res",
        title: "Resuelto (abierto)",
        hint: "Resueltos pendientes de cierre formal.",
        dot: "bg-ok",
        items: resueltos,
      },
      {
        key: "otros",
        title: "Otros",
        hint: "Resto de estados activos.",
        dot: "bg-muted-foreground",
        items: otros,
      },
    ].filter((g) => g.items.length > 0);
  }, [list]);

  const counts = useMemo(() => {
    const mios = openTickets.filter((t) => t.asignado_a === user?.id).length;
    const creados = openTickets.filter((t) => t.solicitante_id === user?.id).length;
    const seguimiento = openTickets.filter(
      (t) => t.asignado_a === user?.id || t.solicitante_id === user?.id,
    ).length;
    const buckets = { nuevo: 0, progreso: 0, espera: 0, resuelto: 0 };
    for (const t of openTickets) buckets[progressBucket(t.estado)]++;
    buckets.resuelto = openTickets.filter((t) => t.estado === "resuelto").length;
    return {
      mios,
      creados,
      seguimiento,
      ...buckets,
      total: openTickets.length,
      historial: historyTickets.length,
    };
  }, [openTickets, historyTickets, user?.id]);

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
    if (error) return toast.error(error.message);
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

  const barTotal = Math.max(1, counts.nuevo + counts.progreso + counts.espera + counts.resuelto);
  const pct = (n: number) => `${Math.round((n / barTotal) * 100)}%`;

  return (
    <div className="page-content min-h-[calc(100vh-6rem)]">
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

      <div className="mb-3 grid gap-2.5 sm:grid-cols-3 stagger">
        <KpiCard
          icon={<CheckCircle2 className="size-4" />}
          tone="info"
          value={counts.mios}
          title="Pendientes para mí"
          hint="Asignados que todavía requieren una acción"
        />
        <KpiCard
          icon={<ClipboardList className="size-4" />}
          tone="warn"
          value={counts.creados}
          title="Creados por mí"
          hint="Solicitudes que abriste y siguen activas"
        />
        <KpiCard
          icon={<Bell className="size-4" />}
          tone="ok"
          value={counts.seguimiento}
          title="Seguimiento"
          hint="Cambios recientes en tickets que seguís"
        />
      </div>

      <div className="mb-3 inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
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
      </div>

      {vista === "activos" && (
        <>
          <div className="panel mb-4 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Progreso de los tickets</p>
                <p className="text-xs text-muted-foreground">
                  Estado actual de cada solicitud, separado de la actividad reciente.
                </p>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {counts.total} en total
              </span>
            </div>
            <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-muted">
              <span className="bg-muted-foreground/50 transition-[width] duration-700" style={{ width: pct(counts.nuevo) }} />
              <span className="bg-info transition-[width] duration-700" style={{ width: pct(counts.progreso) }} />
              <span className="bg-warn transition-[width] duration-700" style={{ width: pct(counts.espera) }} />
              <span className="bg-ok transition-[width] duration-700" style={{ width: pct(counts.resuelto) }} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Nuevo", n: counts.nuevo, dot: "bg-muted-foreground/60" },
                { label: "En progreso", n: counts.progreso, dot: "bg-info" },
                { label: "En espera", n: counts.espera, dot: "bg-warn" },
                { label: "Resuelto", n: counts.resuelto, dot: "bg-ok" },
              ].map((b) => (
                <div key={b.label} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", b.dot)} />
                    {b.label}
                  </p>
                  <p className="num mt-0.5 text-lg font-semibold">{b.n}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">{list.length} tickets activos</p>
              <p className="text-xs text-muted-foreground">
                Organizados por asignación y estado para priorizar el siguiente paso.
              </p>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Vista operativa</p>
          </div>

          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 skeleton rounded-xl" />
              ))}
            </div>
          )}

          {!isLoading && list.length === 0 && (
            <div className="panel px-6 py-16 text-center text-sm text-muted-foreground">Nada en la bandeja activa</div>
          )}

          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.key}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2 rounded-full", g.dot)} />
                    {g.title}
                    <span className="font-normal text-muted-foreground">{g.items.length}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{g.hint}</p>
                </div>
                <TicketTable
                  items={g.items}
                  canWrite={!!canWrite}
                  nombre={nombre}
                  onOpen={setSelectedId}
                  onPatch={patchTicket}
                  onAuto={autoasignar}
                />
              </section>
            ))}
          </div>
        </>
      )}

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

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full border-border p-0 sm:max-w-xl lg:max-w-2xl">
          <SheetTitle className="sr-only">Detalle del ticket</SheetTitle>
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
        </SheetContent>
      </Sheet>

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
          className={cn(
            "grid grid-cols-1 gap-2 px-4 py-3 transition hover:bg-muted/25 lg:grid-cols-[minmax(0,1.7fr)_88px_120px_140px_100px_110px] lg:items-center",
            i > 0 && "border-t border-border/40",
          )}
        >
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

          <span
            className={cn(
              "inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              PRIO_BADGE[t.prioridad] ?? PRIO_BADGE.media,
            )}
          >
            {PRIO_LABEL[t.prioridad] ?? t.prioridad}
          </span>

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
                      {e.label}
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

function KpiCard({
  icon,
  tone,
  value,
  title,
  hint,
}: {
  icon: ReactNode;
  tone: "ok" | "warn" | "info";
  value: number;
  title: string;
  hint: string;
}) {
  const toneClass = { ok: "bg-ok/12 text-ok", warn: "bg-warn/14 text-warn", info: "bg-info/12 text-info" }[tone];
  return (
    <div className="kpi-cell">
      <div className="flex items-center justify-between">
        <p className="kpi-label">{title}</p>
        <div className={cn("grid size-8 place-items-center rounded-lg", toneClass)}>{icon}</div>
      </div>
      <p className="kpi-value">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
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
                  <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/30">
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
