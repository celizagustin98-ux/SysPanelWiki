import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  BOARD_COLS,
  ESTADO_STYLE,
  PRIORIDAD_BAR,
  type Ticket as TicketT,
  estadoLabel,
  isArchivedClosed,
  sortTickets,
  ticketLabel,
  tiempoRelativo,
  within30Days,
} from "@/components/tickets/constants";
import { TicketCard } from "@/components/tickets/TicketCard";
import { ReopenDialog } from "@/components/tickets/ReopenDialog";
import { TicketDetail } from "@/components/tickets/TicketDetail";
import { NuevoTicket } from "@/components/tickets/NuevoTicket";

export const Route = createFileRoute("/_app/tareas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tickets | Mesa de sistemas" },
      {
        name: "description",
        content: "Cola de tickets internos: incidentes, pedidos y seguimiento operativo.",
      },
      { property: "og:title", content: "Tickets | SysIntranet" },
    ],
  }),
  component: TicketsPage,
});

type Vista = "lista" | "board" | "historial";
type FiltroCola = "todos" | "mios" | "sin_asignar" | "criticos";

function TicketsPage() {
  const { canWrite, user, profile } = useAuth();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("lista");
  const [filtro, setFiltro] = useState<FiltroCola>("todos");
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

  const applySearchAndFiltro = (list: TicketT[]) => {
    let out = list;
    if (filtro === "mios") out = out.filter((t) => t.asignado_a === user?.id);
    if (filtro === "sin_asignar") out = out.filter((t) => !t.asignado_a);
    if (filtro === "criticos") out = out.filter((t) => t.prioridad === "critica");
    const term = q.trim().toLowerCase();
    if (term) {
      out = out.filter((t) =>
        [ticketLabel(t), t.titulo, t.descripcion, t.sector, t.categoria, t.solicitante_nombre, t.tipo]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      );
    }
    return sortTickets(out);
  };

  const boardTickets = useMemo(() => {
    const open = tickets.filter((t) => !isArchivedClosed(t.estado));
    const closedRecent = tickets.filter((t) => isArchivedClosed(t.estado) && within30Days(t));
    return applySearchAndFiltro([...open, ...closedRecent]);
  }, [tickets, filtro, q, user?.id]);

  const listTickets = useMemo(() => {
    const list = tickets.filter((t) => !isArchivedClosed(t.estado));
    return applySearchAndFiltro(list);
  }, [tickets, filtro, q, user?.id]);

  const historyTickets = useMemo(() => {
    const list = tickets.filter((t) => isArchivedClosed(t.estado) && within30Days(t));
    return applySearchAndFiltro(list);
  }, [tickets, filtro, q, user?.id]);

  const selected = selectedId ? tickets.find((t) => t.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !tickets.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tickets, selectedId]);

  const counts = useMemo(
    () => ({
      mios: tickets.filter((t) => t.asignado_a === user?.id && !isArchivedClosed(t.estado)).length,
      sin_asignar: tickets.filter((t) => !t.asignado_a && !isArchivedClosed(t.estado)).length,
      criticos: tickets.filter((t) => t.prioridad === "critica" && !isArchivedClosed(t.estado)).length,
      historial: tickets.filter((t) => isArchivedClosed(t.estado) && within30Days(t)).length,
      abiertos: tickets.filter((t) => !isArchivedClosed(t.estado)).length,
    }),
    [tickets, user?.id],
  );

  const refetch = () => qc.invalidateQueries({ queryKey: ["tareas"] });

  const changeEstado = async (id: string, estado: string) => {
    const payload: Record<string, unknown> = { estado };
    if (estado === "resuelto") payload.resuelto_en = new Date().toISOString();
    if (estado === "cerrado" || estado === "cancelado") payload.cerrado_en = new Date().toISOString();
    const { error } = await api.from("tareas").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Estado → ${estadoLabel(estado)}`);
    refetch();
  };

  const reopenTicket = async (id: string, mode: "nuevo" | "asignar", asignado?: string) => {
    const payload: Record<string, unknown> = {
      cerrado_en: null,
      resuelto_en: null,
    };
    if (mode === "nuevo") {
      payload.estado = "nuevo";
      payload.asignado_a = null;
    } else {
      payload.estado = "asignado";
      payload.asignado_a = asignado ?? null;
    }
    const { error } = await api.from("tareas").update(payload).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(mode === "nuevo" ? "Reabierto en Backlog" : "Reabierto y asignado");
    setReopenId(null);
    refetch();
  };

  const byColumn = (key: string) => {
    if (key === "cerrado") return boardTickets.filter((t) => isArchivedClosed(t.estado));
    return boardTickets.filter((t) => t.estado === key);
  };

  const reopenTarget = reopenId ? tickets.find((t) => t.id === reopenId) : null;
  const openDetail = (id: string) => setSelectedId(id);

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        title="Tickets"
        description="Mesa de sistemas"
        action={
          canWrite ? (
            <NuevoTicket
              perfiles={perfiles}
              userId={user?.id}
              userName={profile?.full_name}
              onDone={(id) => {
                refetch();
                if (id) setSelectedId(id);
              }}
            />
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Abiertos", value: counts.abiertos },
          { label: "Sin asignar", value: counts.sin_asignar },
          { label: "Críticos", value: counts.criticos },
          { label: "Historial 30d", value: counts.historial },
        ].map((k) => (
          <div key={k.label} className="kpi-cell !py-2.5">
            <p className="kpi-label">{k.label}</p>
            <p className="kpi-value !text-lg">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5">
            {(
              [
                ["lista", "Cola"],
                ["board", "Board"],
                ["historial", "Historial"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVista(key)}
                className={cn(
                  "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  vista === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {key === "historial" && (
                  <span className="ml-1.5 font-mono text-[10px] opacity-80">{counts.historial}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-xs sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 font-mono text-sm"
              placeholder="TK-… o título"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              ["todos", "Todos"],
              ["mios", "Míos"],
              ["sin_asignar", "Cola"],
              ["criticos", "Críticos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFiltro(key)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                filtro === key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {label}
              {key !== "todos" && (
                <span className="font-mono text-[10px] tabular-nums opacity-80">
                  {counts[key as "mios" | "sin_asignar" | "criticos"]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {vista === "lista" && (
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          <div className="grid grid-cols-[auto_1fr_auto] gap-0 border-b border-border bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid-cols-[88px_1fr_100px_110px_90px]">
            <span>ID</span>
            <span>Ticket</span>
            <span className="hidden sm:inline">Estado</span>
            <span className="hidden sm:inline">Asignado</span>
            <span className="text-right">Activo</span>
          </div>
          <div className="max-h-[calc(100vh-18rem)] overflow-y-auto">
            {isLoading && (
              <div className="space-y-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse border-b border-border/50 bg-muted/20" />
                ))}
              </div>
            )}
            {!isLoading && listTickets.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
                <Inbox className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">Nada en la cola</p>
                <p className="text-xs text-muted-foreground">Los tickets abiertos aparecen acá.</p>
              </div>
            )}
            {listTickets.map((t) => {
              const active = selected?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openDetail(t.id)}
                  className={cn(
                    "grid w-full grid-cols-[auto_1fr_auto] items-center gap-x-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors sm:grid-cols-[88px_1fr_100px_110px_90px]",
                    active ? "bg-primary/[0.07]" : "hover:bg-muted/40",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        "hidden h-8 w-0.5 rounded-full sm:block",
                        PRIORIDAD_BAR[t.prioridad] ?? PRIORIDAD_BAR.media,
                      )}
                    />
                    <span className="font-mono text-[11px] text-muted-foreground">{ticketLabel(t)}</span>
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium tracking-tight">{t.titulo}</span>
                    <span className="block truncate text-[11px] capitalize text-muted-foreground">
                      {t.tipo || "pedido"}
                      {t.categoria ? ` · ${t.categoria}` : ""}
                      {t.sector ? ` · ${t.sector}` : ""}
                    </span>
                  </span>
                  <span className="hidden sm:inline">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", ESTADO_STYLE[t.estado])}>
                      {estadoLabel(t.estado)}
                    </span>
                  </span>
                  <span className="hidden truncate text-[11px] text-muted-foreground sm:inline">
                    {nombre(t.asignado_a)}
                  </span>
                  <span className="text-right font-mono text-[10px] text-muted-foreground">
                    {tiempoRelativo(t.updated_at ?? t.created_at)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {vista === "board" && (
        <div className="min-h-0 flex-1 overflow-x-auto pb-2">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-lg bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="flex min-w-max gap-2.5">
              {BOARD_COLS.map((col) => {
                const items = byColumn(col.key);
                return (
                  <div
                    key={col.key}
                    className="flex w-[220px] shrink-0 flex-col rounded-lg border border-border bg-muted/15"
                  >
                    <div className="flex items-center gap-2 border-b border-border/60 px-2.5 py-2">
                      <span className={cn("size-1.5 rounded-full", col.dot)} />
                      <span className="text-[11px] font-semibold tracking-tight">{col.label}</span>
                      <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-1.5 overflow-y-auto p-1.5">
                      {items.length === 0 && (
                        <p className="px-1 py-8 text-center text-[10px] text-muted-foreground">—</p>
                      )}
                      {items.map((t) => (
                        <TicketCard
                          key={t.id}
                          ticket={t}
                          assigneeName={nombre(t.asignado_a)}
                          canWrite={!!canWrite}
                          active={selectedId === t.id}
                          onOpen={() => openDetail(t.id)}
                          onEstado={(estado) => changeEstado(t.id, estado)}
                          onReopen={() => setReopenId(t.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {vista === "historial" && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-medium">Cerrados · 30 días</p>
            <span className="font-mono text-xs text-muted-foreground">{historyTickets.length}</span>
          </div>
          <div className="divide-y divide-border/60">
            {historyTickets.length === 0 && (
              <p className="px-4 py-14 text-center text-sm text-muted-foreground">Sin cerrados en el último mes.</p>
            )}
            {historyTickets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openDetail(t.id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{ticketLabel(t)}</span>
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", ESTADO_STYLE[t.estado])}>
                      {estadoLabel(t.estado)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[13px] font-medium">{t.titulo}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {nombre(t.asignado_a)} · {tiempoRelativo(t.cerrado_en || t.updated_at)}
                  </p>
                </button>
                {canWrite && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReopenId(t.id)}>
                    Reabrir
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
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
