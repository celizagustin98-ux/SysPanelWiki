import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  CheckSquare,
  CircleDot,
  Clock3,
  MessageSquare,
  Plus,
  Search,
  Send,
  Ticket,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

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

type Ticket = {
  id: string;
  numero: number | null;
  titulo: string;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  tipo: string | null;
  etiquetas: string[];
  asignado_a: string | null;
  solicitante_id: string | null;
  solicitante_nombre: string | null;
  sector: string | null;
  categoria: string | null;
  canal: string | null;
  resolucion: string | null;
  vence_el: string | null;
  resuelto_en: string | null;
  cerrado_en: string | null;
  created_at?: string;
  updated_at?: string;
};

const ESTADOS = [
  { key: "nuevo", label: "Nuevo" },
  { key: "asignado", label: "Asignado" },
  { key: "en_curso", label: "En curso" },
  { key: "esperando", label: "Esperando" },
  { key: "resuelto", label: "Resuelto" },
  { key: "cerrado", label: "Cerrado" },
  { key: "cancelado", label: "Cancelado" },
] as const;

const TIPOS = [
  { key: "incidente", label: "Incidente" },
  { key: "pedido", label: "Pedido" },
  { key: "cambio", label: "Cambio" },
  { key: "consulta", label: "Consulta" },
  { key: "mantenimiento", label: "Mantenimiento" },
] as const;

const PRIORIDADES = ["critica", "alta", "media", "baja"] as const;

const CATEGORIAS = ["Red", "PC", "Impresora", "Accesos", "Correo", "Servidor", "Otro"];

const PRIORIDAD_STYLE: Record<string, string> = {
  baja: "bg-muted text-muted-foreground",
  media: "bg-primary/15 text-primary",
  alta: "bg-chart-5/20 text-chart-5",
  critica: "bg-destructive/15 text-destructive",
};

const ESTADO_STYLE: Record<string, string> = {
  nuevo: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  asignado: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  en_curso: "bg-primary/15 text-primary",
  esperando: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  resuelto: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  cerrado: "bg-muted text-muted-foreground",
  cancelado: "bg-muted text-muted-foreground line-through",
};

type Cola = "abiertos" | "mios" | "sin_asignar" | "criticos" | "cerrados" | "todos";

function ticketLabel(t: Ticket) {
  return t.numero != null ? `TK-${t.numero}` : t.id.slice(0, 8);
}

function isClosed(estado: string) {
  return ["cerrado", "cancelado", "resuelto"].includes(estado);
}

