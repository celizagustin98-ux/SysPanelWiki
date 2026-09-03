import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckSquare,
  Clock3,
  Inbox,
  MessageSquare,
  Plus,
  Search,
  Send,
  Ticket,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  alta: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  critica: "bg-destructive/15 text-destructive",
};

const PRIORIDAD_BAR: Record<string, string> = {
  baja: "bg-muted-foreground/40",
  media: "bg-primary",
  alta: "bg-amber-500",
  critica: "bg-destructive",
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
function tiempoRelativo(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "ahora";
  if (sec < 3600) return `hace ${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `hace ${Math.floor(sec / 3600)} h`;
  if (sec < 86400 * 7) return `hace ${Math.floor(sec / 86400)} d`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}
function estadoLabel(key: string) {
  return ESTADOS.find((e) => e.key === key)?.label ?? key.replace(/_/g, " ");
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
    if (cola === "criticos") list = list.filter((t) => t.prioridad === "critica" && !isClosed(t.estado));
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

  const selected = selectedId ? tickets.find((t) => t.id === selectedId) ?? null : null;

  useEffect(() => {
    if (selectedId && !tickets.some((t) => t.id === selectedId)) setSelectedId(null);
  }, [tickets, selectedId]);

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

  const filtrosPrincipales = [
    ["abiertos", "Abiertos"],
    ["mios", "Míos"],
    ["sin_asignar", "Sin asignar"],
    ["criticos", "Críticos"],
  ] as const;

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col">
      <PageHeader
        title="Tickets"
        description="Mesa de sistemas · cola de incidentes y pedidos internos"
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
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-9" placeholder="Buscar TK-…, título, sector…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {filtrosPrincipales.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCola(key)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                cola === key
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {label}
              <span className={cn("rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums", cola === key ? "bg-primary/15" : "bg-muted")}>
                {counts[key]}
              </span>
            </button>
          ))}
          <Select
            value={cola === "cerrados" || cola === "todos" ? cola : "__more"}
            onValueChange={(v) => {
              if (v === "cerrados" || v === "todos") setCola(v);
            }}
          >
            <SelectTrigger className="h-8 w-auto gap-1 border-border px-2.5 text-xs">
              <SelectValue placeholder="Más" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cerrados">Cerrados ({counts.cerrados})</SelectItem>
              <SelectItem value="todos">Todos ({counts.todos})</SelectItem>
              <SelectItem value="__more" disabled>
                Más vistas…
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-0 overflow-hidden rounded-xl border border-border/80 bg-card/40",
          selected ? "lg:grid-cols-[minmax(300px,420px)_1fr]" : "grid-cols-1",
        )}
      >
        <div className={cn("flex min-h-[50vh] flex-col border-border lg:min-h-[calc(100vh-13rem)]", selected && "hidden border-r lg:flex")}>
          <div className="flex items-center justify-between border-b border-border/70 px-4 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cola</p>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{filtered.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && (
              <div className="space-y-0">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="animate-pulse border-b border-border/50 px-4 py-3">
                    <div className="mb-2 h-3 w-16 rounded bg-muted" />
                    <div className="mb-2 h-4 w-3/4 rounded bg-muted" />
                    <div className="h-3 w-1/2 rounded bg-muted" />
                  </div>
                ))}
              </div>
            )}
            {!isLoading && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div className="grid size-12 place-items-center rounded-full bg-muted/60">
                  <Inbox className="size-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">No hay tickets en esta vista</p>
                  <p className="mt-1 text-xs text-muted-foreground">Cambiá el filtro o creá un ticket nuevo.</p>
                </div>
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
                    "group relative flex w-full gap-0 border-b border-border/50 text-left transition-colors",
                    active ? "bg-primary/[0.07]" : "hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "w-1 shrink-0 self-stretch",
                      PRIORIDAD_BAR[t.prioridad] ?? PRIORIDAD_BAR.media,
                      !active && "opacity-70 group-hover:opacity-100",
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
                      <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", ESTADO_STYLE[t.estado] ?? "bg-muted text-muted-foreground")}>
                        {estadoLabel(t.estado)}
                      </span>
                      {t.prioridad === "critica" && <span className="text-[10px] font-medium text-destructive">Crítica</span>}
                      {t.prioridad === "alta" && <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Alta</span>}
                      <span className="ml-auto truncate text-[11px] text-muted-foreground">{nombre(t.asignado_a)}</span>
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
              canWrite={canWrite}
              userId={user?.id}
              onRefresh={refetch}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : (
          <div className="hidden min-h-[calc(100vh-13rem)] flex-col items-center justify-center gap-3 text-muted-foreground lg:flex">
            <div className="grid size-14 place-items-center rounded-2xl border border-dashed border-border/80 bg-muted/20">
              <Ticket className="size-6 opacity-40" />
            </div>
            <p className="text-sm font-medium text-foreground/80">Seleccioná un ticket</p>
            <p className="max-w-xs text-center text-xs text-muted-foreground">
              La cola muestra el trabajo pendiente. Al hacer click se abre el detalle.
            </p>
          </div>
        )}
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
  onClose,
}: {
  ticket: Ticket;
  perfiles: { id: string; full_name: string }[];
  canWrite: boolean;
  userId?: string;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const [comentario, setComentario] = useState("");
  const [nuevaSub, setNuevaSub] = useState("");
  const [resolucionDraft, setResolucionDraft] = useState(ticket.resolucion ?? "");
  const [resolveOpen, setResolveOpen] = useState(false);
  const [docVinculo, setDocVinculo] = useState("");

  useEffect(() => {
    setResolucionDraft(ticket.resolucion ?? "");
    setComentario("");
    setNuevaSub("");
  }, [ticket.id, ticket.resolucion]);

  const { data: subtareas = [] } = useQuery({
    queryKey: ["subtareas", ticket.id],
    queryFn: async () => {
      const { data } = await api.from("tarea_subtareas").select("*").eq("tarea_id", ticket.id).order("created_at");
      return (data ?? []) as { id: string; titulo: string; hecha: boolean }[];
    },
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ["comentarios", ticket.id],
    queryFn: async () => {
      const { data } = await api.from("tarea_comentarios").select("*").eq("tarea_id", ticket.id).order("created_at");
      return (data ?? []) as { id: string; contenido: string; autor_id: string; created_at: string }[];
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
      const { data } = await api.from("tarea_instructivos").select("doc_id").eq("tarea_id", ticket.id);
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
    await patch({ resolucion: text, estado: "resuelto", resuelto_en: new Date().toISOString() }, "Ticket resuelto");
    setResolveOpen(false);
  };

  const cerrar = async () => {
    await patch({
      estado: "cerrado",
      cerrado_en: new Date().toISOString(),
      resolucion: resolucionDraft.trim() || ticket.resolucion,
    }, "Ticket cerrado");
  };

  return (
    <div className="flex h-full max-h-[calc(100vh-13rem)] flex-col">
      <div className="sticky top-0 z-10 border-b border-border/70 bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-5">
        <div className="flex items-start gap-3">
          <Button type="button" size="icon" variant="ghost" className="mt-0.5 size-8 shrink-0 lg:hidden" onClick={onClose} title="Volver a la cola">
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-muted-foreground">{ticketLabel(ticket)}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium", ESTADO_STYLE[ticket.estado] ?? "bg-muted")}>
                {estadoLabel(ticket.estado)}
              </span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize", PRIORIDAD_STYLE[ticket.prioridad] ?? PRIORIDAD_STYLE.media)}>
                {ticket.prioridad}
              </span>
              {ticket.tipo && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">{ticket.tipo}</Badge>
              )}
            </div>
            <h2 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">{ticket.titulo}</h2>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {canWrite && !ticket.asignado_a && (
              <Button size="sm" variant="secondary" className="h-8" onClick={tomar}>
                <UserPlus className="size-3.5" /> Tomar
              </Button>
            )}
            {canWrite && ticket.estado !== "resuelto" && ticket.estado !== "cerrado" && (
              <Button size="sm" className="h-8" onClick={() => setResolveOpen(true)}>Resolver</Button>
            )}
            {canWrite && ticket.estado === "resuelto" && (
              <Button size="sm" variant="outline" className="h-8" onClick={cerrar}>Cerrar</Button>
            )}
            <Button type="button" size="icon" variant="ghost" className="hidden size-8 lg:inline-flex" onClick={onClose} title="Cerrar detalle">
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid gap-0 lg:grid-cols-[1.4fr_minmax(240px,0.9fr)]">
          <div className="space-y-6 border-border p-4 sm:p-5 lg:border-r">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 text-sm sm:grid-cols-3">
              <MetaItem label="Solicitante">{ticket.solicitante_nombre || nombre(ticket.solicitante_id)}</MetaItem>
              <MetaItem label="Sector">{ticket.sector || "—"}</MetaItem>
              <MetaItem label="Categoría">{ticket.categoria || "—"}</MetaItem>
              <MetaItem label="Asignado">{nombre(ticket.asignado_a)}</MetaItem>
              <MetaItem label="Actualizado">{tiempoRelativo(ticket.updated_at ?? ticket.created_at)}</MetaItem>
              <MetaItem label="Vence">{ticket.vence_el ? new Date(ticket.vence_el).toLocaleDateString("es-AR") : "—"}</MetaItem>
            </div>

            <section>
              <SectionTitle>Descripción</SectionTitle>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {ticket.descripcion || "Sin descripción."}
              </p>
            </section>

            {ticket.resolucion && (
              <section className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Resolución</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{ticket.resolucion}</p>
              </section>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <SectionTitle icon={<CheckSquare className="size-3.5" />}>Pasos</SectionTitle>
                <span className="text-xs text-muted-foreground">{hechas}/{subtareas.length}{subtareas.length ? ` · ${progreso}%` : ""}</span>
              </div>
              {subtareas.length > 0 && (
                <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progreso}%` }} />
                </div>
              )}
              <div className="space-y-0.5">
                {subtareas.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-muted/50">
                    <Checkbox
                      checked={s.hecha}
                      disabled={!canWrite}
                      onCheckedChange={async (v) => {
                        await api.from("tarea_subtareas").update({ hecha: !!v }).eq("id", s.id);
                        localRefetch();
                      }}
                    />
                    <span className={cn("flex-1 text-sm", s.hecha && "text-muted-foreground line-through")}>{s.titulo}</span>
                    {canWrite && (
                      <Button size="icon" variant="ghost" className="size-7 opacity-60 hover:opacity-100" onClick={async () => {
                        await api.from("tarea_subtareas").delete().eq("id", s.id);
                        localRefetch();
                      }}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {canWrite && (
                <form className="mt-2 flex gap-2" onSubmit={async (e) => {
                  e.preventDefault();
                  if (!nuevaSub.trim()) return;
                  await api.from("tarea_subtareas").insert({ tarea_id: ticket.id, titulo: nuevaSub.trim() });
                  setNuevaSub("");
                  localRefetch();
                }}>
                  <Input className="h-8" placeholder="Agregar paso…" value={nuevaSub} onChange={(e) => setNuevaSub(e.target.value)} />
                  <Button type="submit" size="icon" variant="secondary" className="size-8 shrink-0"><Plus className="size-4" /></Button>
                </form>
              )}
            </section>

            <section>
              <SectionTitle icon={<MessageSquare className="size-3.5" />}>Actividad</SectionTitle>
              <div className="mt-3 space-y-3">
                {comentarios.map((c) => (
                  <div key={c.id} className="relative pl-4">
                    <span className="absolute left-0 top-2 size-2 rounded-full bg-primary/50" />
                    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{nombre(c.autor_id)}</span>
                        <span>{tiempoRelativo(c.created_at)}</span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{c.contenido}</p>
                    </div>
                  </div>
                ))}
                {comentarios.length === 0 && <p className="text-sm text-muted-foreground">Sin comentarios todavía.</p>}
              </div>
              {canWrite && (
                <form className="mt-3 flex gap-2" onSubmit={async (e) => {
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
                }}>
                  <Textarea rows={2} className="min-h-[64px] resize-none" placeholder="Escribí un comentario…" value={comentario} onChange={(e) => setComentario(e.target.value)} />
                  <Button type="submit" size="icon" className="size-9 shrink-0 self-end"><Send className="size-4" /></Button>
                </form>
              )}
            </section>
          </div>

          <div className="space-y-4 bg-muted/15 p-4 sm:p-5">
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Propiedades</p>
              <PropField label="Estado">
                <Select value={ticket.estado} disabled={!canWrite} onValueChange={(v) => patch({ estado: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{ESTADOS.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}</SelectContent>
                </Select>
              </PropField>
              <PropField label="Prioridad">
                <Select value={ticket.prioridad} disabled={!canWrite} onValueChange={(v) => patch({ prioridad: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </PropField>
              <PropField label="Tipo">
                <Select value={ticket.tipo || "pedido"} disabled={!canWrite} onValueChange={(v) => patch({ tipo: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </PropField>
              <PropField label="Asignado">
                <Select
                  value={ticket.asignado_a ?? "none"}
                  disabled={!canWrite}
                  onValueChange={(v) =>
                    patch({
                      asignado_a: v === "none" ? null : v,
                      estado: v !== "none" && ticket.estado === "nuevo" ? "asignado" : ticket.estado,
                    })
                  }
                >
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {perfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </PropField>
              {ticket.vence_el && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock3 className="size-3.5" /> Vence {new Date(ticket.vence_el).toLocaleDateString("es-AR")}
                </p>
              )}
            </div>

            <div className="space-y-2 border-t border-border/60 pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Instructivos</p>
              <div className="space-y-1">
                {vinculados.map((id) => {
                  const d = docs.find((x) => x.id === id);
                  if (!d) return null;
                  return (
                    <div key={id} className="flex items-center gap-1">
                      <Link to="/instructivos" search={{ doc: id }} className="flex-1 truncate text-sm text-primary hover:underline">{d.title}</Link>
                      {canWrite && (
                        <Button size="icon" variant="ghost" className="size-7" onClick={async () => {
                          await api.from("tarea_instructivos").delete().eq("tarea_id", ticket.id).eq("doc_id", id);
                          localRefetch();
                        }}>
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {vinculados.length === 0 && <p className="text-xs text-muted-foreground">Ninguno vinculado.</p>}
              </div>
              {canWrite && (
                <Select value={docVinculo} onValueChange={async (v) => {
                  setDocVinculo("");
                  const { error } = await api.from("tarea_instructivos").insert({ tarea_id: ticket.id, doc_id: v });
                  if (error) return toast.error("Ya está vinculado");
                  localRefetch();
                }}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Vincular…" /></SelectTrigger>
                  <SelectContent>
                    {docs.filter((d) => !vinculados.includes(d.id)).map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {isAdmin && (
              <Button variant="outline" size="sm" className="w-full" onClick={async () => {
                if (!confirm("¿Eliminar este ticket?")) return;
                await api.from("tareas").delete().eq("id", ticket.id);
                toast.success("Ticket eliminado");
                onClose();
                onRefresh();
              }}>
                <Trash2 className="size-3.5 text-destructive" /> Eliminar
              </Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolver {ticketLabel(ticket)}</DialogTitle>
            <DialogDescription>Registrá qué se hizo para cerrar el caso.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nota de resolución</Label>
            <Textarea rows={4} placeholder="Qué se hizo para resolver el caso…" value={resolucionDraft} onChange={(e) => setResolucionDraft(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancelar</Button>
            <Button onClick={resolver}>Marcar resuelto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{children}</p>
    </div>
  );
}

function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {icon}{children}
    </p>
  );
}

function PropField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
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
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={(o) => {
      setOpen(o);
      if (o) {
        setPrioridad("media");
        setTipo("pedido");
        setAsignado("none");
        setCategoria("Otro");
      }
    }}>
      <DialogTrigger asChild>
        <Button><Plus className="size-4" /> Nuevo ticket</Button>
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>Nuevo ticket</DialogTitle>
          <DialogDescription>Registrá un incidente o pedido interno.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5 px-5 py-4" onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const fd = new FormData(e.currentTarget);
          const titulo = String(fd.get("titulo") || "").trim();
          if (titulo.length < 3) return toast.error("Ingresá un título claro");
          const asignadoId = asignado === "none" ? null : asignado;
          setSaving(true);
          const { data, error } = await api.from("tareas").insert({
            titulo,
            descripcion: String(fd.get("descripcion") || ""),
            prioridad,
            tipo,
            categoria,
            sector: String(fd.get("sector") || "") || null,
            solicitante_nombre: String(fd.get("solicitante") || "") || userName || null,
            solicitante_id: userId ?? null,
            canal: "sistema",
            estado: asignadoId ? "asignado" : "nuevo",
            asignado_a: asignadoId,
            vence_el: String(fd.get("vence_el") || "") || null,
            created_by: userId ?? null,
          });
          setSaving(false);
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
        }}>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qué pasa</p>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input name="titulo" required placeholder="Ej. Impresora 3er piso sin red" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea name="descripcion" rows={3} placeholder="Detalle del problema o pedido…" />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clasificación</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select value={prioridad} onValueChange={setPrioridad}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sector</Label>
                <Input name="sector" placeholder="Planta / oficina" />
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contexto</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Solicitante</Label>
                <Input name="solicitante" defaultValue={userName ?? ""} placeholder="Nombre" />
              </div>
              <div className="space-y-1.5">
                <Label>Vence</Label>
                <Input name="vence_el" type="date" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Asignar a</Label>
                <Select value={asignado} onValueChange={setAsignado}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cola (sin asignar)</SelectItem>
                    {perfiles.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-border/70 pt-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creando…" : "Crear ticket"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
