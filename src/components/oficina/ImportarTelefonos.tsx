import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { type FilaTelefono, claveTelefono, parsearTelefonosCsv } from "./telefonos-csv";

/** Importa internos desde un CSV: muestra qué entra, qué está repetido y qué está incompleto antes de guardar. */
export function ImportarTelefonos({ existentes }: { existentes: { sector: string; nombre: string; interno: string }[] }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<null | { archivo: string; nuevos: FilaTelefono[]; repetidos: number; invalidas: number }>(null);
  const [guardando, setGuardando] = useState(false);

  const leer = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) return toast.error("Subí un archivo .csv (en Excel: Guardar como → CSV UTF-8).");
    const r = parsearTelefonosCsv(await file.text());
    if (r.error) return toast.error(r.error);
    const ya = new Set(existentes.map(claveTelefono));
    const vistos = new Set<string>();
    const nuevos: FilaTelefono[] = [];
    let repetidos = 0;
    for (const f of r.filas) {
      const k = claveTelefono(f);
      if (ya.has(k) || vistos.has(k)) repetidos++;
      else {
        vistos.add(k);
        nuevos.push(f);
      }
    }
    setVista({ archivo: file.name, nuevos, repetidos, invalidas: r.invalidas });
  };

  const importar = async () => {
    if (!vista?.nuevos.length) return;
    setGuardando(true);
    const { error } = await api.from("oficina_telefonos").insert(vista.nuevos.map((f, i) => ({ ...f, orden: i, activo: true })));
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`${vista.nuevos.length} interno${vista.nuevos.length === 1 ? "" : "s"} importado${vista.nuevos.length === 1 ? "" : "s"}`);
    setVista(null);
    await qc.invalidateQueries({ queryKey: ["oficina_telefonos"] });
  };

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => input.current?.click()}>
        <Upload className="size-4" /> Importar
      </Button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv,.txt"
        className="hidden"
        onChange={(e) => {
          void leer(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Dialog open={!!vista} onOpenChange={(o) => !o && setVista(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar internos</DialogTitle>
            <DialogDescription>{vista?.archivo}</DialogDescription>
          </DialogHeader>
          {vista && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border border-ok/30 bg-ok/8 p-2">
                  <p className="num text-xl font-semibold text-ok">{vista.nuevos.length}</p>
                  <p className="text-xs text-muted-foreground">nuevos</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-2">
                  <p className="num text-xl font-semibold">{vista.repetidos}</p>
                  <p className="text-xs text-muted-foreground">ya estaban</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-2">
                  <p className={vista.invalidas ? "num text-xl font-semibold text-warn" : "num text-xl font-semibold"}>{vista.invalidas}</p>
                  <p className="text-xs text-muted-foreground">incompletos</p>
                </div>
              </div>
              {vista.nuevos.length > 0 && (
                <div className="max-h-56 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <tbody>
                      {vista.nuevos.slice(0, 50).map((f) => (
                        <tr key={claveTelefono(f)} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-1.5 text-muted-foreground">{f.sector}</td>
                          <td className="px-2 py-1.5">{f.nombre}</td>
                          <td className="num px-2 py-1.5 text-right font-semibold">{f.interno}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {vista.nuevos.length > 50 && <p className="px-2 py-1.5 text-xs text-muted-foreground">y {vista.nuevos.length - 50} más…</p>}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Los repetidos (mismo sector, nombre e interno) y las filas sin sector, nombre o interno no se cargan.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setVista(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void importar()} disabled={guardando || !vista?.nuevos.length}>
              {guardando && <Loader2 className="animate-spin" />} Importar {vista?.nuevos.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
