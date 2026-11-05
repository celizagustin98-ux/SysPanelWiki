import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FileText, Loader2, ShoppingCart, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ESTILO_DOC, encabezadoDoc, escHtml, imprimirHtml, pieDoc } from "@/lib/imprimir";
import { pronosticar } from "./pronostico";

type FilaModelo = { id: string; nombre: string; marca: string | null; stock: number; stock_minimo: number; usados: number; en_camino: number };
type FilaSector = { sector: string; usados: number; modelo_top: string | null };
type FilaImpresora = { id: string; codigo: string; nombre: string; sector: string | null; usados: number };

const RANGOS = [
  [30, "30 días"],
  [90, "90 días"],
  [180, "6 meses"],
  [365, "12 meses"],
] as const;

/** Consumo del período, pronóstico por modelo y el pedido sugerido listo para crear con un clic. */
export function usePedidoSugerido(dias: number, userId?: string, userName?: string | null, onPedido?: () => void) {
  const qc = useQueryClient();
  const [creando, setCreando] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["toner_consumo", dias],
    queryFn: async () => {
      const { data, error } = await api.rpc("consumo_toners", { _dias: dias });
      if (error) throw error;
      return data as { modelos: FilaModelo[]; sectores: FilaSector[]; impresoras?: FilaImpresora[] };
    },
  });

  const filas = useMemo(
    () =>
      (data?.modelos ?? [])
        .map((m) => ({ ...m, ...pronosticar({ stock: m.stock, minimo: m.stock_minimo, usados: m.usados, dias, enCamino: m.en_camino }) }))
        .sort((a, b) => (a.diasRestantes ?? 9999) - (b.diasRestantes ?? 9999) || b.sugerido - a.sugerido),
    [data, dias],
  );
  const aPedir = filas.filter((f) => f.sugerido > 0);

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
      onPedido?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setCreando(false);
    }
  };
  return { data, isLoading, filas, aPedir, crearPedido, creando };
}

/** Aviso en el depósito: modelos que se acaban y el pedido sugerido a un clic. */
export function AvisoPedidoSugerido({ canWrite, userId, userName, onPedido }: { canWrite: boolean; userId?: string; userName?: string | null; onPedido: () => void }) {
  const { aPedir, crearPedido, creando } = usePedidoSugerido(90, userId, userName, onPedido);
  if (!aPedir.length) return null;
  const unidades = aPedir.reduce((s, f) => s + f.sugerido, 0);
  return (
    <div className="panel flex flex-wrap items-center gap-3 border-warn/40 bg-warn/6 px-4 py-3">
      <ShoppingCart className="size-5 shrink-0 text-warn" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">
          Hay {aPedir.length} {aPedir.length === 1 ? "modelo" : "modelos"} para pedir ({unidades} u.)
        </p>
        <p className="truncate text-xs text-muted-foreground">{aPedir.map((f) => `${f.nombre} ×${f.sugerido}`).join(" · ")}</p>
      </div>
      {canWrite && (
        <Button size="sm" onClick={() => void crearPedido()} disabled={creando}>
          {creando ? <Loader2 className="animate-spin" /> : <ShoppingCart />} Generar pedido
        </Button>
      )}
    </div>
  );
}

