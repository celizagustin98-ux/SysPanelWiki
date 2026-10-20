import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import type { Activo } from "./dialogs";

/** Mover el equipo: planta, sector y ubicación física dentro del sector. */
export function UbicacionDialog({
  item,
  trigger,
  plantas = [],
  sectores = [],
  onDone,
}: {
  item: Pick<Activo, "id" | "codigo" | "planta" | "sector" | "ubicacion_detalle">;
  trigger: ReactNode;
  plantas?: string[];
  sectores?: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? "").trim() || null;
    setSaving(true);
    const { error } = await api
      .from("inventario")
      .update({ planta: v("planta"), sector: v("sector"), ubicacion_detalle: v("ubicacion_detalle") })
      .eq("id", item.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`${item.codigo}: ubicación actualizada`);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-5 text-primary" /> Ubicación de {item.codigo}
          </DialogTitle>
          <DialogDescription>Dónde está el equipo físicamente. Ayuda a encontrarlo en la auditoría.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <datalist id="ubi-plantas">
            {plantas.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="ubi-sectores">
            {sectores.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="planta">Planta</Label>
              <Input id="planta" name="planta" list="ubi-plantas" defaultValue={item.planta ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sector">Sector</Label>
              <Input id="sector" name="sector" list="ubi-sectores" defaultValue={item.sector ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ubicacion_detalle">Ubicación física</Label>
            <Input
              id="ubicacion_detalle"
              name="ubicacion_detalle"
              defaultValue={item.ubicacion_detalle ?? ""}
              placeholder="Puesto 3 · escritorio de la ventana · Rack 1 U12"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <MapPin />} Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
