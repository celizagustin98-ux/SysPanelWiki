import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Files,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/instructivos")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ doc: (s.doc as string) || undefined }),
  head: () => ({
    meta: [
      { title: "Instructivos | Wiki operativa" },
      { name: "description", content: "Wiki operativa con carpetas, editor visual, adjuntos PDF y buscador global." },
      { property: "og:title", content: "Instructivos | Wiki operativa" },
      { property: "og:description", content: "Documentación técnica organizada en árbol con visor de PDF." },
    ],
  }),
  component: InstructivosPage,
});

type Carpeta = { id: string; name: string; parent_id: string | null };
type Doc = {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  tags: string[];
  views: number;
  updated_at: string;
};
type Adjunto = { id: string; doc_id: string; file_name: string; file_path: string };

function InstructivosPage() {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { doc: docParam } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(docParam ?? null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: "", content: "", tags: "" });
  const [pdfActivo, setPdfActivo] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Carpeta | null>(null);

  const { data: carpetas = [] } = useQuery({
    queryKey: ["wiki_folders"],
    queryFn: async () => {
      const { data, error } = await api.from("wiki_folders").select("*").order("name");
      if (error) throw error;
      return data as Carpeta[];
    },
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["wiki_docs"],
    queryFn: async () => {
      const { data, error } = await api
        .from("wiki_docs")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });

  const activo = docs.find((d) => d.id === selected) ?? null;

  const { data: adjuntos = [] } = useQuery({
    queryKey: ["wiki_attachments", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await api
        .from("wiki_attachments")
        .select("*")
        .eq("doc_id", selected!);
      if (error) throw error;
      return data as Adjunto[];
    },
  });

  useEffect(() => {
    if (!activo) return;
    setDraft({ title: activo.title, content: activo.content, tags: activo.tags.join(", ") });
    setEditing(false);
    setPdfActivo(null);
    api
      .from("wiki_docs")
      .update({ views: activo.views + 1 })
      .eq("id", activo.id)
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const resultados = useMemo(() => {
    if (!q.trim()) return null;
    const term = q.toLowerCase();
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(term) ||
        d.content.toLowerCase().includes(term) ||
        d.tags.join(" ").toLowerCase().includes(term),
    );
  }, [q, docs]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wiki_docs"] });
    qc.invalidateQueries({ queryKey: ["wiki_folders"] });
  };

  const docsByFolder = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const doc of docs) {
      if (!doc.folder_id) continue;
      map.set(doc.folder_id, [...(map.get(doc.folder_id) ?? []), doc]);
    }
    return map;
  }, [docs]);

  const childFolders = useMemo(() => {
    const map = new Map<string | null, Carpeta[]>();
    for (const folder of carpetas) {
      map.set(folder.parent_id, [...(map.get(folder.parent_id) ?? []), folder]);
    }
    return map;
  }, [carpetas]);

  const getFolderTreeIds = (folderId: string): string[] => {
    const ids = [folderId];
    for (const child of childFolders.get(folderId) ?? []) ids.push(...getFolderTreeIds(child.id));
    return ids;
  };

  const countDocsInFolder = (folderId: string) =>
    getFolderTreeIds(folderId).reduce((total, id) => total + (docsByFolder.get(id)?.length ?? 0), 0);

  const eliminarCarpeta = async () => {
    if (!folderToDelete) return;
    const ids = getFolderTreeIds(folderToDelete.id);
    for (const id of ids) {
      const { error } = await api.from("wiki_docs").update({ folder_id: null }).eq("folder_id", id);
      if (error) return toast.error(error.message);
    }
    const { error } = await api.from("wiki_folders").delete().eq("id", folderToDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Carpeta eliminada. Los instructivos quedaron en la raíz.");
    setFolderToDelete(null);
    refresh();
  };

  const guardar = async () => {
    if (!activo) return;
    const { error } = await api
      .from("wiki_docs")
      .update({
        title: draft.title,
        content: draft.content,
        tags: draft.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      })
      .eq("id", activo.id);
    if (error) return toast.error(error.message);
    toast.success("Instructivo guardado");
    setEditing(false);
    refresh();
  };

  const subirPdf = async (file: File) => {
    if (!activo) return;
    if (file.type !== "application/pdf") return toast.error("Solo se permiten archivos PDF");
    const path = `${activo.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await api.storage.from("instructivos").upload(path, file);
    if (error) return toast.error(error.message);
    const { error: e2 } = await api
      .from("wiki_attachments")
      .insert({ doc_id: activo.id, file_name: file.name, file_path: path });
    if (e2) return toast.error(e2.message);
    toast.success("PDF adjuntado");
    qc.invalidateQueries({ queryKey: ["wiki_attachments", activo.id] });
  };

  const verPdf = async (a: Adjunto) => {
    const { data, error } = await api.storage
      .from("instructivos")
      .createSignedUrl(a.file_path, 3600);
    if (error) return toast.error(error.message);
    setPdfActivo(data.signedUrl);
  };

  const renderTree = (parent: string | null, depth = 0) => (
    <div className={cn("space-y-1", depth > 0 && "ml-3 border-l border-border/60 pl-2")}>
      {(childFolders.get(parent) ?? []).map((c) => {
        const open = expanded[c.id] ?? depth === 0;
        return (
          <div key={c.id} className="group/folder">
            <div className="flex items-center rounded-lg hover:bg-accent/55">
              <button
                onClick={() => setExpanded((s) => ({ ...s, [c.id]: !open }))}
                className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-sm"
              >
                {open ? (
                  <ChevronDown className="size-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0" />
                )}
                <Folder className="size-4 shrink-0 text-primary" />
                <span className="truncate font-medium">{c.name}</span>
                <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {countDocsInFolder(c.id)}
                </span>
              </button>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="mr-1 size-7 opacity-0 transition-opacity group-hover/folder:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setFolderToDelete(c)}
                    >
                      <Trash2 className="size-4" /> Eliminar carpeta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {open && (
              <>
                {renderTree(c.id, depth + 1)}
                <div className="ml-3 space-y-1 border-l border-border/60 pl-2">
                  {(docsByFolder.get(c.id) ?? []).map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setSelected(d.id);
                        navigate({ to: "/instructivos", search: { doc: d.id } });
                      }}
                      className={cn(
                        "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        selected === d.id && "bg-primary/15 text-primary ring-1 ring-primary/20",
                      )}
                    >
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{d.title}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
      {depth === 0 &&
        docs
          .filter((d) => !d.folder_id)
          .map((d) => (
            <button
              key={d.id}
              onClick={() => {
                setSelected(d.id);
                navigate({ to: "/instructivos", search: { doc: d.id } });
              }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                selected === d.id && "bg-primary/15 text-primary ring-1 ring-primary/20",
              )}
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{d.title}</span>
            </button>
          ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Instructivos"
        description="Wiki operativa jerárquica con editor visual y PDFs embebidos."
        action={
          canWrite ? (
            <div className="flex gap-2">
              <NuevaCarpeta carpetas={carpetas} onDone={refresh} />
              <NuevoDoc
                carpetas={carpetas}
                userId={user?.id}
                onDone={(id) => {
                  refresh();
                  setSelected(id);
                }}
              />
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
          <Input
            className="h-11 rounded-xl pl-9"
            placeholder="Buscar por título, contenido o etiquetas..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Folder className="size-4 text-primary" />
          <span>{carpetas.length} carpetas</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Files className="size-4 text-primary" />
          <span>{docs.length} instructivos</span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="panel h-fit overflow-hidden">
          <CardHeader className="border-b border-border/70 bg-muted/25 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Folder className="size-4 text-primary" /> Biblioteca
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-y-auto p-3">
            {resultados ? (
              <div className="space-y-1">
                <p className="px-2 pb-2 text-xs font-medium uppercase text-muted-foreground">
                  Resultados
                </p>
                {resultados.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => {
                      setSelected(d.id);
                      navigate({ to: "/instructivos", search: { doc: d.id } });
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-accent/60",
                      selected === d.id && "bg-primary/15 text-primary ring-1 ring-primary/20",
                    )}
                  >
                    <FileText className="size-4 shrink-0" />
                    <span className="truncate">{d.title}</span>
                  </button>
                ))}
                {resultados.length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin coincidencias.</p>
                )}
              </div>
            ) : (
              renderTree(null)
            )}
          </CardContent>
        </Card>

        <Card className="panel min-h-[60vh] overflow-hidden">
          {!activo ? (
            <CardContent className="grid min-h-[52vh] place-items-center py-24 text-center">
              <div className="max-w-sm space-y-3">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <FileText className="size-6" />
                </div>
                <div>
                  <p className="font-medium">Seleccioná un instructivo</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Usá el árbol o el buscador para abrir documentación operativa.
                  </p>
                </div>
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 border-b border-border/70 bg-muted/20">
                <div className="min-w-0">
                  {editing ? (
                    <Input
                      value={draft.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      className="h-11 text-lg font-semibold"
                    />
                  ) : (
                    <CardTitle className="text-2xl">{activo.title}</CardTitle>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {activo.tags.map((t) => (
                      <Badge key={t} variant="secondary">
                        #{t}
                      </Badge>
                    ))}
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Files className="size-3.5" /> {activo.views} vistas
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" /> Actualizado{" "}
                      {new Date(activo.updated_at).toLocaleDateString("es-AR")}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {canWrite &&
                    (editing ? (
                      <>
                        <Button variant="ghost" onClick={() => setEditing(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={guardar}>
                          <Save className="size-4" /> Guardar
                        </Button>
                      </>
                    ) : (
                      <Button variant="secondary" onClick={() => setEditing(true)}>
                        Editar
                      </Button>
                    ))}
                  {isAdmin && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={async () => {
                        const { error } = await api.from("wiki_docs").delete().eq("id", activo.id);
                        if (error) return toast.error(error.message);
                        toast.success("Instructivo eliminado");
                        setSelected(null);
                        refresh();
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {editing ? (
                  <>
                    <RichTextEditor
                      value={draft.content}
                      onChange={(html) => setDraft((d) => ({ ...d, content: html }))}
                    />
                    <div className="space-y-1.5">
                      <Label>Etiquetas (separadas por coma)</Label>
                      <Input
                        value={draft.tags}
                        onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  <div
                    className="wiki-content text-sm"
                    dangerouslySetInnerHTML={{ __html: activo.content || "<p>Sin contenido.</p>" }}
                  />
                )}

                <div className="rounded-xl border border-border bg-muted/10 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Paperclip className="size-4" /> Archivos PDF adjuntos
                    </p>
                    {canWrite && (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
                        <Upload className="size-3.5" /> Subir PDF
                        <input
                          type="file"
                          accept="application/pdf"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) subirPdf(f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {adjuntos.map((a) => (
                      <Button key={a.id} size="sm" variant="outline" onClick={() => verPdf(a)}>
                        <FileText className="size-4" /> {a.file_name}
                      </Button>
                    ))}
                    {adjuntos.length === 0 && (
                      <p className="text-sm text-muted-foreground">Sin adjuntos.</p>
                    )}
                  </div>
                  {pdfActivo && (
                    <iframe
                      title="Visor de PDF"
                      src={pdfActivo}
                      className="mt-4 h-[70vh] w-full rounded-lg border border-border bg-background"
                    />
                  )}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
      <AlertDialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar carpeta</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la carpeta "{folderToDelete?.name}" y sus subcarpetas. Los instructivos no se borran:
              quedarán movidos a la raíz para que no pierdas contenido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminarCarpeta}
            >
              Eliminar carpeta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NuevaCarpeta({ carpetas, onDone }: { carpetas: Carpeta[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState("root");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <FolderPlus className="size-4" /> Carpeta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const { error } = await api.from("wiki_folders").insert({
              name: String(fd.get("name")),
              parent_id: parent === "root" ? null : parent,
            });
            if (error) return toast.error(error.message);
            toast.success("Carpeta creada");
            setOpen(false);
            onDone();
          }}
        >
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input name="name" required />
          </div>
          <div className="space-y-1.5">
            <Label>Carpeta padre</Label>
            <Select value={parent} onValueChange={setParent}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Raíz</SelectItem>
                {carpetas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
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

function NuevoDoc({
  carpetas,
  userId,
  onDone,
}: {
  carpetas: Carpeta[];
  userId?: string;
  onDone: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("root");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Instructivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo instructivo</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const { data, error } = await api
              .from("wiki_docs")
              .insert({
                title: String(fd.get("title")),
                folder_id: folder === "root" ? null : folder,
                content: "<p>Escribí el contenido del instructivo…</p>",
                created_by: userId ?? null,
              })
              .select("id")
              .single();
            if (error) return toast.error(error.message);
            toast.success("Instructivo creado");
            setOpen(false);
            onDone(data.id);
          }}
        >
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label>Carpeta</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Sin carpeta</SelectItem>
                {carpetas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
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
