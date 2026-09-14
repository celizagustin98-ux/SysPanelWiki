import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  Files,
  Folder,
  Eye,
  LibraryBig,
  Loader2,
  MoreHorizontal,
  Paperclip,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DocRow, NuevaCarpeta, NuevoDoc } from "@/components/instructivos/InstructivosHelpers";

export const Route = createFileRoute("/_app/instructivos")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ doc: (s.doc as string) || undefined }),
  head: () => ({
    meta: [
      { title: "Instructivos | Base de conocimiento" },
      { name: "description", content: "Base de conocimiento operativa con carpetas, texto, PDFs y busqueda." },
      { property: "og:title", content: "Instructivos | Base de conocimiento" },
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

function isEmptyHtml(html?: string | null) {
  if (!html) return true;
  const plain = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  return plain.length === 0;
}

function InstructivosPage() {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { doc: docParam } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(docParam ?? null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("wiki_expanded") || "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });
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
  const [docTab, setDocTab] = useState("contenido");

  useEffect(() => {
    try {
      localStorage.setItem("wiki_expanded", JSON.stringify(expanded));
    } catch {
      /* ignore */
    }
  }, [expanded]);

  const { data: carpetas = [], isLoading: loadingFolders } = useQuery({
    queryKey: ["wiki_folders"],
    queryFn: async () => {
      const { data, error } = await api.from("wiki_folders").select("*").order("name");
      if (error) throw error;
      return data as Carpeta[];
    },
  });

  const { data: docs = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["wiki_docs"],
    queryFn: async () => {
      const { data, error } = await api.from("wiki_docs").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });

  const activo = docs.find((d) => d.id === selected) ?? null;

  const { data: adjuntos = [] } = useQuery({
    queryKey: ["wiki_attachments", selected],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await api.from("wiki_attachments").select("*").eq("doc_id", selected!);
      if (error) throw error;
      return data as Adjunto[];
    },
  });

  useEffect(() => {
    if (!activo) return;
    setDraft({ title: activo.title, content: activo.content, tags: activo.tags.join(", ") });
    setEditing(false);
    setPdfActivo(null);
    setDocTab("contenido");
    api.from("wiki_docs").update({ views: activo.views + 1 }).eq("id", activo.id).then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    if (!activo || editing) return;
    if (adjuntos.length > 0 && isEmptyHtml(activo.content)) setDocTab("pdfs");
  }, [activo?.id, adjuntos.length, activo?.content, editing]);

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

  const recientes = useMemo(() => docs.slice(0, 6), [docs]);

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

  const selectDoc = (id: string) => {
    setSelected(id);
    navigate({ to: "/instructivos", search: { doc: id } });
  };

  const onFolderCreated = async (created?: Carpeta) => {
    if (created) {
      qc.setQueryData<Carpeta[]>(["wiki_folders"], (prev) => {
        const list = prev ?? [];
        if (list.some((f) => f.id === created.id)) return list;
        return [...list, created].sort((a, b) => a.name.localeCompare(b.name, "es"));
      });
      if (created.parent_id) setExpanded((s) => ({ ...s, [created.parent_id!]: true }));
    }
    await qc.invalidateQueries({ queryKey: ["wiki_folders"] });
  };

  const onDocCreated = async (created?: Doc) => {
    if (created) {
      qc.setQueryData<Doc[]>(["wiki_docs"], (prev) => {
        const list = prev ?? [];
        if (list.some((d) => d.id === created.id)) return list;
        return [created, ...list];
      });
      if (created.folder_id) setExpanded((s) => ({ ...s, [created.folder_id!]: true }));
      selectDoc(created.id);
      setEditing(true);
    }
    await qc.invalidateQueries({ queryKey: ["wiki_docs"] });
  };

  const eliminarCarpeta = async () => {
    if (!folderToDelete) return;
    const ids = getFolderTreeIds(folderToDelete.id);
    for (const id of ids) {
      const { error } = await api.from("wiki_docs").update({ folder_id: null }).eq("folder_id", id);
      if (error) return toast.error(error.message);
    }
    const { error } = await api.from("wiki_folders").delete().eq("id", folderToDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Carpeta eliminada. Los instructivos quedaron en la raiz.");
    setFolderToDelete(null);
    refresh();
  };

  const guardar = async () => {
    if (!activo) return;
    setSavingDoc(true);
    const tags = draft.tags.split(",").map((t) => t.trim()).filter(Boolean);
    const { error } = await api.from("wiki_docs").update({ title: draft.title, content: draft.content, tags }).eq("id", activo.id);
    setSavingDoc(false);
    if (error) return toast.error(error.message);
    qc.setQueryData<Doc[]>(["wiki_docs"], (prev) =>
      (prev ?? []).map((d) =>
        d.id === activo.id
          ? { ...d, title: draft.title, content: draft.content, tags, updated_at: new Date().toISOString() }
          : d,
      ),
    );
    toast.success("Instructivo guardado");
    setEditing(false);
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
    const { error: e2 } = await api.from("wiki_attachments").insert({ doc_id: activo.id, file_name: file.name, file_path: path });
    setUploadingPdf(false);
    if (e2) return toast.error(e2.message);
    toast.success("PDF disponible");
    await refreshAttachments(activo.id);
    setDocTab("pdfs");
  };

  const reemplazarPdf = async (actual: Adjunto, file: File) => {
    if (!activo) return;
    if (file.type !== "application/pdf") return toast.error("Solo se permiten archivos PDF");
    setUploadingPdf(true);
    const path = `${activo.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const upload = await api.storage.from("instructivos").upload(path, file);
    if (upload.error) {
      setUploadingPdf(false);
      return toast.error(upload.error.message);
    }
    const update = await api.from("wiki_attachments").update({ file_name: file.name, file_path: path }).eq("id", actual.id);
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
    setDocTab("pdfs");
  };

  useEffect(() => {
    if (!activo || adjuntos.length === 0 || pdfActivo?.id) return;
    setPdfActivo({ id: adjuntos[0].id, name: adjuntos[0].file_name });
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

  const renderTree = (parent: string | null, depth = 0): ReactNode => (
    <div className={cn("space-y-0.5", depth > 0 && "ml-2 border-l border-border/40 pl-2")}>
      {(childFolders.get(parent) ?? []).map((c) => {
        const open = expanded[c.id] ?? depth === 0;
        const count = countDocsInFolder(c.id);
        return (
          <div key={c.id} className="group/folder">
            <div className="flex items-center rounded-lg hover:bg-muted/60">
              <button type="button" onClick={() => setExpanded((s) => ({ ...s, [c.id]: !open }))} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-sm">
                {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                <Folder className="size-3.5 shrink-0 text-primary" />
                <span className="truncate font-medium">{c.name}</span>
                {count > 0 && <span className="ml-auto rounded-md bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">{count}</span>}
              </button>
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="mr-0.5 size-7 opacity-0 group-hover/folder:opacity-100">
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setFolderToDelete(c)}>
                      <Trash2 className="size-4" /> Eliminar carpeta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {open && (
              <>
                {renderTree(c.id, depth + 1)}
                <div className="ml-2 space-y-0.5 border-l border-border/40 pl-2">
                  {(docsByFolder.get(c.id) ?? []).map((d) => (
                    <DocRow key={d.id} doc={d} active={selected === d.id} onSelect={() => selectDoc(d.id)} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
      {depth === 0 &&
        docs.filter((d) => !d.folder_id).map((d) => (
          <DocRow key={d.id} doc={d} active={selected === d.id} onSelect={() => selectDoc(d.id)} />
        ))}
    </div>
  );

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-4">
      <PageHeader
        title="Instructivos"
        description="Base de conocimiento del area · texto + PDF"
        action={canWrite ? (<div className="flex gap-2"><NuevaCarpeta carpetas={carpetas} onDone={onFolderCreated} /><NuevoDoc carpetas={carpetas} userId={user?.id} onDone={onDocCreated} /></div>) : null}
      />

      <div className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm lg:grid-cols-[300px_1fr]">
        <aside className="flex max-h-[42vh] flex-col border-border bg-muted/15 lg:max-h-[calc(100vh-11rem)] lg:border-r">
          <div className="space-y-3 border-b border-border/60 p-3.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="h-9 border-border/70 bg-background pl-8 text-sm" placeholder="Buscar en la biblioteca…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-0.5 ring-1 ring-border/60"><Folder className="size-3" /> {carpetas.length}</span>
              <span className="inline-flex items-center gap-1 rounded-md bg-background/80 px-2 py-0.5 ring-1 ring-border/60"><Files className="size-3" /> {docs.length}</span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
            {(loadingFolders || loadingDocs) && (
              <div className="space-y-2 p-1">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/70" />)}</div>
            )}
            {!loadingDocs && resultados && (
              <div className="space-y-1">
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resultados · {resultados.length}</p>
                {resultados.map((d) => <DocRow key={d.id} doc={d} active={selected === d.id} onSelect={() => selectDoc(d.id)} />)}
                {resultados.length === 0 && <p className="px-2 py-8 text-center text-xs text-muted-foreground">Sin coincidencias</p>}
              </div>
            )}
            {!loadingDocs && !resultados && (
              <>
                {recientes.length > 0 && (
                  <div className="mb-3">
                    <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recientes</p>
                    <div className="space-y-0.5">{recientes.map((d) => <DocRow key={`r-${d.id}`} doc={d} active={selected === d.id} onSelect={() => selectDoc(d.id)} showTime />)}</div>
                  </div>
                )}
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Biblioteca</p>
                {carpetas.length === 0 && docs.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <LibraryBig className="mx-auto mb-2 size-9 text-muted-foreground/35" />
                    <p className="text-xs font-medium text-muted-foreground">Biblioteca vacia</p>
                  </div>
                ) : (
                  renderTree(null)
                )}
              </>
            )}
          </div>
        </aside>

        <main className="flex min-h-[52vh] flex-col bg-background lg:min-h-[calc(100vh-11rem)]">
          {!activo ? (
            <div className="grid flex-1 place-items-center px-6 py-16 text-center">
              <div className="max-w-md space-y-4">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-border/70 bg-muted/30">
                  <FileText className="size-7 text-primary/70" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-base font-semibold tracking-tight">Base de conocimiento</p>
                  <p className="text-sm text-muted-foreground">Elegi un instructivo o crea uno nuevo. Cada documento puede tener texto y PDFs.</p>
                </div>
                {canWrite && (
                  <div className="flex justify-center gap-2 pt-1">
                    <NuevaCarpeta carpetas={carpetas} onDone={onFolderCreated} />
                    <NuevoDoc carpetas={carpetas} userId={user?.id} onDone={onDocCreated} />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-4 py-3.5 backdrop-blur-md sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    {editing ? (
                      <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="h-11 text-lg font-semibold" />
                    ) : (
                      <h1 className="text-xl font-semibold tracking-tight">{activo.title}</h1>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(editing ? draft.tags.split(",").map((t) => t.trim()).filter(Boolean) : activo.tags).map((t) => (
                        <Badge key={t} variant="secondary" className="h-5 px-1.5 text-[10px]">#{t}</Badge>
                      ))}
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Eye className="size-3" /> {activo.views}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" /> {tiempoRelativo(activo.updated_at)}</span>
                      {adjuntos.length > 0 && (
                        <Badge variant="outline" className="h-5 gap-1 border-primary/25 bg-primary/5 px-1.5 text-[10px] text-primary">
                          <Paperclip className="size-3" /> {adjuntos.length} PDF
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {canWrite && !editing && (
                      <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-muted/60">
                        {uploadingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                        Subir PDF
                        <input type="file" accept="application/pdf" className="hidden" disabled={uploadingPdf} onChange={(e) => { const f = e.target.files?.[0]; if (f) subirPdf(f); e.target.value = ""; }} />
                      </label>
                    )}
                    {canWrite && (editing ? (
                      <>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>Cancelar</Button>
                        <Button size="sm" className="h-8" onClick={guardar} disabled={savingDoc}>
                          {savingDoc ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Guardar
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="secondary" className="h-8" onClick={() => setEditing(true)}>Editar</Button>
                    ))}
                    {isAdmin && !editing && (
                      <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={async () => {
                        if (!confirm("Eliminar este instructivo?")) return;
                        const { error } = await api.from("wiki_docs").delete().eq("id", activo.id);
                        if (error) return toast.error(error.message);
                        toast.success("Eliminado");
                        setSelected(null);
                        navigate({ to: "/instructivos", search: {} });
                        refresh();
                      }}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Tabs value={docTab} onValueChange={setDocTab} className="flex min-h-0 flex-1 flex-col">
                <div className="border-b border-border/50 px-4 sm:px-6">
                  <TabsList className="h-10 bg-transparent p-0">
                    <TabsTrigger value="contenido" className="h-10 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">Contenido</TabsTrigger>
                    <TabsTrigger value="pdfs" className="h-10 gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                      <Paperclip className="size-3.5" /> PDFs
                      <span className={cn("rounded-full px-1.5 font-mono text-[10px]", adjuntos.length > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>{adjuntos.length}</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="contenido" className="mt-0 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                  {editing ? (
                    <div className="mx-auto max-w-3xl space-y-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Etiquetas (separadas por coma)</Label>
                        <Input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} placeholder="red, impresora…" />
                      </div>
                      <RichTextEditor value={draft.content} onChange={(content) => setDraft((d) => ({ ...d, content }))} />
                    </div>
                  ) : isEmptyHtml(activo.content) ? (
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
                      <FileText className="size-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium">Sin texto en este instructivo</p>
                      <p className="text-xs text-muted-foreground">{adjuntos.length > 0 ? "Hay PDFs cargados. Podes verlos en la pestana PDFs." : "Edita el documento o subi un PDF."}</p>
                      <div className="flex gap-2">
                        {canWrite && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Escribir</Button>}
                        {adjuntos.length > 0 && <Button size="sm" variant="outline" onClick={() => setDocTab("pdfs")}>Ver PDFs</Button>}
                      </div>
                    </div>
                  ) : (
                    <article className="prose prose-sm dark:prose-invert mx-auto max-w-3xl">
                      <div className="wiki-content text-[15px] leading-relaxed" dangerouslySetInnerHTML={{ __html: activo.content }} />
                    </article>
                  )}
                </TabsContent>

                <TabsContent value="pdfs" className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2 sm:px-5">
                    {adjuntos.map((a) => (
                      <button key={a.id} type="button" onClick={() => verPdf(a)} className={cn("inline-flex max-w-[200px] items-center gap-1.5 truncate rounded-md border px-2 py-1 text-xs", pdfActivo?.id === a.id ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-muted/50")}>
                        <Paperclip className="size-3 shrink-0" /><span className="truncate">{a.file_name}</span>
                      </button>
                    ))}
                    {canWrite && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40">
                        {uploadingPdf ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                        Subir PDF
                        <input type="file" accept="application/pdf" className="hidden" disabled={uploadingPdf} onChange={(e) => { const f = e.target.files?.[0]; if (f) subirPdf(f); e.target.value = ""; }} />
                      </label>
                    )}
                  </div>
                  <div className="relative min-h-0 flex-1 bg-muted/15">
                    {adjuntos.length === 0 && (
                      <div className="grid h-full min-h-[45vh] place-items-center p-8 text-center">
                        <div>
                          <Paperclip className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                          <p className="text-sm text-muted-foreground">No hay PDFs en este instructivo</p>
                        </div>
                      </div>
                    )}
                    {adjuntos.length > 0 && loadingPdf && (
                      <div className="grid h-full place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
                    )}
                    {pdfViewerSrc && !loadingPdf && (
                      <iframe title={pdfActivo?.name ?? "PDF"} src={pdfViewerSrc} className="h-full min-h-[55vh] w-full border-0" />
                    )}
                    {pdfActivo && adjuntos.length > 0 && (
                      <div className="absolute bottom-3 right-3 flex gap-1.5">
                        {pdfViewerSrc && (
                          <a href={pdfViewerSrc} download={pdfActivo.name} className="inline-flex h-8 items-center rounded-md border border-border bg-background/95 px-2.5 text-xs font-medium shadow-sm hover:bg-muted">Descargar</a>
                        )}
                        {canWrite && (
                          <>
                            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background/95 px-2.5 text-xs font-medium shadow-sm hover:bg-muted">
                              <Upload className="size-3.5" /> Reemplazar
                              <input type="file" accept="application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; const current = adjuntos.find((x) => x.id === pdfActivo.id); if (f && current) reemplazarPdf(current, f); e.target.value = ""; }} />
                            </label>
                            <Button size="sm" variant="outline" className="h-8 bg-background/95 text-xs" onClick={() => { const current = adjuntos.find((x) => x.id === pdfActivo.id); if (current) setPdfToDelete(current); }}>
                              <Trash2 className="size-3.5 text-destructive" /> Quitar
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>

      <AlertDialog open={!!folderToDelete} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar carpeta</AlertDialogTitle>
            <AlertDialogDescription>Se eliminara «{folderToDelete?.name}» y subcarpetas. Los instructivos pasan a la raiz.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={eliminarCarpeta}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pdfToDelete} onOpenChange={(o) => !o && setPdfToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar PDF</AlertDialogTitle>
            <AlertDialogDescription>Se eliminara «{pdfToDelete?.file_name}» de forma permanente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={eliminarPdf}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
