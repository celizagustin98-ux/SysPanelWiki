import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/inventario")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inventario | SysIntranet | Área Wiki" },
      { name: "description", content: "Gestión de activos de sistemas: hardware, periféricos y licencias." },
      { property: "og:title", content: "Inventario | SysIntranet | Área Wiki" },
      { property: "og:description", content: "Control de estados y asignación de activos." },
    ],
  }),
  component: InventarioPage,
});

const ESTADOS = ["nuevo", "en_uso", "en_reparacion", "dado_de_baja"] as const;
const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevo",
  en_uso: "En uso",
  en_reparacion: "En reparación",
  dado_de_baja: "Dado de baja",
};

type Item = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  estado: string;
  asignado_a: string | null;
  sector: string | null;
  notas: string | null;
};

function ItemDialog({
  item,
  trigger,
  onDone,
}: {
  item?: Item;
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState(item?.estado ?? "nuevo");
  const [categoria, setCategoria] = useState(item?.categoria ?? "hardware");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      codigo: String(fd.get("codigo")),
      nombre: String(fd.get("nombre")),
      categoria,
      marca: String(fd.get("marca") || ""),
      modelo: String(fd.get("modelo") || ""),
      numero_serie: String(fd.get("numero_serie") || ""),
      estado,
      asignado_a: String(fd.get("asignado_a") || ""),
      sector: String(fd.get("sector") || ""),
      notas: String(fd.get("notas") || ""),
    };
    const { error } = item
      ? await api.from("inventario").update(payload).eq("id", item.id)
      : await api.from("inventario").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(item ? "Activo actualizado" : "Activo creado");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar activo" : "Nuevo activo"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input name="codigo" defaultValue={item?.codigo} required />
            </div>
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input name="nombre" defaultValue={item?.nombre} required />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hardware">Hardware</SelectItem>
                  <SelectItem value="periferico">Periférico</SelectItem>
                  <SelectItem value="licencia">Licencia</SelectItem>
                  <SelectItem value="red">Red</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {ESTADO_LABEL[e]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Marca</Label>
              <Input name="marca" defaultValue={item?.marca ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input name="modelo" defaultValue={item?.modelo ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>N° de serie</Label>
              <Input name="numero_serie" defaultValue={item?.numero_serie ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Input name="sector" defaultValue={item?.sector ?? ""} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Asignado a</Label>
            <Input name="asignado_a" defaultValue={item?.asignado_a ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea name="notas" defaultValue={item?.notas ?? ""} />
          </div>
          <DialogFooter>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function InventarioPage() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("todos");

  const { data = [] } = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const { data, error } = await api
        .from("inventario")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Item[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from("inventario").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Activo eliminado");
      qc.invalidateQueries({ queryKey: ["inventario"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () =>
      data.filter(
        (i) =>
          (estado === "todos" || i.estado === estado) &&
          [i.codigo, i.nombre, i.marca, i.modelo, i.numero_serie, i.asignado_a, i.sector]
            .join(" ")
            .toLowerCase()
            .includes(q.toLowerCase()),
      ),
    [data, q, estado],
  );

  return (
    <div>
      <PageHeader
        title="Inventario"
        description="Hardware, periféricos y licencias del área."
        action={
          canWrite ? (
            <ItemDialog
              trigger={
                <Button>
                  <Plus className="size-4" /> Nuevo activo
                </Button>
              }
              onDone={() => qc.invalidateQueries({ queryKey: ["inventario"] })}
            />
          ) : null
        }
      />

      <Card className="panel">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por código, nombre, serie, sector…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Select value={estado} onValueChange={setEstado}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los estados</SelectItem>
                {ESTADOS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {ESTADO_LABEL[e]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Asignado</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.codigo}</TableCell>
                    <TableCell className="font-medium">{i.nombre}</TableCell>
                    <TableCell className="capitalize">{i.categoria}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          i.estado === "dado_de_baja"
                            ? "destructive"
                            : i.estado === "en_reparacion"
                              ? "outline"
                              : "secondary"
                        }
                      >
                        {ESTADO_LABEL[i.estado] ?? i.estado}
                      </Badge>
                    </TableCell>
                    <TableCell>{i.asignado_a || "—"}</TableCell>
                    <TableCell>{i.sector || "—"}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && (
                        <ItemDialog
                          item={i}
                          trigger={
                            <Button size="icon" variant="ghost">
                              <Pencil className="size-4" />
                            </Button>
                          }
                          onDone={() => qc.invalidateQueries({ queryKey: ["inventario"] })}
                        />
                      )}
                      {isAdmin && (
                        <Button size="icon" variant="ghost" onClick={() => del.mutate(i.id)}>
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                      Sin resultados.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
