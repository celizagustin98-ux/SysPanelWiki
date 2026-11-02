import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Loader2, ShoppingCart, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { pronosticar } from "./pronostico";

type FilaModelo = { id: string; nombre: string; marca: string | null; stock: number; stock_minimo: number; usados: number; en_camino: number };
type FilaSector = { sector: string; usados: number; modelo_top: string | null };

const RANGOS = [
  [30, "30 días"],
  [90, "90 días"],
  [180, "6 meses"],
  [365, "12 meses"],
] as const;

/** Consumo de tóners: pronóstico de cuándo se acaba cada modelo, pedido sugerido y consumo por sector. */
export function ConsumoToners({ canWrite, userId, userName, onPedido }: { canWrite: boolean; userId?: string; userName?: string | null; onPedido: () => void }) {
  const qc = useQueryClient();
  const [dias, setDias] = useState<number>(90);
  const [creando, setCreando] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["toner_consumo", dias],
    queryFn: async () => {
      const { data, error } = await api.rpc("consumo_toners", { _dias: dias });
      if (error) throw error;
      return data as { modelos: FilaModelo[]; sectores: FilaSector[] };
    },
  });

  const filas = useMemo(
    () =>
      (data?.modelos ?? [])
        .map((m) => ({ ...m, ...pronosticar({ stock: m.stock, minimo: m.stock_minimo, usados: m.usados, dias, enCamino: m.en_camino }) }))
        .sort((a, b) => (a.diasRestantes ?? 9999) - (b.diasRestantes ?? 9999) || b.sugerido - a.sugerido),
    [data, dias],
  );
  const sectores = data?.sectores ?? [];
  const maxSector = Math.max(1, ...sectores.map((s) => s.usados));
  const aPedir = filas.filter((f) => f.sugerido > 0);
  const totalUsados = filas.reduce((s, f) => s + f.usados, 0);
  const seAcabanEnMes = filas.filter((f) => f.diasRestantes != null && f.diasRestantes <= 30).length;

  const crearPedido = async () => {
    if (!aPedir.length) return;
    setCreando(true);
    try {
      const { data: pedido, error } = await api.from("toner_pedidos").insert({
        estado: "borrador",
        notas: `Pedido sugerido según el consumo de los últimos ${dias} días (cubre 30 días y deja el mínimo).`,
        created_by: userId ?? null,
        created_by_nombre: userName ?? null,
      });
      if (error || !pedido) throw new Error(error?.message || "No se pudo crear el pedido");
      const p = pedido as { id: string; numero: number };
      const { error: errItems } = await api
        .from("toner_pedido_items")
        .insert(aPedir.map((f) => ({ pedido_id: p.id, modelo_id: f.id, cantidad: f.sugerido, stock_al_pedir: f.stock })));
      if (errItems) throw new Error(errItems.message);
      toast.success(`Pedido PED-${p.numero} creado en borrador: revisalo antes de enviarlo`);
      await qc.invalidateQueries({ queryKey: ["toner_pedidos"] });
      await qc.invalidateQueries({ queryKey: ["toner_pedido_items"] });
      await qc.invalidateQueries({ queryKey: ["toner_consumo"] });
      onPedido();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-xs">
          {RANGOS.map(([d, label]) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={cn("rounded-md px-3 py-1.5 text-[13px] font-medium transition", dias === d ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        {canWrite && (
          <Button onClick={() => void crearPedido()} disabled={creando || !aPedir.length}>
            {creando ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
            {aPedir.length ? `Crear pedido sugerido (${aPedir.reduce((s, f) => s + f.sugerido, 0)} u.)` : "Nada para pedir"}
          </Button>
        )}
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        <StatTile label="Usados en el período" value={isLoading ? "—" : totalUsados} hint={`últimos ${dias} días`} />
        <StatTile label="Se acaban en 30 días" value={isLoading ? "—" : seAcabanEnMes} tone={seAcabanEnMes ? "warn" : "ok"} hint="al ritmo actual" />
        <StatTile label="Modelos para pedir" value={isLoading ? "—" : aPedir.length} tone={aPedir.length ? "warn" : "ok"} hint="para cubrir el próximo mes" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr] xl:items-start">
        <Card className="panel overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingDown className="size-4 text-primary" /> Pronóstico por modelo
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">Modelo</th>
                    <th className="px-3 py-2 text-right">Stock</th>
                    <th className="px-3 py-2 text-right">Usados</th>
                    <th className="px-3 py-2 text-right">Por mes</th>
                    <th className="px-3 py-2 text-right">Alcanza</th>
                    <th className="px-3 py-2 text-right">Pedido</th>
                    <th className="px-4 py-2 text-right">Sugerido</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={7} className="p-4">
                        <div className="skeleton h-10" />
                      </td>
                    </tr>
                  )}
                  {filas.map((f) => (
                    <tr key={f.id} className="border-t border-border/50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{f.nombre}</p>
                        {f.marca && <p className="text-xs text-muted-foreground">{f.marca}</p>}
                      </td>
                      <td className={cn("num px-3 py-2.5 text-right", f.stock <= f.stock_minimo && "font-semibold text-crit")}>
                        {f.stock}
                        <span className="text-muted-foreground">/{f.stock_minimo}</span>
                      </td>
                      <td className="num px-3 py-2.5 text-right">{f.usados}</td>
                      <td className="num px-3 py-2.5 text-right text-muted-foreground">{(f.porDia * 30).toLocaleString("es-AR", { maximumFractionDigits: 1 })}</td>
                      <td className="px-3 py-2.5 text-right">
                        {f.diasRestantes == null ? (
                          <span className="text-xs text-muted-foreground">sin uso</span>
                        ) : (
                          <Badge variant={f.diasRestantes <= 15 ? "crit" : f.diasRestantes <= 30 ? "warn" : "ok"} className="num">
                            {f.diasRestantes === 0 ? "sin stock" : `${f.diasRestantes} días`}
                          </Badge>
                        )}
                      </td>
                      <td className="num px-3 py-2.5 text-right text-muted-foreground">{f.en_camino || "—"}</td>
                      <td className={cn("num px-4 py-2.5 text-right font-semibold", f.sugerido ? "text-primary" : "text-muted-foreground")}>{f.sugerido || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
              "Alcanza" es cuántos días dura el stock al ritmo del período elegido. "Sugerido" cubre los próximos 30 días y deja el mínimo, descontando lo que ya
              está pedido.
            </p>
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Consumo por sector</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {!isLoading && sectores.length === 0 && <p className="text-sm text-muted-foreground">No hubo consumo en el período.</p>}
            {sectores.map((s) => (
              <div key={s.sector}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{s.sector}</span>
                  <span className="num shrink-0 text-muted-foreground">{s.usados} u.</span>
                </div>
                <div className="meter mt-1" style={{ ["--meter" as string]: "var(--primary)" }}>
                  <span style={{ width: `${(s.usados / maxSector) * 100}%` }} />
                </div>
                {s.modelo_top && <p className="mt-0.5 text-[11px] text-muted-foreground">Más usado: {s.modelo_top}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
