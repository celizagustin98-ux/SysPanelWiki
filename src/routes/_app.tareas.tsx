import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Inbox, Search, Ticket } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Vista = "board" | "lista" | "historial";
type FiltroCola = "todos" | "mios" | "sin_asignar" | "criticos";

function TicketsPage() {
  const { canWrite, user, profile } = useAuth();
  const qc = useQueryClient();
  const [vista, setVista] = useState<Vista>("board");
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

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        title="Tickets"
        description="Mesa de sistemas · board, cola e historial (30 días)"
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

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border bg-card/80 p-0.5">
            {(
              [
                ["board", "Board"],
                ["lista", "Lista"],
                ["historial", "Historial"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setVista(key);
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  vista === key ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                {key === "historial" && (
                  <span className="ml-1.5 font-mono text-[10px] tabular-nums opacity-80">{counts.historial}</span>
                )}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-xs sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-sm"
              placeholder="Buscar TK-…, título…"
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
              ["sin_asignar", "Sin asignar"],
              ["criticos", "Críticos"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFiltro(key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                filtro === key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {label}
              {key !== "todos" && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums",
                    filtro === key ? "bg-primary/15" : "bg-muted",
                  )}
                >
                  {counts[key as "mios" | "sin_asignar" | "criticos"]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {vista === "board" && (
        <div className="min-h-0 flex-1 overflow-x-auto pb-2">
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          ) : (
            <div className="flex min-w-max gap-3">
              {BOARD_COLS.map((col) => {
                const items = byColumn(col.key);
                return (
                  <div
                    key={col.key}
                    className="flex w-[240px] shrink-0 flex-col rounded-xl border border-border/70 bg-muted/20"
                  >
                    <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2.5">
                      <span className={cn("size-2 rounded-full", col.dot)} />
                      <span className="text-xs font-semibold tracking-tight">{col.label}</span>
                      <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                        {items.length}
                      </span>
                    </div>
                    <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-2 overflow-y-auto p-2">
                      {items.length === 0 && (
                        <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">Vacío</p>
                      )}
                      {items.map((t) => (
                        <TicketCard
                          key={t.id}
                          ticket={t}
                          assigneeName={nombre(t.asignado_a)}
                          canWrite={!!canWrite}
                          active={selectedId === t.id}
                          onOpen={() => setSelectedId(t.id)}
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

          {selected && (
            <div className="mt-4 overflow-hidden rounded-xl border border-border/80 bg-card/50">
              <TicketDetail
                ticket={selected}
                perfiles={perfiles}
                canWrite={!!canWrite}
                userId={user?.id}
                onRefresh={refetch}
                onClose={() => setSelectedId(null)}
                onReopen={() => setReopenId(selected.id)}
              />
            </div>
          )}
        </div>
      )}

      {vista === "lista" && (
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border/80 bg-card/40",
            selected ? "lg:grid-cols-[minmax(300px,420px)_1fr]" : "grid-cols-1",
          )}
        >
          <div
            className={cn(
              "flex min-h-[50vh] flex-col border-border lg:min-h-[calc(100vh-13rem)]",
              selected && "hidden border-r lg:flex",
            )}
          >
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cola</p>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{listTickets.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {!isLoading && listTickets.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                  <Inbox className="size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">No hay tickets abiertos</p>
                </div>
              )}
              {listTickets.map((t) => {
                const active = selected?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "group relative flex w-full gap-0 border-b border-border/50 text-left transition-colors",
                      active ? "bg-primary/[0.07]" : "hover:bg-muted/40",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1 shrink-0 self-stretch",
                        PRIORIDAD_BAR[t.prioridad] ?? PRIORIDAD_BAR.media,
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{ticketLabel(t)}</span>
                        <span className="text-[11px] capitalize text-muted-foreground/80">
                          {t.tipo || "pedido"}
                          {t.categoria ? ` · ${t.categoria}` : ""}
                        </span>
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {tiempoRelativo(t.updated_at ?? t.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium leading-snug tracking-tight">{t.titulo}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                            ESTADO_STYLE[t.estado] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {estadoLabel(t.estado)}
                        </span>
                        <span className="ml-auto truncate text-[11px] text-muted-foreground">
                          {nombre(t.asignado_a)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          {selected ? (
            <div className="flex min-h-[50vh] flex-col lg:min-h-[calc(100vh-13rem)]">
              <TicketDetail
                ticket={selected}
                perfiles={perfiles}
                canWrite={!!canWrite}
                userId={user?.id}
                onRefresh={refetch}
                onClose={() => setSelectedId(null)}
                onReopen={() => setReopenId(selected.id)}
              />
            </div>
          ) : (
            <div className="hidden min-h-[calc(100vh-13rem)] flex-col items-center justify-center gap-3 text-muted-foreground lg:flex">
              <Ticket className="size-6 opacity-40" />
              <p className="text-sm font-medium text-foreground/80">Seleccioná un ticket</p>
            </div>
          )}
        </div>
      )}

      {vista === "historial" && (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-card/40">
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
            <p className="text-sm font-medium">Cerrados · últimos 30 días</p>
            <span className="font-mono text-xs text-muted-foreground">{historyTickets.length}</span>
          </div>
          <div className="divide-y divide-border/50">
            {historyTickets.length === 0 && (
              <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                No hay tickets cerrados en el último mes.
              </p>
            )}
            {historyTickets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(t.id)}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{ticketLabel(t)}</span>
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", ESTADO_STYLE[t.estado])}>
                      {estadoLabel(t.estado)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm font-medium">{t.titulo}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {nombre(t.asignado_a)} · {tiempoRelativo(t.cerrado_en || t.updated_at)}
                  </p>
                </button>
                {canWrite && (
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setReopenId(t.id)}>
                    Reabrir
                  </Button>
                )}
              </div>
            ))}
          </div>
          {selected && (
            <div className="border-t border-border/70">
              <TicketDetail
                ticket={selected}
                perfiles={perfiles}
                canWrite={!!canWrite}
                userId={user?.id}
                onRefresh={refetch}
                onClose={() => setSelectedId(null)}
                onReopen={() => setReopenId(selected.id)}
              />
            </div>
          )}
        </div>
      )}

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
