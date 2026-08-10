import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Copy, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
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
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/toners")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Tóners | SysIntranet | Wiki Area" },
      { name: "description", content: "Entradas, salidas, stock crítico y generación de códigos seriados de tóners." },
      { property: "og:title", content: "Tóners | SysIntranet | Wiki Area" },
      { property: "og:description", content: "Control de stock y codificación de tóners." },
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
        .limit(100);
      if (error) throw error;
      return data as Array<{
        id: string;
        tipo: string;
        cantidad: number;
        sector: string | null;
        responsable: string | null;
        created_at: string;
        toner_modelos: { nombre: string } | null;
      }>;
    },
  });

  const { data: unidades = [] } = useQuery({
    queryKey: ["toner_unidades"],
    queryFn: async () => {
      const { data, error } = await api
        .from("toner_unidades")
        .select("*, toner_modelos(nombre)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Array<{
        id: string;
        codigo: string;
        estado: string;
        created_at: string;
        toner_modelos: { nombre: string } | null;
      }>;
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
      toast.success(`${codes.length} código(s) generados`);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criticos = modelos.filter((m) => m.stock <= m.stock_minimo);

  return (
    <div>
      <PageHeader
        title="Tóners"
        description="Stock, movimientos y codificación de tóners."
        action={
          canWrite ? (
            <div className="flex gap-2">
              <Dialog open={genOpen} onOpenChange={setGenOpen}>
                <DialogTrigger asChild>
                  <Button variant="default" className="gap-2">
                    <Wand2 className="size-4" /> Generar códigos
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Generador de códigos seriados</DialogTitle>
                    <DialogDescription>
                      Genera códigos correlativos con el prefijo del modelo (ej: hpuni-0001).
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      if (!modeloSel) return toast.error("Elegí un modelo");
                      generar.mutate({
                        modelo_id: modeloSel,
                        cantidad: Number(fd.get("cantidad") || 1),
                      });
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
                              {m.nombre} ({m.prefijo})
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
                        Generar
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
          <TabsTrigger value="movimientos">Entradas / Salidas</TabsTrigger>
          <TabsTrigger value="codigos">Códigos seriados</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modelos.map((m) => (
            <Card key={m.id} className="panel">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{m.nombre}</span>
                  <Badge variant={m.stock <= m.stock_minimo ? "destructive" : "secondary"}>
                    {m.stock} u.
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  {m.marca || "—"} · prefijo <span className="font-mono">{m.prefijo}</span> · mínimo{" "}
                  {m.stock_minimo}
                </p>
                <Progress value={Math.min(100, (m.stock / Math.max(1, m.stock_minimo * 3)) * 100)} />
                {canWrite && (
                  <div className="flex gap-2">
                    <MovimientoDialog
                      modelo={m}
                      tipo="entrada"
                      onDone={refresh}
                      trigger={
                        <Button size="sm" variant="secondary" className="flex-1">
                          <ArrowDownLeft className="size-4" /> Entrada
                        </Button>
                      }
                    />
                    <MovimientoDialog
                      modelo={m}
                      tipo="salida"
                      onDone={refresh}
                      trigger={
                        <Button size="sm" variant="outline" className="flex-1">
                          <ArrowUpRight className="size-4" /> Salida
                        </Button>
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {modelos.length === 0 && (
            <p className="text-sm text-muted-foreground">Cargá un modelo de tóner para comenzar.</p>
          )}
        </TabsContent>

        <TabsContent value="movimientos" className="mt-4">
          <Card className="panel">
            <CardContent className="overflow-x-auto p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Cant.</TableHead>
                    <TableHead>Sector</TableHead>
                    <TableHead>Responsable</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">
                        {new Date(m.created_at).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell>{m.toner_modelos?.nombre ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={m.tipo === "entrada" ? "secondary" : "outline"}>{m.tipo}</Badge>
                      </TableCell>
                      <TableCell>{m.cantidad}</TableCell>
                      <TableCell>{m.sector || "—"}</TableCell>
                      <TableCell>{m.responsable || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {movimientos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Sin movimientos registrados.
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
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Unidades codificadas</CardTitle>
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
                    <TableHead>Alta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unidades.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-mono">{u.codigo}</TableCell>
                      <TableCell>{u.toner_modelos?.nombre ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{u.estado}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(u.created_at).toLocaleDateString("es-AR")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {unidades.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
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

function ModeloDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <Plus className="size-4" /> Modelo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo modelo de tóner</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const { error } = await api.from("toner_modelos").insert({
              nombre: String(fd.get("nombre")),
              marca: String(fd.get("marca") || ""),
              prefijo: String(fd.get("prefijo")).toLowerCase(),
              stock: Number(fd.get("stock") || 0),
              stock_minimo: Number(fd.get("stock_minimo") || 2),
            });
            if (error) return toast.error(error.message);
            toast.success("Modelo creado");
            setOpen(false);
            onDone();
          }}
        >
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input name="nombre" required placeholder="HP 26A Universal" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Input name="marca" placeholder="HP" />
            </div>
            <div className="space-y-1.5">
              <Label>Prefijo</Label>
              <Input name="prefijo" required placeholder="hpuni" />
            </div>
            <div className="space-y-1.5">
              <Label>Stock inicial</Label>
              <Input type="number" name="stock" defaultValue={0} min={0} />
            </div>
            <div className="space-y-1.5">
              <Label>Stock mínimo</Label>
              <Input type="number" name="stock_minimo" defaultValue={2} min={0} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MovimientoDialog({
  modelo,
  tipo,
  trigger,
  onDone,
}: {
  modelo: Modelo;
  tipo: "entrada" | "salida";
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {tipo} · {modelo.nombre}
          </DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const { error } = await api.from("toner_movimientos").insert({
              modelo_id: modelo.id,
              tipo,
              cantidad: Number(fd.get("cantidad") || 1),
              sector: String(fd.get("sector") || ""),
              responsable: String(fd.get("responsable") || ""),
              notas: String(fd.get("notas") || ""),
            });
            if (error) return toast.error(error.message);
            toast.success("Movimiento registrado");
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
              <Label>Sector</Label>
              <Input name="sector" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Input name="responsable" />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input name="notas" />
          </div>
          <DialogFooter>
            <Button type="submit">Registrar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
