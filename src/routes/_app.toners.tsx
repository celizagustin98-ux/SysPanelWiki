import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Copy,
  Download,
  Edit3,
  FileText,
  ListChecks,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PackageX,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { abrirPdfPedido } from "@/lib/toner-pedido-pdf";
import { cn } from "@/lib/utils";
import { StatTile } from "@/components/StatTile";

export const Route = createFileRoute("/_app/toners")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tóners · SysIntranet" },
      { name: "description", content: "Inventario en tiempo real: ingreso, uso y pedidos al proveedor." },
    ],
  }),
  component: TonersPage,
});

type Modelo = {
  id: string;
  nombre: string;
  marca: string | null;
  prefijo: string;
  correlativo: number;
  stock: number;
  stock_minimo: number;
};

type Movimiento = {
  id: string;
  modelo_id: string;
  tipo: string;
  cantidad: number;
  sector: string | null;
  responsable: string | null;
  toner_entra: string | null;
  toner_sale: string | null;
  notas: string | null;
  created_at: string;
  toner_modelos: { nombre: string } | null;
};

type Unidad = {
  id: string;
  modelo_id: string;
  codigo: string;
  estado: string;
  generado_por_nombre: string | null;
  lote_generacion_id: string | null;
  created_at: string;
  toner_modelos: { nombre: string } | null;
};

type Pedido = {
  id: string;
  numero: number;
  estado: string;
  proveedor: string | null;
  notas: string | null;
  created_by_nombre: string | null;
  enviado_at: string | null;
  recibido_at: string | null;
  created_at: string;
};

type PedidoItem = {
  id: string;
  pedido_id: string;
  modelo_id: string;
  cantidad: number;
  stock_al_pedir: number | null;
  cantidad_recibida: number;
  toner_modelos: { nombre: string } | null;
};

