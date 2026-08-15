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
  Eye,
  LibraryBig,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
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
  const [pdfActivo, setPdfActivo] = useState<{ id: string; name: string } | null>(null);
  const [pdfViewerSrc, setPdfViewerSrc] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<Carpeta | null>(null);
  const [pdfToDelete, setPdfToDelete] = useState<Adjunto | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);

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

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["wiki_docs"] }),
      qc.invalidateQueries({ queryKey: ["wiki_folders"] }),
    ]);
  };

  const refreshAttachments = async (docId = activo?.id) => {
    if (!docId) return;
    await qc.invalidateQueries({ queryKey: ["wiki_attachments", docId] });
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
    setSavingDoc(true);
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
    setSavingDoc(false);
    if (error) return toast.error(error.message);
    toast.success("Instructivo guardado");
    setEditing(false);
    refresh();
  };

  const subirPdf = async (file: File) => {
    if (!activo) return;
    if (file.type !== "application/pdf") return toast.error("Solo se permiten archivos PDF");
    setUploadingPdf(true);
    const path = `${activo.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await api.storage.from("instructivos").upload(path, file);
    if (error) {
      setUploadingPdf(false);
      return toast.error(error.message);
    }
    const { error: e2 } = await api
      .from("wiki_attachments")
      .insert({ doc_id: activo.id, file_name: file.name, file_path: path });
    setUploadingPdf(false);
    if (e2) return toast.error(e2.message);
    toast.success("PDF disponible para lectura");
    await refreshAttachments(activo.id);
  };

  const reemplazarPdf = async (actual: Adjunto, file: File) => {
    if (!activo) return;
    if (file.type !== "application/pdf") return toast.error("Solo se permiten archivos PDF");
    setUploadingPdf(true);
    const path = `${activo.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const upload = await api.storage.from("instructivos").upload(path, file);
    if (upload.error) {
      setUploadingPdf(false);
      return toast.error(upload.error.message);
    }
    const update = await api
      .from("wiki_attachments")
      .update({ file_name: file.name, file_path: path })
      .eq("id", actual.id);
    if (update.error) {
      setUploadingPdf(false);
      return toast.error(update.error.message);
    }
    await api.storage.from("instructivos").remove(actual.file_path);
    setUploadingPdf(false);
    setPdfActivo(null);
    toast.success("PDF reemplazado");
    await refreshAttachments(activo.id);
  };

  const eliminarPdf = async () => {
    if (!pdfToDelete || !activo) return;
    const deleteRow = await api.from("wiki_attachments").delete().eq("id", pdfToDelete.id);
    if (deleteRow.error) return toast.error(deleteRow.error.message);
    await api.storage.from("instructivos").remove(pdfToDelete.file_path);
    if (pdfActivo?.id === pdfToDelete.id) setPdfActivo(null);
    setPdfToDelete(null);
    toast.success("PDF eliminado");
    await refreshAttachments(activo.id);
  };

  const verPdf = (a: Adjunto) => {
    setPdfActivo({ id: a.id, name: a.file_name });
  };

  useEffect(() => {
    if (!activo || adjuntos.length === 0 || pdfActivo?.id) return;
    verPdf(adjuntos[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo?.id, adjuntos.length]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setPdfViewerSrc("");
    if (!pdfActivo?.id) return;
    setLoadingPdf(true);
    api.instructivos
      .pdfBlobUrl(pdfActivo.id)
      .then((url) => {
        objectUrl = url;
        if (active) setPdfViewerSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "No se pudo abrir el PDF");
      })
      .finally(() => {
        if (active) setLoadingPdf(false);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfActivo?.id]);

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
        description="Base de instructivos con carpetas, lectura PDF en pantalla y búsqueda rápida."
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
                <LibraryBig className="size-4 text-primary" /> Biblioteca
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
                        <Button onClick={guardar} disabled={savingDoc}>
                          {savingDoc ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                          Guardar
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

                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-gradient-to-r from-primary/10 via-card to-card px-4 py-3">
                    <div>
                      <p className="flex items-center gap-2 text-sm font-semibold">
                        <Paperclip className="size-4 text-primary" /> Documentos PDF
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Lectura directa, reemplazo de versiones y limpieza de archivos antiguos.
                      </p>
                    </div>
                    {canWrite && (
                      <label
                        className={cn(
                          "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
                          uploadingPdf && "pointer-events-none opacity-70",
                        )}
                      >
                        {uploadingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                        {uploadingPdf ? "Procesando..." : "Subir PDF"}
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

                  {adjuntos.length > 0 ? (
                    <div className="grid min-h-[640px] gap-0 xl:grid-cols-[300px_1fr]">
                      <aside className="border-b border-border/70 bg-muted/10 p-3 xl:border-b-0 xl:border-r">
                        <div className="mb-3 flex items-center justify-between px-2">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            PDFs disponibles
                          </p>
                          <Badge variant="secondary">{adjuntos.length}</Badge>
                        </div>
                        <div className="space-y-1">
                          {adjuntos.map((a) => (
                            <div
                              key={a.id}
                              className={cn(
                                "group/pdf flex items-start gap-2 rounded-xl border border-transparent px-2 py-2 text-sm transition-colors hover:border-border hover:bg-accent/70",
                                pdfActivo?.id === a.id && "bg-primary/15 text-primary ring-1 ring-primary/20",
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => verPdf(a)}
                                className="flex min-w-0 flex-1 items-start gap-2 text-left"
                              >
                                <FileText className="mt-0.5 size-4 shrink-0" />
                                <span className="min-w-0">
                                <span className="line-clamp-2 font-medium leading-snug">{a.file_name}</span>
                                <span className="mt-1 block text-[11px] text-muted-foreground">
                                  Abrir lectura
                                </span>
                                </span>
                              </button>
                              {canWrite && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="size-7 shrink-0 opacity-100 xl:opacity-0 xl:group-hover/pdf:opacity-100"
                                    >
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem asChild>
                                      <label className="flex cursor-pointer items-center gap-2">
                                        <RefreshCw className="size-4" />
                                        Reemplazar PDF
                                        <input
                                          type="file"
                                          accept="application/pdf"
                                          className="hidden"
                                          onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) reemplazarPdf(a, f);
                                            e.currentTarget.value = "";
                                          }}
                                        />
                                      </label>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setPdfToDelete(a)}
                                    >
                                      <Trash2 className="size-4" /> Eliminar PDF
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          ))}
                        </div>
                      </aside>

                      <section className="flex min-h-[640px] flex-col bg-background">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {pdfActivo?.name ?? "Seleccioná un PDF"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              El PDF se muestra acá, dentro del módulo.
                            </p>
                          </div>
                          {pdfActivo && (
                            <div className="flex gap-2">
                              <Button
                                asChild
                                type="button"
                                size="sm"
                                variant="outline"
                              >
                                <a
                                  href={pdfViewerSrc || undefined}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-disabled={!pdfViewerSrc}
                                  onClick={(event) => {
                                    if (!pdfViewerSrc) event.preventDefault();
                                  }}
                                >
                                  <Eye className="size-4" /> Ver PDF
                                </a>
                              </Button>
                              {canWrite && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const current = adjuntos.find((a) => a.id === pdfActivo.id);
                                    if (current) setPdfToDelete(current);
                                  }}
                                >
                                  <Trash2 className="size-4 text-destructive" /> Eliminar
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {pdfActivo ? (
                          <div className="flex h-[72vh] min-h-[640px] flex-col bg-slate-950">
                            {loadingPdf || !pdfViewerSrc ? (
                              <div className="grid min-h-0 flex-1 place-items-center bg-background text-sm text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <Loader2 className="size-4 animate-spin" />
                                  Cargando PDF...
                                </div>
                              </div>
                            ) : (
                              <iframe
                                title={`Vista PDF: ${pdfActivo.name}`}
                                src={pdfViewerSrc}
                                className="min-h-0 flex-1 border-0 bg-white"
                              />
                            )}
                          </div>
                        ) : (
                          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">
                            <div className="max-w-sm space-y-2">
                              <FileText className="mx-auto size-8 text-primary" />
                              <p className="font-medium text-foreground">Elegí un PDF de la lista</p>
                              <p>El documento se abre acá para lectura sin salir del instructivo.</p>
                            </div>
                          </div>
                        )}
                      </section>
                    </div>
                  ) : (
                    <div className="grid min-h-[240px] place-items-center p-8 text-center">
                      <div className="max-w-sm space-y-2">
                        <div className="mx-auto grid size-11 place-items-center rounded-xl bg-primary/15 text-primary">
                          <FileText className="size-5" />
                        </div>
                        <p className="font-medium">Sin PDF cargado</p>
                        <p className="text-sm text-muted-foreground">
                          Subí un instructivo en PDF para que quede disponible como documento de consulta.
                        </p>
                      </div>
                    </div>
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
      <AlertDialog open={!!pdfToDelete} onOpenChange={(open) => !open && setPdfToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar PDF</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{pdfToDelete?.file_name}" del instructivo. Esta acción sirve para quitar versiones
              viejas o archivos cargados por error.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={eliminarPdf}
            >
              Eliminar PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NuevaCarpeta({ carpetas, onDone }: { carpetas: Carpeta[]; onDone: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState("root");
  const [creating, setCreating] = useState(false);
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
            const name = String(fd.get("name") ?? "").trim();
            if (!name) return toast.error("Ingresá un nombre de carpeta");
            setCreating(true);
            const { error } = await api.from("wiki_folders").insert({
              name,
              parent_id: parent === "root" ? null : parent,
            });
            setCreating(false);
            if (error) return toast.error(error.message);
            toast.success("Carpeta creada");
            setOpen(false);
            e.currentTarget.reset();
            await onDone();
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
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
              {creating ? "Creando..." : "Crear carpeta"}
            </Button>
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
  const [creating, setCreating] = useState(false);
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
            const title = String(fd.get("title") ?? "").trim();
            if (!title) return toast.error("Ingresá un título");
            setCreating(true);
            const { data, error } = await api.from("wiki_docs").insert({
              title,
              folder_id: folder === "root" ? null : folder,
              content: "<p>Escribí el contenido del instructivo...</p>",
              created_by: userId ?? null,
            });
            setCreating(false);
            if (error) return toast.error(error.message);
            const created = Array.isArray(data) ? data[0] : data;
            if (!created?.id) return toast.error("No se pudo abrir el instructivo creado");
            toast.success("Instructivo creado");
            setOpen(false);
            e.currentTarget.reset();
            onDone(created.id);
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
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {creating ? "Creando..." : "Crear instructivo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
