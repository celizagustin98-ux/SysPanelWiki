import { useState } from "react";
import { FileText, FolderPlus, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

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

export function DocRow({
  doc,
  active,
  onSelect,
  showTime,
  hasPdf,
}: {
  doc: Doc;
  active: boolean;
  onSelect: () => void;
  showTime?: boolean;
  hasPdf?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
        active
          ? "bg-primary/10 text-foreground ring-1 ring-primary/25"
          : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md border",
          active ? "border-primary/30 bg-primary/15 text-primary" : "border-border bg-muted/40",
        )}
      >
        <FileText className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px]", active && "font-medium text-foreground")}>
          {doc.title}
        </span>
        {showTime && (
          <span className="font-mono text-[10px] text-muted-foreground/80">{tiempoRelativo(doc.updated_at)}</span>
        )}
      </span>
      {hasPdf && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          PDF
        </span>
      )}
    </button>
  );
}

export function NuevaCarpeta({
  carpetas,
  onDone,
  defaultParent,
}: {
  carpetas: Carpeta[];
  onDone: (created?: Carpeta) => void | Promise<void>;
  defaultParent?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState("root");
  const [creating, setCreating] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setParent(defaultParent || "root");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          <FolderPlus className="size-3.5" /> Carpeta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
          <DialogDescription>Organizá instructivos por área o sistema.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (creating) return;
            const fd = new FormData(e.currentTarget);
            const name = String(fd.get("name") ?? "").trim();
            if (!name) return toast.error("Ingresá un nombre de carpeta");
            setCreating(true);
            const { data, error } = await api
              .from("wiki_folders")
              .insert({ name, parent_id: parent === "root" ? null : parent });
            setCreating(false);
            if (error) return toast.error(error.message);
            const created = (Array.isArray(data) ? data[0] : data) as Carpeta | undefined;
            toast.success("Carpeta creada");
            setOpen(false);
            e.currentTarget.reset();
            await onDone(created);
          }}
        >
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input name="name" required autoFocus placeholder="Ej. Redes, Impresoras…" />
          </div>
          <div className="space-y-1.5">
            <Label>Dentro de</Label>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
              {creating ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NuevoDoc({
  carpetas,
  userId,
  onDone,
  defaultFolder,
}: {
  carpetas: Carpeta[];
  userId?: string;
  onDone: (created?: Doc) => void | Promise<void>;
  defaultFolder?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("none");
  const [creating, setCreating] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setFolder(defaultFolder || "none");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus className="size-3.5" /> Instructivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo instructivo</DialogTitle>
          <DialogDescription>
            Va dentro de una carpeta. Después adjuntás el PDF oficial.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (creating) return;
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            if (!title) return toast.error("Ingresá un título");
            if (folder === "none" || !folder) {
              return toast.error("Elegí una carpeta para organizar el instructivo");
            }
            setCreating(true);
            const payload = {
              title,
              folder_id: folder,
              content: "<p></p>",
              tags: [] as string[],
              views: 0,
              created_by: userId ?? null,
            };
            const { data, error } = await api.from("wiki_docs").insert(payload);
            setCreating(false);
            if (error) return toast.error(error.message);
            const created = (Array.isArray(data) ? data[0] : data) as Doc | undefined;
            toast.success("Instructivo creado");
            setOpen(false);
            e.currentTarget.reset();
            if (!created?.id) {
              await onDone();
              return;
            }
            await onDone({
              ...created,
              title,
              folder_id: payload.folder_id,
              content: payload.content,
              tags: [],
              views: 0,
              updated_at: created.updated_at ?? new Date().toISOString(),
            });
          }}
        >
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input name="title" required autoFocus placeholder="Ej. Alta de usuario en AD" />
          </div>
          <div className="space-y-1.5">
            <Label>
              Carpeta <span className="text-destructive">*</span>
            </Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar carpeta" />
              </SelectTrigger>
              <SelectContent>
                {carpetas.length === 0 && (
                  <SelectItem value="none" disabled>
                    Primero creá una carpeta
                  </SelectItem>
                )}
                {carpetas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Obligatorio: cada instructivo vive en una carpeta.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating || carpetas.length === 0}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {creating ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
