import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Copy,
  Download,
  Edit3,
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/toners")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tóners | Depósito y pedidos" },
      {
        name: "description",
        content: "Inventario en tiempo real: ingreso de pedidos, uso en sector y pedidos al proveedor.",
      },
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
  toner_codigo: string | null;
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
  const totalUnidades = modelos.reduce((s, m) => s + m.stock, 0);

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

  const responsableDefault = profile?.full_name || user?.email || "";

  return (
    <div>
      <PageHeader
        title="Tóners"
        description="Depósito en tiempo real: ingresá pedidos, descontá al usar y generá pedidos al proveedor."
        action={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <IngresoDialog modelos={modelos} responsableDefault={responsableDefault} onDone={refresh} />
              <UsoDialog modelos={modelos} responsableDefault={responsableDefault} onDone={refresh} />
              <ModeloDialog onDone={refresh} />
            </div>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Kpi label="Modelos" value={modelos.length} icon={<Boxes className="size-4" />} />
        <Kpi label="Unidades en depósito" value={totalUnidades} icon={<PackageCheck className="size-4" />} />
        <Kpi
          label="Stock crítico"
          value={criticos.length}
          icon={<AlertTriangle className="size-4" />}
          danger={criticos.length > 0}
        />
      </div>

      {criticos.length > 0 && (
        <Card className="panel mb-4 border-destructive/40">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <AlertTriangle className="size-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">Críticos:</span>
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

        {/* —— DEPÓSITO —— */}
        <TabsContent value="deposito" className="mt-4 space-y-4">
          <Card className="panel overflow-hidden">
            <CardHeader className="border-b border-border/70 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Stock del depósito</CardTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Ingreso suma unidades. Uso / reposición las descuenta al instante.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportCsv(
                      "deposito-toners.csv",
                      ["Modelo", "Marca", "Prefijo", "Stock", "Mínimo", "Estado"],
                      modelosFiltrados.map((m) => [
                        m.nombre,
                        m.marca ?? "",
                        m.prefijo,
                        m.stock,
                        m.stock_minimo,
                        m.stock <= m.stock_minimo ? "Critico" : "OK",
                      ]),
                    )
                  }
                >
                  <Download className="size-4" /> Exportar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1 sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={stockQuery}
                    onChange={(e) => setStockQuery(e.target.value)}
                    placeholder="Buscar modelo, marca, prefijo…"
                  />
                </div>
                <Select value={stockEstado} onValueChange={(v) => setStockEstado(v as typeof stockEstado)}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
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
                      <TableHead className="w-[120px]">Disponibles</TableHead>
                      <TableHead className="w-[100px]">Mínimo</TableHead>
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
                              <div
                                className={cn(
                                  "grid size-8 place-items-center rounded-md",
                                  bajo
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-primary/10 text-primary",
                                )}
                              >
                                {bajo ? <PackageX className="size-4" /> : <PackageCheck className="size-4" />}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold">{m.nombre}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {m.marca || "—"} · <span className="font-mono">{m.prefijo}</span>
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-lg font-bold tabular-nums">{m.stock}</span>
                            <Badge variant={bajo ? "destructive" : "secondary"} className="ml-2">
                              {bajo ? "Crítico" : "OK"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono tabular-nums">{m.stock_minimo}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {ultimo
                              ? `${movimientoLabel(ultimo.tipo)} · ${new Date(ultimo.created_at).toLocaleDateString("es-AR")}`
                              : "—"}
                          </TableCell>
                          {canWrite && (
                            <TableCell className="text-right">
                              <div className="flex flex-wrap justify-end gap-1">
                                <IngresoDialog
                                  modelos={modelos}
                                  modeloFijo={m}
                                  responsableDefault={responsableDefault}
                                  onDone={refresh}
                                  trigger={
                                    <Button size="sm" variant="secondary" className="h-8">
                                      <PackagePlus className="size-3.5" /> Ingresar
                                    </Button>
                                  }
                                />
                                <UsoDialog
                                  modelos={modelos}
                                  modeloFijo={m}
                                  responsableDefault={responsableDefault}
                                  onDone={refresh}
                                  trigger={
                                    <Button size="sm" variant="outline" className="h-8">
                                      <PackageMinus className="size-3.5" /> Usar
                                    </Button>
                                  }
                                />
                                <ModeloDialog modelo={m} onDone={refresh} />
                                <EliminarModeloDialog modelo={m} onDone={refresh} />
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {modelosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={canWrite ? 5 : 4} className="py-12 text-center text-sm text-muted-foreground">
                          No hay modelos para mostrar.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* —— MOVIMIENTOS —— */}
        <TabsContent value="movimientos" className="mt-4">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ListChecks className="size-4 text-primary" /> Kardex de movimientos
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Ingresos, usos, reposiciones y ajustes.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  exportCsv(
                    "movimientos-toner.csv",
                    ["Fecha", "Tipo", "Modelo", "Cant", "Sector", "Responsable", "Notas"],
                    movimientosFiltrados.map((m) => [
                      new Date(m.created_at).toLocaleString("es-AR"),
                      m.tipo,
                      m.toner_modelos?.nombre ?? "",
                      m.cantidad,
                      m.sector ?? "",
                      m.responsable ?? "",
                      m.notas ?? "",
                    ]),
                  )
                }
              >
                <Download className="size-4" /> Exportar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={movQuery}
                  onChange={(e) => setMovQuery(e.target.value)}
                  placeholder="Buscar en movimientos…"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Sector</TableHead>
                      <TableHead>Responsable</TableHead>
                      <TableHead>Detalle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movimientosFiltrados.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {new Date(m.created_at).toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={tipoBadgeVariant(m.tipo)}>{movimientoLabel(m.tipo)}</Badge>
                        </TableCell>
                        <TableCell>{m.toner_modelos?.nombre ?? "—"}</TableCell>
                        <TableCell className="font-mono tabular-nums">{m.cantidad}</TableCell>
                        <TableCell>{m.sector || "—"}</TableCell>
                        <TableCell>{m.responsable || "—"}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                          {[m.toner_entra && `entra ${m.toner_entra}`, m.toner_sale && `sale ${m.toner_sale}`, m.notas]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {movimientosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                          Sin movimientos.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* —— PEDIDOS —— */}
        <TabsContent value="pedidos" className="mt-4 space-y-4">
          <Card className="panel">
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="size-4 text-primary" /> Pedidos al proveedor
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Armá el pedido con los tóners en rojo y exportalo para enviárselo al proveedor.
                </p>
              </div>
              {canWrite && (
                <PedidoDialog
                  modelos={modelos}
                  criticos={criticos}
                  userId={user?.id}
                  userName={profile?.full_name}
                  onDone={refresh}
                />
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {criticos.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-destructive">
                    Sugeridos para pedido ({criticos.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {criticos.map((m) => {
                      const sugerido = Math.max(m.stock_minimo * 2 - m.stock, m.stock_minimo, 1);
                      return (
                        <Badge key={m.id} variant="outline" className="font-normal">
                          {m.nombre}: stock {m.stock} → pedir ~{sugerido}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nº</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Ítems</TableHead>
                      <TableHead>Creado</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pedidos.map((p) => {
                      const items = pedidoItems.filter((i) => i.pedido_id === p.id);
                      const total = items.reduce((s, i) => s + i.cantidad, 0);
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono font-semibold">PED-{p.numero}</TableCell>
                          <TableCell>
                            <Badge variant={pedidoEstadoVariant(p.estado)} className="capitalize">
                              {p.estado}
                            </Badge>
                          </TableCell>
                          <TableCell>{p.proveedor || "—"}</TableCell>
                          <TableCell className="text-sm">
                            {items.length} modelo(s) · {total} u.
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(p.created_at).toLocaleString("es-AR")}
                            {p.created_by_nombre ? ` · ${p.created_by_nombre}` : ""}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => exportPedido(p, items)}
                              >
                                <Download className="size-3.5" /> Exportar
                              </Button>
                              {canWrite && p.estado === "borrador" && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={async () => {
                                    const { error } = await api
                                      .from("toner_pedidos")
                                      .update({
                                        estado: "enviado",
                                        enviado_at: new Date().toISOString(),
                                      })
                                      .eq("id", p.id);
                                    if (error) return toast.error(error.message);
                                    toast.success("Pedido marcado como enviado");
                                    refresh();
                                  }}
                                >
                                  Marcar enviado
                                </Button>
                              )}
                              {canWrite && (p.estado === "enviado" || p.estado === "borrador") && (
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    for (const item of items) {
                                      const { error } = await api.from("toner_movimientos").insert({
                                        modelo_id: item.modelo_id,
                                        tipo: "ingreso",
                                        cantidad: item.cantidad,
                                        responsable: responsableDefault,
                                        notas: `Recepción PED-${p.numero}`,
                                      });
                                      if (error) return toast.error(error.message);
                                      await api
                                        .from("toner_pedido_items")
                                        .update({ cantidad_recibida: item.cantidad })
                                        .eq("id", item.id);
                                    }
                                    const { error } = await api
                                      .from("toner_pedidos")
                                      .update({
                                        estado: "recibido",
                                        recibido_at: new Date().toISOString(),
                                      })
                                      .eq("id", p.id);
                                    if (error) return toast.error(error.message);
                                    toast.success("Pedido recibido · stock actualizado");
                                    refresh();
                                  }}
                                >
                                  <PackagePlus className="size-3.5" /> Recibir en depósito
                                </Button>
                              )}
                              {canWrite && p.estado === "borrador" && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-8 text-destructive"
                                  onClick={async () => {
                                    const { error } = await api.from("toner_pedidos").delete().eq("id", p.id);
                                    if (error) return toast.error(error.message);
                                    toast.success("Pedido eliminado");
                                    refresh();
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pedidos.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                          <ClipboardList className="mx-auto mb-2 size-8 opacity-40" />
                          Todavía no hay pedidos. Generá uno desde los críticos.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* —— CÓDIGOS —— */}
        <TabsContent value="codigos" className="mt-4">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Códigos de etiqueta</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generá correlativos para pegar en la unidad física (opcional al ingresar stock).
                </p>
              </div>
              {canWrite && (
                <Button onClick={() => setGenOpen(true)}>
                  <Wand2 className="size-4" /> Generar códigos
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={codigoQuery}
                  onChange={(e) => setCodigoQuery(e.target.value)}
                  placeholder="Buscar lote o modelo…"
                />
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Códigos</TableHead>
                      <TableHead>Modelo</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Generado por</TableHead>
                      <TableHead>Fecha</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lotesFiltrados.map((lote) => (
                      <TableRow key={lote.id}>
                        <TableCell className="font-mono text-sm font-semibold">{lote.codigoGenerado}</TableCell>
                        <TableCell>{lote.modelo}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{lote.cantidad}</Badge>
                        </TableCell>
                        <TableCell>{lote.generadoPor}</TableCell>
                        <TableCell className="text-xs">{lote.fechaGenerado}</TableCell>
                      </TableRow>
                    ))}
                    {lotesFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                          Sin lotes de códigos.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <GenerarCodigosDialog
            open={genOpen}
            setOpen={setGenOpen}
            modelos={modelos}
            modeloSel={modeloSel}
            setModeloSel={setModeloSel}
            generados={generados}
            setGenerados={setGenerados}
            generar={generar}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Card className={cn("panel", danger && "border-destructive/40")}>
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className={cn(
            "grid size-9 place-items-center rounded-lg",
            danger ? "bg-destructive/15 text-destructive" : "bg-primary/15 text-primary",
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-xl font-bold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function IngresoDialog({
  modelos,
  modeloFijo,
  responsableDefault,
  onDone,
  trigger,
}: {
  modelos: Modelo[];
  modeloFijo?: Modelo;
  responsableDefault: string;
  onDone: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeloId, setModeloId] = useState(modeloFijo?.id ?? "");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && modeloFijo) setModeloId(modeloFijo.id);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <PackagePlus className="size-4" /> Ingresar stock
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ingresar stock</DialogTitle>
          <DialogDescription>Sumá unidades al depósito cuando llega un pedido o reposición del proveedor.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            const mid = modeloFijo?.id || modeloId;
            if (!mid) return toast.error("Elegí un modelo");
            const cantidad = Number(fd.get("cantidad") || 1);
            if (!Number.isFinite(cantidad) || cantidad < 1) return toast.error("Cantidad inválida");
            setSaving(true);
            const { error } = await api.from("toner_movimientos").insert({
              modelo_id: mid,
              tipo: "ingreso",
              cantidad,
              responsable: String(fd.get("responsable") || responsableDefault),
              notas: String(fd.get("notas") || ""),
            });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success(`+${cantidad} al depósito`);
            setOpen(false);
            onDone();
          }}
        >
          {!modeloFijo && (
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={setModeloId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre} (stock {m.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {modeloFijo && (
            <p className="text-sm font-medium">{modeloFijo.nombre}</p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" name="cantidad" min={1} defaultValue={1} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Input name="responsable" defaultValue={responsableDefault} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas / remito</Label>
            <Input name="notas" placeholder="Nº remito, proveedor…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Ingresar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsoDialog({
  modelos,
  modeloFijo,
  responsableDefault,
  onDone,
  trigger,
}: {
  modelos: Modelo[];
  modeloFijo?: Modelo;
  responsableDefault: string;
  onDone: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeloId, setModeloId] = useState(modeloFijo?.id ?? "");
  const modelo = modeloFijo || modelos.find((m) => m.id === modeloId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && modeloFijo) setModeloId(modeloFijo.id);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="secondary">
            <PackageMinus className="size-4" /> Usar / reponer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Usar tóner del depósito</DialogTitle>
          <DialogDescription>
            Descuenta stock al instalar o cambiar un tóner en un sector.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
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
              modelo_id: mid,
              tipo: "uso",
              cantidad,
              sector,
              responsable: String(fd.get("responsable") || responsableDefault),
              toner_entra: String(fd.get("toner_entra") || "").trim() || null,
              toner_sale: String(fd.get("toner_sale") || "").trim() || null,
              notas: String(fd.get("notas") || ""),
            });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success(`−${cantidad} del depósito`);
            setOpen(false);
            onDone();
          }}
        >
          {!modeloFijo && (
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={setModeloId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre} (disp. {m.stock})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {modeloFijo && (
            <p className="text-sm">
              <span className="font-medium">{modeloFijo.nombre}</span>
              <span className="text-muted-foreground"> · disponibles {modeloFijo.stock}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" name="cantidad" min={1} defaultValue={1} />
            </div>
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Input name="sector" required placeholder="RRHH, 3er piso…" />
            </div>
            <div className="space-y-1.5">
              <Label>Código entra (opc.)</Label>
              <Input name="toner_entra" placeholder="Etiqueta nuevo" />
            </div>
            <div className="space-y-1.5">
              <Label>Código sale (opc.)</Label>
              <Input name="toner_sale" placeholder="Etiqueta usado" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Responsable</Label>
              <Input name="responsable" defaultValue={responsableDefault} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notas</Label>
              <Input name="notas" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Registrando…" : "Descontar del depósito"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PedidoDialog({
  modelos,
  criticos,
  userId,
  userName,
  onDone,
}: {
  modelos: Modelo[];
  criticos: Modelo[];
  userId?: string;
  userName?: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lineas, setLineas] = useState<{ modelo_id: string; cantidad: number }[]>(() =>
    criticos.map((m) => ({
      modelo_id: m.id,
      cantidad: Math.max(m.stock_minimo * 2 - m.stock, m.stock_minimo, 1),
    })),
  );

  const abrir = (o: boolean) => {
    setOpen(o);
    if (o) {
      setLineas(
        criticos.map((m) => ({
          modelo_id: m.id,
          cantidad: Math.max(m.stock_minimo * 2 - m.stock, m.stock_minimo, 1),
        })),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Nuevo pedido
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pedido a proveedor</DialogTitle>
          <DialogDescription>
            Se precargan los modelos en stock crítico. Ajustá cantidades y exportá el pedido.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            const validas = lineas.filter((l) => l.modelo_id && l.cantidad > 0);
            if (!validas.length) return toast.error("Agregá al menos un ítem");
            setSaving(true);
            const { data: pedido, error } = await api.from("toner_pedidos").insert({
              estado: "borrador",
              proveedor: String(fd.get("proveedor") || "").trim() || null,
              notas: String(fd.get("notas") || "").trim() || null,
              created_by: userId ?? null,
              created_by_nombre: userName ?? null,
            });
            if (error || !pedido) {
              setSaving(false);
              return toast.error(error?.message || "No se pudo crear el pedido");
            }
            const pedidoId = (pedido as Pedido).id;
            for (const linea of validas) {
              const modelo = modelos.find((m) => m.id === linea.modelo_id);
              const { error: itemErr } = await api.from("toner_pedido_items").insert({
                pedido_id: pedidoId,
                modelo_id: linea.modelo_id,
                cantidad: linea.cantidad,
                stock_al_pedir: modelo?.stock ?? null,
              });
              if (itemErr) {
                setSaving(false);
                return toast.error(itemErr.message);
              }
            }
            setSaving(false);
            toast.success(`Pedido PED-${(pedido as Pedido).numero} creado`);
            setOpen(false);
            onDone();
          }}
        >
          <div className="space-y-1.5">
            <Label>Proveedor</Label>
            <Input name="proveedor" placeholder="Nombre del proveedor" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Ítems</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLineas((prev) => [...prev, { modelo_id: modelos[0]?.id ?? "", cantidad: 1 }])
                }
              >
                <Plus className="size-3.5" /> Línea
              </Button>
            </div>
            {lineas.map((linea, idx) => (
              <div key={idx} className="flex gap-2">
                <Select
                  value={linea.modelo_id}
                  onValueChange={(v) =>
                    setLineas((prev) => prev.map((l, i) => (i === idx ? { ...l, modelo_id: v } : l)))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nombre} (stock {m.stock})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="w-20"
                  min={1}
                  value={linea.cantidad}
                  onChange={(e) =>
                    setLineas((prev) =>
                      prev.map((l, i) =>
                        i === idx ? { ...l, cantidad: Math.max(1, Number(e.target.value) || 1) } : l,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setLineas((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}
            {lineas.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin ítems. Agregá una línea o hay críticos.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea name="notas" rows={2} placeholder="Urgencia, contacto, etc." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Creando…" : "Crear pedido"}
            </Button>
          </DialogFooter>
        </form>
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
        {isEditing ? (
          <Button size="icon" variant="ghost" className="size-8" title="Editar modelo">
            <Edit3 className="size-4" />
          </Button>
        ) : (
          <Button variant="outline">
            <Plus className="size-4" /> Nuevo modelo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar modelo" : "Nuevo modelo de tóner"}</DialogTitle>
          <DialogDescription>
            Alta de catálogo. El stock se mueve solo con Ingresar / Usar.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            const nombre = String(fd.get("nombre") || "").trim();
            const marca = String(fd.get("marca") || "").trim();
            const prefijo = String(fd.get("prefijo") || "").trim().toLowerCase();
            const stockMinimo = Number(fd.get("stock_minimo") || 0);
            if (nombre.length < 2) return toast.error("Ingresá el modelo");
            if (!/^[a-z0-9_-]{2,16}$/.test(prefijo))
              return toast.error("Prefijo: 2–16 letras, números o guiones");
            if (!Number.isFinite(stockMinimo) || stockMinimo < 0) return toast.error("Mínimo inválido");
            setSaving(true);
            const payload = isEditing
              ? { nombre, marca, prefijo, stock_minimo: stockMinimo }
              : { nombre, marca, prefijo, stock: 0, stock_minimo: stockMinimo };
            const { error } = isEditing
              ? await api.from("toner_modelos").update(payload).eq("id", modelo.id)
              : await api.from("toner_modelos").insert(payload);
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success(isEditing ? "Modelo actualizado" : "Modelo creado");
            setOpen(false);
            onDone();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Modelo</Label>
              <Input name="nombre" required defaultValue={modelo?.nombre ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Input name="marca" defaultValue={modelo?.marca ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Prefijo código</Label>
              <Input name="prefijo" required defaultValue={modelo?.prefijo ?? ""} placeholder="hp26a" />
            </div>
            <div className="space-y-1.5">
              <Label>Stock mínimo</Label>
              <Input type="number" name="stock_minimo" min={0} defaultValue={modelo?.stock_minimo ?? 2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              <Save className="size-4" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
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
      <Button
        size="icon"
        variant="ghost"
        className="size-8 text-destructive"
        title="Eliminar"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar modelo</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará "{modelo.nombre}" y sus movimientos/códigos asociados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (ev) => {
              ev.preventDefault();
              setDeleting(true);
              const { error } = await api.from("toner_modelos").delete().eq("id", modelo.id);
              setDeleting(false);
              if (error) return toast.error(error.message);
              toast.success("Eliminado");
              setOpen(false);
              onDone();
            }}
          >
            {deleting ? "Eliminando…" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function GenerarCodigosDialog({
  open,
  setOpen,
  modelos,
  modeloSel,
  setModeloSel,
  generados,
  setGenerados,
  generar,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  modelos: Modelo[];
  modeloSel: string;
  setModeloSel: (v: string) => void;
  generados: string[];
  setGenerados: (v: string[]) => void;
  generar: ReturnType<typeof useMutation<string[], Error, { modelo_id: string; cantidad: number }>>;
}) {
  const modeloSeleccionado = modelos.find((m) => m.id === modeloSel);
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setModeloSel("");
      setGenerados([]);
      generar.reset();
    }
  };
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {generados.length > 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>Códigos generados</DialogTitle>
              <DialogDescription>{modeloSeleccionado?.nombre}</DialogDescription>
            </DialogHeader>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-2">
              {generados.map((c, i) => (
                <div key={c} className="flex justify-between rounded-md bg-muted/40 px-2 py-1.5 font-mono text-sm">
                  <span className="text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  {c}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(generados.join("\n"));
                  toast.success("Copiado");
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Listo
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generar códigos</DialogTitle>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const cantidad = Number(fd.get("cantidad") || 1);
                if (!modeloSel) return toast.error("Elegí modelo");
                generar.mutate({ modelo_id: modeloSel, cantidad });
              }}
            >
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Select value={modeloSel} onValueChange={setModeloSel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nombre} · próximo {m.correlativo + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input type="number" name="cantidad" min={1} max={200} defaultValue={1} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={generar.isPending}>
                  {generar.isPending ? "Generando…" : "Generar"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function movimientoLabel(tipo: string) {
  const map: Record<string, string> = {
    ingreso: "Ingreso",
    cargar: "Ingreso",
    entrada: "Ingreso",
    uso: "Uso",
    consumo: "Uso",
    salida: "Uso",
    reposicion: "Reposición",
    ajuste: "Ajuste",
  };
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

function exportPedido(p: Pedido, items: PedidoItem[]) {
  exportCsv(
    `pedido-PED-${p.numero}.csv",
    ["Pedido", "Estado", "Proveedor", "Modelo", "Cantidad", "Stock al pedir"],
    items.map((i) => [
      `PED-${p.numero}`,
      p.estado,
      p.proveedor ?? "",
      i.toner_modelos?.nombre ?? i.modelo_id,
      i.cantidad,
      i.stock_al_pedir ?? "",
    ]),
  );
  toast.success("Pedido exportado");
}

function exportCsv(fileName: string, headers: string[], rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [headers, ...rows].map((row) => row.map(escape).join(";")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

type LoteCodigos = {
  id: string;
  codigoGenerado: string;
  modelo: string;
  cantidad: number;
  generadoPor: string;
  fechaGenerado: string;
  sortDate: number;
};

function agruparCodigosGenerados(unidades: Unidad[]): LoteCodigos[] {
  const grupos = new Map<string, Unidad[]>();
  for (const u of unidades) {
    const fecha = new Date(u.created_at);
    const minuto = Number.isNaN(fecha.getTime()) ? u.created_at : fecha.toISOString().slice(0, 16);
    const key = u.lote_generacion_id || `${u.modelo_id}|${u.generado_por_nombre || ""}|${minuto}`;
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
        codigoGenerado: ordenados.length === 1 ? desde : `${desde} al ${hasta}`,
        modelo: primero.toner_modelos?.nombre ?? "—",
        cantidad: ordenados.length,
        generadoPor: primero.generado_por_nombre || "—",
        fechaGenerado: new Date(primero.created_at).toLocaleString("es-AR"),
        sortDate: new Date(primero.created_at).getTime(),
      };
    })
    .sort((a, b) => b.sortDate - a.sortDate);
}