function TicketsPage() {
  const { canWrite, user, profile } = useAuth();
  const qc = useQueryClient();
  const [cola, setCola] = useState<Cola>("abiertos");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["tareas"],
    queryFn: async () => {
      const { data, error } = await api.from("tareas").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Ticket[];
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

  const filtered = useMemo(() => {
    let list = [...tickets];
    if (cola === "abiertos") list = list.filter((t) => !isClosed(t.estado));
    if (cola === "mios") list = list.filter((t) => t.asignado_a === user?.id && !isClosed(t.estado));
    if (cola === "sin_asignar") list = list.filter((t) => !t.asignado_a && !isClosed(t.estado));
    if (cola === "criticos")
      list = list.filter((t) => t.prioridad === "critica" && !isClosed(t.estado));
    if (cola === "cerrados") list = list.filter((t) => isClosed(t.estado));

    const term = q.trim().toLowerCase();
    if (term) {
      list = list.filter((t) =>
        [ticketLabel(t), t.titulo, t.descripcion, t.sector, t.categoria, t.solicitante_nombre, t.tipo]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      );
    }

    const prioRank = (p: string) => PRIORIDADES.indexOf(p as (typeof PRIORIDADES)[number]);
    list.sort((a, b) => {
      const pa = prioRank(a.prioridad);
      const pb = prioRank(b.prioridad);
      if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
      return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
    });
    return list;
  }, [tickets, cola, q, user?.id]);

  const selected = tickets.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  const counts = useMemo(
    () => ({
      abiertos: tickets.filter((t) => !isClosed(t.estado)).length,
      mios: tickets.filter((t) => t.asignado_a === user?.id && !isClosed(t.estado)).length,
      sin_asignar: tickets.filter((t) => !t.asignado_a && !isClosed(t.estado)).length,
      criticos: tickets.filter((t) => t.prioridad === "critica" && !isClosed(t.estado)).length,
      cerrados: tickets.filter((t) => isClosed(t.estado)).length,
      todos: tickets.length,
    }),
    [tickets, user?.id],
  );

  const refetch = () => qc.invalidateQueries({ queryKey: ["tareas"] });

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        title="Tickets"
        description="Mesa de sistemas: cola de incidentes y pedidos internos."
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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar TK-…, título, sector…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["abiertos", "Abiertos"],
              ["mios", "Míos"],
              ["sin_asignar", "Sin asignar"],
              ["criticos", "Críticos"],
              ["cerrados", "Cerrados"],
              ["todos", "Todos"],
            ] as const
          ).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={cola === key ? "default" : "outline"}
              onClick={() => setCola(key)}
            >
              {label}
              <Badge variant="secondary" className="ml-1.5 tabular-nums">
                {counts[key]}
              </Badge>
            </Button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
        {/* Queue */}
        <Card className="panel flex max-h-[70vh] flex-col overflow-hidden lg:max-h-[calc(100vh-12rem)]">
          <CardContent className="flex min-h-0 flex-1 flex-col p-0">
            <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Cola · {filtered.length}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {isLoading && (
                <p className="p-6 text-center text-sm text-muted-foreground">Cargando…</p>
              )}
              {!isLoading && filtered.length === 0 && (
                <div className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
                  <Ticket className="size-8 opacity-50" />
                  <p className="text-sm">No hay tickets en esta vista.</p>
                </div>
              )}
              {filtered.map((t) => {
                const active = selected?.id === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={cn(
                      "w-full border-b border-border px-3 py-3 text-left transition-colors",
                      active ? "bg-accent/60" : "hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {ticketLabel(t)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          PRIORIDAD_STYLE[t.prioridad] ?? PRIORIDAD_STYLE.media,
                        )}
                      >
                        {t.prioridad}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm font-medium leading-snug">{t.titulo}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                          ESTADO_STYLE[t.estado] ?? "bg-muted text-muted-foreground",
                        )}
                      >
                        {ESTADOS.find((e) => e.key === t.estado)?.label ?? t.estado.replace(/_/g, " ")}
                      </span>
                      {t.tipo && (
                        <span className="text-[10px] capitalize text-muted-foreground">{t.tipo}</span>
                      )}
                      <span className="ml-auto truncate text-[11px] text-muted-foreground">
                        {nombre(t.asignado_a)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Detail */}
        <Card className="panel min-h-[420px] overflow-hidden">
          <CardContent className="p-0">
            {selected ? (
              <TicketDetail
                ticket={selected}
                perfiles={perfiles}
                canWrite={canWrite}
                userId={user?.id}
                isAdmin={false}
                onRefresh={refetch}
              />
            ) : (
              <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 text-muted-foreground">
                <CircleDot className="size-8 opacity-40" />
                <p className="text-sm">Seleccioná un ticket de la cola</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TicketDetail({
  ticket,
  perfiles,
  canWrite,
  userId,
  onRefresh,
}: {
  ticket: Ticket;
  perfiles: { id: string; full_name: string }[];
  canWrite: boolean;
  userId?: string;
  isAdmin: boolean;
  onRefresh: () => void;
}) {
  const { isAdmin } = useAuth();
  const [comentario, setComentario] = useState("");
  const [nuevaSub, setNuevaSub] = useState("");
  const [resolucionDraft, setResolucionDraft] = useState(ticket.resolucion ?? "");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [docVinculo, setDocVinculo] = useState("");

  const { data: subtareas = [] } = useQuery({
    queryKey: ["subtareas", ticket.id],
    queryFn: async () => {
      const { data } = await api
        .from("tarea_subtareas")
        .select("*")
        .eq("tarea_id", ticket.id)
        .order("created_at");
      return (data ?? []) as { id: string; titulo: string; hecha: boolean }[];
    },
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ["comentarios", ticket.id],
    queryFn: async () => {
      const { data } = await api
        .from("tarea_comentarios")
        .select("*")
        .eq("tarea_id", ticket.id)
        .order("created_at");
      return (data ?? []) as {
        id: string;
        contenido: string;
        autor_id: string;
        created_at: string;
      }[];
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["wiki_docs_min"],
    queryFn: async () => {
      const { data } = await api.from("wiki_docs").select("id, title").order("title");
      return (data ?? []) as { id: string; title: string }[];
    },
  });

  const { data: vinculados = [] } = useQuery({
    queryKey: ["tarea_instructivos", ticket.id],
    queryFn: async () => {
      const { data } = await api
        .from("tarea_instructivos")
        .select("doc_id")
        .eq("tarea_id", ticket.id);
      return (data ?? []).map((r) => r.doc_id as string);
    },
  });

  const qc = useQueryClient();
  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.full_name ?? "Usuario";
  const hechas = subtareas.filter((s) => s.hecha).length;
  const progreso = subtareas.length ? Math.round((hechas / subtareas.length) * 100) : 0;

  const localRefetch = () => {
    qc.invalidateQueries({ queryKey: ["subtareas", ticket.id] });
    qc.invalidateQueries({ queryKey: ["comentarios", ticket.id] });
    qc.invalidateQueries({ queryKey: ["tarea_instructivos", ticket.id] });
    onRefresh();
  };

  const patch = async (values: Record<string, unknown>, okMsg?: string) => {
    const { error } = await api.from("tareas").update(values).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    if (okMsg) toast.success(okMsg);
    onRefresh();
  };

  const tomar = async () => {
    if (!userId) return;
    await patch({ asignado_a: userId, estado: "en_curso" }, "Ticket tomado");
  };

  const resolver = async () => {
    const text = resolucionDraft.trim();
    if (!text) return toast.error("Indicá la resolución");
    await patch(
      {
        resolucion: text,
        estado: "resuelto",
        resuelto_en: new Date().toISOString(),
      },
      "Ticket resuelto",
    );
    setResolveOpen(false);
  };

  const cerrar = async () => {
    await patch(
      {
        estado: "cerrado",
        cerrado_en: new Date().toISOString(),
        resolucion: resolucionDraft.trim() || ticket.resolucion,
      },
      "Ticket cerrado",
    );
  };

  return (
    <div className="flex max-h-[70vh] flex-col lg:max-h-[calc(100vh-12rem)]">
      <div className="border-b border-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{ticketLabel(ticket)}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                  ESTADO_STYLE[ticket.estado] ?? "bg-muted",
                )}
              >
                {ESTADOS.find((e) => e.key === ticket.estado)?.label ?? ticket.estado}
              </span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                  PRIORIDAD_STYLE[ticket.prioridad] ?? PRIORIDAD_STYLE.media,
                )}
              >
                {ticket.prioridad}
              </span>
              {ticket.tipo && (
                <Badge variant="outline" className="capitalize">
                  {ticket.tipo}
                </Badge>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold tracking-tight sm:text-xl">{ticket.titulo}</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {ticket.solicitante_nombre || nombre(ticket.solicitante_id)}
              {ticket.sector ? ` · ${ticket.sector}` : ""}
              {ticket.categoria ? ` · ${ticket.categoria}` : ""}
            </p>
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              {!ticket.asignado_a && (
                <Button size="sm" variant="secondary" onClick={tomar}>
                  <UserPlus className="size-4" /> Tomar
                </Button>
              )}
              {ticket.estado !== "resuelto" && ticket.estado !== "cerrado" && (
                <Button size="sm" onClick={() => setResolveOpen(true)}>
                  Resolver
                </Button>
              )}
              {ticket.estado === "resuelto" && (
                <Button size="sm" variant="outline" onClick={cerrar}>
                  Cerrar
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6 border-border p-4 sm:p-5 lg:border-r">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Descripción
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
              {ticket.descripcion || "Sin descripción."}
            </p>
          </div>

          {ticket.resolucion && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Resolución
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.resolucion}</p>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckSquare className="size-4" /> Pasos
              </p>
              <span className="text-xs text-muted-foreground">
                {hechas}/{subtareas.length}
                {subtareas.length ? ` · ${progreso}%` : ""}
              </span>
            </div>
            {subtareas.length > 0 && (
              <div className="mb-3 h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progreso}%` }}
                />
              </div>
            )}
            <div className="space-y-1">
              {subtareas.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40"
                >
                  <Checkbox
                    checked={s.hecha}
                    disabled={!canWrite}
                    onCheckedChange={async (v) => {
                      await api.from("tarea_subtareas").update({ hecha: !!v }).eq("id", s.id);
                      localRefetch();
                    }}
                  />
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      s.hecha && "text-muted-foreground line-through",
                    )}
                  >
                    {s.titulo}
                  </span>
                  {canWrite && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-7"
                      onClick={async () => {
                        await api.from("tarea_subtareas").delete().eq("id", s.id);
                        localRefetch();
                      }}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {canWrite && (
              <form
                className="mt-2 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!nuevaSub.trim()) return;
                  await api
                    .from("tarea_subtareas")
                    .insert({ tarea_id: ticket.id, titulo: nuevaSub.trim() });
                  setNuevaSub("");
                  localRefetch();
                }}
              >
                <Input
                  placeholder="Agregar paso…"
                  value={nuevaSub}
                  onChange={(e) => setNuevaSub(e.target.value)}
                />
                <Button type="submit" size="icon" variant="secondary">
                  <Plus className="size-4" />
                </Button>
              </form>
            )}
          </div>

          <div>
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <MessageSquare className="size-4" /> Comentarios
            </p>
            <div className="space-y-2">
              {comentarios.map((c) => (
                <div key={c.id} className="rounded-lg border border-border bg-card/50 p-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{nombre(c.autor_id)}</span>
                    <span>{new Date(c.created_at).toLocaleString("es-AR")}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.contenido}</p>
                </div>
              ))}
              {comentarios.length === 0 && (
                <p className="text-sm text-muted-foreground">Sin comentarios.</p>
              )}
            </div>
            <form
              className="mt-3 flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!comentario.trim() || !userId) return;
                const { error } = await api.from("tarea_comentarios").insert({
                  tarea_id: ticket.id,
                  autor_id: userId,
                  contenido: comentario.trim(),
                });
                if (error) return toast.error(error.message);
                setComentario("");
                localRefetch();
              }}
            >
              <Textarea
                rows={2}
                placeholder="Agregar comentario…"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
              <Button type="submit" size="icon" className="shrink-0">
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-4 bg-muted/20 p-4 sm:p-5">
          <div className="space-y-3 rounded-xl border border-border bg-card/80 p-3">
            <FieldLabel>Estado</FieldLabel>
            <Select
              value={ticket.estado}
              disabled={!canWrite}
              onValueChange={(v) => patch({ estado: v })}
            >
              <SelectTrigger>
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

            <FieldLabel>Prioridad</FieldLabel>
            <Select
              value={ticket.prioridad}
              disabled={!canWrite}
              onValueChange={(v) => patch({ prioridad: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p} className="capitalize">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <FieldLabel>Tipo</FieldLabel>
            <Select
              value={ticket.tipo || "pedido"}
              disabled={!canWrite}
              onValueChange={(v) => patch({ tipo: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <FieldLabel>Asignado</FieldLabel>
            <Select
              value={ticket.asignado_a ?? "none"}
              disabled={!canWrite}
              onValueChange={(v) =>
                patch({
                  asignado_a: v === "none" ? null : v,
                  estado:
                    v !== "none" && ticket.estado === "nuevo" ? "asignado" : ticket.estado,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin asignar</SelectItem>
                {perfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {ticket.vence_el && (
              <p className="flex items-center gap-1.5 pt-1 text-xs text-muted-foreground">
                <Clock3 className="size-3.5" />
                Vence {new Date(ticket.vence_el).toLocaleDateString("es-AR")}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card/80 p-3">
            <FieldLabel>Instructivos</FieldLabel>
            <div className="mt-2 space-y-1.5">
              {vinculados.map((id) => {
                const d = docs.find((x) => x.id === id);
                if (!d) return null;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <Link
                      to="/instructivos"
                      search={{ doc: id }}
                      className="flex-1 truncate text-sm text-primary hover:underline"
                    >
                      {d.title}
                    </Link>
                    {canWrite && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={async () => {
                          await api
                            .from("tarea_instructivos")
                            .delete()
                            .eq("tarea_id", ticket.id)
                            .eq("doc_id", id);
                          localRefetch();
                        }}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                );
              })}
              {vinculados.length === 0 && (
                <p className="text-sm text-muted-foreground">Ninguno vinculado.</p>
              )}
            </div>
            {canWrite && (
              <Select
                value={docVinculo}
                onValueChange={async (v) => {
                  setDocVinculo("");
                  const { error } = await api
                    .from("tarea_instructivos")
                    .insert({ tarea_id: ticket.id, doc_id: v });
                  if (error) return toast.error("Ya está vinculado");
                  localRefetch();
                }}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Vincular instructivo…" />
                </SelectTrigger>
                <SelectContent>
                  {docs
                    .filter((d) => !vinculados.includes(d.id))
                    .map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {isAdmin && (
            <Button
              variant="outline"
              className="w-full"
              onClick={async () => {
                await api.from("tareas").delete().eq("id", ticket.id);
                toast.success("Ticket eliminado");
                onRefresh();
              }}
            >
              <Trash2 className="size-4 text-destructive" /> Eliminar ticket
            </Button>
          )}
        </div>
      </div>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver {ticketLabel(ticket)}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nota de resolución</Label>
            <Textarea
              rows={4}
              placeholder="Qué se hizo para resolver el caso…"
              value={resolucionDraft}
              onChange={(e) => setResolucionDraft(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={resolver}>Marcar resuelto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </Label>
  );
}

function NuevoTicket({
  perfiles,
  userId,
  userName,
  onDone,
}: {
  perfiles: { id: string; full_name: string }[];
  userId?: string;
  userName?: string | null;
  onDone: (id?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [prioridad, setPrioridad] = useState("media");
  const [tipo, setTipo] = useState("pedido");
  const [asignado, setAsignado] = useState("none");
  const [categoria, setCategoria] = useState("Otro");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Nuevo ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nuevo ticket</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const asignadoId = asignado === "none" ? null : asignado;
            const { data, error } = await api.from("tareas").insert({
              titulo: String(fd.get("titulo")),
              descripcion: String(fd.get("descripcion") || ""),
              prioridad,
              tipo,
              categoria,
              sector: String(fd.get("sector") || "") || null,
              solicitante_nombre:
                String(fd.get("solicitante") || "") || userName || null,
              solicitante_id: userId ?? null,
              canal: "sistema",
              estado: asignadoId ? "asignado" : "nuevo",
              asignado_a: asignadoId,
              vence_el: String(fd.get("vence_el") || "") || null,
              created_by: userId ?? null,
            });
            if (error) return toast.error(error.message);
            toast.success("Ticket creado");
            setOpen(false);
            const id =
              data && typeof data === "object" && !Array.isArray(data)
                ? (data as { id?: string }).id
                : Array.isArray(data)
                  ? (data[0] as { id?: string })?.id
                  : undefined;
            onDone(id);
          }}
        >
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input name="titulo" required placeholder="Ej. Impresora 3er piso sin red" />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea name="descripcion" rows={3} placeholder="Detalle del problema o pedido…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORIDADES.map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Input name="sector" placeholder="Planta / oficina" />
            </div>
            <div className="space-y-1.5">
              <Label>Solicitante</Label>
              <Input name="solicitante" defaultValue={userName ?? ""} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <Label>Vence</Label>
              <Input name="vence_el" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Asignar a</Label>
            <Select value={asignado} onValueChange={setAsignado}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Cola (sin asignar)</SelectItem>
                {perfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit">Crear ticket</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
