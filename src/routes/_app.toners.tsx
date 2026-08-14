import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Copy,
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
  codigo: string;
  estado: string;
  generado_por_nombre: string | null;
  created_at: string;
  toner_modelos: { nombre: string } | null;
};

function TonersPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [generados, setGenerados] = useState<string[]>([]);
  const [genOpen, setGenOpen] = useState(false);
  const [modeloSel, setModeloSel] = useState<string>("");

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
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow className="border-b border-border/70 bg-muted/45 hover:bg-muted/45">
                      <TableHead className="h-11 min-w-[330px] px-5 text-xs font-semibold uppercase text-muted-foreground">
                        <div className="flex items-center gap-2">
                          Toner marcas
                          <ListFilter className="size-3.5" />
                        </div>
                      </TableHead>
                      <TableHead className="h-11 w-[180px] px-4 text-xs font-semibold uppercase text-muted-foreground">
                        Cantidad actual
                      </TableHead>
                      <TableHead className="h-11 w-[170px] px-4 text-xs font-semibold uppercase text-muted-foreground">
                        Cantidad mínima
                      </TableHead>
                      <TableHead className="h-11 min-w-[250px] px-4 text-xs font-semibold uppercase text-muted-foreground">
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
                    {modelos.map((m) => {
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
                    {modelos.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={canWrite ? 5 : 4}
                          className="px-5 py-14 text-center text-sm text-muted-foreground"
                        >
                          <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
                            <PackageCheck className="size-8 text-muted-foreground/60" />
                            <p className="font-medium text-foreground">Todavía no hay modelos cargados</p>
                            <p>Cargá un modelo de tóner para comenzar a controlar el stock.</p>
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
              {canWrite && <ReposicionDialog modelos={modelos} onDone={refresh} />}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table className="min-w-[820px]">
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
                  {reposiciones.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{new Date(m.created_at).toLocaleString("es-AR")}</TableCell>
                      <TableCell>{m.sector || "—"}</TableCell>
                      <TableCell>{m.toner_modelos?.nombre ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.toner_entra || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{m.toner_sale || "—"}</TableCell>
                      <TableCell>{m.responsable || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {reposiciones.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Todavía no hay reposiciones registradas.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
              {canWrite && (
                <Button onClick={() => setGenOpen(true)}>
                  <Wand2 className="size-4" /> Generar códigos
                </Button>
              )}
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Generado por</TableHead>
                    <TableHead>Alta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unidades.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono">{u.codigo}</TableCell>
                      <TableCell>{u.toner_modelos?.nombre ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{estadoLabel(u.estado)}</Badge>
                      </TableCell>
                      <TableCell>{u.generado_por_nombre || "—"}</TableCell>
                      <TableCell className="text-xs">{new Date(u.created_at).toLocaleDateString("es-AR")}</TableCell>
                    </TableRow>
                  ))}
                  {unidades.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                        Todavía no generaste códigos.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
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
  generar,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  modelos: Modelo[];
  modeloSel: string;
  setModeloSel: (value: string) => void;
  generados: string[];
  generar: ReturnType<typeof useMutation<string[], Error, { modelo_id: string; cantidad: number }>>;
}) {
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" className="gap-2">
          <Wand2 className="size-4" /> Generar códigos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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
        {generados.length > 0 && (
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Códigos generados</p>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(generados.join("\n"));
                  toast.success("Copiados al portapapeles");
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {generados.map((c) => (
                <Badge key={c} variant="secondary" className="font-mono">
                  {c}
                </Badge>
              ))}
            </div>
          </div>
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
          <Button size="icon" variant="ghost" className="size-8" title="Editar modelo">
            <Edit3 className="size-4" />
          </Button>
        ) : (
          <Button variant="secondary">
            <Plus className="size-4" /> Modelo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar modelo de tóner" : "Nuevo modelo de tóner"}</DialogTitle>
          <DialogDescription>Cargá los datos tal como se van a ver en la hoja de stock.</DialogDescription>
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
            const stock = Number(fd.get("stock") || 0);
            const stockMinimo = Number(fd.get("stock_minimo") || 0);

            if (nombre.length < 2) return toast.error("Ingresá el nombre del modelo");
            if (!/^[a-z0-9_-]{2,16}$/.test(prefijo)) {
              return toast.error("El prefijo debe tener 2 a 16 letras, números, guiones o guiones bajos");
            }
            if (!Number.isFinite(stock) || stock < 0) return toast.error("La cantidad actual no es válida");
            if (!Number.isFinite(stockMinimo) || stockMinimo < 0) return toast.error("La cantidad mínima no es válida");

            setSaving(true);
            const payload = { nombre, marca, prefijo, stock, stock_minimo: stockMinimo };
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
          <div className="rounded-lg border border-border/70 bg-muted/20">
            <div className="grid grid-cols-1 border-b border-border/70 bg-muted/50 text-xs font-semibold uppercase text-muted-foreground md:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr]">
              <div className="px-3 py-2">Toner marcas</div>
              <div className="px-3 py-2">Marca</div>
              <div className="px-3 py-2">Prefijo</div>
              <div className="px-3 py-2">Cantidad actual</div>
              <div className="px-3 py-2">Cantidad mínima</div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_0.7fr]">
              <div className="space-y-1.5">
                <Label className="md:hidden">Toner marcas</Label>
                <Input name="nombre" required defaultValue={modelo?.nombre ?? ""} placeholder="HP 26A Universal" />
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
                <Label className="md:hidden">Cantidad actual</Label>
                <Input type="number" name="stock" defaultValue={modelo?.stock ?? 0} min={0} />
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
      <Button size="icon" variant="ghost" className="size-8 text-destructive" title="Eliminar modelo" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" />
      </Button>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar modelo de tóner</AlertDialogTitle>
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
              toast.success("Modelo eliminado");
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

function estadoLabel(estado: string) {
  if (estado === "en_stock") return "En stock";
  if (estado === "instalado") return "Instalado";
  return estado;
}