/** Consumo de tóners: pronóstico de cuándo se acaba cada modelo, pedido sugerido y consumo por sector. */
export function ConsumoToners({ canWrite, userId, userName, onPedido }: { canWrite: boolean; userId?: string; userName?: string | null; onPedido: () => void }) {
  const [dias, setDias] = useState<number>(90);
  const { data, isLoading, filas, aPedir, crearPedido, creando } = usePedidoSugerido(dias, userId, userName, onPedido);
  const sectores = data?.sectores ?? [];
  const impresoras = data?.impresoras ?? [];
  const maxSector = Math.max(1, ...sectores.map((s) => s.usados));
  const maxImpresora = Math.max(1, ...impresoras.map((s) => s.usados));
  const totalUsados = filas.reduce((s, f) => s + f.usados, 0);
  const seAcabanEnMes = filas.filter((f) => f.diasRestantes != null && f.diasRestantes <= 30).length;

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
        <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={isLoading || !filas.length} onClick={() => imprimirInformeConsumo(dias, filas, sectores, impresoras)}>
          <FileText /> Informe para Dirección
        </Button>
        {canWrite && (
          <Button onClick={() => void crearPedido()} disabled={creando || !aPedir.length}>
            {creando ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
            {aPedir.length ? `Crear pedido sugerido (${aPedir.reduce((s, f) => s + f.sugerido, 0)} u.)` : "Nada para pedir"}
          </Button>
        )}
        </div>
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

        <Card className="panel xl:col-start-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Impresoras que más consumen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {!isLoading && impresoras.length === 0 && (
              <p className="text-sm text-muted-foreground">Todavía no hay cambios registrados por impresora. Registralos desde la ficha de la impresora (o escaneando su QR) para ver este ranking.</p>
            )}
            {impresoras.map((s, i) => (
              <div key={s.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">
                    <span className="num mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                    <span className="font-medium">{s.nombre}</span> <span className="num text-xs text-primary">{s.codigo}</span>
                  </span>
                  <span className="num shrink-0 text-muted-foreground">{s.usados} u.</span>
                </div>
                <div className="meter mt-1" style={{ ["--meter" as string]: "var(--warn)" }}>
                  <span style={{ width: `${(s.usados / maxImpresora) * 100}%` }} />
                </div>
                {s.sector && <p className="mt-0.5 text-[11px] text-muted-foreground">{s.sector}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Informe de consumo (modelos, sectores e impresoras) para presentar a Dirección. */
function imprimirInformeConsumo(dias: number, filas: (FilaModelo & { porDia: number; diasRestantes: number | null; sugerido: number })[], sectores: FilaSector[], impresoras: FilaImpresora[]) {
  const total = filas.reduce((s, f) => s + f.usados, 0);
  const tabla = (cab: string[], filasHtml: string) => `<table><thead><tr>${cab.map((c, i) => `<th${i ? ' class="r"' : ""}>${c}</th>`).join("")}</tr></thead><tbody>${filasHtml}</tbody></table>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Consumo de tóners</title><style>${ESTILO_DOC}</style></head><body>
    ${encabezadoDoc("Informe de consumo de tóners", `Últimos ${dias} días`)}
    <div class="grid">
      <div class="box"><label>Tóners usados</label><div>${total}</div></div>
      <div class="box"><label>Por mes (promedio)</label><div>${Math.round((total / dias) * 30)}</div></div>
      <div class="box"><label>Modelos para reponer</label><div>${filas.filter((f) => f.sugerido > 0).length}</div></div>
    </div>
    <h2>Impresoras que más consumen</h2>
    ${impresoras.length ? tabla(["Impresora", "Sector", "Tóners"], impresoras.map((i) => `<tr><td>${escHtml(i.nombre)} (${escHtml(i.codigo)})</td><td class="r">${escHtml(i.sector ?? "—")}</td><td class="r">${i.usados}</td></tr>`).join("")) : "<p class='small'>Sin cambios registrados por impresora en el período.</p>"}
    <h2>Consumo por sector</h2>
    ${tabla(["Sector", "Modelo más usado", "Tóners"], sectores.map((s) => `<tr><td>${escHtml(s.sector)}</td><td class="r">${escHtml(s.modelo_top ?? "—")}</td><td class="r">${s.usados}</td></tr>`).join(""))}
    <h2>Por modelo</h2>
    ${tabla(["Modelo", "Usados", "Por mes", "Stock", "Alcanza"], filas.map((f) => `<tr><td>${escHtml(f.nombre)}</td><td class="r">${f.usados}</td><td class="r">${(f.porDia * 30).toLocaleString("es-AR", { maximumFractionDigits: 1 })}</td><td class="r">${f.stock}</td><td class="r">${f.diasRestantes == null ? "—" : `${f.diasRestantes} días`}</td></tr>`).join(""))}
    <div class="pie">${pieDoc(`Consumo de tóners · últimos ${dias} días`)}</div>
  </body></html>`;
  imprimirHtml(html, "Consumo de tóners");
}
