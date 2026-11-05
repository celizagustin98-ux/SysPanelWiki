import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useMemo, useState } from "react";
import { ArrowLeftRight, Check, CopyPlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { nightEndIso, nightStartIso, planCopiaGuardias, type Guardia } from "./domain";

type Operario = { nombre: string; code: string; color: string };

/** Completa las noches vacías del período repitiendo la planilla de hace 1 o 4 semanas. */
export function CopiarPlanilla({ dias, guardias, onDone }: { dias: Date[]; guardias: Guardia[]; onDone: () => Promise<void> | void }) {
  const [abierto, setAbierto] = useState(false);
  const [semanas, setSemanas] = useState("4");
  const [guardando, setGuardando] = useState(false);
  const plan = useMemo(() => (abierto ? planCopiaGuardias(dias, guardias, Number(semanas)) : []), [abierto, dias, guardias, semanas]);

  const aplicar = async () => {
    setGuardando(true);
    const { error } = await api.from("guardias").insert(
      plan.map((p) => ({ operador_nombre: p.operador, desde: nightStartIso(p.dia), hasta: nightEndIso(p.dia), notas: "Guardia 1 noche" })),
    );
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`${plan.length} noches cargadas`);
    setAbierto(false);
    await onDone();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAbierto(true)}>
        <CopyPlus className="size-3.5" /> Copiar planilla anterior
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !guardando && setAbierto(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copiar la planilla anterior</DialogTitle>
            <DialogDescription>Completa solo las noches vacías, con quien estuvo de guardia el mismo día de la semana. No pisa lo cargado ni a quien esté de vacaciones.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Repetir lo de</Label>
            <Select value={semanas} onValueChange={setSemanas}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">La semana anterior</SelectItem>
                <SelectItem value="2">Hace 2 semanas (rotación quincenal)</SelectItem>
                <SelectItem value="4">Hace 4 semanas (mismo esquema mensual)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {plan.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">No hay noches para completar con esa opción.</p>
          ) : (
            <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
              {plan.map((p) => (
                <li key={p.dia.toISOString()} className="flex justify-between gap-2">
                  <span className="first-letter:uppercase">{format(p.dia, "EEE d/MM", { locale: es })}</span>
                  <span className="font-medium">{p.operador}</span>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void aplicar()} disabled={guardando || !plan.length}>
              {guardando && <Loader2 className="animate-spin" />} Cargar {plan.length || ""} noches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type Intercambio = {
  id: string;
  fecha: string;
  de_nombre: string;
  a_nombre: string;
  devuelve_fecha: string | null;
  motivo: string | null;
  estado: string;
  pedido_por: string | null;
  pedido_por_nombre: string | null;
};

const fechaCorta = (f: string) => format(new Date(`${f.slice(0, 10)}T00:00:00`), "EEE d/MM", { locale: es });

export function useIntercambios() {
  return useQuery({
    queryKey: ["guardia_intercambios"],
    queryFn: async () =>
      ((await api.from("guardia_intercambios").select("*").eq("estado", "pendiente").order("fecha")).data ?? []).map((r: Intercambio) => ({
        ...r,
        fecha: String(r.fecha).slice(0, 10),
        devuelve_fecha: r.devuelve_fecha ? String(r.devuelve_fecha).slice(0, 10) : null,
      })) as Intercambio[],
  });
}

/** Pedido de intercambio desde la celda: quién cubre esa noche y, si quiere, qué noche devuelve. */
export function PedirIntercambio({ de, dia, operarios, onListo }: { de: string; dia: Date; operarios: Operario[]; onListo: () => void }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [a, setA] = useState("");
  const [devuelve, setDevuelve] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const enviar = async () => {
    if (!a) return toast.error("Elegí quién cubre la guardia");
    setGuardando(true);
    const { error } = await api.from("guardia_intercambios").insert({
      fecha: format(dia, "yyyy-MM-dd"),
      de_nombre: de,
      a_nombre: a,
      devuelve_fecha: devuelve || null,
      motivo: motivo.trim() || null,
      pedido_por: profile?.id ?? null,
      pedido_por_nombre: profile?.full_name ?? null,
    });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Pedido de intercambio enviado: falta que lo apruebe un administrador");
    void qc.invalidateQueries({ queryKey: ["guardia_intercambios"] });
    onListo();
  };
  return (
    <div className="space-y-2 rounded-xl border border-info/30 bg-info/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ArrowLeftRight className="size-4 text-info" /> Pedir intercambio
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">La cubre</Label>
          <Select value={a} onValueChange={setA}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Compañero…" />
            </SelectTrigger>
            <SelectContent>
              {operarios
                .filter((o) => o.nombre !== de)
                .map((o) => (
                  <SelectItem key={o.nombre} value={o.nombre}>
                    {o.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">A cambio de la noche (opcional)</Label>
          <Input type="date" value={devuelve} onChange={(e) => setDevuelve(e.target.value)} className="h-9 [color-scheme:light] dark:[color-scheme:dark]" />
        </div>
      </div>
      <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="h-9" />
      <Button size="sm" onClick={() => void enviar()} disabled={guardando}>
        {guardando && <Loader2 className="animate-spin" />} Enviar pedido
      </Button>
    </div>
  );
}

/** Intercambios pendientes: el administrador los aprueba (se aplican en la planilla) o los rechaza. */
export function IntercambiosPendientes({ operarios, onAplicar }: { operarios: Operario[]; onAplicar: (op: Operario, dia: Date) => Promise<void> }) {
  const { isAdmin, profile } = useAuth();
  const qc = useQueryClient();
  const { data: lista = [] } = useIntercambios();
  const [ocupado, setOcupado] = useState<string | null>(null);
  if (!lista.length) return null;

  const resolver = async (it: Intercambio, estado: "aprobado" | "rechazado" | "cancelado") => {
    setOcupado(it.id);
    try {
      if (estado === "aprobado") {
        const cubre = operarios.find((o) => o.nombre === it.a_nombre);
        const devuelve = operarios.find((o) => o.nombre === it.de_nombre);
        if (!cubre) throw new Error(`${it.a_nombre} ya no está en la lista de operarios`);
        await onAplicar(cubre, new Date(`${it.fecha}T00:00:00`));
        if (it.devuelve_fecha && devuelve) await onAplicar(devuelve, new Date(`${it.devuelve_fecha}T00:00:00`));
      }
      const { error } = await api
        .from("guardia_intercambios")
        .update({ estado, resuelto_por_nombre: profile?.full_name ?? null, resuelto_at: new Date().toISOString() })
        .eq("id", it.id);
      if (error) throw new Error(error.message);
      toast.success(estado === "aprobado" ? "Intercambio aplicado en la planilla" : estado === "rechazado" ? "Intercambio rechazado" : "Pedido cancelado");
      void qc.invalidateQueries({ queryKey: ["guardia_intercambios"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo resolver");
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="panel space-y-2 border-info/35 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <ArrowLeftRight className="size-4 text-info" /> Intercambios pendientes ({lista.length})
      </p>
      <ul className="divide-y divide-border/60">
        {lista.map((it) => (
          <li key={it.id} className={cn("flex flex-wrap items-center gap-2 py-2 text-sm", ocupado === it.id && "opacity-60")}>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{it.a_nombre}</span> cubre a <span className="font-medium">{it.de_nombre}</span> el {fechaCorta(it.fecha)}
              {it.devuelve_fecha && <> · y {it.de_nombre} devuelve el {fechaCorta(it.devuelve_fecha)}</>}
              {it.motivo && <span className="block text-xs text-muted-foreground">{it.motivo}</span>}
              {it.pedido_por_nombre && <span className="block text-[11px] text-muted-foreground">Pidió {it.pedido_por_nombre}</span>}
            </span>
            {isAdmin ? (
              <span className="flex gap-1">
                <Button size="sm" className="h-7" disabled={!!ocupado} onClick={() => void resolver(it, "aprobado")}>
                  <Check className="size-3.5" /> Aprobar
                </Button>
                <Button size="sm" variant="outline" className="h-7" disabled={!!ocupado} onClick={() => void resolver(it, "rechazado")}>
                  <X className="size-3.5" /> Rechazar
                </Button>
              </span>
            ) : it.pedido_por === profile?.id ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={!!ocupado} onClick={() => void resolver(it, "cancelado")}>
                Cancelar pedido
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">Esperando aprobación</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tope de horas extras por empleado en el período (lo fija el administrador). */
export function useTopeHorasExtras() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["ajuste", "tope_horas_extras"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const v = (await api.rpc("ajuste_leer", { _clave: "tope_horas_extras" })).data;
      return typeof v === "number" && v > 0 ? v : null;
    },
  });
  const guardar = async (horas: number | null) => {
    const { error } = await api.rpc("ajuste_guardar", { _clave: "tope_horas_extras", _valor: horas });
    if (error) return toast.error(error.message);
    toast.success(horas ? `Tope fijado en ${horas} h por período` : "Tope quitado");
    void qc.invalidateQueries({ queryKey: ["ajuste", "tope_horas_extras"] });
  };
  return { tope: data ?? null, guardar };
}
