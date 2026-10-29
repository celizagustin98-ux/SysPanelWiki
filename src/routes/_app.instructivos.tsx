import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Home,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { VisorPdf } from "@/components/VisorPdf";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/AppShell";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/instructivos")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    doc: (s.doc as string) || undefined,
    folder: (s.folder as string) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Instructivos · Nodara" },
      { name: "description", content: "Biblioteca de instructivos en carpetas, con PDF y su información." },
    ],
  }),
  component: InstructivosPage,
});

type Carpeta = { id: string; name: string; parent_id: string | null; created_at?: string };
type Doc = {
  id: string;
  folder_id: string | null;
  title: string;
  descripcion: string | null;
  tags: string[];
  views: number;
  created_at: string;
  updated_at: string;
};
type Adjunto = {
  id: string;
  doc_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
};

const MAX_PDF_MB = 10;
const VIEW_KEY = "syswiki.instructivos.view";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatBytes(n?: number | null) {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function tituloDesdeArchivo(name: string) {
  const base = name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function parseTags(text: string) {
  return [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
}

const porNombre = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

function InstructivosPage() {
  const { user, puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("instructivos");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { doc: docParam, folder: folderParam } = Route.useSearch();
  const currentFolderId = folderParam ?? null;
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">(() => {
    try {
      return (localStorage.getItem(VIEW_KEY) as "grid" | "list") || "grid";
    } catch {
      return "grid";
    }
  });
  const [dragging, setDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [folderDialog, setFolderDialog] = useState<{ mode: "create" } | { mode: "rename"; folder: Carpeta } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Carpeta | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* sin almacenamiento */
    }
  }, [view]);

  const { data: carpetasRaw = [], isLoading: loadingFolders } = useQuery({
    queryKey: ["wiki_folders"],
    queryFn: async () => {
      const { data, error } = await api.from("wiki_folders").select("id, name, parent_id, created_at").order("name");
      if (error) throw error;
      return data as Carpeta[];
    },
  });

  // Orden alfabético real (sin distinguir mayúsculas ni acentos, "Carpeta 2" antes que "Carpeta 10").
  const carpetas = useMemo(() => [...carpetasRaw].sort((a, b) => porNombre.compare(a.name, b.name)), [carpetasRaw]);

  const { data: docsRaw = [], isLoading: loadingDocs } = useQuery({
    queryKey: ["wiki_docs"],
    queryFn: async () => {
      const { data, error } = await api
        .from("wiki_docs")
        .select("id, folder_id, title, descripcion, tags, views, created_at, updated_at")
        .order("title");
      if (error) throw error;
      return data as Doc[];
    },
  });
  const docs = useMemo(() => [...docsRaw].sort((a, b) => porNombre.compare(a.title, b.title)), [docsRaw]);

  const { data: adjuntos = [] } = useQuery({
    queryKey: ["wiki_attachments"],
    queryFn: async () => {
      const { data, error } = await api
        .from("wiki_attachments")
        .select("id, doc_id, file_name, file_path, file_size, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Adjunto[];
    },
  });

  const term = q.trim();
  const { data: contentMatches = [] } = useQuery({
    queryKey: ["wiki_search", term.toLowerCase()],
    enabled: term.length >= 3,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = (await api.rpc("buscar_instructivos", { _q: term })) as { data: unknown };
      return ((data ?? []) as { id: string }[]).map((d) => d.id);
    },
  });

  const pdfByDoc = useMemo(() => {
    const map = new Map<string, Adjunto>();
    for (const a of adjuntos) if (!map.has(a.doc_id)) map.set(a.doc_id, a);
    return map;
  }, [adjuntos]);

  const folderById = useMemo(() => new Map(carpetas.map((c) => [c.id, c])), [carpetas]);
  const childrenOf = (id: string | null) => carpetas.filter((c) => (c.parent_id ?? null) === id);
  const docsIn = (id: string | null) => docs.filter((d) => (d.folder_id ?? null) === id);

  const countDeep = useMemo(() => {
    const memo = new Map<string, number>();
    const walk = (id: string): number => {
      if (memo.has(id)) return memo.get(id)!;
      const n =
        docs.filter((d) => d.folder_id === id).length +
        carpetas.filter((c) => c.parent_id === id).reduce((s, c) => s + walk(c.id), 0);
      memo.set(id, n);
      return n;
    };
    carpetas.forEach((c) => walk(c.id));
    return memo;
  }, [docs, carpetas]);

  const breadcrumb = useMemo(() => {
    const chain: Carpeta[] = [];
    let cur = currentFolderId ? folderById.get(currentFolderId) : undefined;
    let guard = 0;
    while (cur && guard++ < 20) {
      chain.unshift(cur);
      cur = cur.parent_id ? folderById.get(cur.parent_id) : undefined;
    }
    return chain;
  }, [currentFolderId, folderById]);

  const selectedDoc = docs.find((d) => d.id === docParam) ?? null;

  const searchResults = useMemo(() => {
    if (!term) return null;
    const lower = term.toLowerCase();
    const enContenido = new Set(contentMatches);
    return docs.filter(
      (d) =>
        d.title.toLowerCase().includes(lower) ||
        (d.descripcion ?? "").toLowerCase().includes(lower) ||
        (d.tags ?? []).join(" ").toLowerCase().includes(lower) ||
        (pdfByDoc.get(d.id)?.file_name ?? "").toLowerCase().includes(lower) ||
        enContenido.has(d.id),
    );
  }, [term, docs, contentMatches, pdfByDoc]);

  const subfolders = childrenOf(currentFolderId);
  // Los instructivos se cargan dentro de una carpeta: el botón aparece al entrar en ella.
  const puedeCargar = canWrite && !!currentFolderId && !searchResults;
  const files = searchResults ?? docsIn(currentFolderId);

  const goFolder = (id: string | null) =>
    navigate({ to: "/instructivos", search: { folder: id ?? undefined, doc: undefined } });
  const openDoc = (d: Doc) =>
    navigate({ to: "/instructivos", search: { doc: d.id, folder: d.folder_id ?? undefined } });

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["wiki_folders"] }),
      qc.invalidateQueries({ queryKey: ["wiki_docs"] }),
      qc.invalidateQueries({ queryKey: ["wiki_attachments"] }),
    ]);
  };

  const pickFiles = (list: FileList | File[] | null) => {
    const all = Array.from(list ?? []);
    const pdfs = all.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (all.length && !pdfs.length) return toast.error("Solo se pueden subir archivos PDF");
    if (pdfs.length < all.length) toast.warning(`${all.length - pdfs.length} archivo(s) ignorados: no son PDF`);
    const grandes = pdfs.filter((f) => f.size > MAX_PDF_MB * 1024 * 1024);
    if (grandes.length) toast.error(`Superan ${MAX_PDF_MB} MB: ${grandes.map((f) => f.name).join(", ")}`);
    const ok = pdfs.filter((f) => f.size <= MAX_PDF_MB * 1024 * 1024);
    if (ok.length) setPendingFiles(ok);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!puedeCargar) return;
    pickFiles(e.dataTransfer.files);
  };

  const eliminarCarpeta = async () => {
    const f = folderToDelete;
    if (!f) return;
    // El contenido sube un nivel (nada se pierde).
    const parent = f.parent_id ?? null;
    const r1 = await api.from("wiki_docs").update({ folder_id: parent }).eq("folder_id", f.id);
    const r2 = await api.from("wiki_folders").update({ parent_id: parent }).eq("parent_id", f.id);
    const r3 = await api.from("wiki_folders").delete().eq("id", f.id);
    const err = r1.error || r2.error || r3.error;
    if (err) return toast.error(err.message);
    toast.success(`Carpeta "${f.name}" eliminada; su contenido pasó a la carpeta superior`);
    setFolderToDelete(null);
    await refreshAll();
    if (currentFolderId === f.id) goFolder(parent);
  };

  if (selectedDoc) {
    return (
      <DocViewer
        doc={selectedDoc}
        pdf={pdfByDoc.get(selectedDoc.id) ?? null}
        carpetas={carpetas}
        breadcrumb={breadcrumb}
        canWrite={canWrite}
        userId={user?.id ?? null}
        onBack={() => goFolder(selectedDoc.folder_id)}
        onChanged={refreshAll}
        onDeleted={async () => {
          await refreshAll();
          goFolder(selectedDoc.folder_id);
        }}
      />
    );
  }

  const loading = loadingFolders || loadingDocs;
  const titulo = searchResults ? `Resultados para “${term}”` : (breadcrumb.at(-1)?.name ?? "Todos los instructivos");

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (!puedeCargar || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <PageHeader
        title="Instructivos"
        description="Procedimientos del área organizados en carpetas. Entrá a una carpeta para cargar instructivos."
        action={
          canWrite ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setFolderDialog({ mode: "create" })}>
                <FolderPlus /> Nueva carpeta
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="panel hidden h-fit p-2 lg:block">
          <p className="eyebrow px-2 pb-1.5 pt-1">Carpetas</p>
          <TreeItem
            label="Inicio"
            icon={<Home className="size-4" />}
            active={!currentFolderId && !searchResults}
            count={docs.length}
            onClick={() => {
              setQ("");
              goFolder(null);
            }}
          />
          <FolderTree
            parentId={null}
            depth={0}
            carpetas={carpetas}
            currentId={currentFolderId}
            countDeep={countDeep}
            openChain={new Set(breadcrumb.map((b) => b.id))}
            onOpen={(id) => {
              setQ("");
              goFolder(id);
            }}
          />
        </aside>

        <section className="min-w-0 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[13px]" aria-label="Ruta">
              <button
                type="button"
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted",
                  !breadcrumb.length && "font-semibold",
                )}
                onClick={() => {
                  setQ("");
                  goFolder(null);
                }}
              >
                <Home className="size-3.5" /> Inicio
              </button>
              {breadcrumb.map((b, i) => (
                <span key={b.id} className="inline-flex shrink-0 items-center gap-1">
                  <ChevronRight className="size-3.5 text-muted-foreground/60" />
                  <button
                    type="button"
                    onClick={() => goFolder(b.id)}
                    className={cn("rounded-md px-2 py-1 hover:bg-muted", i === breadcrumb.length - 1 && "font-semibold")}
                  >
                    {b.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="flex gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-9 pl-9 pr-8"
                  placeholder="Buscar en todos los instructivos…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => setQ("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex rounded-lg border border-border bg-card p-0.5">
                <ViewButton active={view === "grid"} onClick={() => setView("grid")} label="Vista de íconos">
                  <LayoutGrid className="size-4" />
                </ViewButton>
                <ViewButton active={view === "list"} onClick={() => setView("list")} label="Vista de lista">
                  <List className="size-4" />
                </ViewButton>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
              <p className="text-xs text-muted-foreground">
                {searchResults
                  ? `${files.length} documento(s) encontrados`
                  : `${subfolders.length} carpeta(s) · ${files.length} documento(s)`}
              </p>
            </div>
            {currentFolderId && !searchResults && canWrite && (
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" onClick={() => fileInput.current?.click()}>
                  <Upload /> Cargar instructivo
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical /> Carpeta
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setFolderDialog({ mode: "rename", folder: breadcrumb.at(-1)! })}>
                      <Pencil /> Renombrar
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" onClick={() => setFolderToDelete(breadcrumb.at(-1)!)}>
                      <Trash2 /> Eliminar carpeta
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>

          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-28" />
              ))}
            </div>
          ) : (
            <>
              {!searchResults && subfolders.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 stagger">
                  {subfolders.map((c) => (
                    <FolderCard
                      key={c.id}
                      folder={c}
                      count={countDeep.get(c.id) ?? 0}
                      subCount={childrenOf(c.id).length}
                      onOpen={() => goFolder(c.id)}
                      canWrite={canWrite}
                      onRename={() => setFolderDialog({ mode: "rename", folder: c })}
                      onDelete={() => setFolderToDelete(c)}
                    />
                  ))}
                </div>
              )}

              {files.length === 0 && (searchResults || subfolders.length === 0) ? (
                <DropHint
                  canWrite={puedeCargar}
                  enInicio={!currentFolderId && canWrite}
                  searching={!!searchResults}
                  onPick={() => fileInput.current?.click()}
                  onNuevaCarpeta={() => setFolderDialog({ mode: "create" })}
                />
              ) : view === "grid" ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 stagger">
                  {files.map((d) => (
                    <FileCard
                      key={d.id}
                      doc={d}
                      pdf={pdfByDoc.get(d.id) ?? null}
                      folderName={searchResults ? folderById.get(d.folder_id ?? "")?.name : undefined}
                      onOpen={() => openDoc(d)}
                    />
                  ))}
                </div>
              ) : (
                <FileTable
                  docs={files}
                  pdfByDoc={pdfByDoc}
                  folderById={folderById}
                  showFolder={!!searchResults}
                  onOpen={openDoc}
                />
              )}
            </>
          )}
        </section>
      </div>

      {dragging && puedeCargar && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-primary bg-card px-10 py-8 text-center shadow-lg rise-in">
            <Upload className="mx-auto size-8 text-primary" />
            <p className="mt-3 font-semibold">Soltá los PDF para subirlos</p>
            <p className="text-sm text-muted-foreground">
              Se guardan en <strong>{breadcrumb.at(-1)?.name ?? "Inicio"}</strong>
            </p>
          </div>
        </div>
      )}

      {pendingFiles && (
        <UploadDialog
          files={pendingFiles}
          carpetas={carpetas}
          folderId={currentFolderId}
          userId={user?.id ?? null}
          onClose={() => setPendingFiles(null)}
          onDone={async () => {
            setPendingFiles(null);
            await refreshAll();
          }}
        />
      )}

      {folderDialog && (
        <FolderDialog
          state={folderDialog}
          parentId={currentFolderId}
          onClose={() => setFolderDialog(null)}
          onDone={async (created) => {
            setFolderDialog(null);
            await qc.invalidateQueries({ queryKey: ["wiki_folders"] });
            if (created) goFolder(created);
          }}
        />
      )}

      <AlertDialog open={!!folderToDelete} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la carpeta “{folderToDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              No se borra ningún documento: todo lo que contiene pasa a la carpeta superior.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminarCarpeta}>Eliminar carpeta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ───────────── Árbol y tarjetas ───────────── */

