import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, MapPin, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { leerQr } from "@/lib/qr";
import { useActivosLite, type ActivoLite } from "./ActivoPicker";
import { pitido, VisorQr } from "./EscanerQR";

const fechaLocal = () => new Date().toLocaleDateString("sv-SE");

/** Mover varios equipos juntos a otra planta, sector o puesto. */
export function MoverActivos({
  ids,
  plantas,
  sectores,
  onClose,
  onDone,
}: {
  ids: string[];
  plantas: string[];
  sectores: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [planta, setPlanta] = useState("");
  const [sector, setSector] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [guardando, setGuardando] = useState(false);

  const mover = async () => {
    const values: Record<string, unknown> = {};
    if (planta.trim()) values.planta = planta.trim();
    if (sector.trim()) values.sector = sector.trim();
    if (ubicacion.trim()) values.ubicacion_detalle = ubicacion.trim();
    if (!Object.keys(values).length) return toast.error("Indicá a dónde se mueven");
    setGuardando(true);
    const r = await Promise.all(ids.map((id) => api.from("inventario").update(values).eq("id", id)));
    setGuardando(false);
    const fallas = r.filter((x) => x.error).length;
    if (fallas) toast.error(`${fallas} no se pudieron mover`);
    toast.success(`${ids.length - fallas} equipo(s) movidos${values.sector ? ` a ${values.sector}` : ""}`);
    void qc.invalidateQueries({ queryKey: ["activos-lite"] });
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {ids.length} equipo(s)</DialogTitle>
          <DialogDescription>Completá solo lo que cambia; lo que quede vacío se mantiene como está.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Planta</Label>
            <Input value={planta} onChange={(e) => setPlanta(e.target.value)} list="mover-plantas" placeholder="Sin cambios" />
            <datalist id="mover-plantas">
              {plantas.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sector</Label>
            <Input value={sector} onChange={(e) => setSector(e.target.value)} list="mover-sectores" placeholder="Sin cambios" autoFocus />
            <datalist id="mover-sectores">
              {sectores.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Puesto / ubicación</Label>
            <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Sin cambios" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void mover()} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : <MapPin />} Mover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Escaneo en ráfaga: se escanean varias etiquetas seguidas (relevamiento de un sector)
 * y después se aplica una acción a todas: registrar el control o moverlas.
 */
export function EscaneoRafaga({ onClose, onMover, onDone }: { onClose: () => void; onMover: (ids: string[]) => void; onDone: () => void }) {
  const { data: activos = [] } = useActivosLite();
  const [leidos, setLeidos] = useState<ActivoLite[]>([]);
  const [desconocidos, setDesconocidos] = useState<string[]>([]);
  const [manual, setManual] = useState("");
  const [guardando, setGuardando] = useState(false);
  const porCodigo = useMemo(() => new Map(activos.map((a) => [a.codigo.toUpperCase(), a])), [activos]);
  const porId = useMemo(() => new Map(activos.map((a) => [a.id, a])), [activos]);

  const agregar = (texto: string) => {
    const q = leerQr(texto);
    const a = q?.id ? porId.get(q.id) : q?.codigo ? porCodigo.get(q.codigo.toUpperCase()) : undefined;
    if (!a) {
      pitido(false);
      setDesconocidos((d) => (d.includes(texto) ? d : [...d, texto]));
      return;
    }
    setLeidos((l) => {
      if (l.some((x) => x.id === a.id)) return l;
      pitido(true);
      return [a, ...l];
    });
  };

  const controlar = async () => {
    setGuardando(true);
    const r = await Promise.all(
      leidos.map((a) => api.rpc("controlar_inventario", { _inventario_id: a.id, _fecha_control: fechaLocal(), _estado: "operativo", _observacion: "Relevamiento con escaneo en ráfaga" })),
    );
    setGuardando(false);
    const fallas = r.filter((x) => (x as { error: unknown }).error).length;
    if (fallas) toast.error(`${fallas} controles no se pudieron registrar`);
    toast.success(`Control registrado en ${leidos.length - fallas} equipo(s)`);
    onDone();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" /> Escaneo en ráfaga
          </DialogTitle>
          <DialogDescription>Pasá por las etiquetas una tras otra. Al terminar, registrá el control de todas juntas o movelas de sector.</DialogDescription>
        </DialogHeader>
        <VisorQr activo continuo onResult={agregar} className="aspect-video w-full overflow-hidden rounded-xl" />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) agregar(manual.trim());
            setManual("");
          }}
        >
          <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="O escribí el código y Enter" className="h-9" />
        </form>
        <div className="space-y-1.5">
          <p className="eyebrow">Leídos ({leidos.length})</p>
          {leidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía ninguno.</p>
          ) : (
            <ul className="linea-tiempo max-h-52 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border">
              {leidos.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
                  <CheckCircle2 className="size-4 shrink-0 text-ok" />
                  <span className="num font-medium text-primary">{a.codigo}</span>
                  <span className="min-w-0 flex-1 truncate">{a.descripcion || a.nombre}</span>
                  <span className="hidden truncate text-xs text-muted-foreground sm:inline">{a.sector}</span>
                  <button type="button" className="rounded p-0.5 text-muted-foreground hover:text-foreground" aria-label="Quitar" onClick={() => setLeidos((l) => l.filter((x) => x.id !== a.id))}>
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {desconocidos.length > 0 && <p className="text-xs text-warn">No están en el inventario: {desconocidos.slice(-5).join(", ")}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cerrar
          </Button>
          <Button variant="outline" disabled={!leidos.length || guardando} onClick={() => onMover(leidos.map((a) => a.id))}>
            <MapPin /> Mover a…
          </Button>
          <Button disabled={!leidos.length || guardando} onClick={() => void controlar()}>
            {guardando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Registrar control
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
