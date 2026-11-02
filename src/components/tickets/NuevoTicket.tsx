import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivoPicker } from "@/components/activos/ActivoPicker";
import { BookmarkPlus, Plus } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { CATEGORIAS, PRIORIDADES, TIPOS, prioLabel } from "./constants";

type Plantilla = { id: string; nombre: string; titulo: string; descripcion: string | null; tipo: string; prioridad: string; categoria: string };

export function NuevoTicket({
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
  const [activoId, setActivoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const qc = useQueryClient();
  const { data: plantillas = [] } = useQuery({
    queryKey: ["ticket_plantillas"],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.from("ticket_plantillas").select("*").order("nombre");
      return (data ?? []) as Plantilla[];
    },
  });

  const usarPlantilla = (id: string) => {
    const p = plantillas.find((x) => x.id === id);
    if (!p) return;
    setTitulo(p.titulo);
    setDescripcion(p.descripcion ?? "");
    setTipo(p.tipo);
    setPrioridad(p.prioridad);
    setCategoria(p.categoria);
  };

  const [nombrePlantilla, setNombrePlantilla] = useState<string | null>(null);
  const guardarPlantilla = async () => {
    const nombre = (nombrePlantilla ?? "").trim();
    if (nombre.length < 3) return toast.error("Poné un nombre a la plantilla");
    const { error } = await api.from("ticket_plantillas").insert({ nombre, titulo: titulo.trim() || nombre, descripcion: descripcion || null, tipo, prioridad, categoria });
    if (error) return toast.error(error.message);
    toast.success("Plantilla guardada");
    setNombrePlantilla(null);
    await qc.invalidateQueries({ queryKey: ["ticket_plantillas"] });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setPrioridad("media");
          setTipo("pedido");
          setAsignado("none");
          setCategoria("Otro");
          setTitulo("");
          setDescripcion("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button className="h-9">
          <Plus className="size-4" /> Nuevo ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>Nuevo ticket</DialogTitle>
          <DialogDescription>Registrá un incidente o pedido interno.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5 px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            const tituloLimpio = titulo.trim();
            if (tituloLimpio.length < 3) return toast.error("Ingresá un título claro");
            const asignadoId = asignado === "none" ? null : asignado;
            setSaving(true);
            const { data, error } = await api.from("tareas").insert({
              titulo: tituloLimpio,
              descripcion,
              prioridad,
              tipo,
              categoria,
              sector: String(fd.get("sector") || "") || null,
              solicitante_nombre: String(fd.get("solicitante") || "") || userName || null,
              solicitante_id: userId ?? null,
              activo_id: activoId,
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
            setActivoId(null);
            const id =
              data && typeof data === "object" && !Array.isArray(data)
                ? (data as { id?: string }).id
                : Array.isArray(data)
                  ? (data[0] as { id?: string })?.id
                  : undefined;
            onDone(id);
          }}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Qué pasa</p>
              {plantillas.length > 0 && (
                <Select value="" onValueChange={usarPlantilla}>
                  <SelectTrigger className="h-8 w-auto gap-2 text-xs">
                    <SelectValue placeholder="Usar plantilla…" />
                  </SelectTrigger>
                  <SelectContent>
                    {plantillas.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input name="titulo" required value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Impresora 3er piso sin red" />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Textarea name="descripcion" rows={4} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Detalle del problema o pedido…" />
            </div>
            {titulo.trim().length >= 3 &&
              (nombrePlantilla === null ? (
                <button
                  type="button"
                  onClick={() => setNombrePlantilla(titulo.replace(/[-:\s]+$/, ""))}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <BookmarkPlus className="size-3.5" /> Guardar como plantilla
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    autoFocus
                    value={nombrePlantilla}
                    onChange={(e) => setNombrePlantilla(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void guardarPlantilla();
                      }
                      if (e.key === "Escape") setNombrePlantilla(null);
                    }}
                    placeholder="Nombre de la plantilla"
                    className="h-8 text-xs"
                  />
                  <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void guardarPlantilla()}>
                    Guardar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setNombrePlantilla(null)}>
                    Cancelar
                  </Button>
                </div>
              ))}
          </div>
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Clasificación</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={tipo} onValueChange={setTipo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select value={prioridad} onValueChange={setPrioridad}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORIDADES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {prioLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Categoría</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
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
                <Label>Equipo (opcional)</Label>
                <ActivoPicker value={activoId} onChange={setActivoId} />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Asignar a</Label>
                <Select value={asignado} onValueChange={setAsignado}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Cola (sin asignar)</SelectItem>
                    {perfiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 border-t border-border/70 pt-4 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
