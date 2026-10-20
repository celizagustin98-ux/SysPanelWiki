import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  CheckSquare,
  Clock3,
  Flag,
  MessageSquare,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { Boxes, Paperclip } from "lucide-react";
import { Adjuntos } from "@/components/Adjuntos";
import { ActivoPicker } from "@/components/activos/ActivoPicker";
import { useAuth } from "@/lib/auth";
import { cn, formatFecha } from "@/lib/utils";
import {
  ESTADOS,
  FLUJO,
  PRIORIDAD_STYLE,
  PRIORIDADES,
  TIPOS,
  type Ticket,
  estadoLabel,
  ticketLabel,
  tiempoRelativo,
} from "./constants";

export function TicketDetail({
  ticket,
  perfiles,
  canWrite,
  userId,
  onRefresh,
  onClose,
  onReopen,
}: {
  ticket: Ticket;
  perfiles: { id: string; full_name: string }[];
  canWrite: boolean;
  userId?: string;
  onRefresh: () => void;
  onClose: () => void;
  onReopen?: () => void;
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

  /** Cambia el estado y deja constancia en la actividad del ticket. */
  const cambiarEstado = async (estado: string, extra: Record<string, unknown> = {}, okMsg?: string) => {
    const { error } = await api.from("tareas").update({ estado, ...extra }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    if (userId) {
      await api.from("tarea_comentarios").insert({
        tarea_id: ticket.id,
        autor_id: userId,
        contenido: `${MARCA_SISTEMA}${estadoLabel(ticket.estado)} → ${estadoLabel(estado)}`,
      });
    }
    toast.success(okMsg ?? `Ticket en "${estadoLabel(estado)}"`);
    localRefetch();
  };

  const tomar = async () => {
    if (!userId) return;
    await cambiarEstado("asignado", { asignado_a: userId }, "Ticket asignado a vos");
  };

  const resolver = async () => {
    const text = resolucionDraft.trim();
    if (!text) return toast.error("Indicá la resolución");
    await cambiarEstado("resuelto", { resolucion: text, resuelto_en: new Date().toISOString() }, "Ticket resuelto");
    setResolveOpen(false);
  };

  const cerrar = async () => {
    await cambiarEstado(
      "cerrado",
      { cerrado_en: new Date().toISOString(), resolucion: resolucionDraft.trim() || ticket.resolucion },
      "Ticket terminado",
    );
  };

  // El paso siguiente según el estado: un botón principal y, si aplica, uno secundario.
  const abierto = !["resuelto", "cerrado", "cancelado"].includes(ticket.estado);
  const pasos: { label: string; icon: ReactNode; onClick: () => void; variante?: "outline" | "secondary" }[] = [];
  if (canWrite) {
    if (ticket.estado === "nuevo" && !ticket.asignado_a) pasos.push({ label: "Tomar ticket", icon: <UserPlus />, onClick: () => void tomar() });
    if (ticket.estado === "nuevo" && ticket.asignado_a) pasos.push({ label: "Pasar a asignado", icon: <UserPlus />, onClick: () => void cambiarEstado("asignado") });
    if (ticket.estado === "asignado") pasos.push({ label: "Empezar a trabajar", icon: <Play />, onClick: () => void cambiarEstado("en_curso", ticket.asignado_a ? {} : { asignado_a: userId }) });
    if (ticket.estado === "en_curso") {
      pasos.push({ label: "Marcar resuelto", icon: <CheckCircle2 />, onClick: () => setResolveOpen(true) });
      pasos.push({ label: "Poner en espera", icon: <Pause />, onClick: () => void cambiarEstado("esperando"), variante: "outline" });
    }
    if (ticket.estado === "esperando") {
      pasos.push({ label: "Retomar", icon: <Play />, onClick: () => void cambiarEstado("en_curso") });
      pasos.push({ label: "Marcar resuelto", icon: <CheckCircle2 />, onClick: () => setResolveOpen(true), variante: "outline" });
    }
    if (ticket.estado === "resuelto") {
      pasos.push({ label: "Terminar ticket", icon: <Flag />, onClick: () => void cerrar() });
      pasos.push({ label: "Volver a trabajar", icon: <RotateCcw />, onClick: () => void cambiarEstado("en_curso"), variante: "outline" });
    }
    if ((ticket.estado === "cerrado" || ticket.estado === "cancelado") && onReopen) pasos.push({ label: "Reabrir", icon: <RotateCcw />, onClick: onReopen, variante: "secondary" });
    if (abierto && ticket.estado !== "nuevo" && ticket.estado !== "asignado" && !ticket.asignado_a)
      pasos.push({ label: "Tomar", icon: <UserPlus />, onClick: () => void patch({ asignado_a: userId }, "Ticket asignado a vos"), variante: "outline" });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border/70 bg-card px-5 pb-4 pt-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-primary">{ticketLabel(ticket)}</span>
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize", PRIORIDAD_STYLE[ticket.prioridad] ?? PRIORIDAD_STYLE.media)}>
                Prioridad {ticket.prioridad}
              </span>
              {ticket.tipo && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                  {ticket.tipo}
                </Badge>
              )}
              {ticket.canal === "qr" && (
                <Badge variant="info" className="h-5 px-1.5 text-[10px]">
                  Reportado por QR
                </Badge>
              )}
            </div>
            <h2 className="mt-1.5 text-lg font-semibold leading-snug tracking-tight sm:text-xl">{ticket.titulo}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {ticket.solicitante_nombre || nombre(ticket.solicitante_id)}
              {ticket.sector ? ` · ${ticket.sector}` : ""} · creado {tiempoRelativo(ticket.created_at ?? null)}
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" className="size-9 shrink-0" onClick={onClose} title="Cerrar" aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </div>

        <FlujoTicket estado={ticket.estado} />

        {pasos.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pasos.map((p, k) => (
              <Button key={p.label} size={k === 0 ? "default" : "sm"} variant={p.variante ?? "default"} className={cn(k === 0 && "h-10 px-5")} onClick={p.onClick}>
                {p.icon} {p.label}
              </Button>
            ))}
            {ticket.asignado_a && (
              <span className="ml-auto text-xs text-muted-foreground">
                A cargo de <span className="font-medium text-foreground">{nombre(ticket.asignado_a)}</span>
              </span>
            )}
          </div>
        )}
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
              <MetaItem label="Vence">{formatFecha(ticket.vence_el)}</MetaItem>
            </div>

            <section>
              <SectionTitle>Descripción</SectionTitle>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {ticket.descripcion || "Sin descripción."}
              </p>
            </section>

            {ticket.resolucion && (
              <section className="rounded-lg border border-ok/25 bg-ok/9 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ok ">Resolución</p>
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
                {comentarios.map((c) =>
                  c.contenido.startsWith(MARCA_SISTEMA) ? (
                    <div key={c.id} className="relative flex items-center gap-2 pl-4 text-xs text-muted-foreground">
                      <span className="absolute left-0 top-1/2 size-2 -translate-y-1/2 rounded-full bg-muted-foreground/40" />
                      <span className="font-medium text-foreground/80">{nombre(c.autor_id)}</span>
                      <span>{c.contenido.slice(MARCA_SISTEMA.length)}</span>
                      <span className="ml-auto shrink-0">{tiempoRelativo(c.created_at)}</span>
                    </div>
                  ) : (
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
                  ),
                )}
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
                <Select value={ticket.estado} disabled={!canWrite} onValueChange={(v) => void cambiarEstado(v)}>
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
                  <Clock3 className="size-3.5" /> Vence {formatFecha(ticket.vence_el)}
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
                      <Link to="/instructivos" search={{ doc: id as string, folder: undefined }} className="flex-1 truncate text-sm text-primary hover:underline">{d.title}</Link>
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

            <div className="space-y-2">
              <SectionTitle icon={<Boxes className="size-3.5" />}>Equipo</SectionTitle>
              {canWrite ? (
                <ActivoPicker value={ticket.activo_id ?? null} onChange={(id) => void patch({ activo_id: id }, id ? "Equipo vinculado" : "Equipo desvinculado")} />
              ) : (
                <p className="text-xs text-muted-foreground">{ticket.activo_id ? "Vinculado a un activo" : "Sin equipo vinculado."}</p>
              )}
              {ticket.activo_id && (
                <Link to="/inventario" search={{ item: ticket.activo_id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  Ver planilla técnica del equipo →
                </Link>
              )}
            </div>

            <div className="space-y-2">
              <SectionTitle icon={<Paperclip className="size-3.5" />}>Adjuntos</SectionTitle>
              <Adjuntos entidad="ticket" entidadId={ticket.id} canEdit={canWrite} compacto />
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

/** Prefijo de los comentarios automáticos de cambio de estado. */
const MARCA_SISTEMA = "↻ ";

const PASOS_FLUJO: { key: string; label: string }[] = FLUJO.map((k) => ({ key: k, label: estadoLabel(k) }));

/** Barra de progreso del ticket: Pendiente → Asignado → Trabajando → Resuelto → Terminado. */
function FlujoTicket({ estado }: { estado: string }) {
  const cancelado = estado === "cancelado";
  const idx = estado === "esperando" ? FLUJO.indexOf("en_curso") : FLUJO.indexOf(estado as (typeof FLUJO)[number]);
  return (
    <ol className="mt-4 grid grid-cols-5 gap-1.5" aria-label="Progreso del ticket">
      {PASOS_FLUJO.map((p, i) => {
        const hecho = !cancelado && i < idx;
        const actual = !cancelado && i === idx;
        const label = actual && estado === "esperando" ? "En espera" : p.label;
        return (
          <li key={p.key} className="min-w-0" aria-current={actual ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors duration-500",
                hecho ? "bg-ok" : actual ? (estado === "esperando" ? "bg-warn" : "bg-primary") : "bg-muted",
              )}
            />
            <p
              className={cn(
                "mt-1.5 flex items-center gap-1 truncate text-[11px]",
                actual ? "font-semibold text-foreground" : hecho ? "text-ok" : "text-muted-foreground",
              )}
            >
              {hecho && <CheckCircle2 className="size-3 shrink-0" />}
              {label}
            </p>
          </li>
        );
      })}
      {cancelado && <p className="col-span-5 text-xs text-muted-foreground">Ticket cancelado.</p>}
    </ol>
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