function TreeItem({
  label,
  icon,
  active,
  count,
  depth = 0,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  count?: number;
  depth?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors",
        active ? "bg-primary/12 font-medium text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className="num text-[11px] opacity-70">{count}</span>}
    </button>
  );
}

function FolderTree({
  parentId,
  depth,
  carpetas,
  currentId,
  countDeep,
  openChain,
  onOpen,
}: {
  parentId: string | null;
  depth: number;
  carpetas: Carpeta[];
  currentId: string | null;
  countDeep: Map<string, number>;
  openChain: Set<string>;
  onOpen: (id: string) => void;
}) {
  const items = carpetas.filter((c) => (c.parent_id ?? null) === parentId);
  if (!items.length || depth > 6) return null;
  return (
    <>
      {items.map((c) => {
        const active = c.id === currentId;
        const open = openChain.has(c.id);
        return (
          <div key={c.id}>
            <TreeItem
              label={c.name}
              depth={depth + 1}
              active={active}
              count={countDeep.get(c.id) ?? 0}
              icon={open ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0" />}
              onClick={() => onOpen(c.id)}
            />
            {open && (
              <FolderTree
                parentId={c.id}
                depth={depth + 1}
                carpetas={carpetas}
                currentId={currentId}
                countDeep={countDeep}
                openChain={openChain}
                onOpen={onOpen}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

function ViewButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-8 place-items-center rounded-md transition-colors",
        active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FolderCard({
  folder,
  count,
  subCount,
  onOpen,
  canWrite,
  onRename,
  onDelete,
}: {
  folder: Carpeta;
  count: number;
  subCount: number;
  onOpen: () => void;
  canWrite: boolean;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="panel panel-hover group flex cursor-pointer items-center gap-3 p-3.5"
    >
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn/14 text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)] transition-transform group-hover:scale-105">
        <Folder className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold">{folder.name}</p>
        <p className="text-xs text-muted-foreground">
          {count} doc{count === 1 ? "" : "s"}
          {subCount > 0 ? ` · ${subCount} subcarpeta${subCount === 1 ? "" : "s"}` : ""}
        </p>
      </div>
      {canWrite && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="size-8 opacity-60 group-hover:opacity-100" aria-label="Opciones de carpeta">
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onRename}>
              <Pencil /> Renombrar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 /> Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function FileCard({
  doc,
  pdf,
  folderName,
  onOpen,
}: {
  doc: Doc;
  pdf: Adjunto | null;
  folderName?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" onClick={onOpen} className="panel panel-hover group flex flex-col overflow-hidden text-left">
      <div className="relative flex h-24 items-center justify-center bg-grid bg-muted/40">
        <div className="relative grid h-16 w-12 place-items-center rounded-md border border-border bg-card shadow-sm transition-transform group-hover:-translate-y-0.5">
          <FileText className="size-5 text-crit" />
          <span className="absolute -bottom-1.5 rounded bg-crit px-1 font-mono text-[8px] font-bold text-white">PDF</span>
        </div>
        {!pdf && (
          <Badge variant="warn" className="absolute right-2 top-2">
            Sin PDF
          </Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug">{doc.title}</p>
        {doc.descripcion ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{doc.descripcion}</p>
        ) : null}
        {doc.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {doc.tags.slice(0, 3).map((t) => (
              <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}
        <p className="mt-auto flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
          {folderName && (
            <span className="inline-flex items-center gap-1 truncate">
              <Folder className="size-3" /> {folderName} ·
            </span>
          )}
          <span>{formatDate(doc.updated_at)}</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Eye className="size-3" /> {doc.views ?? 0}
          </span>
        </p>
      </div>
    </button>
  );
}

function FileTable({
  docs,
  pdfByDoc,
  folderById,
  showFolder,
  onOpen,
}: {
  docs: Doc[];
  pdfByDoc: Map<string, Adjunto>;
  folderById: Map<string, Carpeta>;
  showFolder: boolean;
  onOpen: (d: Doc) => void;
}) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-[13px]">
        <thead>
          <tr className="border-b border-border/70 bg-muted/40 text-left text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            <th className="px-3 py-2.5">Nombre</th>
            {showFolder && <th className="px-3 py-2.5">Carpeta</th>}
            <th className="px-3 py-2.5">Archivo</th>
            <th className="px-3 py-2.5">Tamaño</th>
            <th className="px-3 py-2.5">Actualizado</th>
            <th className="px-3 py-2.5 text-right">Vistas</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            const pdf = pdfByDoc.get(d.id);
            return (
              <tr
                key={d.id}
                onClick={() => onOpen(d)}
                className="cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40"
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <FileText className="size-4 shrink-0 text-crit" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{d.title}</p>
                      {d.descripcion && <p className="truncate text-xs text-muted-foreground">{d.descripcion}</p>}
                    </div>
                  </div>
                </td>
                {showFolder && (
                  <td className="px-3 py-2.5 text-muted-foreground">{folderById.get(d.folder_id ?? "")?.name ?? "Inicio"}</td>
                )}
                <td className="max-w-[220px] truncate px-3 py-2.5 text-xs text-muted-foreground">
                  {pdf?.file_name ?? <Badge variant="warn">Sin PDF</Badge>}
                </td>
                <td className="num px-3 py-2.5 text-xs text-muted-foreground">{formatBytes(pdf?.file_size)}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(d.updated_at)}</td>
                <td className="num px-3 py-2.5 text-right text-xs text-muted-foreground">{d.views ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DropHint({
  canWrite,
  enInicio,
  searching,
  onPick,
  onNuevaCarpeta,
}: {
  canWrite: boolean;
  enInicio: boolean;
  searching: boolean;
  onPick: () => void;
  onNuevaCarpeta: () => void;
}) {
  if (searching) {
    return (
      <div className="empty-state panel bg-grid">
        <Search className="mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-semibold">Sin resultados</p>
        <p className="mt-1 text-[13px] text-muted-foreground">Probá con otra palabra, una etiqueta o el nombre del archivo.</p>
      </div>
    );
  }
  if (enInicio) {
    return (
      <button
        type="button"
        onClick={onNuevaCarpeta}
        className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-border bg-grid px-6 py-12 text-center transition-colors hover:border-primary/50"
      >
        <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <FolderPlus className="size-5" />
        </div>
        <p className="mt-3 text-sm font-semibold">Todavía no hay carpetas</p>
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">Creá una carpeta y entrá en ella para cargar los instructivos.</p>
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={!canWrite}
      onClick={onPick}
      className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-border bg-grid px-6 py-12 text-center transition-colors hover:border-primary/50 disabled:cursor-default"
    >
      <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Upload className="size-5" />
      </div>
      <p className="mt-3 text-sm font-semibold">Esta carpeta está vacía</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
        {canWrite ? "Arrastrá PDFs acá o hacé clic para elegirlos. Vas a poder cargar título, descripción y etiquetas de cada uno." : "Todavía no hay instructivos cargados."}
      </p>
    </button>
  );
}

/* ───────────── Subida múltiple ───────────── */

type UploadRow = { file: File; title: string; descripcion: string; tags: string; status: "pendiente" | "subiendo" | "listo" | "error"; error?: string };

function UploadDialog({
  files,
  carpetas,
  folderId,
  userId,
  onClose,
  onDone,
}: {
  files: File[];
  carpetas: Carpeta[];
  folderId: string | null;
  userId: string | null;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [rows, setRows] = useState<UploadRow[]>(() =>
    files.map((f) => ({ file: f, title: tituloDesdeArchivo(f.name), descripcion: "", tags: "", status: "pendiente" })),
  );
  const [destino, setDestino] = useState<string>(folderId ?? "root");
  const [busy, setBusy] = useState(false);
  const done = rows.every((r) => r.status === "listo");

  const update = (i: number, patch: Partial<UploadRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const subir = async () => {
    if (rows.some((r) => !r.title.trim())) return toast.error("Cada documento necesita un título");
    setBusy(true);
    let ok = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status === "listo") continue;
      update(i, { status: "subiendo", error: undefined });
      try {
        const { data, error } = await api.from("wiki_docs").insert({
          title: r.title.trim(),
          descripcion: r.descripcion.trim() || null,
          tags: parseTags(r.tags),
          folder_id: destino === "root" ? null : destino,
          content: "",
          views: 0,
          created_by: userId,
        });
        if (error) throw error;
        const doc = (Array.isArray(data) ? data[0] : data) as { id: string };
        const path = `${doc.id}/${Date.now()}-${r.file.name.replace(/[^\w.-]+/g, "_")}`;
        const up = await api.storage.from("instructivos").upload(path, r.file);
        if (up.error) {
          await api.from("wiki_docs").delete().eq("id", doc.id);
          throw up.error;
        }
        const att = await api.from("wiki_attachments").insert({
          doc_id: doc.id,
          file_name: r.file.name,
          file_path: path,
          file_size: r.file.size,
          created_by: userId,
        });
        if (att.error) throw att.error;
        update(i, { status: "listo" });
        ok++;
      } catch (e) {
        update(i, { status: "error", error: e instanceof Error ? e.message : "No se pudo subir" });
      }
    }
    setBusy(false);
    if (ok) toast.success(`${ok} instructivo(s) subidos`);
    if (ok && rows.length === ok) await onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && (done ? void onDone() : onClose())}>
      <DialogContent className="max-h-[calc(var(--av)*0.90)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Subir {rows.length === 1 ? "instructivo" : `${rows.length} instructivos`}</DialogTitle>
          <DialogDescription>Completá la información de cada PDF. El título se toma del nombre del archivo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Guardar en</Label>
          <Select value={destino} onValueChange={setDestino} disabled={busy}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">Inicio (sin carpeta)</SelectItem>
              {carpetas.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={cn("rounded-xl border p-3.5", r.status === "error" ? "border-destructive/40" : "border-border")}>
              <div className="mb-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="size-4 text-crit" />
                <span className="min-w-0 flex-1 truncate">{r.file.name}</span>
                <span className="num">{formatBytes(r.file.size)}</span>
                {r.status === "subiendo" && <Loader2 className="size-4 animate-spin text-primary" />}
                {r.status === "listo" && <Badge variant="ok">Listo</Badge>}
                {r.status === "error" && <Badge variant="crit">Error</Badge>}
                {r.status === "pendiente" && !busy && rows.length > 1 && (
                  <button
                    type="button"
                    aria-label="Quitar"
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    className="hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Input
                  value={r.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder="Título"
                  disabled={busy || r.status === "listo"}
                  className="sm:col-span-2"
                />
                <Textarea
                  value={r.descripcion}
                  onChange={(e) => update(i, { descripcion: e.target.value })}
                  placeholder="Descripción: de qué trata, cuándo usarlo…"
                  rows={2}
                  disabled={busy || r.status === "listo"}
                  className="sm:col-span-2"
                />
                <Input
                  value={r.tags}
                  onChange={(e) => update(i, { tags: e.target.value })}
                  placeholder="Etiquetas separadas por coma: vpn, red, firewall"
                  disabled={busy || r.status === "listo"}
                  className="sm:col-span-2"
                />
              </div>
              {r.error && <p className="mt-2 text-xs text-destructive">{r.error}</p>}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={done ? () => void onDone() : onClose} disabled={busy}>
            {done ? "Cerrar" : "Cancelar"}
          </Button>
          {!done && (
            <Button onClick={subir} disabled={busy || !rows.length}>
              {busy ? <Loader2 className="animate-spin" /> : <Upload />}
              {busy ? "Subiendo…" : rows.some((r) => r.status === "error") ? "Reintentar" : "Subir"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Carpeta: crear / renombrar ───────────── */

function FolderDialog({
  state,
  parentId,
  onClose,
  onDone,
}: {
  state: { mode: "create" } | { mode: "rename"; folder: Carpeta };
  parentId: string | null;
  onClose: () => void;
  onDone: (createdId?: string) => Promise<void>;
}) {
  const [name, setName] = useState(state.mode === "rename" ? state.folder.name : "");
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    const n = name.trim();
    if (!n) return toast.error("Ingresá un nombre");
    setBusy(true);
    if (state.mode === "create") {
      const { data, error } = await api.from("wiki_folders").insert({ name: n, parent_id: parentId });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success(`Carpeta "${n}" creada`);
      const created = (Array.isArray(data) ? data[0] : data) as { id: string } | undefined;
      await onDone(created?.id);
    } else {
      const { error } = await api.from("wiki_folders").update({ name: n }).eq("id", state.folder.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("Carpeta renombrada");
      await onDone();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{state.mode === "create" ? "Nueva carpeta" : "Renombrar carpeta"}</DialogTitle>
          {state.mode === "create" && (
            <DialogDescription>Se crea dentro de la carpeta en la que estás.</DialogDescription>
          )}
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void guardar()}
          placeholder="Ej. Redes y VPN"
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {state.mode === "create" ? "Crear" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Visor del documento ───────────── */

function DocViewer({
  doc,
  pdf,
  carpetas,
  breadcrumb,
  canWrite,
  userId,
  onBack,
  onChanged,
  onDeleted,
}: {
  doc: Doc;
  pdf: Adjunto | null;
  carpetas: Carpeta[];
  breadcrumb: Carpeta[];
  canWrite: boolean;
  userId: string | null;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [pdfSrc, setPdfSrc] = useState("");
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: doc.title,
    descripcion: doc.descripcion ?? "",
    tags: (doc.tags ?? []).join(", "),
    folder: doc.folder_id ?? "root",
  });

  useEffect(() => {
    setForm({ title: doc.title, descripcion: doc.descripcion ?? "", tags: (doc.tags ?? []).join(", "), folder: doc.folder_id ?? "root" });
    setEditing(false);
    // Contador dedicado: no genera revisiones ni auditoría.
    void api.rpc("registrar_vista_instructivo", { _id: doc.id });
  }, [doc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    let url = "";
    setPdfSrc("");
    if (!pdf?.id) return;
    setLoadingPdf(true);
    api.instructivos
      .pdfBlobUrl(pdf.id)
      .then((u) => {
        url = u;
        if (alive) setPdfSrc(u);
        else URL.revokeObjectURL(u);
      })
      .catch((err) => alive && toast.error(err instanceof Error ? err.message : "No se pudo abrir el PDF"))
      .finally(() => alive && setLoadingPdf(false));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pdf?.id]);

  const guardar = async () => {
    if (!form.title.trim()) return toast.error("El título no puede quedar vacío");
    const { error } = await api
      .from("wiki_docs")
      .update({
        title: form.title.trim(),
        descripcion: form.descripcion.trim() || null,
        tags: parseTags(form.tags),
        folder_id: form.folder === "root" ? null : form.folder,
      })
      .eq("id", doc.id);
    if (error) return toast.error(error.message);
    toast.success("Información actualizada");
    setEditing(false);
    await onChanged();
  };

  const reemplazar = async (file: File) => {
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") return toast.error("Solo PDF");
    if (file.size > MAX_PDF_MB * 1024 * 1024) return toast.error(`El PDF supera ${MAX_PDF_MB} MB`);
    setReplacing(true);
    const path = `${doc.id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const up = await api.storage.from("instructivos").upload(path, file);
    if (up.error) {
      setReplacing(false);
      return toast.error(up.error.message);
    }
    const res = pdf
      ? await api.from("wiki_attachments").update({ file_name: file.name, file_path: path, file_size: file.size }).eq("id", pdf.id)
      : await api.from("wiki_attachments").insert({ doc_id: doc.id, file_name: file.name, file_path: path, file_size: file.size, created_by: userId });
    if (pdf && !res.error) await api.storage.from("instructivos").remove(pdf.file_path);
    setReplacing(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(pdf ? "PDF reemplazado" : "PDF cargado");
    await onChanged();
  };

  const eliminar = async () => {
    if (pdf) await api.storage.from("instructivos").remove(pdf.file_path);
    const { error } = await api.from("wiki_docs").delete().eq("id", doc.id);
    if (error) return toast.error(error.message);
    toast.success("Instructivo eliminado");
    await onDeleted();
  };

  const descargar = () => {
    if (!pdfSrc) return;
    const a = document.createElement("a");
    a.href = pdfSrc;
    a.download = pdf?.file_name || `${doc.title}.pdf`;
    a.click();
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft /> Volver
        </Button>
        <nav className="flex min-w-0 items-center gap-1 text-[13px] text-muted-foreground">
          <span>Inicio</span>
          {breadcrumb.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              {b.name}
            </span>
          ))}
        </nav>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel overflow-hidden">
          {loadingPdf ? (
            <div className="grid h-[calc(var(--av)*0.70)] place-items-center text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : pdfSrc ? (
            <VisorPdf src={pdfSrc} className="h-[min(calc(var(--av)*0.78),900px)]" />
          ) : (
            <div className="flex h-[calc(var(--av)*0.50)] flex-col items-center justify-center gap-3 bg-grid text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Este instructivo todavía no tiene PDF</p>
              {canWrite && (
                <Button onClick={() => replaceInput.current?.click()} disabled={replacing}>
                  {replacing ? <Loader2 className="animate-spin" /> : <Upload />} Subir PDF
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="panel h-fit space-y-5 p-5">
          {editing ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Título</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Descripción</Label>
                <Textarea rows={4} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Etiquetas</Label>
                <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="vpn, red" />
              </div>
              <div className="space-y-1.5">
                <Label>Carpeta</Label>
                <Select value={form.folder} onValueChange={(v) => setForm({ ...form, folder: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="root">Inicio (sin carpeta)</SelectItem>
                    {carpetas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={guardar} className="flex-1">
                  Guardar
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="eyebrow">Instructivo</p>
                <h1 className="mt-1 text-lg font-semibold leading-snug tracking-tight">{doc.title}</h1>
                {doc.descripcion ? (
                  <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{doc.descripcion}</p>
                ) : (
                  <p className="mt-2 text-[13px] italic text-muted-foreground/70">Sin descripción.</p>
                )}
                {doc.tags?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {doc.tags.map((t) => (
                      <span key={t} className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-3 border-y border-border/70 py-4 text-[13px]">
                <Meta label="Archivo" value={pdf?.file_name ?? "—"} wide />
                <Meta label="Tamaño" value={formatBytes(pdf?.file_size)} />
                <Meta label="Vistas" value={String(doc.views ?? 0)} />
                <Meta label="Creado" value={formatDate(doc.created_at)} />
                <Meta label="Actualizado" value={formatDate(doc.updated_at)} />
              </dl>

              <div className="grid gap-2">
                <Button onClick={descargar} disabled={!pdfSrc}>
                  <Download /> Descargar PDF
                </Button>
                {canWrite && (
                  <>
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      <Pencil /> Editar información
                    </Button>
                    <Button variant="outline" onClick={() => replaceInput.current?.click()} disabled={replacing}>
                      {replacing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      {pdf ? "Reemplazar PDF" : "Subir PDF"}
                    </Button>
                    <Button variant="outline" onClick={() => setEditing(true)}>
                      <FolderInput /> Mover a otra carpeta
                    </Button>
                    <Button variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)}>
                      <Trash2 /> Eliminar
                    </Button>
                  </>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <input
        ref={replaceInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void reemplazar(f);
          e.target.value = "";
        }}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{doc.title}”?</AlertDialogTitle>
            <AlertDialogDescription>Se borran el documento y su PDF. Queda registrado en auditoría.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={eliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}
