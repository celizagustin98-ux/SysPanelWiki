import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, CheckCircle2, ClipboardList, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  type Ticket as TicketT,
  estadoLabel,
  isArchivedClosed,
  sortTickets,
  ticketLabel,
  tiempoRelativo,
  within30Days,
  initials,
  ESTADOS,
} from "@/components/tickets/constants";
import { ReopenDialog } from "@/components/tickets/ReopenDialog";
import { TicketDetail } from "@/components/tickets/TicketDetail";
import { NuevoTicket } from "@/components/tickets/NuevoTicket";

export const Route = createFileRoute("/_app/tareas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tickets | Bandeja de trabajo" },
      { name: "description", content: "Bandeja de trabajo interna de sistemas." },
      { property: "og:title", content: "Tickets | SysIntranet" },
    ],
  }),
  component: TicketsPage,
});

type Vista = "activos" | "historial";

const PRIO_BADGE: Record<string, string> = {
  critica: "bg-rose-100 text-rose-700",
  alta: "bg-amber-100 text-amber-800",
  media: "bg-slate-100 text-slate-600",
  baja: "bg-slate-50 text-slate-500",
};
const PRIO_LABEL: Record<string, string> = {
  critica: "Urgente",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};
const ESTADO_BADGE: Record<string, string> = {
  nuevo: "bg-sky-100 text-sky-800",
  asignado: "bg-violet-100 text-violet-800",
  en_curso: "bg-sky-100 text-sky-900",
  esperando: "bg-amber-100 text-amber-900",
  resuelto: "bg-emerald-100 text-emerald-800",
  cerrado: "bg-slate-100 text-slate-600",
  cancelado: "bg-slate-100 text-slate-500",
};

function progressBucket(estado: string): "nuevo" | "progreso" | "espera" | "resuelto" {
  if (estado === "nuevo") return "nuevo";
  if (estado === "esperando") return "espera";
  if (estado === "resuelto" || estado === "cerrado" || estado === "cancelado") return "resuelto";
  return "progreso";
}

