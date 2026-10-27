import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, Printer, Tags } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { etiquetasLibresGenerar, etiquetasMarcar } from "@/backend/api/qr.functions";
import { FORMATOS_ETIQUETA, htmlEtiquetas, imprimirEtiquetas, type DatoEtiqueta, type FormatoEtiqueta } from "@/lib/etiquetas";
import { cn } from "@/lib/utils";
import type { Activo } from "./dialogs";
import { useQrAjustes } from "./useQrAjustes";

const MAX = 300;
const FORMATO_KEY = "nodara.etiquetas.formato";

type Alcance = "seleccionados" | "filtrados" | "pendientes" | "reimprimir";

function dato(a: Activo): DatoEtiqueta {
  return {
    codigo: a.codigo,
    descripcion: a.descripcion || a.nombre,
    sector: a.sector,
    planta: a.planta,
    ubicacion: a.ubicacion_detalle,
    serie: a.numero_serie,
  };
}

function formatoGuardado(): FormatoEtiqueta {
  try {
    const f = localStorage.getItem(FORMATO_KEY);
    if (f === "rollo" || f === "mini" || f === "a4") return f;
  } catch {
    /* sin almacenamiento */
  }
  return "rollo";
}

/** Imprimir etiquetas QR: elegir qué equipos y en qué formato, y marcar las que salieron bien. */
export function ImprimirEtiquetas({
  trigger,
  seleccionados,
  filtrados,
  todos,
  abrirCon,
}: {
  trigger: ReactNode;
  seleccionados: Activo[];
  filtrados: Activo[];
  todos: Activo[];
  /** Al abrir desde la planilla de un equipo: imprime solo ese. */
  abrirCon?: Alcance;
}) {
  const qc = useQueryClient();
  const { ajustes } = useQrAjustes();
  const [open, setOpen] = useState(false);
  const [formato, setFormato] = useState<FormatoEtiqueta>(formatoGuardado);
  const [alcance, setAlcance] = useState<Alcance>("pendientes");
  const [confirmar, setConfirmar] = useState<Activo[] | null>(null);
  const [preview, setPreview] = useState("");
  const [cantidadLibres, setCantidadLibres] = useState(10);
  const [busy, setBusy] = useState(false);

  const grupos = useMemo(
    () => ({
      seleccionados,
      filtrados,
      pendientes: todos.filter((a) => !a.etiqueta_impresa_at && a.estado !== "baja"),
      reimprimir: todos.filter((a) => a.etiqueta_reimprimir),
    }),
    [seleccionados, filtrados, todos],
  );
  const lista = grupos[alcance];

  useEffect(() => {
    if (!open) return;
    setConfirmar(null);
    setAlcance(abrirCon ?? (seleccionados.length ? "seleccionados" : grupos.pendientes.length ? "pendientes" : "filtrados"));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vista previa de la primera etiqueta con el formato elegido.
  useEffect(() => {
    if (!open) return;
    const muestra: DatoEtiqueta = lista[0] ? dato(lista[0]) : { codigo: "INV-00123", descripcion: "PC administrativa", sector: "Facturación", planta: "PB", ubicacion: "Puesto 3" };
    let vivo = true;
    void htmlEtiquetas([muestra], formato, ajustes.anchoMm, ajustes.urlBase).then((h) => vivo && setPreview(h));
    return () => {
      vivo = false;
    };
  }, [open, formato, lista, ajustes.anchoMm, ajustes.urlBase]);

  const elegirFormato = (f: FormatoEtiqueta) => {
    setFormato(f);
    try {
      localStorage.setItem(FORMATO_KEY, f);
    } catch {
      /* sin almacenamiento */
    }
  };

  // De a tandas: al marcar una tanda como impresa, la siguiente aparece sola en "Sin etiqueta".
  const tanda = lista.slice(0, MAX);

  const imprimir = async () => {
    if (!tanda.length) return toast.error("No hay equipos para imprimir");
    setBusy(true);
    await imprimirEtiquetas(tanda.map(dato), formato, ajustes.anchoMm, ajustes.urlBase);
    setBusy(false);
    setConfirmar(tanda);
  };

  const marcarImpresas = async () => {
    if (!confirmar) return;
    setBusy(true);
    try {
      const r = await etiquetasMarcar({ data: { ids: confirmar.map((a) => a.id), impresas: true } });
      toast.success(`${r.n} etiqueta${r.n === 1 ? "" : "s"} marcada${r.n === 1 ? "" : "s"} como impresa${r.n === 1 ? "" : "s"}`);
      void qc.invalidateQueries({ queryKey: ["inventario"] });
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo marcar");
    } finally {
      setBusy(false);
    }
  };

  const imprimirLibres = async () => {
    setBusy(true);
    try {
      const { codigos } = await etiquetasLibresGenerar({ data: { cantidad: cantidadLibres } });
      await imprimirEtiquetas(
        codigos.map((codigo) => ({ codigo, libre: true })),
        formato,
        ajustes.anchoMm,
        ajustes.urlBase,
      );
      toast.success(`Reservados ${codigos[0]} a ${codigos[codigos.length - 1]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudieron generar");
    } finally {
      setBusy(false);
    }
  };

  const opciones: { value: Alcance; label: string; ayuda: string }[] = [
    ...(seleccionados.length ? [{ value: "seleccionados" as const, label: "Seleccionados", ayuda: "Los que tildaste en la tabla" }] : []),
    { value: "pendientes", label: "Sin etiqueta", ayuda: "Nunca se imprimió su etiqueta" },
    { value: "reimprimir", label: "Para reimprimir", ayuda: "Marcados como dañados o perdidos" },
    { value: "filtrados", label: "Filtrados", ayuda: "Lo que muestra la tabla ahora" },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(var(--av)*0.92)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tags className="size-5 text-primary" /> Etiquetas QR
          </DialogTitle>
          <DialogDescription>
            Impresora térmica de rollo {ajustes.anchoMm} mm (se cambia en Configuración) u hoja A4.
          </DialogDescription>
        </DialogHeader>

        {confirmar ? (
          <div className="py-4 text-center">
            <Printer className="mx-auto size-10 text-primary" />
            <h3 className="mt-3 font-semibold">¿Salieron bien las {confirmar.length} etiquetas?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Si las marcás como impresas dejan de aparecer en "Sin etiqueta" y en "Para reimprimir".
            </p>
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="outline" onClick={() => setConfirmar(null)}>
                No, volver
              </Button>
              <Button onClick={() => void marcarImpresas()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Sí, marcar impresas
              </Button>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="equipos">
            <TabsList className="mb-3">
              <TabsTrigger value="equipos">Equipos</TabsTrigger>
              <TabsTrigger value="blanco">Etiquetas en blanco</TabsTrigger>
            </TabsList>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <div className="space-y-4">
                <TabsContent value="equipos" className="mt-0 space-y-2">
                  <Label>Qué imprimir</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {opciones.map((o) => (
                      <Opcion key={o.value} activa={alcance === o.value} onClick={() => setAlcance(o.value)} titulo={o.label} ayuda={o.ayuda} n={grupos[o.value].length} />
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="blanco" className="mt-0 space-y-2">
                  <Label htmlFor="cant">Cantidad</Label>
                  <Input
                    id="cant"
                    type="number"
                    min={1}
                    max={200}
                    value={cantidadLibres}
                    onChange={(e) => setCantidadLibres(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                    className="w-32"
                  />
                  <p className="text-xs text-muted-foreground">
                    Se reservan los próximos códigos correlativos. Pegás la etiqueta en el equipo nuevo, la escaneás y el sistema abre el alta con
                    ese código.
                  </p>
                  <Button onClick={() => void imprimirLibres()} disabled={busy} className="mt-2">
                    {busy ? <Loader2 className="animate-spin" /> : <Printer />} Generar e imprimir {cantidadLibres}
                  </Button>
                </TabsContent>

                <div className="space-y-2">
                  <Label>Formato</Label>
                  <div className="grid gap-2">
                    {FORMATOS_ETIQUETA.map((f) => (
                      <Opcion key={f.value} activa={formato === f.value} onClick={() => elegirFormato(f.value)} titulo={f.label} ayuda={f.ayuda} />
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <Label>Vista previa</Label>
                <div className="mt-2 grid place-items-center rounded-xl border border-border bg-muted/40 p-3">
                  <iframe
                    title="Vista previa de etiqueta"
                    srcDoc={preview.replace("</style>", "html,body{overflow:hidden}</style>")}
                    scrolling="no"
                    className="pointer-events-none origin-top rounded bg-white shadow-sm"
                    style={
                      formato === "a4"
                        ? { width: 300, height: 140, transform: "scale(.6)", marginBottom: -56 }
                        : { width: `${ajustes.anchoMm}mm`, height: formato === "mini" ? "24mm" : ajustes.anchoMm >= 80 ? "70mm" : "60mm" }
                    }
                  />
                </div>
              </div>
            </div>

            <TabsContent value="equipos" className="mt-0">
              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={() => void imprimir()} disabled={busy || !lista.length}>
                  {busy ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir {tanda.length}
                  {lista.length > MAX && ` de ${lista.length}`}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Opcion({ activa, onClick, titulo, ayuda, n }: { activa: boolean; onClick: () => void; titulo: string; ayuda: string; n?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-left transition-colors",
        activa ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border hover:border-primary/40",
      )}
    >
      <span className="flex items-center justify-between gap-2 text-sm font-medium">
        {titulo}
        {n != null && <span className="num text-xs text-muted-foreground">{n}</span>}
      </span>
      <span className="block text-[11px] text-muted-foreground">{ayuda}</span>
    </button>
  );
}