function TonersPage() {
  const { canWrite, profile, user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState("deposito");
  const [stockQuery, setStockQuery] = useState("");
  const [stockEstado, setStockEstado] = useState<"todos" | "ok" | "critico">("todos");
  const [movQuery, setMovQuery] = useState("");
  const [codigoQuery, setCodigoQuery] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  const [modeloSel, setModeloSel] = useState("");
  const [generados, setGenerados] = useState<string[]>([]);

  const { data: modelos = [] } = useQuery({
    queryKey: ["toner_modelos"],
    queryFn: async () => {
      const { data, error } = await api.from("toner_modelos").select("*").order("nombre");
      if (error) throw error;
      return data as Modelo[];
    },
  });

  const { data: movimientos = [] } = useQuery({
    queryKey: ["toner_movimientos"],
    queryFn: async () => {
      const { data, error } = await api
        .from("toner_movimientos")
        .select("*, toner_modelos(nombre)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Movimiento[];
    },
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ["toner_unidades"],
    queryFn: async () => {
      const { data, error } = await api
        .from("toner_unidades")
        .select("*, toner_modelos(nombre)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return data as Unidad[];
    },
  });

  const { data: pedidos = [] } = useQuery({
    queryKey: ["toner_pedidos"],
    queryFn: async () => {
      const { data, error } = await api
        .from("toner_pedidos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as Pedido[];
    },
  });

  const { data: pedidoItems = [] } = useQuery({
    queryKey: ["toner_pedido_items"],
    queryFn: async () => {
      const { data, error } = await api.from("toner_pedido_items").select("*, toner_modelos(nombre)");
      if (error) throw error;
      return data as PedidoItem[];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["toner_modelos"] });
    qc.invalidateQueries({ queryKey: ["toner_movimientos"] });
    qc.invalidateQueries({ queryKey: ["toner_unidades"] });
    qc.invalidateQueries({ queryKey: ["toner_pedidos"] });
    qc.invalidateQueries({ queryKey: ["toner_pedido_items"] });
  };

  const generar = useMutation({
    mutationFn: async ({ modelo_id, cantidad }: { modelo_id: string; cantidad: number }) => {
      const { data, error } = await api.rpc("generar_codigos_toner", {
        _modelo_id: modelo_id,
        _cantidad: cantidad,
      });
      if (error) throw error;
      return (data ?? []) as unknown as string[];
    },
    onSuccess: (codes) => {
      setGenerados(codes);
      toast.success(`${codes.length} código(s) generado(s)`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criticos = modelos.filter((m) => m.stock <= m.stock_minimo);
  const pedidosAbiertos = pedidos.filter((p) => p.estado === "borrador" || p.estado === "enviado");
  const modeloIdsPendientes = new Set(
    pedidoItems.filter((i) => pedidosAbiertos.some((p) => p.id === i.pedido_id)).map((i) => i.modelo_id),
  );
  const totalUnidades = modelos.reduce((s, m) => s + m.stock, 0);
  const responsableDefault = profile?.full_name || user?.email || "";

  const modelosFiltrados = useMemo(() => {
    const q = stockQuery.trim().toLowerCase();
    return modelos.filter((m) => {
      const coincide =
        !q ||
        m.nombre.toLowerCase().includes(q) ||
        (m.marca ?? "").toLowerCase().includes(q) ||
        m.prefijo.toLowerCase().includes(q);
      const critico = m.stock <= m.stock_minimo;
      const estadoOk = stockEstado === "todos" || (stockEstado === "critico" ? critico : !critico);
      return coincide && estadoOk;
    });
  }, [modelos, stockEstado, stockQuery]);

  const movimientosFiltrados = useMemo(() => {
    const q = movQuery.trim().toLowerCase();
    if (!q) return movimientos;
    return movimientos.filter((m) =>
      [m.tipo, m.sector, m.responsable, m.notas, m.toner_modelos?.nombre, m.toner_entra, m.toner_sale]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [movimientos, movQuery]);

  const lotesCodigos = useMemo(() => agruparCodigosGenerados(unidades), [unidades]);
  const lotesFiltrados = useMemo(() => {
    const q = codigoQuery.trim().toLowerCase();
    if (!q) return lotesCodigos;
    return lotesCodigos.filter((lote) =>
      [lote.codigoGenerado, lote.modelo, lote.generadoPor].some((v) => v.toLowerCase().includes(q)),
    );
  }, [codigoQuery, lotesCodigos]);

  const ultimoPorModelo = useMemo(() => {
    const map = new Map<string, Movimiento>();
    for (const m of movimientos) {
      if (!map.has(m.modelo_id)) map.set(m.modelo_id, m);
    }
    return map;
  }, [movimientos]);

  const descargarPdfPedido = (p: Pedido, items: PedidoItem[]) => {
    try {
      abrirPdfPedido({
        numero: p.numero,
        proveedor: p.proveedor,
        notas: p.notas,
        solicitante: p.created_by_nombre || responsableDefault,
        fecha: new Date(p.created_at),
        lineas: items.map((i) => {
          const mod = modelos.find((m) => m.id === i.modelo_id);
          return {
            nombre: i.toner_modelos?.nombre ?? mod?.nombre ?? i.modelo_id,
            marca: mod?.marca,
            stock: i.stock_al_pedir ?? mod?.stock ?? null,
            minimo: mod?.stock_minimo ?? null,
            cantidad: i.cantidad,
          };
        }),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo abrir el PDF");
    }
  };

  const eliminarPedido = async (p: Pedido) => {
    if (!confirm(`¿Eliminar PED-${p.numero}? Esta acción no se puede deshacer.`)) return;
    await api.from("toner_pedido_items").delete().eq("pedido_id", p.id);
    const { error } = await api.from("toner_pedidos").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Pedido eliminado");
    refresh();
  };

  return (
    <div>
      <PageHeader title="Tóners" description="Depósito en tiempo real: stock, movimientos y pedidos al proveedor." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3 stagger">
        <Kpi label="Modelos" value={modelos.length} icon={<Boxes className="size-4" />} />
        <Kpi label="Unidades en depósito" value={totalUnidades} icon={<PackageCheck className="size-4" />} />
        <Kpi label="Stock crítico" value={criticos.length} icon={<AlertTriangle className="size-4" />} danger />
      </div>

      {criticos.length > 0 && (
        <Card className="panel mb-4 border-destructive/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <AlertTriangle className="size-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Críticos (hasta recibir pedido):</span>
            {criticos.map((m) => (
              <Badge key={m.id} variant="destructive">
                {m.nombre} · {m.stock}/{m.stock_minimo}
              </Badge>
            ))}
            {canWrite && (
              <Button size="sm" className="ml-auto" variant="secondary" onClick={() => setTab("pedidos")}>
                <ShoppingCart className="size-4" /> Ir a Pedidos
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="deposito">Depósito</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="pedidos" className="gap-1.5">
            Pedidos
            {criticos.length > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {criticos.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="codigos">Códigos</TabsTrigger>
        </TabsList>

        <TabsContent value="deposito" className="mt-4">
          <Card className="panel overflow-hidden">
            <CardHeader className="border-b border-border/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Stock del depósito</CardTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">Ingreso suma. Uso descuenta. Crítico hasta recibir pedido.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canWrite && (
                    <>
                      <IngresoDialog modelos={modelos} responsableDefault={responsableDefault} onDone={refresh} />
                      <UsoDialog modelos={modelos} responsableDefault={responsableDefault} onDone={refresh} />
                      <ModeloDialog onDone={refresh} />
                    </>
                  )}
                  <Button type="button" variant="outline" size="sm" onClick={() => exportCsv("deposito-toners.csv", ["Modelo", "Marca", "Prefijo", "Stock", "Minimo", "Estado"], modelosFiltrados.map((m) => [m.nombre, m.marca ?? "", m.prefijo, m.stock, m.stock_minimo, m.stock <= m.stock_minimo ? "Critico" : "OK"]))}>
                    <Download className="size-4" /> Exportar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input className="pl-9" value={stockQuery} onChange={(e) => setStockQuery(e.target.value)} placeholder="Buscar modelo, marca, prefijo…" />
                </div>
                <Select value={stockEstado} onValueChange={(v) => setStockEstado(v as typeof stockEstado)}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="ok">Stock OK</SelectItem>
                    <SelectItem value="critico">Críticos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Disponibles</TableHead>
                      <TableHead>Mínimo</TableHead>
                      <TableHead>Último movimiento</TableHead>
                      {canWrite && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelosFiltrados.map((m) => {
                      const bajo = m.stock <= m.stock_minimo;
                      const ultimo = ultimoPorModelo.get(m.id);
                      return (
                        <TableRow key={m.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className={cn("grid size-8 place-items-center rounded-md", bajo ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>
                                {bajo ? <PackageX className="size-4" /> : <PackageCheck className="size-4" />}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{m.nombre}</p>
                                <p className="truncate text-xs text-muted-foreground">{m.marca || "—"} · <span className="font-mono">{m.prefijo}</span></p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="min-w-44">
                            <div className="flex items-center gap-2">
                              <span className="num text-lg font-semibold">{m.stock}</span>
                              <Badge variant={bajo ? "crit" : m.stock <= m.stock_minimo * 2 ? "warn" : "ok"}>
                                {bajo ? "Crítico" : m.stock <= m.stock_minimo * 2 ? "Bajo" : "OK"}
                              </Badge>
                            </div>
                            <div
                              className="meter mt-1.5 w-32"
                              style={{ ["--meter" as string]: bajo ? "var(--crit)" : m.stock <= m.stock_minimo * 2 ? "var(--warn)" : "var(--ok)" }}
                              title={`${m.stock} de ${Math.max(m.stock_minimo * 3, 1)} recomendadas`}
                            >
                              <span style={{ width: `${Math.min(100, (m.stock / Math.max(m.stock_minimo * 3, 1)) * 100)}%` }} />
                            </div>
                            {modeloIdsPendientes.has(m.id) && (
                              <Badge variant="outline" className="ml-1 border-warn/50 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]">En pedido</Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">{m.stock_minimo}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ultimo ? `${movimientoLabel(ultimo.tipo)} · ${new Date(ultimo.created_at).toLocaleDateString("es-AR")}` : "—"}
                          </TableCell>
                          {canWrite && (
                            <TableCell className="text-right">
                              <div className="flex flex-wrap justify-end gap-1">
                                <IngresoDialog modelos={modelos} modeloFijo={m} responsableDefault={responsableDefault} onDone={refresh} trigger={<Button size="sm" variant="secondary" className="h-8"><PackagePlus className="size-3.5" /> Ingresar</Button>} />
                                <UsoDialog modelos={modelos} modeloFijo={m} responsableDefault={responsableDefault} onDone={refresh} trigger={<Button size="sm" variant="outline" className="h-8"><PackageMinus className="size-3.5" /> Usar</Button>} />
                                <ModeloDialog modelo={m} onDone={refresh} />
                                <EliminarModeloDialog modelo={m} onDone={refresh} />
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {modelosFiltrados.length === 0 && (
                      <TableRow><TableCell colSpan={canWrite ? 5 : 4} className="py-12 text-center text-sm text-muted-foreground">No hay modelos.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos" className="mt-4">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base"><ListChecks className="size-4 text-primary" /> Kardex de movimientos</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={() => exportCsv("movimientos-toner.csv", ["Fecha", "Tipo", "Modelo", "Cant", "Sector", "Responsable", "Notas"], movimientosFiltrados.map((m) => [new Date(m.created_at).toLocaleString("es-AR"), m.tipo, m.toner_modelos?.nombre ?? "", m.cantidad, m.sector ?? "", m.responsable ?? "", m.notas ?? ""])) }>
                <Download className="size-4" /> Exportar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={movQuery} onChange={(e) => setMovQuery(e.target.value)} placeholder="Buscar…" />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Modelo</TableHead><TableHead>Cant.</TableHead><TableHead>Sector</TableHead><TableHead>Responsable</TableHead><TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientosFiltrados.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-xs">{new Date(m.created_at).toLocaleString("es-AR")}</TableCell>
                        <TableCell><Badge variant={tipoBadgeVariant(m.tipo)}>{movimientoLabel(m.tipo)}</Badge></TableCell>
                        <TableCell>{m.toner_modelos?.nombre ?? "—"}</TableCell>
                        <TableCell className="font-mono tabular-nums">{m.cantidad}</TableCell>
                        <TableCell>{m.sector || "—"}</TableCell>
                        <TableCell>{m.responsable || "—"}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{[m.toner_entra && `entra ${m.toner_entra}`, m.toner_sale && `sale ${m.toner_sale}`, m.notas].filter(Boolean).join(" · ") || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {movimientosFiltrados.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">Sin movimientos.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pedidos" className="mt-4 space-y-4">
          <Card className="panel">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base"><ShoppingCart className="size-4 text-primary" /> Pedidos al proveedor</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Al recibir, confirmá si llegó todo o cargá las cantidades reales.</p>
              </div>
              {canWrite && <PedidoDialog modelos={modelos} criticos={criticos} userId={user?.id} userName={profile?.full_name} onDone={refresh} />}
            </CardHeader>
            <CardContent className="space-y-4">
              {criticos.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-destructive">Stock crítico ({criticos.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {criticos.map((m) => (
                      <Badge key={m.id} variant="outline" className="font-normal">{m.nombre}: {m.stock}/{m.stock_minimo}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {pedidos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 py-14 text-center">
                  <ClipboardList className="mx-auto mb-3 size-10 text-muted-foreground/50" />
                  <p className="font-medium">Todavía no hay pedidos</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pedidos.map((p) => {
                    const items = pedidoItems.filter((i) => i.pedido_id === p.id);
                    const total = items.reduce((s, i) => s + i.cantidad, 0);
                    return (
                      <div key={p.id} className="rounded-xl border border-border/70 bg-card/40 p-4 shadow-sm">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-base font-bold">PED-{p.numero}</span>
                              <Badge variant={pedidoEstadoVariant(p.estado)} className="capitalize">{p.estado}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{p.proveedor || "Sin proveedor"} · {items.length} modelo(s) · {total} u.</p>
                            <p className="text-xs text-muted-foreground">{new Date(p.created_at).toLocaleString("es-AR")}{p.created_by_nombre ? ` · ${p.created_by_nombre}` : ""}</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Button size="sm" onClick={() => descargarPdfPedido(p, items)}><FileText className="size-3.5" /> PDF</Button>
                            <Button size="sm" variant="outline" onClick={() => exportPedidoCsv(p, items)}><Download className="size-3.5" /> CSV</Button>
                            {canWrite && p.estado === "borrador" && (
                              <Button size="sm" variant="secondary" onClick={async () => {
                                const { error } = await api.from("toner_pedidos").update({ estado: "enviado", enviado_at: new Date().toISOString() }).eq("id", p.id);
                                if (error) return toast.error(error.message);
                                toast.success("Marcado como enviado");
                                refresh();
                              }}>Enviado</Button>
                            )}
                            {canWrite && (p.estado === "enviado" || p.estado === "borrador") && (
                              <RecibirPedidoDialog pedido={p} items={items} responsable={responsableDefault} onDone={refresh} />
                            )}
                            {canWrite && (
                              <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Eliminar" onClick={() => eliminarPedido(p)}>
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {items.length > 0 && (
                          <div className="mt-3 overflow-hidden rounded-lg border border-border/60">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/30">
                                  <TableHead>Modelo</TableHead>
                                  <TableHead className="w-24 text-right">Cant.</TableHead>
                                  <TableHead className="w-28 text-right">Stock al pedir</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {items.map((i) => (
                                  <TableRow key={i.id}>
                                    <TableCell className="text-sm">{i.toner_modelos?.nombre ?? i.modelo_id}</TableCell>
                                    <TableCell className="text-right font-mono tabular-nums">{i.cantidad}</TableCell>
                                    <TableCell className="text-right font-mono text-muted-foreground tabular-nums">{i.stock_al_pedir ?? "—"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codigos" className="mt-4">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Códigos de etiqueta</CardTitle>
              {canWrite && <Button onClick={() => setGenOpen(true)}><Wand2 className="size-4" /> Generar códigos</Button>}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" value={codigoQuery} onChange={(e) => setCodigoQuery(e.target.value)} placeholder="Buscar…" />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Códigos</TableHead><TableHead>Modelo</TableHead><TableHead>Cant.</TableHead><TableHead>Generado por</TableHead><TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lotesFiltrados.map((lote) => (
                      <TableRow key={lote.id}>
                        <TableCell className="font-mono text-sm font-semibold">{lote.codigoGenerado}</TableCell>
                        <TableCell>{lote.modelo}</TableCell>
                        <TableCell><Badge variant="secondary">{lote.cantidad}</Badge></TableCell>
                        <TableCell>{lote.generadoPor}</TableCell>
                        <TableCell className="text-xs">{lote.fechaGenerado}</TableCell>
                      </TableRow>
                    ))}
                    {lotesFiltrados.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">Sin lotes.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <GenerarCodigosDialog open={genOpen} setOpen={setGenOpen} modelos={modelos} modeloSel={modeloSel} setModeloSel={setModeloSel} generados={generados} setGenerados={setGenerados} generar={generar} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RecibirPedidoDialog({
  pedido,
  items,
  responsable,
  onDone,
}: {
  pedido: Pedido;
  items: PedidoItem[];
  responsable: string;
  onDone: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [parcialOpen, setParcialOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const totalPedido = items.reduce((s, i) => s + i.cantidad, 0);

  const abrirConfirm = () => {
    const init: Record<string, string> = {};
    for (const i of items) init[i.id] = String(i.cantidad);
    setCantidades(init);
    setConfirmOpen(true);
  };

  const recibir = async (recibidos: { item: PedidoItem; cantidad: number }[]) => {
    const validos = recibidos.filter((r) => r.cantidad > 0);
    if (!validos.length) return toast.error("Indicá al menos una cantidad recibida");
    if (saving) return;
    setSaving(true);
    // Se marca el pedido como recibido solo si todavía no lo estaba: evita ingresar el stock dos veces
    // (doble clic o dos personas recibiendo el mismo pedido).
    const claim = (await api
      .from("toner_pedidos")
      .update({ estado: "recibido", recibido_at: new Date().toISOString() })
      .eq("id", pedido.id)
      .neq("estado", "recibido")) as { count?: number; error: Error | null };
    if (claim.error) {
      setSaving(false);
      return toast.error(claim.error.message);
    }
    if (!claim.count) {
      setSaving(false);
      setConfirmOpen(false);
      setParcialOpen(false);
      onDone();
      return toast.info(`PED-${pedido.numero} ya estaba recibido`);
    }
    for (const { item, cantidad } of validos) {
      const { error } = await api.from("toner_movimientos").insert({
        modelo_id: item.modelo_id,
        tipo: "ingreso",
        cantidad,
        responsable,
        notas: `Recepcion PED-${pedido.numero}`,
      });
      if (error) {
        setSaving(false);
        return toast.error(error.message);
      }
      await api.from("toner_pedido_items").update({ cantidad_recibida: cantidad }).eq("id", item.id);
    }
    setSaving(false);
    toast.success(`Recibidas ${validos.reduce((s, r) => s + r.cantidad, 0)} u. · stock actualizado`);
    setConfirmOpen(false);
    setParcialOpen(false);
    onDone();
  };

  return (
    <>
      <Button size="sm" onClick={abrirConfirm} disabled={saving || pedido.estado === "recibido"}>
        <PackagePlus className="size-3.5" /> Recibir
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Recibiste PED-{pedido.numero} completo?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Se ingresarán <strong className="text-foreground">{totalPedido}</strong> unidades al depósito:
                </p>
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                  {items.map((i) => (
                    <li key={i.id}>
                      {i.toner_modelos?.nombre ?? i.modelo_id}: <strong>{i.cantidad}</strong>
                    </li>
                  ))}
                </ul>
                <p>Si llegó todo, aceptá. Si llegó distinto, cargá las cantidades reales.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setConfirmOpen(false);
                setParcialOpen(true);
              }}
            >
              No, cargar cantidades
            </Button>
            <AlertDialogAction
              disabled={saving}
              onClick={async (e) => {
                e.preventDefault();
                await recibir(items.map((item) => ({ item, cantidad: item.cantidad })));
              }}
            >
              {saving ? "Guardando…" : "Sí, recibí todo"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={parcialOpen} onOpenChange={setParcialOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cantidades recibidas · PED-{pedido.numero}</DialogTitle>
            <DialogDescription>Solo se suman al depósito las unidades que indiques.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-3 overflow-y-auto">
            {items.map((i) => (
              <div key={i.id} className="grid grid-cols-[1fr_88px] items-center gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{i.toner_modelos?.nombre ?? i.modelo_id}</p>
                  <p className="text-xs text-muted-foreground">Pedido: {i.cantidad}</p>
                </div>
                <Input
                  type="number"
                  min={0}
                  className="h-9 text-right"
                  value={cantidades[i.id] ?? ""}
                  onChange={(e) => setCantidades((prev) => ({ ...prev, [i.id]: e.target.value }))}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setParcialOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={async () => {
                await recibir(
                  items.map((item) => ({
                    item,
                    cantidad: Math.max(0, Number(cantidades[item.id] || 0)),
                  })),
                );
              }}
            >
              {saving ? "Guardando…" : "Confirmar recepción"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Kpi({ label, value, icon, danger }: { label: string; value: number; icon: ReactNode; danger?: boolean }) {
  return <StatTile label={label} value={value} icon={icon} tone={danger ? (value > 0 ? "crit" : "ok") : "neutral"} />;
}

function IngresoDialog({ modelos, modeloFijo, responsableDefault, onDone, trigger }: { modelos: Modelo[]; modeloFijo?: Modelo; responsableDefault: string; onDone: () => void; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeloId, setModeloId] = useState(modeloFijo?.id ?? "");
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && modeloFijo) setModeloId(modeloFijo.id); }}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm"><PackagePlus className="size-4" /> Ingresar stock</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingresar stock</DialogTitle>
          <DialogDescription>Sumá unidades al depósito.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const fd = new FormData(e.currentTarget);
          const mid = modeloFijo?.id || modeloId;
          if (!mid) return toast.error("Elegí un modelo");
          const cantidad = Number(fd.get("cantidad") || 1);
          if (!Number.isFinite(cantidad) || cantidad < 1) return toast.error("Cantidad inválida");
          setSaving(true);
          const { error } = await api.from("toner_movimientos").insert({ modelo_id: mid, tipo: "ingreso", cantidad, responsable: String(fd.get("responsable") || responsableDefault), notas: String(fd.get("notas") || "") });
          setSaving(false);
          if (error) return toast.error(error.message);
          toast.success(`+${cantidad} al depósito`);
          setOpen(false);
          onDone();
        }}>
          {!modeloFijo && (
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={setModeloId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre} (stock {m.stock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {modeloFijo && <p className="text-sm font-medium">{modeloFijo.nombre}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Cantidad</Label><Input type="number" name="cantidad" min={1} defaultValue={1} /></div>
            <div className="space-y-1.5"><Label>Responsable</Label><Input name="responsable" defaultValue={responsableDefault} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notas / remito</Label><Input name="notas" placeholder="Nº remito…" /></div>
          <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Ingresar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsoDialog({ modelos, modeloFijo, responsableDefault, onDone, trigger }: { modelos: Modelo[]; modeloFijo?: Modelo; responsableDefault: string; onDone: () => void; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeloId, setModeloId] = useState(modeloFijo?.id ?? "");
  const modelo = modeloFijo || modelos.find((m) => m.id === modeloId);
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o && modeloFijo) setModeloId(modeloFijo.id); }}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm" variant="secondary"><PackageMinus className="size-4" /> Usar / reponer</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usar tóner del depósito</DialogTitle>
          <DialogDescription>Descuenta stock al instalar en un sector.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const fd = new FormData(e.currentTarget);
          const mid = modeloFijo?.id || modeloId;
          if (!mid) return toast.error("Elegí un modelo");
          const cantidad = Number(fd.get("cantidad") || 1);
          const stock = modelo?.stock ?? 0;
          if (!Number.isFinite(cantidad) || cantidad < 1) return toast.error("Cantidad inválida");
          if (cantidad > stock) return toast.error("No hay stock suficiente");
          const sector = String(fd.get("sector") || "").trim();
          if (!sector) return toast.error("Indicá el sector");
          setSaving(true);
          const { error } = await api.from("toner_movimientos").insert({
            modelo_id: mid, tipo: "uso", cantidad, sector,
            responsable: String(fd.get("responsable") || responsableDefault),
            toner_entra: String(fd.get("toner_entra") || "").trim() || null,
            toner_sale: String(fd.get("toner_sale") || "").trim() || null,
            notas: String(fd.get("notas") || ""),
          });
          setSaving(false);
          if (error) return toast.error(error.message);
          toast.success(`-${cantidad} del depósito`);
          setOpen(false);
          onDone();
        }}>
          {!modeloFijo && (
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={setModeloId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                <SelectContent>{modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre} (disp. {m.stock})</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {modeloFijo && <p className="text-sm"><span className="font-medium">{modeloFijo.nombre}</span><span className="text-muted-foreground"> · disp. {modeloFijo.stock}</span></p>}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Cantidad</Label><Input type="number" name="cantidad" min={1} defaultValue={1} /></div>
            <div className="space-y-1.5"><Label>Sector</Label><Input name="sector" required placeholder="RRHH…" /></div>
            <div className="space-y-1.5"><Label>Código entra (opc.)</Label><Input name="toner_entra" /></div>
            <div className="space-y-1.5"><Label>Código sale (opc.)</Label><Input name="toner_sale" /></div>
            <div className="col-span-2 space-y-1.5"><Label>Responsable</Label><Input name="responsable" defaultValue={responsableDefault} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notas</Label><Input name="notas" /></div>
          </div>
          <DialogFooter><Button type="submit" disabled={saving}>{saving ? "Registrando…" : "Descontar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PedidoDialog({ modelos, criticos, userId, userName, onDone }: { modelos: Modelo[]; criticos: Modelo[]; userId?: string; userName?: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [notas, setNotas] = useState("");
  const [filtro, setFiltro] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cantidades, setCantidades] = useState<Record<string, string>>({});

  const abrir = (o: boolean) => {
    setOpen(o);
    if (o) {
      setProveedor("");
      setNotas("");
      setFiltro("");
      setSelected(new Set(criticos.map((m) => m.id)));
      setCantidades({});
    }
  };

  const modelosVisibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    const list = [...modelos].sort((a, b) => {
      const ac = a.stock <= a.stock_minimo ? 0 : 1;
      const bc = b.stock <= b.stock_minimo ? 0 : 1;
      if (ac !== bc) return ac - bc;
      return a.nombre.localeCompare(b.nombre, "es");
    });
    if (!q) return list;
    return list.filter((m) => m.nombre.toLowerCase().includes(q) || (m.marca ?? "").toLowerCase().includes(q) || m.prefijo.toLowerCase().includes(q));
  }, [modelos, filtro]);

  const seleccionados = modelos.filter((m) => selected.has(m.id)).map((m) => ({ modelo: m, cantidad: Number(cantidades[m.id] || 0) })).filter((x) => x.cantidad > 0);
  const totalUnidades = seleccionados.reduce((s, x) => s + x.cantidad, 0);

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger asChild><Button><Plus className="size-4" /> Nuevo pedido</Button></DialogTrigger>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>Nuevo pedido a proveedor</DialogTitle>
          <DialogDescription>Críticos primero. Definí vos la cantidad.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Proveedor</Label><Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Nombre" /></div>
            <div className="space-y-1.5"><Label>Notas</Label><Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Filtrar…" />
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setSelected(new Set(criticos.map((m) => m.id)))}>Marcar críticos</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => { setSelected(new Set()); setCantidades({}); }}>Limpiar</Button>
          </div>
          <div className="overflow-hidden rounded-lg border border-border/70">
            <div className="grid grid-cols-[auto_1fr_72px_96px] gap-2 border-b border-border/70 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span /><span>Modelo</span><span className="text-right">Stock</span><span className="text-right">Cantidad</span>
            </div>
            <div className="max-h-[38vh] overflow-y-auto">
              {modelosVisibles.map((m) => {
                const critico = m.stock <= m.stock_minimo;
                const checked = selected.has(m.id);
                return (
                  <div key={m.id} className={cn("grid grid-cols-[auto_1fr_72px_96px] items-center gap-2 border-b border-border/50 px-3 py-2.5", checked && "bg-primary/5", critico && "bg-destructive/[0.04]")}>
                    <input type="checkbox" className="size-4 accent-teal-500" checked={checked} onChange={(e) => {
                      setSelected((prev) => { const next = new Set(prev); if (e.target.checked) next.add(m.id); else next.delete(m.id); return next; });
                      if (!e.target.checked) setCantidades((prev) => { const next = { ...prev }; delete next[m.id]; return next; });
                    }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.marca || "Sin marca"}{critico && <span className="ml-2 text-destructive">· crítico</span>}</p>
                    </div>
                    <span className="text-right font-mono text-sm tabular-nums">{m.stock}<span className="text-muted-foreground">/{m.stock_minimo}</span></span>
                    <Input type="number" min={1} className="h-8 text-right" disabled={!checked} value={cantidades[m.id] ?? ""} placeholder={checked ? "¿Cuántos?" : "—"} onChange={(e) => {
                      const v = e.target.value;
                      setCantidades((prev) => ({ ...prev, [m.id]: v }));
                      if (v && Number(v) > 0) setSelected((prev) => new Set(prev).add(m.id));
                    }} />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-sm">
            <span>Con cantidad: <strong>{seleccionados.length}</strong></span>
            <span>Total: <strong className="font-mono">{totalUnidades}</strong> u.</span>
          </div>
        </div>
        <DialogFooter className="border-t border-border/70 px-5 py-3">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" disabled={saving || seleccionados.length === 0} onClick={async () => {
            if (saving) return;
            if (!seleccionados.length) return toast.error("Indicá cantidad en al menos un modelo");
            setSaving(true);
            const { data: pedido, error } = await api.from("toner_pedidos").insert({
              estado: "borrador", proveedor: proveedor.trim() || null, notas: notas.trim() || null,
              created_by: userId ?? null, created_by_nombre: userName ?? null,
            });
            if (error || !pedido) { setSaving(false); return toast.error(error?.message || "No se pudo crear"); }
            const pedidoRow = pedido as Pedido;
            for (const { modelo, cantidad } of seleccionados) {
              const { error: itemErr } = await api.from("toner_pedido_items").insert({
                pedido_id: pedidoRow.id, modelo_id: modelo.id, cantidad, stock_al_pedir: modelo.stock,
              });
              if (itemErr) { setSaving(false); return toast.error(itemErr.message); }
            }
            setSaving(false);
            toast.success(`Pedido PED-${pedidoRow.numero} creado`);
            setOpen(false);
            onDone();
            try {
              abrirPdfPedido({
                numero: pedidoRow.numero, proveedor: proveedor.trim() || null, notas: notas.trim() || null, solicitante: userName ?? null,
                lineas: seleccionados.map(({ modelo, cantidad }) => ({ nombre: modelo.nombre, marca: modelo.marca, stock: modelo.stock, minimo: modelo.stock_minimo, cantidad })),
              });
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Pedido creado; falló el PDF");
            }
          }}>
            <FileText className="size-4" />{saving ? "Creando…" : "Crear e imprimir PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeloDialog({ modelo, onDone }: { modelo?: Modelo; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEditing = !!modelo;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isEditing ? <Button size="icon" variant="ghost" className="size-8" title="Editar"><Edit3 className="size-4" /></Button> : <Button size="sm" variant="outline"><Plus className="size-4" /> Nuevo modelo</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isEditing ? "Editar modelo" : "Nuevo modelo"}</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const fd = new FormData(e.currentTarget);
          const nombre = String(fd.get("nombre") || "").trim();
          const marca = String(fd.get("marca") || "").trim();
          const prefijo = String(fd.get("prefijo") || "").trim().toLowerCase();
          const stockMinimo = Number(fd.get("stock_minimo") || 0);
          if (nombre.length < 2) return toast.error("Ingresá el modelo");
          if (!/^[a-z0-9_-]{2,16}$/.test(prefijo)) return toast.error("Prefijo inválido");
          if (!Number.isFinite(stockMinimo) || stockMinimo < 0) return toast.error("Mínimo inválido");
          setSaving(true);
          const payload = isEditing ? { nombre, marca, prefijo, stock_minimo: stockMinimo } : { nombre, marca, prefijo, stock: 0, stock_minimo: stockMinimo };
          const { error } = isEditing ? await api.from("toner_modelos").update(payload).eq("id", modelo.id) : await api.from("toner_modelos").insert(payload);
          setSaving(false);
          if (error) return toast.error(error.message);
          toast.success(isEditing ? "Actualizado" : "Creado");
          setOpen(false);
          onDone();
        }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2"><Label>Modelo</Label><Input name="nombre" required defaultValue={modelo?.nombre ?? ""} /></div>
            <div className="space-y-1.5"><Label>Marca</Label><Input name="marca" defaultValue={modelo?.marca ?? ""} /></div>
            <div className="space-y-1.5"><Label>Prefijo</Label><Input name="prefijo" required defaultValue={modelo?.prefijo ?? ""} /></div>
            <div className="space-y-1.5"><Label>Stock mínimo</Label><Input type="number" name="stock_minimo" min={0} defaultValue={modelo?.stock_minimo ?? 2} /></div>
          </div>
          <DialogFooter><Button type="submit" disabled={saving}><Save className="size-4" /> {saving ? "…" : "Guardar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EliminarModeloDialog({ modelo, onDone }: { modelo: Modelo; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => setOpen(true)}><Trash2 className="size-4" /></Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar modelo</AlertDialogTitle>
          <AlertDialogDescription>Se eliminará "{modelo.nombre}".</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async (ev) => {
            ev.preventDefault();
            setDeleting(true);
            const { error } = await api.from("toner_modelos").delete().eq("id", modelo.id);
            setDeleting(false);
            if (error) return toast.error(error.message);
            toast.success("Eliminado");
            setOpen(false);
            onDone();
          }}>{deleting ? "…" : "Eliminar"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function GenerarCodigosDialog({ open, setOpen, modelos, modeloSel, setModeloSel, generados, setGenerados, generar }: {
  open: boolean; setOpen: (o: boolean) => void; modelos: Modelo[]; modeloSel: string; setModeloSel: (v: string) => void;
  generados: string[]; setGenerados: (v: string[]) => void;
  generar: ReturnType<typeof useMutation<string[], Error, { modelo_id: string; cantidad: number }>>;
}) {
  const modeloSeleccionado = modelos.find((m) => m.id === modeloSel);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) { setModeloSel(""); setGenerados([]); generar.reset(); }
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {generados.length > 0 ? (
          <>
            <DialogHeader><DialogTitle>Códigos generados</DialogTitle><DialogDescription>{modeloSeleccionado?.nombre}</DialogDescription></DialogHeader>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {generados.map((c, i) => (
                <div key={c} className="flex justify-between rounded-md bg-muted/40 px-2 py-1.5 font-mono text-sm">
                  <span className="text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>{c}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { navigator.clipboard.writeText(generados.join("\n")); toast.success("Copiado"); }}><Copy className="size-4" /> Copiar</Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>Listo</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader><DialogTitle>Generar códigos</DialogTitle></DialogHeader>
            <form className="grid gap-3" onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const cantidad = Number(fd.get("cantidad") || 1);
              if (!modeloSel) return toast.error("Elegí modelo");
              generar.mutate({ modelo_id: modeloSel, cantidad });
            }}>
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Select value={modeloSel} onValueChange={setModeloSel}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                  <SelectContent>{modelos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre} · próximo {m.correlativo + 1}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Cantidad</Label><Input type="number" name="cantidad" min={1} max={200} defaultValue={1} /></div>
              <DialogFooter><Button type="submit" disabled={generar.isPending}>{generar.isPending ? "…" : "Generar"}</Button></DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function movimientoLabel(tipo: string) {
  const map: Record<string, string> = { ingreso: "Ingreso", cargar: "Ingreso", entrada: "Ingreso", uso: "Uso", consumo: "Uso", salida: "Uso", reposicion: "Reposición", ajuste: "Ajuste" };
  return map[tipo] || tipo;
}
function tipoBadgeVariant(tipo: string): "secondary" | "outline" | "destructive" | "default" {
  if (["ingreso", "cargar", "entrada"].includes(tipo)) return "secondary";
  if (["uso", "consumo", "salida", "reposicion"].includes(tipo)) return "outline";
  return "default";
}
function pedidoEstadoVariant(estado: string): "secondary" | "outline" | "destructive" | "default" {
  if (estado === "recibido") return "secondary";
  if (estado === "enviado") return "default";
  if (estado === "cancelado") return "destructive";
  return "outline";
}
function exportPedidoCsv(p: Pedido, items: PedidoItem[]) {
  exportCsv("pedido-PED-" + p.numero + ".csv", ["Pedido", "Estado", "Proveedor", "Modelo", "Cantidad", "Stock al pedir"], items.map((i) => ["PED-" + p.numero, p.estado, p.proveedor ?? "", i.toner_modelos?.nombre ?? i.modelo_id, i.cantidad, i.stock_al_pedir ?? ""]));
  toast.success("CSV exportado");
}
function exportCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n;]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

type LoteCodigos = { id: string; codigoGenerado: string; modelo: string; cantidad: number; generadoPor: string; fechaGenerado: string; sortDate: number };
function agruparCodigosGenerados(unidades: Unidad[]): LoteCodigos[] {
  const grupos = new Map<string, Unidad[]>();
  for (const u of unidades) {
    const fecha = new Date(u.created_at);
    const minuto = Number.isNaN(fecha.getTime()) ? u.created_at : fecha.toISOString().slice(0, 16);
    const key = u.lote_generacion_id || u.modelo_id + "|" + (u.generado_por_nombre || "") + "|" + minuto;
    grupos.set(key, [...(grupos.get(key) ?? []), u]);
  }
  return Array.from(grupos.entries())
    .map(([id, items]) => {
      const ordenados = [...items].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true }));
      const primero = ordenados[0];
      const desde = ordenados[0]?.codigo;
      const hasta = ordenados[ordenados.length - 1]?.codigo;
      return {
        id,
        codigoGenerado: ordenados.length === 1 ? desde : desde + " al " + hasta,
        modelo: primero.toner_modelos?.nombre ?? "—",
        cantidad: ordenados.length,
        generadoPor: primero.generado_por_nombre || "—",
        fechaGenerado: new Date(primero.created_at).getTime() ? new Date(primero.created_at).toLocaleString("es-AR") : "—",
        sortDate: new Date(primero.created_at).getTime(),
      };
    })
    .sort((a, b) => b.sortDate - a.sortDate);
}