function formatDay(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

function TicketsPage() {
  const { canWrite, user, profile } = useAuth();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("activos");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reopenId, setReopenId] = useState<string | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tareas"],
    queryFn: async () => {
      const { data, error } = await api.from("tareas").select("*").order("updated_at", { ascending: false });
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
  const historyTickets = useMemo(
    () => tickets.filter((t) => isArchivedClosed(t.estado) && within30Days(t)),
    [tickets],
  );

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
        dot: "bg-slate-400",
        items: sinAsignar,
      },
      {
        key: "prog",
        title: "En progreso",
        hint: "Tickets con trabajo activo y seguimiento en curso.",
        dot: "bg-sky-500",
        items: enProgreso,
      },
      {
        key: "esp",
        title: "Pendiente de respuesta",
        hint: "Tickets en espera de información o una dependencia.",
        dot: "bg-amber-400",
        items: pendiente,
      },
      {
        key: "res",
        title: "Resuelto (abierto)",
        hint: "Resueltos pendientes de cierre formal.",
        dot: "bg-emerald-500",
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

  const selected = selectedId ? tickets.find((t) => t.id === selectedId) ?? null : null;
  const reopenTarget = reopenId ? tickets.find((t) => t.id === reopenId) : null;

  useEffect(() => {
    if (selectedId && !tickets.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tickets, selectedId]);

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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Trabajo interno <span className="text-muted-foreground/40">/</span> Tickets
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground/90 sm:text-2xl">
            Bandeja de trabajo
          </h1>
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

      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        Mi espacio <span className="text-muted-foreground/40">/</span> Tickets internos
      </p>
      <div className="mb-6 mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mis tickets</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Una bandeja clara para saber qué está sin asignar, qué está en curso y qué necesita respuesta.
          </p>
        </div>
        <div className="relative w-full max-w-xs shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-full border-border/60 bg-card pl-10 shadow-sm"
            placeholder="Buscar tickets…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <KpiCard
          icon={<CheckCircle2 className="size-5 text-sky-600" />}
          iconBg="bg-sky-50"
          value={counts.mios}
          title="Pendientes para mí"
          hint="Asignados que todavía requieren una acción"
        />
        <KpiCard
          icon={<ClipboardList className="size-5 text-amber-600" />}
          iconBg="bg-amber-50"
          value={counts.creados}
          title="Creados por mí"
          hint="Solicitudes que abriste y siguen activas"
        />
        <KpiCard
          icon={<Bell className="size-5 text-teal-600" />}
          iconBg="bg-teal-50"
          value={counts.seguimiento}
          title="Seguimiento"
          hint="Cambios recientes en tickets que seguís"
        />
      </div>

      <div className="mb-5 inline-flex rounded-full bg-muted/70 p-1">
        <button
          type="button"
          onClick={() => setVista("activos")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
            vista === "activos"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <ClipboardList className="size-3.5" />
          Activos
          <span
            className={cn(
              "inline-flex min-w-5 justify-center rounded-full px-1.5 text-[11px] font-semibold",
              vista === "activos" ? "bg-amber-400 text-amber-950" : "bg-background text-muted-foreground",
            )}
          >
            {counts.total}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setVista("historial")}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
            vista === "historial"
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Historial · 30 días
          <span
            className={cn(
              "inline-flex min-w-5 justify-center rounded-full px-1.5 text-[11px] font-semibold",
              vista === "historial" ? "bg-amber-400 text-amber-950" : "bg-background text-muted-foreground",
            )}
          >
            {counts.historial}
          </span>
        </button>
      </div>

      {vista === "activos" && (
        <>
          <div className="panel mb-6 p-5">
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
            <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-muted">
              <span className="bg-slate-400" style={{ width: pct(counts.nuevo) }} />
              <span className="bg-sky-600" style={{ width: pct(counts.progreso) }} />
              <span className="bg-amber-400" style={{ width: pct(counts.espera) }} />
              <span className="bg-emerald-500" style={{ width: pct(counts.resuelto) }} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Nuevo", n: counts.nuevo, dot: "bg-slate-400" },
                { label: "En progreso", n: counts.progreso, dot: "bg-sky-600" },
                { label: "En espera", n: counts.espera, dot: "bg-amber-400" },
                { label: "Resuelto", n: counts.resuelto, dot: "bg-emerald-500" },
              ].map((b) => (
                <div key={b.label} className="rounded-xl bg-muted/35 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", b.dot)} />
                    {b.label}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{b.n}</p>
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
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/40" />
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
        <section className="rise-in">
          <div className="mb-4 rounded-2xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
            <span className="font-semibold">{hist.length} tickets</span> en historial. Los que cumplan 30 días salen de
            esta vista.
          </div>
          <div className="space-y-2">
            {hist.length === 0 && (
              <p className="py-16 text-center text-sm text-muted-foreground">Sin cerrados en el último mes.</p>
            )}
            {hist.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-[var(--shadow-panel)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold tracking-tight">{t.titulo}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", ESTADO_BADGE[t.estado])}>
                      {estadoLabel(t.estado)}
                    </span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", PRIO_BADGE[t.prioridad])}>
                      {PRIO_LABEL[t.prioridad]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {ticketLabel(t)}
                    {t.solicitante_nombre ? ` · Solicita ${t.solicitante_nombre}` : ""}
                    {" · "}
                    {tiempoRelativo(t.cerrado_en || t.updated_at)}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{nombre(t.asignado_a)}</span>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setSelectedId(t.id)}>
                  Ver detalle
                </Button>
                {canWrite && (
                  <Button size="sm" className="h-8" onClick={() => setReopenId(t.id)}>
                    Reabrir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
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
            {t.vence_el && <p className="text-[11px] text-rose-600">{formatDay(t.vence_el)}</p>}
          </div>

          <div className="flex justify-end gap-1.5">
            {canWrite && !t.asignado_a && (
              <Button size="sm" variant="outline" className="h-8 rounded-full text-xs" onClick={() => void onAuto(t)}>
                Autoasignar
              </Button>
            )}
            {t.asignado_a && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
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
  iconBg,
  value,
  title,
  hint,
}: {
  icon: ReactNode;
  iconBg: string;
  value: number;
  title: string;
  hint: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card p-5 shadow-[var(--shadow-panel)]">
      <p className="absolute right-4 top-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">
        Activos
      </p>
      <div className={cn("mb-3 grid size-10 place-items-center rounded-xl", iconBg)}>{icon}</div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
