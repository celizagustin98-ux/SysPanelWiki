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
import { api } from "@/integrations/api/client";
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
}: {
  doc: Doc;
  active: boolean;
  onSelect: () => void;
  showTime?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
        active
          ? "bg-primary/12 font-medium text-primary ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-muted/55 hover:text-foreground",
      )}
    >
      <FileText className="size-3.5 shrink-0 opacity-75" />
      <span className="min-w-0 flex-1 truncate">{doc.title}</span>
      {showTime && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/80">
          {tiempoRelativo(doc.updated_at)}
        </span>
      )}
    </button>
  );
}

export function NuevaCarpeta({
  carpetas,
  onDone,
}: {
  carpetas: Carpeta[];
  onDone: (created?: Carpeta) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState("root");
  const [creating, setCreating] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setParent("root");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <FolderPlus className="size-4" /> Carpeta
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva carpeta</DialogTitle>
          <DialogDescription>Organizá la biblioteca de instructivos.</DialogDescription>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <FolderPlus className="size-4" />}
              {creating ? "Creando…" : "Crear carpeta"}
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
}: {
  carpetas: Carpeta[];
  userId?: string;
  onDone: (created?: Doc) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("root");
  const [creating, setCreating] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setFolder("root");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Instructivo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo instructivo</DialogTitle>
          <DialogDescription>Se abre listo para editar. Después podés adjuntar PDFs.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (creating) return;
            const fd = new FormData(e.currentTarget);
            const title = String(fd.get("title") ?? "").trim();
            if (!title) return toast.error("Ingresá un título");
            setCreating(true);
            const payload = {
              title,
              folder_id: folder === "root" ? null : folder,
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
            <Label>Carpeta</Label>
            <Select value={folder} onValueChange={setFolder}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="root">Raíz (sin carpeta)</SelectItem>
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
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {creating ? "Creando…" : "Crear"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
