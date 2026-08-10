import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  KanbanSquare,
  ListTodo,
  MessageSquare,
  Plus,
  Send,
  Trash2,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/tareas")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tareas | Gestión Kanban" },
      { name: "description", content: "Tablero Kanban y listado de tareas con subtareas, comentarios e instructivos vinculados." },
      { property: "og:title", content: "Tareas | Tablero operativo" },
      { property: "og:description", content: "Seguimiento de trabajo con checklists, chat interno y prioridades." },
    ],
  }),
  component: TareasPage,
});

type Tarea = {
  id: string;
  titulo: string;
  descripcion: string | null;
  estado: string;
  prioridad: string;
  etiquetas: string[];
  asignado_a: string | null;
  vence_el: string | null;
  estimacion_horas: number | null;
};

const COLUMNAS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "en_progreso", label: "En progreso" },
  { key: "en_revision", label: "En revisión" },
  { key: "completada", label: "Completada" },
];

const PRIORIDAD_STYLE: Record<string, string> = {
  baja: "bg-muted text-muted-foreground",
  media: "bg-primary/15 text-primary",
  alta: "bg-chart-5/20 text-chart-5",
  critica: "bg-destructive/15 text-destructive",
};

function TareasPage() {
  const { canWrite, user } = useAuth();
  const qc = useQueryClient();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("todas");

  const { data: tareas = [] } = useQuery({
    queryKey: ["tareas"],
    queryFn: async () => {
      const { data, error } = await api.from("tareas").select("*").order("orden");
      if (error) throw error;
      return data as Tarea[];
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

  const visibles = tareas.filter((t) =>
    filtro === "todas" ? true : filtro === "mias" ? t.asignado_a === user?.id : t.prioridad === filtro,
  );

  const mover = async (id: string, estado: string) => {
    const { error } = await api.from("tareas").update({ estado }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tareas"] });
  };

  return (
    <div>
      <PageHeader
        title="Tareas"
        description="Tablero Kanban y listado con detalle completo, checklists y chat por tarea."
        action={
          <div className="flex items-center gap-2">
            <Select value={filtro} onValueChange={setFiltro}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="mias">Mis tareas</SelectItem>
                <SelectItem value="critica">Críticas</SelectItem>
                <SelectItem value="alta">Alta prioridad</SelectItem>
              </SelectContent>
            </Select>
            {canWrite && (
              <NuevaTarea
                perfiles={perfiles}
                userId={user?.id}
                onDone={() => qc.invalidateQueries({ queryKey: ["tareas"] })}
              />
            )}
          </div>
        }
      />

      <Tabs defaultValue="kanban">
        <TabsList className="mb-4">
          <TabsTrigger value="kanban">
            <KanbanSquare className="size-4" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="lista">
            <ListTodo className="size-4" /> Lista
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNAS.map((col) => {
              const items = visibles.filter((t) => t.estado === col.key);
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const id = e.dataTransfer.getData("text/plain");
                    if (id && canWrite) mover(id, col.key);
                  }}
                  className="rounded-xl border border-border bg-card/40 p-3"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">{col.label}</p>
                    <Badge variant="secondary">{items.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {items.map((t) => (
                      <button
                        key={t.id}
                        draggable={canWrite}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                        onClick={() => setAbierta(t.id)}
                        className="w-full rounded-lg border border-border bg-card p-3 text-left transition hover:border-primary/50 hover:shadow-md"
                      >
                        <p className="text-sm font-medium">{t.titulo}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                              PRIORIDAD_STYLE[t.prioridad] ?? PRIORIDAD_STYLE.media,
                            )}
                          >
                            {t.prioridad}
                          </span>
                          {t.vence_el && (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <CalendarDays className="size-3" />
                              {new Date(t.vence_el).toLocaleDateString("es-AR")}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 truncate text-[11px] text-muted-foreground">
                          {nombre(t.asignado_a)}
                        </p>
                      </button>
                    ))}
                    {items.length === 0 && (
                      <p className="py-6 text-center text-xs text-muted-foreground">Sin tareas</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="lista">
          <Card className="panel">
            <CardContent className="overflow-x-auto p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tarea</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Vence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((t) => (
                    <TableRow
                      key={t.id}
                      className="cursor-pointer"
                      onClick={() => setAbierta(t.id)}
                    >
                      <TableCell className="font-medium">{t.titulo}</TableCell>
                      <TableCell className="capitalize">{t.estado.replace("_", " ")}</TableCell>
                      <TableCell className="capitalize">{t.prioridad}</TableCell>
                      <TableCell>{nombre(t.asignado_a)}</TableCell>
                      <TableCell>
                        {t.vence_el ? new Date(t.vence_el).toLocaleDateString("es-AR") : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibles.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                        No hay tareas para este filtro.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <DetalleTarea
        tarea={tareas.find((t) => t.id === abierta) ?? null}
        perfiles={perfiles}
        onClose={() => setAbierta(null)}
      />
    </div>
  );
}

function DetalleTarea({
  tarea,
  perfiles,
  onClose,
}: {
  tarea: Tarea | null;
  perfiles: { id: string; full_name: string }[];
  onClose: () => void;
}) {
  const { canWrite, user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [nuevaSub, setNuevaSub] = useState("");
  const [comentario, setComentario] = useState("");
  const [docVinculo, setDocVinculo] = useState("");

  const { data: subtareas = [] } = useQuery({
    queryKey: ["subtareas", tarea?.id],
    enabled: !!tarea,
    queryFn: async () => {
      const { data } = await api
        .from("tarea_subtareas")
        .select("*")
        .eq("tarea_id", tarea!.id)
        .order("created_at");
      return (data ?? []) as { id: string; titulo: string; hecha: boolean }[];
    },
  });

  const { data: comentarios = [] } = useQuery({
    queryKey: ["comentarios", tarea?.id],
    enabled: !!tarea,
    queryFn: async () => {
      const { data } = await api
        .from("tarea_comentarios")
        .select("*")
        .eq("tarea_id", tarea!.id)
        .order("created_at");
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
    queryKey: ["tarea_instructivos", tarea?.id],
    enabled: !!tarea,
    queryFn: async () => {
      const { data } = await api
        .from("tarea_instructivos")
        .select("doc_id")
        .eq("tarea_id", tarea!.id);
      return (data ?? []).map((r) => r.doc_id as string);
    },
  });

  if (!tarea) return null;
  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.full_name ?? "Usuario";
  const hechas = subtareas.filter((s) => s.hecha).length;
  const progreso = subtareas.length ? Math.round((hechas / subtareas.length) * 100) : 0;

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["subtareas", tarea.id] });
    qc.invalidateQueries({ queryKey: ["comentarios", tarea.id] });
    qc.invalidateQueries({ queryKey: ["tarea_instructivos", tarea.id] });
    qc.invalidateQueries({ queryKey: ["tareas"] });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6 text-xl">{tarea.titulo}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Descripción</Label>
              <p className="mt-1 whitespace-pre-wrap text-sm">
                {tarea.descripcion || "Sin descripción."}
              </p>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CheckSquare className="size-4" /> Subtareas
                </p>
                <span className="text-xs text-muted-foreground">
                  {hechas}/{subtareas.length} · {progreso}%
                </span>
              </div>
              <div className="mb-3 h-1.5 w-full rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progreso}%` }} />
              </div>
              <div className="space-y-1.5">
                {subtareas.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50">
                    <Checkbox
                      checked={s.hecha}
                      disabled={!canWrite}
                      onCheckedChange={async (v) => {
                        await api.from("tarea_subtareas").update({ hecha: !!v }).eq("id", s.id);
                        refetch();
                      }}
                    />
                    <span className={cn("flex-1 text-sm", s.hecha && "text-muted-foreground line-through")}>
                      {s.titulo}
                    </span>
                    {canWrite && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={async () => {
                          await api.from("tarea_subtareas").delete().eq("id", s.id);
                          refetch();
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
                      .insert({ tarea_id: tarea.id, titulo: nuevaSub.trim() });
                    setNuevaSub("");
                    refetch();
                  }}
                >
                  <Input
                    placeholder="Agregar subtarea…"
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
              <div className="space-y-3">
                {comentarios.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border bg-card/60 p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{nombre(c.autor_id)}</span>
                      <span>{new Date(c.created_at).toLocaleString("es-AR")}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{c.contenido}</p>
                  </div>
                ))}
                {comentarios.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin comentarios todavía.</p>
                )}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!comentario.trim() || !user) return;
                  const { error } = await api
                    .from("tarea_comentarios")
                    .insert({ tarea_id: tarea.id, autor_id: user.id, contenido: comentario.trim() });
                  if (error) return toast.error(error.message);
                  setComentario("");
                  refetch();
                }}
              >
                <Textarea
                  rows={2}
                  placeholder="Escribí un comentario…"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                />
                <Button type="submit" size="icon">
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border p-3">
              <Label className="text-xs uppercase text-muted-foreground">Estado</Label>
              <Select
                value={tarea.estado}
                disabled={!canWrite}
                onValueChange={async (v) => {
                  await api.from("tareas").update({ estado: v }).eq("id", tarea.id);
                  refetch();
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COLUMNAS.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label className="mt-3 block text-xs uppercase text-muted-foreground">Prioridad</Label>
              <Select
                value={tarea.prioridad}
                disabled={!canWrite}
                onValueChange={async (v) => {
                  await api.from("tareas").update({ prioridad: v }).eq("id", tarea.id);
                  refetch();
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["baja", "media", "alta", "critica"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Label className="mt-3 block text-xs uppercase text-muted-foreground">Responsable</Label>
              <Select
                value={tarea.asignado_a ?? "none"}
                disabled={!canWrite}
                onValueChange={async (v) => {
                  await api
                    .from("tareas")
                    .update({ asignado_a: v === "none" ? null : v })
                    .eq("id", tarea.id);
                  refetch();
                }}
              >
                <SelectTrigger className="mt-1">
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

              {tarea.vence_el && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" /> Vence el{" "}
                  {new Date(tarea.vence_el).toLocaleDateString("es-AR")}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border p-3">
              <Label className="text-xs uppercase text-muted-foreground">Instructivos vinculados</Label>
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
                              .eq("tarea_id", tarea.id)
                              .eq("doc_id", id);
                            refetch();
                          }}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {vinculados.length === 0 && (
                  <p className="text-sm text-muted-foreground">Ninguno.</p>
                )}
              </div>
              {canWrite && (
                <Select
                  value={docVinculo}
                  onValueChange={async (v) => {
                    setDocVinculo("");
                    const { error } = await api
                      .from("tarea_instructivos")
                      .insert({ tarea_id: tarea.id, doc_id: v });
                    if (error) return toast.error("Ya está vinculado");
                    refetch();
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
                  await api.from("tareas").delete().eq("id", tarea.id);
                  toast.success("Tarea eliminada");
                  onClose();
                  qc.invalidateQueries({ queryKey: ["tareas"] });
                }}
              >
                <Trash2 className="size-4 text-destructive" /> Eliminar tarea
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NuevaTarea({
  perfiles,
  userId,
  onDone,
}: {
  perfiles: { id: string; full_name: string }[];
  userId?: string;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [prioridad, setPrioridad] = useState("media");
  const [asignado, setAsignado] = useState("none");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Nueva tarea
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva tarea</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const { error } = await api.from("tareas").insert({
              titulo: String(fd.get("titulo")),
              descripcion: String(fd.get("descripcion") || ""),
              prioridad,
              asignado_a: asignado === "none" ? null : asignado,
              vence_el: String(fd.get("vence_el") || "") || null,
              created_by: userId ?? null,
            });
            if (error) return toast.error(error.message);
            toast.success("Tarea creada");
            setOpen(false);
            onDone();
          }}
        >
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input name="titulo" required />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Textarea name="descripcion" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={prioridad} onValueChange={setPrioridad}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["baja", "media", "alta", "critica"].map((p) => (
                    <SelectItem key={p} value={p} className="capitalize">
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vence</Label>
              <Input name="vence_el" type="date" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select value={asignado} onValueChange={setAsignado}>
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
          </div>
          <DialogFooter>
            <Button type="submit">Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
