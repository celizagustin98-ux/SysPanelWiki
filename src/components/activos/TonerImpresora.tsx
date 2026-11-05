import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Printer, Replace } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import type { Activo } from "./dialogs";

type Modelo = { id: string; nombre: string; stock: number };
type Cambio = { id: string; created_at: string; cantidad: number; toner_entra: string | null; responsable: string | null; modelo_id: string };

/**
 * Tóner de una impresora: qué modelo usa y registrar el cambio con un toque
 * (se descuenta del depósito y queda en el historial de la impresora).
 */
export function TonerImpresora({ item, onChanged }: { item: Activo & { toner_modelo_id?: string | null }; onChanged: () => void }) {
  const { profile, puedeEscribir, can } = useAuth();
  const puedeUsar = puedeEscribir("toners");
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [modeloId, setModeloId] = useState(item.toner_modelo_id ?? "");
  const [codigo, setCodigo] = useState("none");
  const [contador, setContador] = useState("");
  const [guardando, setGuardando] = useState(false);

  const { data: modelos = [] } = useQuery({
    queryKey: ["toner_modelos", "lite"],
    enabled: can("toners", "view"),
    staleTime: 60_000,
    queryFn: async () => ((await api.from("toner_modelos").select("id, nombre, stock").order("nombre")).data ?? []) as Modelo[],
  });
  const { data: cambios = [] } = useQuery({
    queryKey: ["toner_movimientos", "activo", item.id],
    enabled: can("toners", "view"),
    queryFn: async () =>
      ((await api.from("toner_movimientos").select("id, created_at, cantidad, toner_entra, responsable, modelo_id").eq("activo_id", item.id).order("created_at", { ascending: false }).limit(5)).data ?? []) as Cambio[],
  });
  const { data: disponibles = [] } = useQuery({
    queryKey: ["toner_unidades", "disponibles", modeloId],
    enabled: abierto && !!modeloId,
    queryFn: async () => ((await api.from("toner_unidades").select("id, codigo").eq("modelo_id", modeloId).eq("estado", "en_stock").order("codigo")).data ?? []) as { id: string; codigo: string }[],
  });
  if (!can("toners", "view")) return null;
  const modelo = modelos.find((m) => m.id === (item.toner_modelo_id ?? ""));
  const nombreModelo = (id: string) => modelos.find((m) => m.id === id)?.nombre ?? "Tóner";

  const registrar = async () => {
    const m = modelos.find((x) => x.id === modeloId);
    if (!m) return toast.error("Elegí el modelo de tóner");
    if (m.stock < 1) return toast.error(`No hay ${m.nombre} en el depósito`);
    setGuardando(true);
    const unidad = disponibles.find((u) => u.id === codigo);
    const sector = item.sector || item.planta || "Sin sector";
    const responsable = profile?.full_name ?? "";
    const { data, error } = await api.from("toner_movimientos").insert({
      modelo_id: m.id,
      tipo: "uso",
      cantidad: 1,
      sector,
      responsable,
      activo_id: item.id,
      toner_entra: unidad?.codigo ?? null,
      notas: [`Cambio en ${item.codigo}`, contador.trim() && `contador ${contador.trim()}`].filter(Boolean).join(" · "),
    });
    if (error) {
      setGuardando(false);
      return toast.error(error.message);
    }
    const mov = (Array.isArray(data) ? data[0] : data) as { id?: string } | null;
    if (unidad) {
      await api.from("toner_unidades").update({ estado: "usado", usado_at: new Date().toISOString(), usado_sector: sector, usado_por_nombre: responsable, movimiento_id: mov?.id ?? null }).eq("id", unidad.id).eq("estado", "en_stock");
    }
    // La impresora recuerda qué modelo usa; el contador queda en sus especificaciones.
    const extra: Record<string, unknown> = {};
    if (item.toner_modelo_id !== m.id) extra.toner_modelo_id = m.id;
    if (contador.trim()) extra.specs = { ...(item.specs ?? {}), contador: contador.trim() };
    if (Object.keys(extra).length) await api.from("inventario").update(extra).eq("id", item.id);
    setGuardando(false);
    toast.success(`Cambio de ${m.nombre} registrado en ${item.codigo}`);
    setAbierto(false);
    setContador("");
    setCodigo("none");
    void qc.invalidateQueries({ queryKey: ["toner_movimientos"] });
    void qc.invalidateQueries({ queryKey: ["toner_modelos"] });
    void qc.invalidateQueries({ queryKey: ["toner_consumo"] });
    onChanged();
  };

  return (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <Printer className="size-3.5" /> Tóner
        </p>
        {puedeUsar && (
          <Button
            size="sm"
            onClick={() => {
              setModeloId(item.toner_modelo_id ?? "");
              setAbierto(true);
            }}
          >
            <Replace className="size-3.5" /> Registrar cambio de tóner
          </Button>
        )}
      </div>
      <p className="text-sm">
        {modelo ? (
          <>
            Usa <span className="font-medium">{modelo.nombre}</span> <span className="text-muted-foreground">· {modelo.stock} en depósito</span>
          </>
        ) : (
          <span className="text-muted-foreground">Todavía no se registró qué tóner usa.</span>
        )}
      </p>
      {cambios.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {cambios.map((c) => (
            <li key={c.id}>
              {new Date(c.created_at).toLocaleDateString("es-AR")} · {nombreModelo(c.modelo_id)}
              {c.toner_entra ? ` (${c.toner_entra})` : ""}
              {c.responsable ? ` · ${c.responsable}` : ""}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={abierto} onOpenChange={(o) => !guardando && setAbierto(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cambio de tóner · {item.codigo}</DialogTitle>
            <DialogDescription>Se descuenta 1 del depósito y queda registrado en {item.sector || "el sector de la impresora"}.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Modelo</Label>
              <Select value={modeloId} onValueChange={(v) => { setModeloId(v); setCodigo("none"); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí el tóner" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id} disabled={m.stock < 1}>
                      {m.nombre} ({m.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {disponibles.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Código del tóner (opcional)</Label>
                <Select value={codigo} onValueChange={setCodigo}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin código</SelectItem>
                    {disponibles.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.codigo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Contador de páginas (opcional)</Label>
              <Input value={contador} onChange={(e) => setContador(e.target.value)} inputMode="numeric" className="num" placeholder={item.specs?.contador ?? "12.540"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={guardando || !modeloId}>
              {guardando ? <Loader2 className="animate-spin" /> : <Replace />} Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
