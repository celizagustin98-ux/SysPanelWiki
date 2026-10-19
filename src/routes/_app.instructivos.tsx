import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Loader2,
  Search,
  Shield,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { NuevaCarpeta, NuevoDoc } from "@/components/instructivos/InstructivosHelpers";

export const Route = createFileRoute("/_app/instructivos")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    doc: (s.doc as string) || undefined,
    folder: (s.folder as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Instructivos · SysIntranet" },
      { name: "description", content: "Biblioteca de instructivos por carpetas con PDF." },
      { property: "og:title", content: "Instructivos | SysIntranet" },
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

const FOLDER_STYLES = [
  { icon: "bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]", blob: "bg-warn/12" },
  { icon: "bg-chart-4/12 text-chart-4", blob: "bg-chart-4/12" },
  { icon: "bg-crit/12 text-crit", blob: "bg-crit/12" },
  { icon: "bg-primary/12 text-primary", blob: "bg-primary/12" },
  { icon: "bg-info/12 text-info", blob: "bg-info/12" },
  { icon: "bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]", blob: "bg-warn/12" },
];

function folderStyle(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % FOLDER_STYLES.length;
  return FOLDER_STYLES[h] ?? FOLDER_STYLES[0];
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function stripHtml(html?: string | null) {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function InstructivosPage() {
  const { canWrite, isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { doc: docParam, folder: folderParam } = Route.useSearch();
  const [q, setQ] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<Carpeta | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfSrc, setPdfSrc] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedFolderId = folderParam ?? null;
  const selectedDocId = docParam ?? null;

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
      // Sin `content`: el listado no necesita el cuerpo de cada documento (eran cientos de KB).
      const { data, error } = await api
        .from("wiki_docs")
        .select("id, folder_id, title, tags, views, created_by, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Doc[];
    },
  });

  const activo = docs.find((d) => d.id === selectedDocId) ?? null;

  const { data: activoContent = "" } = useQuery({
    queryKey: ["wiki_doc_content", selectedDocId],
    enabled: !!selectedDocId,
    queryFn: async () => {
      const { data } = await api.from("wiki_docs").select("content").eq("id", selectedDocId!).maybeSingle();
      return ((data as { content?: string } | null)?.content ?? "") as string;
    },
  });

  const term = q.trim();
  const { data: contentMatches = [] } = useQuery({
    queryKey: ["wiki_search", term.toLowerCase()],
    enabled: term.length >= 3,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await api.rpc("buscar_instructivos", { _q: term });
      return ((data ?? []) as { id: string }[]).map((d) => d.id);
    },
  });

  const { data: adjuntos = [] } = useQuery({
    queryKey: ["wiki_attachments", selectedDocId],
    enabled: !!selectedDocId,
    queryFn: async () => {
      const { data, error } = await api.from("wiki_attachments").select("*").eq("doc_id", selectedDocId!);
      if (error) throw error;
      return data as Adjunto[];
    },
  });

  const docsByFolder = useMemo(() => {
    const map = new Map<string, Doc[]>();
    for (const doc of docs) {
      if (!doc.folder_id) continue;
      map.set(doc.folder_id, [...(map.get(doc.folder_id) ?? []), doc]);
    }
    return map;
  }, [docs]);

  const rootFolders = useMemo(() => carpetas.filter((c) => !c.parent_id), [carpetas]);
  const countInFolder = (id: string) => (docsByFolder.get(id) ?? []).length;

  const folderDocs = useMemo(() => {
    if (!selectedFolderId) return [];
    return (docsByFolder.get(selectedFolderId) ?? [])
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }, [docsByFolder, selectedFolderId]);

  const carpetaActiva = carpetas.find((c) => c.id === selectedFolderId) ?? null;

  const searchResults = useMemo(() => {
    if (!q.trim()) return null;
    const lower = q.toLowerCase();
    const enContenido = new Set(contentMatches);
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(lower) ||
        (d.tags ?? []).join(" ").toLowerCase().includes(lower) ||
        enContenido.has(d.id),
    );
  }, [q, docs, contentMatches]);

  useEffect(() => {
    if (!activo) return;
    // Contador dedicado: antes era un update que generaba una revisión y un registro de auditoría por cada vista.
    void api.rpc("registrar_vista_instructivo", { _id: activo.id });
  }, [activo?.id]);

  const pdfActivo = adjuntos[0] ?? null;

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    setPdfSrc("");
    if (!pdfActivo?.id) return;
    setLoadingPdf(true);
    api.instructivos
      .pdfBlobUrl(pdfActivo.id)
      .then((url) => {
        objectUrl = url;
        if (alive) setPdfSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch((err) => {
        if (alive) toast.error(err instanceof Error ? err.message : "No se pudo abrir el PDF");
      })
      .finally(() => {
        if (alive) setLoadingPdf(false);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pdfActivo?.id]);

  const goLibrary = () => navigate({ to: "/instructivos", search: {} });
  const goFolder = (id: string) => navigate({ to: "/instructivos", search: { folder: id } });
  const goDoc = (id: string, folderId?: string | null) =>
    navigate({
      to: "/instructivos",
      search: { doc: id, folder: folderId || selectedFolderId || undefined },
    });

  const onFolderCreated = async (created?: Carpeta) => {
    await qc.invalidateQueries({ queryKey: ["wiki_folders"] });
    if (created) goFolder(created.id);
  };

  const onDocCreated = async (created?: Doc) => {
    await qc.invalidateQueries({ queryKey: ["wiki_docs"] });
    if (created) goDoc(created.id, created.folder_id);
  };

  const eliminarCarpeta = async () => {
    if (!folderToDelete) return;
    const { error: e1 } = await api.from("wiki_docs").update({ folder_id: null }).eq("folder_id", folderToDelete.id);
    if (e1) return toast.error(e1.message);
    const { error } = await api.from("wiki_folders").delete().eq("id", folderToDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Carpeta eliminada");
    setFolderToDelete(null);
    await qc.invalidateQueries({ queryKey: ["wiki_folders"] });
    await qc.invalidateQueries({ queryKey: ["wiki_docs"] });
    goLibrary();
  };

  const subirPdf = async (file: File) => {
    if (!activo) return;
    if (file.type !== "application/pdf") return toast.error("Solo PDF");
    setUploadingPdf(true);
    const path = `${activo.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await api.storage.from("instructivos").upload(path, file);
    if (error) {
      setUploadingPdf(false);
      return toast.error(error.message);
    }
    if (pdfActivo) {
      await api.from("wiki_attachments").update({ file_name: file.name, file_path: path }).eq("id", pdfActivo.id);
      await api.storage.from("instructivos").remove(pdfActivo.file_path);
    } else {
      const { error: e2 } = await api
        .from("wiki_attachments")
        .insert({ doc_id: activo.id, file_name: file.name, file_path: path });
      if (e2) {
        setUploadingPdf(false);
        return toast.error(e2.message);
      }
    }
    setUploadingPdf(false);
    toast.success("PDF listo");
    await qc.invalidateQueries({ queryKey: ["wiki_attachments", activo.id] });
  };

  const downloadPdf = () => {
    if (!pdfSrc || !pdfActivo) return;
    const a = document.createElement("a");
    a.href = pdfSrc;
    a.download = pdfActivo.file_name || "instructivo.pdf";
    a.click();
  };

  const loading = loadingFolders || loadingDocs;
  const view: "library" | "folder" | "doc" = activo ? "doc" : selectedFolderId ? "folder" : "library";

  return (
    <div className="page-content min-h-[calc(100vh-6rem)]">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-11 rounded-full border-border/60 bg-card pl-10 shadow-sm"
            placeholder="Buscar por título o etiqueta…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {canWrite && (
          <div className="flex flex-wrap items-center gap-2">
            <NuevaCarpeta carpetas={carpetas} onDone={onFolderCreated} />
            <NuevoDoc carpetas={carpetas} userId={user?.id} defaultFolder={selectedFolderId} onDone={onDocCreated} />
          </div>
        )}
      </div>

      {searchResults && (
        <section className="rise-in">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Resultados · {searchResults.length}
          </p>
          <DocList docs={searchResults} carpetas={carpetas} onOpen={(d) => goDoc(d.id, d.folder_id)} />
          {searchResults.length === 0 && (
            <p className="py-16 text-center text-sm text-muted-foreground">Sin coincidencias</p>
          )}
        </section>
      )}

      {!searchResults && view === "library" && (
        <section className="rise-in">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Biblioteca <span className="text-muted-foreground/50">/</span> Todos los documentos
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Todos los documentos</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Encontrá el instructivo que necesitás. Organizados por carpeta, con PDF.
          </p>

          <div className="mt-8 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Explorá por carpeta</h2>
              <p className="text-xs text-muted-foreground">Colecciones del equipo de sistemas</p>
            </div>
            {canWrite && <NuevaCarpeta carpetas={carpetas} onDone={onFolderCreated} />}
          </div>

          {loading && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-36 skeleton rounded-xl" />
              ))}
            </div>
          )}

          {!loading && rootFolders.length === 0 && (
            <div className="panel mt-6 flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Folder className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Todavía no hay carpetas</p>
              <p className="text-xs text-muted-foreground">Creá la primera para organizar instructivos.</p>
              {canWrite && <NuevaCarpeta carpetas={carpetas} onDone={onFolderCreated} />}
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {rootFolders.map((c) => {
              const st = folderStyle(c.id);
              const n = countInFolder(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => goFolder(c.id)}
                  className="group relative overflow-hidden rounded-2xl bg-card p-5 text-left shadow-[var(--shadow-panel)] transition hover:shadow-md"
                >
                  <span className={cn("absolute -right-2 -top-2 size-16 rounded-full opacity-70", st.blob)} />
                  <span className={cn("relative mb-4 grid size-10 place-items-center rounded-xl", st.icon)}>
                    <Folder className="size-5" />
                  </span>
                  <p className="relative text-[15px] font-semibold tracking-tight">{c.name}</p>
                  <p className="relative mt-1 text-xs text-muted-foreground">Instructivos del área</p>
                  <p className="relative mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    <FileText className="size-3.5" />
                    {n} documento{n === 1 ? "" : "s"}
                  </p>
                  <ChevronRight className="absolute bottom-5 right-4 size-4 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              );
            })}
          </div>

          {docs.filter((d) => !d.folder_id).length > 0 && (
            <div className="mt-10">
              <h2 className="text-sm font-semibold">Sin carpeta</h2>
              <p className="mb-3 text-xs text-muted-foreground">Movelos a una carpeta cuando puedas</p>
              <DocList
                docs={docs.filter((d) => !d.folder_id)}
                carpetas={carpetas}
                onOpen={(d) => goDoc(d.id, d.folder_id)}
              />
            </div>
          )}
        </section>
      )}

      {!searchResults && view === "folder" && carpetaActiva && (
        <section className="rise-in">
          <button
            type="button"
            onClick={goLibrary}
            className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground"
          >
            Biblioteca <span className="text-muted-foreground/40">/</span> {carpetaActiva.name}
          </button>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{carpetaActiva.name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">Instructivos de esta carpeta</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canWrite && (
                <NuevoDoc
                  carpetas={carpetas}
                  userId={user?.id}
                  defaultFolder={carpetaActiva.id}
                  onDone={onDocCreated}
                />
              )}
              {isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-destructive"
                  onClick={() => setFolderToDelete(carpetaActiva)}
                >
                  <Trash2 className="size-3.5" /> Eliminar
                </Button>
              )}
            </div>
          </div>
          <p className="mt-6 text-sm font-medium">
            {folderDocs.length} documento{folderDocs.length === 1 ? "" : "s"}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">Ordenados por última actualización</p>
          {folderDocs.length === 0 ? (
            <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
              <FileText className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Carpeta vacía</p>
              {canWrite && (
                <NuevoDoc
                  carpetas={carpetas}
                  userId={user?.id}
                  defaultFolder={carpetaActiva.id}
                  onDone={onDocCreated}
                />
              )}
            </div>
          ) : (
            <DocList docs={folderDocs} carpetas={carpetas} onOpen={(d) => goDoc(d.id, d.folder_id)} />
          )}
        </section>
      )}

      {!searchResults && view === "doc" && activo && (
        <section className="rise-in">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-muted-foreground"
              onClick={() => (activo.folder_id ? goFolder(activo.folder_id) : goLibrary())}
            >
              <ArrowLeft className="size-4" /> Volver a la biblioteca
            </Button>
            <div className="flex flex-wrap gap-2">
              {canWrite && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void subirPdf(f);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={uploadingPdf}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploadingPdf ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    {pdfActivo ? "Reemplazar PDF" : "Subir PDF"}
                  </Button>
                </>
              )}
              {pdfSrc && (
                <Button size="sm" className="h-8" onClick={downloadPdf}>
                  <Download className="size-3.5" /> Descargar
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,320px)]">
            <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-panel)]">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 font-medium uppercase tracking-wide">
                  <FileText className="size-3.5" /> Vista previa
                </span>
                {pdfActivo && <span className="max-w-[50%] truncate">{pdfActivo.file_name}</span>}
              </div>
              <div className="relative min-h-[55vh] bg-muted/20">
                {loadingPdf && (
                  <div className="absolute inset-0 grid place-items-center">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loadingPdf && !pdfSrc && (
                  <div className="grid place-items-center px-6 py-24 text-center">
                    <FileText className="mb-3 size-8 text-muted-foreground" />
                    <p className="text-sm font-medium">Sin PDF aún</p>
                    <p className="mt-1 text-xs text-muted-foreground">Subí el instructivo en PDF para verlo acá.</p>
                  </div>
                )}
                {pdfSrc && (
                  <iframe title={activo.title} src={pdfSrc} className="h-[min(70vh,800px)] w-full border-0" />
                )}
              </div>
            </div>

            <aside className="panel h-fit space-y-5 p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]">
                  <FileText className="size-5" />
                </span>
                <div className="min-w-0">
                  <span className="inline-flex rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Disponible
                  </span>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {carpetas.find((c) => c.id === activo.folder_id)?.name ?? "Sin carpeta"}
                  </p>
                  <h2 className="mt-0.5 text-lg font-semibold leading-snug tracking-tight">{activo.title}</h2>
                  {stripHtml(activoContent) ? (
                    <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-muted-foreground">
                      {stripHtml(activoContent)}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Vistas</p>
                  <p className="mt-0.5 font-medium">{activo.views ?? 0}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actualizado</p>
                  <p className="mt-0.5 font-medium">{formatDate(activo.updated_at)}</p>
                </div>
              </div>

              {activo.tags?.length > 0 && (
                <div className="border-t border-border/60 pt-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Etiquetas
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {activo.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
                <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                  <Shield className="size-3.5 text-primary" /> Archivo del equipo
                </p>
                Documento de la biblioteca de instructivos de SysIntranet.
              </div>
            </aside>
          </div>
        </section>
      )}

      <AlertDialog open={!!folderToDelete} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar carpeta?</AlertDialogTitle>
            <AlertDialogDescription>
              Los instructivos de “{folderToDelete?.name}” quedan sin carpeta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarCarpeta}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DocList({
  docs,
  carpetas,
  onOpen,
}: {
  docs: Doc[];
  carpetas: Carpeta[];
  onOpen: (d: Doc) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-panel)]">
      {docs.map((d, i) => {
        const folderName = carpetas.find((c) => c.id === d.folder_id)?.name;
        return (
          <button
            key={d.id}
            type="button"
            onClick={() => onOpen(d)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-muted/40",
              i > 0 && "border-t border-border/50",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]">
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold tracking-tight">{d.title}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {folderName ?? "Sin carpeta"}
                {d.tags?.[0] ? ` · #${d.tags[0]}` : ""}
              </span>
            </span>
            <span className="hidden shrink-0 items-center gap-3 sm:flex">
              <span className="text-xs text-muted-foreground">{formatDate(d.updated_at)}</span>
              {d.tags?.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  #{t}
                </span>
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
