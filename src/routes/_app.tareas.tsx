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
      { title: "Tickets | Mesa de sistemas" },
      { name: "description", content: "Bandeja de trabajo interna." },
      { property: "og:title", content: "Tickets | SysIntranet" },
    ],
  }),
  component: TicketsPage,
});

type Vista = "bandeja" | "historial";

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
  en_curso: "bg-amber-100 text-amber-900",
  esperando: "bg-yellow-100 text-yellow-900",
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

function TicketsPage() {
  const { canWrite, user, profile } = useAuth();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("bandeja");
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

  const counts = useMemo(() => {
    const mios = openTickets.filter((t) => t.asignado_a === user?.id).length;
    const creados = openTickets.filter((t) => t.solicitante_id === user?.id).length;
    const sinAsignar = openTickets.filter((t) => !t.asignado_a).length;
    const buckets = { nuevo: 0, progreso: 0, espera: 0, resuelto: 0 };
    for (const t of openTickets) buckets[progressBucket(t.estado)]++;
    buckets.resuelto = openTickets.filter((t) => t.estado === "resuelto").length;
    return {
      mios,
      creados,
      sinAsignar,
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
      { asignado_a: user.id, estado: t.estado === "nuevo" ? "asignado" : t.estado },
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
    refetch();
  };

  const barTotal = Math.max(1, counts.nuevo + counts.progreso + counts.espera + counts.resuelto);
  const pct = (n: number) => `${Math.round((n / barTotal) * 100)}%`;

  return (
    <div className="page-content min-h-[calc(100vh-6rem)]">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Trabajo interno <span className="text-muted-foreground/40">/</span> Tickets
        </p>
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

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-1 flex gap-2">
            <button
              type="button"
              onClick={() => setVista("bandeja")}
              className={cn(
                "text-[11px] font-medium uppercase tracking-[0.1em]",
                vista === "bandeja" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Mis tickets
            </button>
            <span className="text-muted-foreground/40">/</span>
            <button
              type="button"
              onClick={() => setVista("historial")}
              className={cn(
                "text-[11px] font-medium uppercase tracking-[0.1em]",
                vista === "historial" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              Historial 30d
            </button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {vista === "bandeja" ? "Mis tickets" : "Historial de tickets"}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {vista === "bandeja"
              ? "Un lugar para revisar lo importante, dar seguimiento y cerrar pendientes."
              : "Los tickets resueltos/cerrados permanecen 30 días. Podés reabrirlos si hace falta."}
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 rounded-full border-border/60 bg-card pl-10 shadow-sm"
            placeholder={vista === "bandeja" ? "Buscar tickets…" : "Buscar en historial…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {vista === "bandeja" && (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <KpiCard
              icon={<CheckCircle2 className="size-5 text-sky-600" />}
              iconBg="bg-sky-50"
              value={counts.mios}
              title="Pendientes para mí"
              hint="Asignados que todavía requieren acción"
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
              value={counts.sinAsignar}
              title="Sin asignar"
              hint="Cola libre del equipo"
            />
          </div>

          <div className="panel mb-6 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Progreso de los tickets</p>
                <p className="text-xs text-muted-foreground">Estado actual de cada solicitud abierta</p>
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {counts.total} en total
              </span>
            </div>
            <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-muted">
              <span className="bg-slate-400" style={{ width: pct(counts.nuevo) }} />
              <span className="bg-sky-500" style={{ width: pct(counts.progreso) }} />
              <span className="bg-amber-400" style={{ width: pct(counts.espera) }} />
              <span className="bg-emerald-500" style={{ width: pct(counts.resuelto) }} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Nuevo", n: counts.nuevo, dot: "bg-slate-400" },
                { label: "En progreso", n: counts.progreso, dot: "bg-sky-500" },
                { label: "En espera", n: counts.espera, dot: "bg-amber-400" },
                { label: "Resuelto", n: counts.resuelto, dot: "bg-emerald-500" },
              ].map((b) => (
                <div key={b.label} className="rounded-xl bg-muted/40 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn("size-1.5 rounded-full", b.dot)} />
                    {b.label}
                  </p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{b.n}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="mb-2 text-sm font-medium">{list.length} tickets</p>

          <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-panel)]">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_90px_120px_140px_100px_110px] gap-2 border-b border-border/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
              <span>Ticket</span>
              <span>Prioridad</span>
              <span>Estado</span>
              <span>Responsable</span>
              <span>Actividad</span>
              <span className="text-right">Acción</span>
            </div>

            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse border-b border-border/40 bg-muted/20" />
              ))}

            {!isLoading && list.length === 0 && (
              <p className="px-4 py-16 text-center text-sm text-muted-foreground">Nada en la bandeja</p>
            )}

            {list.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-1 gap-2 border-b border-border/50 px-4 py-3 transition hover:bg-muted/30 lg:grid-cols-[minmax(0,1.6fr)_90px_120px_140px_100px_110px] lg:items-center"
              >
                <button type="button" className="min-w-0 text-left" onClick={() => setSelectedId(t.id)}>
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
                      <span className="rounded-full bg-muted px-1.5 py-px text-[10px]">
                        #{t.categoria.toLowerCase()}
                      </span>
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
                        void patchTicket(t.id, payload);
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
                  <p>{tiempoRelativo(t.updated_at ?? t.created_at)}</p>
                  {t.vence_el && (
                    <p className="text-[11px] text-rose-600">
                      {new Date(t.vence_el).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                    </p>
                  )}
                </div>

                <div className="flex justify-end gap-1.5">
                  {canWrite && !t.asignado_a && (
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void autoasignar(t)}>
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
      <p className="absolute right-4 top-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        Activos
      </p>
      <div className={cn("mb-3 grid size-10 place-items-center rounded-xl", iconBg)}>{icon}</div>
      <p className="text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
