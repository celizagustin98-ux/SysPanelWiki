import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Copy,
  Download,
  Edit3,
  ListChecks,
  ListFilter,
  PackageCheck,
  PackageMinus,
  PackagePlus,
  PackageX,
  Plus,
  Save,
  ScanLine,
  Search,
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
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/toners")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tóners | SysIntranet | Área Wiki" },
      {
        name: "description",
        content: "Stock actual, reposición por sector y generación de códigos para etiquetas de tóners.",
      },
      { property: "og:title", content: "Tóners | SysIntranet | Área Wiki" },
      { property: "og:description", content: "Control de stock, reposiciones y codificación de tóners." },
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

type LoteCodigos = {
  id: string;
  codigoGenerado: string;
  modelo: string;
  cantidad: number;
  generadoPor: string;
  fechaGenerado: string;
  sortDate: number;
};

function TonersPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [generados, setGenerados] = useState<string[]>([]);
  const [genOpen, setGenOpen] = useState(false);
  const [modeloSel, setModeloSel] = useState<string>("");
  const [stockQuery, setStockQuery] = useState("");
  const [stockEstado, setStockEstado] = useState<"todos" | "ok" | "critico">("todos");
  const [reposicionQuery, setReposicionQuery] = useState("");
  const [codigoQuery, setCodigoQuery] = useState("");

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
        .limit(150);
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

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["toner_modelos"] });
    qc.invalidateQueries({ queryKey: ["toner_movimientos"] });
    qc.invalidateQueries({ queryKey: ["toner_unidades"] });
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
  const reposiciones = movimientos.filter((m) => m.tipo === "reposicion");
  const stockMovimientos = movimientos.filter((m) => m.tipo === "cargar" || m.tipo === "consumo");
  const lotesCodigos = useMemo(() => agruparCodigosGenerados(unidades), [unidades]);
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
  const reposicionesFiltradas = useMemo(() => {
    const q = reposicionQuery.trim().toLowerCase();
    if (!q) return reposiciones;
    return reposiciones.filter((m) =>
      [
        m.sector,
        m.toner_modelos?.nombre,
        m.toner_entra,
        m.toner_sale,
        m.responsable,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [reposiciones, reposicionQuery]);
  const lotesFiltrados = useMemo(() => {
    const q = codigoQuery.trim().toLowerCase();
    if (!q) return lotesCodigos;
    return lotesCodigos.filter((lote) =>
      [lote.codigoGenerado, lote.modelo, lote.generadoPor, lote.fechaGenerado]
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [codigoQuery, lotesCodigos]);

  const ultimoControlPorModelo = useMemo(() => {
    const map = new Map<string, Movimiento>();
    for (const movimiento of movimientos) {
      if (!map.has(movimiento.modelo_id)) map.set(movimiento.modelo_id, movimiento);
    }
    return map;
  }, [movimientos]);

  return (
    <div>
      <PageHeader
        title="Tóners"
        description="Stock actual, reposición por sector y generación de códigos para etiquetas físicas."
        action={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
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
              <ModeloDialog onDone={refresh} />
            </div>
          ) : null
        }
      />

      {criticos.length > 0 && (
        <Card className="panel mb-6 border-destructive/50">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <AlertTriangle className="size-5 text-destructive" />
            <span className="text-sm font-medium text-destructive">Stock crítico:</span>
            {criticos.map((m) => (
              <Badge key={m.id} variant="destructive">
                {m.nombre} · {m.stock} u.
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="reposicion">Reposición Toner</TabsTrigger>
          <TabsTrigger value="codigos">Generación de Códigos</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card className="panel overflow-hidden">
            <CardHeader className="border-b border-border/70 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Boxes className="size-4 text-primary" />
                    Stock actual de tóners
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Existencias actuales por modelo. Usá Cargar para sumar stock y Consumo para descontar unidades.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="h-7 rounded-md px-2.5 text-xs">
                    {modelos.length} modelos
                  </Badge>
                  <Badge
                    variant={criticos.length > 0 ? "destructive" : "secondary"}
                    className="h-7 rounded-md px-2.5 text-xs"
                  >
                    <PackageX className="size-3" /> {criticos.length} críticos
                  </Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      exportCsv(
                        "stock-toners.csv",
                        ["Modelo", "Marca", "Prefijo", "Cantidad actual", "Cantidad minima", "Estado"],
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
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-sm">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={stockQuery}
                    onChange={(e) => setStockQuery(e.target.value)}
                    placeholder="Buscar modelo, marca o prefijo"
                    className="pl-9"
                  />
                </div>
                <Select value={stockEstado} onValueChange={(value) => setStockEstado(value as typeof stockEstado)}>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="ok">Stock OK</SelectItem>
                    <SelectItem value="critico">Stock crítico</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="overflow-hidden">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="border-b border-border/70 bg-muted/45 hover:bg-muted/45">
                      <TableHead className="h-11 px-5 text-xs font-semibold uppercase text-muted-foreground">
                        <div className="flex items-center gap-2">
                          Modelo
                          <ListFilter className="size-3.5" />
                        </div>
                      </TableHead>
                      <TableHead className="h-11 w-[180px] px-4 text-xs font-semibold uppercase text-muted-foreground">
                        Cantidad actual
                      </TableHead>
                      <TableHead className="h-11 w-[170px] px-4 text-xs font-semibold uppercase text-muted-foreground">
                        Cantidad mínima
                      </TableHead>
                      <TableHead className="h-11 px-4 text-xs font-semibold uppercase text-muted-foreground">
                        Último control
                      </TableHead>
                      {canWrite && (
                        <TableHead className="h-11 w-[240px] px-5 text-right text-xs font-semibold uppercase text-muted-foreground">
                          Acciones
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modelosFiltrados.map((m) => {
                      const ultimo = ultimoControlPorModelo.get(m.id);
                      const bajoStock = m.stock <= m.stock_minimo;
                      const stockPct =
                        m.stock_minimo > 0 ? Math.min(100, Math.round((m.stock / m.stock_minimo) * 100)) : 100;
                      return (
                        <TableRow key={m.id} className="border-b border-border/60 hover:bg-muted/25">
                          <TableCell className="px-5 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                              <div
                                className={
                                  bajoStock
                                    ? "flex size-9 shrink-0 items-center justify-center rounded-md bg-destructive/10 text-destructive"
                                    : "flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
                                }
                              >
                                {bajoStock ? <AlertTriangle className="size-4" /> : <PackageCheck className="size-4" />}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-foreground">{m.nombre}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {m.marca || "Sin marca"} · prefijo <span className="font-mono">{m.prefijo}</span>
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xl font-bold tabular-nums text-foreground">
                                  {m.stock}
                                </span>
                                <Badge variant={bajoStock ? "destructive" : "secondary"} className="rounded-md">
                                  {bajoStock ? "Crítico" : "OK"}
                                </Badge>
                              </div>
                              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={bajoStock ? "h-full bg-destructive" : "h-full bg-primary"}
                                  style={{ width: `${stockPct}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <span className="font-mono text-base font-semibold tabular-nums text-foreground">
                              {m.stock_minimo}
                            </span>
                            <span className="ml-1 text-xs text-muted-foreground">unidades</span>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            {ultimo ? (
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-foreground">
                                  {new Date(ultimo.created_at).toLocaleDateString("es-AR")}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {movimientoLabel(ultimo.tipo)} de {ultimo.cantidad} u.
                                  {ultimo.responsable ? ` · ${ultimo.responsable}` : ""}
                                </p>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">Sin control registrado</span>
                            )}
                          </TableCell>
                          {canWrite && (
                            <TableCell className="px-5 py-4">
                              <div className="flex flex-wrap justify-end gap-2">
                                <ModeloDialog modelo={m} onDone={refresh} />
                                <EliminarModeloDialog modelo={m} onDone={refresh} />
                                <StockMovimientoDialog
                                  modelo={m}
                                  tipo="cargar"
                                  onDone={refresh}
                                  trigger={
                                    <Button size="sm" variant="secondary" className="h-8 gap-1.5 rounded-md px-2.5">
                                      <PackagePlus className="size-4" /> Cargar
                                    </Button>
                                  }
                                />
                                <StockMovimientoDialog
                                  modelo={m}
                                  tipo="consumo"
                                  onDone={refresh}
                                  trigger={
                                    <Button size="sm" variant="outline" className="h-8 gap-1.5 rounded-md px-2.5">
                                      <PackageMinus className="size-4" /> Consumo
                                    </Button>
                                  }
                                />
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                    {modelosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canWrite ? 5 : 4}
                          className="px-5 py-14 text-center text-sm text-muted-foreground"
                        >
                          <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                            <PackageCheck className="size-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">No hay tóners para mostrar</p>
                            <p>Usá Carga Nuevo Toner o ajustá los filtros activos.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card className="panel mt-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4 text-primary" />
                Últimos movimientos de stock
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Movimiento</TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockMovimientos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{new Date(m.created_at).toLocaleString("es-AR")}</TableCell>
                      <TableCell>{m.toner_modelos?.nombre ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={m.tipo === "cargar" ? "secondary" : "outline"}>{movimientoLabel(m.tipo)}</Badge>
                      </TableCell>
                      <TableCell>{m.cantidad}</TableCell>
                      <TableCell>{m.responsable || "—"}</TableCell>
                      <TableCell className="max-w-[260px] truncate">{m.notas || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {stockMovimientos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Sin cargas ni consumos registrados.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reposicion" className="mt-4">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanLine className="size-4 text-primary" />
                  Reposición Toner
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Registro de cambios por sector: toner nuevo colocado y toner agotado retirado.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    exportCsv(
                      "reposicion-toner.csv",
                      ["Fecha", "Sector", "Modelo", "Toner Entra", "Toner Sale", "Responsable"],
                      reposicionesFiltradas.map((m) => [
                        new Date(m.created_at).toLocaleString("es-AR"),
                        m.sector ?? "",
                        m.toner_modelos?.nombre ?? "",
                        m.toner_entra ?? "",
                        m.toner_sale ?? "",
                        m.responsable ?? "",
                      ]),
                    )
                  }
                >
                  <Download className="size-4" /> Exportar
                </Button>
                {canWrite && <ReposicionDialog modelos={modelos} onDone={refresh} />}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={reposicionQuery}
                  onChange={(e) => setReposicionQuery(e.target.value)}
                  placeholder="Buscar sector, modelo, código o responsable"
                  className="pl-9"
                />
              </div>
              <div className="overflow-x-auto">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Toner Entra</TableHead>
                    <TableHead>Toner Sale</TableHead>
                    <TableHead>Responsable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reposicionesFiltradas.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{new Date(m.created_at).toLocaleString("es-AR")}</TableCell>
                      <TableCell>{m.sector || "—"}</TableCell>
                      <TableCell>{m.toner_modelos?.nombre ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.toner_entra || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.toner_sale || "—"}</TableCell>
                      <TableCell>{m.responsable || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {reposicionesFiltradas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Todavía no hay reposiciones registradas.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="codigos" className="mt-4">
          <Card className="panel">
            <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Generación de Códigos</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generá códigos correlativos por modelo para imprimir o pegar en la etiqueta física del toner.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    exportCsv(
                      "generacion-codigos-toner.csv",
                      ["Codigo generado", "Modelo", "Cantidad", "Generado por", "Fecha generado"],
                      lotesFiltrados.map((lote) => [
                        lote.codigoGenerado,
                        lote.modelo,
                        lote.cantidad,
                        lote.generadoPor,
                        lote.fechaGenerado,
                      ]),
                    )
                  }
                >
                  <Download className="size-4" /> Exportar
                </Button>
                {canWrite && (
                  <Button onClick={() => setGenOpen(true)}>
                    <Wand2 className="size-4" /> Generar códigos
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={codigoQuery}
                  onChange={(e) => setCodigoQuery(e.target.value)}
                  placeholder="Buscar lote, modelo o usuario"
                  className="pl-9"
                />
              </div>
              <div className="overflow-x-auto">
              <Table className="min-w-[920px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">
                      Código generado
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase text-muted-foreground">Modelo</TableHead>
                    <TableHead className="w-[120px] text-xs font-semibold uppercase text-muted-foreground">
                      Cantidad
                    </TableHead>
                    <TableHead className="w-[180px] text-xs font-semibold uppercase text-muted-foreground">
                      Generado por
                    </TableHead>
                    <TableHead className="w-[170px] text-xs font-semibold uppercase text-muted-foreground">
                      Fecha generado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotesFiltrados.map((lote) => (
                    <TableRow key={lote.id}>
                      <TableCell className="font-mono text-sm font-semibold">{lote.codigoGenerado}</TableCell>
                      <TableCell>{lote.modelo}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="rounded-md">
                          {lote.cantidad}
                        </Badge>
                      </TableCell>
                      <TableCell>{lote.generadoPor}</TableCell>
                      <TableCell className="text-xs">{lote.fechaGenerado}</TableCell>
                    </TableRow>
                  ))}
                  {lotesFiltrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        Todavía no generaste códigos.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
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
  setOpen: (open: boolean) => void;
  modelos: Modelo[];
  modeloSel: string;
  setModeloSel: (value: string) => void;
  generados: string[];
  setGenerados: (value: string[]) => void;
  generar: ReturnType<typeof useMutation<string[], Error, { modelo_id: string; cantidad: number }>>;
}) {
  const modeloSeleccionado = modelos.find((m) => m.id === modeloSel);
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setModeloSel("");
      setGenerados([]);
      generar.reset();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <Wand2 className="size-4" /> Generar códigos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {generados.length > 0 ? (
          <>
            <DialogHeader>
              <DialogTitle>Códigos generados</DialogTitle>
              <DialogDescription>
                Dejá esta ventana abierta mientras pasás los códigos a la etiquetadora.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg border border-border/80 bg-muted/20">
              <div className="border-b border-border/70 px-3 py-2">
                <p className="text-sm font-semibold text-foreground">
                  {modeloSeleccionado?.nombre ?? "Modelo seleccionado"}
                </p>
                <p className="text-xs text-muted-foreground">{generados.length} código(s) listos para etiquetar</p>
              </div>
              <div className="max-h-72 overflow-y-auto p-3">
                <div className="grid gap-1.5">
                  {generados.map((codigo, index) => (
                    <div
                      key={codigo}
                      className="flex items-center justify-between rounded-md border border-border/60 bg-background px-3 py-2"
                    >
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-mono text-sm font-semibold uppercase tracking-normal text-foreground">
                        {codigo}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(generados.join("\n"));
                  toast.success("Códigos copiados al portapapeles");
                }}
              >
                <Copy className="size-4" /> Copiar listado
              </Button>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Aceptar
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Generación de Códigos</DialogTitle>
              <DialogDescription>
                Seleccioná el modelo y la cantidad. El sistema mantiene la correlatividad automáticamente.
              </DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const cantidad = Number(fd.get("cantidad") || 1);
                if (!modeloSel) return toast.error("Elegí un modelo");
                if (!Number.isFinite(cantidad) || cantidad < 1) return toast.error("La cantidad no es válida");
                generar.mutate({ modelo_id: modeloSel, cantidad });
              }}
            >
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Select value={modeloSel} onValueChange={setModeloSel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    {modelos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nombre} ({m.prefijo}) · próximo {m.correlativo + 1}
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
                  {generar.isPending ? "Generando..." : "Generar"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
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
          <Button size="icon" variant="ghost" className="size-8" title="Editar tóner">
            <Edit3 className="size-4" />
          </Button>
        ) : (
          <Button variant="secondary">
            <Plus className="size-4" /> Carga Nuevo Toner
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar tóner" : "Carga Nuevo Toner"}</DialogTitle>
          <DialogDescription>
            Cargá los datos necesarios para que el tóner aparezca en Stock. La cantidad se modifica solo desde Cargar
            o Consumo.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            const nombre = String(fd.get("nombre") || "").trim();
            const marca = String(fd.get("marca") || "").trim();
            const prefijo = String(fd.get("prefijo") || "").trim().toLowerCase();
            const stockMinimo = Number(fd.get("stock_minimo") || 0);

            if (nombre.length < 2) return toast.error("Ingresá el modelo del toner");
            if (!/^[a-z0-9_-]{2,16}$/.test(prefijo)) {
              return toast.error("El prefijo debe tener 2 a 16 letras, números, guiones o guiones bajos");
            }
            if (!Number.isFinite(stockMinimo) || stockMinimo < 0) return toast.error("La cantidad mínima no es válida");

            setSaving(true);
            const payload = isEditing
              ? { nombre, marca, prefijo, stock_minimo: stockMinimo }
              : { nombre, marca, prefijo, stock: 0, stock_minimo: stockMinimo };
            const { error } = isEditing
              ? await api.from("toner_modelos").update(payload).eq("id", modelo.id)
              : await api.from("toner_modelos").insert(payload);
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success(isEditing ? "Toner actualizado" : "Toner cargado");
            setOpen(false);
            onDone();
          }}
        >
          <div className="rounded-lg border border-border/70 bg-muted/20">
            <div className="grid grid-cols-1 border-b border-border/70 bg-muted/50 text-xs font-semibold uppercase text-muted-foreground md:grid-cols-[1.5fr_0.9fr_0.75fr_0.75fr]">
              <div className="px-3 py-2">Modelo</div>
              <div className="px-3 py-2">Marca</div>
              <div className="px-3 py-2">Prefijo</div>
              <div className="px-3 py-2">Cantidad mínima</div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[1.5fr_0.9fr_0.75fr_0.75fr]">
              <div className="space-y-1.5">
                <Label className="md:hidden">Modelo</Label>
                <Input
                  name="nombre"
                  required
                  defaultValue={modelo?.nombre ?? ""}
                  placeholder="TONER ALTERNATIVO HP CE285A/CB435A/CB436A"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="md:hidden">Marca</Label>
                <Input name="marca" defaultValue={modelo?.marca ?? ""} placeholder="HP" />
              </div>
              <div className="space-y-1.5">
                <Label className="md:hidden">Prefijo</Label>
                <Input name="prefijo" required defaultValue={modelo?.prefijo ?? ""} placeholder="hp26a" />
              </div>
              <div className="space-y-1.5">
                <Label className="md:hidden">Cantidad mínima</Label>
                <Input type="number" name="stock_minimo" defaultValue={modelo?.stock_minimo ?? 2} min={0} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              <Save className="size-4" />
              {saving ? "Guardando..." : "Guardar"}
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
      <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Eliminar tóner" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar tóner</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará "{modelo.nombre}" junto con sus movimientos y códigos generados. Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (event) => {
              event.preventDefault();
              setDeleting(true);
              const { error } = await api.from("toner_modelos").delete().eq("id", modelo.id);
              setDeleting(false);
              if (error) return toast.error(error.message);
              toast.success("Toner eliminado");
              setOpen(false);
              onDone();
            }}
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StockMovimientoDialog({
  modelo,
  tipo,
  trigger,
  onDone,
}: {
  modelo: Modelo;
  tipo: "cargar" | "consumo";
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const isConsumo = tipo === "consumo";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isConsumo ? "Registrar consumo" : "Cargar stock"} · {modelo.nombre}
          </DialogTitle>
          <DialogDescription>
            {isConsumo
              ? "Descuenta unidades del stock actual cuando se retira un toner del depósito."
              : "Suma unidades al stock actual cuando ingresan tóners al depósito."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            const cantidad = Number(fd.get("cantidad") || 1);
            if (!Number.isFinite(cantidad) || cantidad < 1) return toast.error("La cantidad no es válida");
            if (isConsumo && cantidad > modelo.stock) return toast.error("No hay stock suficiente para descontar");

            setSaving(true);
            const { error } = await api.from("toner_movimientos").insert({
              modelo_id: modelo.id,
              tipo,
              cantidad,
              responsable: String(fd.get("responsable") || ""),
              notas: String(fd.get("notas") || ""),
            });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success(isConsumo ? "Consumo registrado" : "Stock cargado");
            setOpen(false);
            onDone();
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cantidad</Label>
              <Input type="number" name="cantidad" min={1} defaultValue={1} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsable</Label>
              <Input name="responsable" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input name="notas" placeholder={isConsumo ? "Retiro de depósito" : "Compra / ingreso / ajuste"} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Registrando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReposicionDialog({ modelos, onDone }: { modelos: Modelo[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modeloId, setModeloId] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Registrar reposición
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Registrar reposición de toner</DialogTitle>
          <DialogDescription>
            Usalo para dejar registro del cambio realizado en un sector. El stock se ajusta manualmente desde Cargar o
            Consumo.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            const fd = new FormData(e.currentTarget);
            if (!modeloId) return toast.error("Elegí un modelo");

            const tonerEntra = String(fd.get("toner_entra") || "").trim();
            const tonerSale = String(fd.get("toner_sale") || "").trim();
            const sector = String(fd.get("sector") || "").trim();
            const responsable = String(fd.get("responsable") || "").trim();

            if (!sector) return toast.error("Ingresá el sector");
            if (!responsable) return toast.error("Ingresá el responsable");

            setSaving(true);
            const { error } = await api.from("toner_movimientos").insert({
              modelo_id: modeloId,
              tipo: "reposicion",
              cantidad: 1,
              sector,
              responsable,
              toner_codigo: "",
              toner_entra: tonerEntra,
              toner_sale: tonerSale,
              notas: String(fd.get("notas") || ""),
            });
            setSaving(false);
            if (error) return toast.error(error.message);
            toast.success("Reposición registrada");
            setOpen(false);
            onDone();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={modeloId} onValueChange={setModeloId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar modelo" />
                </SelectTrigger>
                <SelectContent>
                  {modelos.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Input name="sector" placeholder="Mesa de ayuda, RRHH, Sistemas..." />
            </div>
            <div className="space-y-1.5">
              <Label>Toner Entra</Label>
              <Input name="toner_entra" placeholder="Código del toner nuevo" />
            </div>
            <div className="space-y-1.5">
              <Label>Toner Sale</Label>
              <Input name="toner_sale" placeholder="Código / referencia del toner retirado" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Responsable</Label>
              <Input name="responsable" placeholder="Quién realizó o recibió la reposición" />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Notas</Label>
              <Input name="notas" placeholder="Observaciones opcionales" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar reposición"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function movimientoLabel(tipo: string) {
  if (tipo === "cargar") return "Cargar";
  if (tipo === "consumo") return "Consumo";
  if (tipo === "reposicion") return "Reposición";
  if (tipo === "entrada") return "Entrada";
  if (tipo === "salida") return "Salida";
  return tipo;
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

function agruparCodigosGenerados(unidades: Unidad[]): LoteCodigos[] {
  const grupos = new Map<string, Unidad[]>();

  for (const unidad of unidades) {
    const fecha = new Date(unidad.created_at);
    const minuto = Number.isNaN(fecha.getTime()) ? unidad.created_at : fecha.toISOString().slice(0, 16);
    const key = unidad.lote_generacion_id || `${unidad.modelo_id}|${unidad.generado_por_nombre || ""}|${minuto}`;
    grupos.set(key, [...(grupos.get(key) ?? []), unidad]);
  }

  return Array.from(grupos.entries())
    .map(([id, items]) => {
      const ordenados = [...items].sort((a, b) => compararCodigos(a.codigo, b.codigo));
      const primero = ordenados[0];
      return {
        id,
        codigoGenerado: formatearRangoCodigos(ordenados.map((item) => item.codigo)),
        modelo: primero.toner_modelos?.nombre ?? "—",
        cantidad: ordenados.length,
        generadoPor: primero.generado_por_nombre || "—",
        fechaGenerado: new Date(primero.created_at).toLocaleString("es-AR"),
        sortDate: new Date(primero.created_at).getTime(),
      };
    })
    .sort((a, b) => b.sortDate - a.sortDate);
}

function compararCodigos(a: string, b: string) {
  const parsedA = parseCodigo(a);
  const parsedB = parseCodigo(b);
  if (parsedA && parsedB && parsedA.prefijo === parsedB.prefijo) return parsedA.numero - parsedB.numero;
  return a.localeCompare(b, "es-AR", { numeric: true });
}

function formatearRangoCodigos(codigos: string[]) {
  if (codigos.length === 0) return "—";

  const parsed = codigos.map(parseCodigo);
  const todosValidos = parsed.every(Boolean);
  if (!todosValidos) return codigos.length === 1 ? codigos[0] : `${codigos[0]} al ${codigos[codigos.length - 1]}`;

  const primero = parsed[0]!;
  const ultimo = parsed[parsed.length - 1]!;
  const desde = formatearNumeroCodigo(primero.numero);
  const hasta = formatearNumeroCodigo(ultimo.numero);

  if (codigos.length === 1 || desde === hasta) return `${primero.prefijo} ${desde}`;
  return `${primero.prefijo} ${desde} al ${hasta}`;
}

function parseCodigo(codigo: string) {
  const match = codigo.trim().match(/^(.+?)[\s_-]*(\d+)$/);
  if (!match) return null;
  return {
    prefijo: match[1].replace(/[\s_-]+$/g, "").toLowerCase(),
    numero: Number(match[2]),
  };
}

function formatearNumeroCodigo(numero: number) {
  return String(numero).padStart(3, "0");
}
