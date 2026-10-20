import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Building2,
  Copy,
  Pencil,
  Phone,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { PedidoInsumos } from "@/components/oficina/PedidoInsumos";

export const Route = createFileRoute("/_app/oficina")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Oficina · Nodara" },
      {
        name: "description",
        content: "Herramientas del día a día: teléfonos internos y más.",
      },
    ],
  }),
  component: OficinaPage,
});

type TabKey = "telefonos" | "insumos";

type Telefono = {
  id: string;
  sector: string;
  nombre: string;
  interno: string;
  notas: string | null;
  orden: number;
  activo: boolean;
};

const SECTORES_SUGERIDOS = [
  "Consultorios",
  "Secretarías",
  "Admisión",
  "Guardia",
  "Diagnóstico por imágenes",
  "Administración",
  "Facturación",
  "RRHH",
  "Sistemas",
  "Turnos",
  "Dirección médica",
  "Hospital de día",
  "Comunicaciones",
  "Piso 1 Internado",
  "Piso 2 Internado",
  "Piso 3 Internado",
  "Piso 4 Internado",
  "Quirófanos",
  "Hemodinamia",
  "Subsuelo",
  "Otros",
] as const;

const EMPTY_FORM = {
  sector: "Consultorios",
  nombre: "",
  interno: "",
  notas: "",
  orden: 0,
};

function OficinaPage() {
  const [tab, setTab] = useState<TabKey>("telefonos");

  return (
    <div className="space-y-3.5">
      <PageHeader title="Oficina" description="Herramientas del día a día: teléfonos internos y pedidos de insumos a Compras." />

      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1 shadow-xs">
        {(
          [
            ["telefonos", "Teléfonos internos", Phone],
            ["insumos", "Pedido de insumos", ShoppingCart],
          ] as const
        ).map(([k, label, Icono]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              tab === k ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icono className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "telefonos" && <TelefonosPanel />}
      {tab === "insumos" && <PedidoInsumos />}
    </div>
  );
}

function TelefonosPanel() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string | "todos">("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Telefono | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["oficina_telefonos"],
    queryFn: async () => {
      const { data, error } = await api
        .from("oficina_telefonos")
        .select("id, sector, nombre, interno, notas, orden, activo")
        .order("sector")
        .order("orden")
        .order("nombre");
      if (error) throw error;
      return ((data ?? []) as Telefono[]).filter((r) => r.activo !== false);
    },
  });

  const sectores = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.sector);
    for (const s of SECTORES_SUGERIDOS) set.add(s);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "es"));
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows
      .filter((r) => (sectorFilter === "todos" ? true : r.sector === sectorFilter))
      .filter((r) => {
        if (!term) return true;
        return [r.sector, r.nombre, r.interno, r.notas]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term));
      })
      .sort((a, b) => {
        if (term) {
          const aNum = a.interno.toLowerCase().includes(term) ? 0 : 1;
          const bNum = b.interno.toLowerCase().includes(term) ? 0 : 1;
          if (aNum !== bNum) return aNum - bNum;
        }
        const s = a.sector.localeCompare(b.sector, "es");
        if (s !== 0) return s;
        return (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, "es");
      });
  }, [rows, q, sectorFilter]);

  const bySector = useMemo(() => {
    const map = new Map<string, Telefono[]>();
    for (const r of filtered) {
      const list = map.get(r.sector) ?? [];
      list.push(r);
      map.set(r.sector, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [filtered]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        sector: form.sector.trim(),
        nombre: form.nombre.trim(),
        interno: form.interno.trim(),
        notas: form.notas.trim() || null,
        orden: Number(form.orden) || 0,
        activo: true,
      };
      if (!payload.sector || !payload.nombre || !payload.interno) {
        throw new Error("Sector, nombre e interno son obligatorios");
      }
      if (editing) {
        const { error } = await api.from("oficina_telefonos").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await api.from("oficina_telefonos").insert(payload);
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Interno actualizado" : "Interno agregado");
      qc.invalidateQueries({ queryKey: ["oficina_telefonos"] });
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // Soft delete
      const { error } = await api.from("oficina_telefonos").update({ activo: false }).eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Interno eliminado");
      qc.invalidateQueries({ queryKey: ["oficina_telefonos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openCreate() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      sector: sectorFilter !== "todos" ? sectorFilter : "Consultorios",
    });
    setDialogOpen(true);
  }

  function openEdit(row: Telefono) {
    setEditing(row);
    setForm({
      sector: row.sector,
      nombre: row.nombre,
      interno: row.interno,
      notas: row.notas ?? "",
      orden: row.orden,
    });
    setDialogOpen(true);
  }

  async function copyInterno(interno: string) {
    try {
      await navigator.clipboard.writeText(interno);
      toast.success(`Copiado: ${interno}`);
    } catch {
      toast.message(interno);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[16rem] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, sector o interno…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          value={sectorFilter}
          onValueChange={(v) => setSectorFilter(v as string | "todos")}
        >
          <SelectTrigger className="w-[11rem]">
            <SelectValue placeholder="Sector" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los sectores</SelectItem>
            {sectores.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canWrite && (
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="size-4" /> Agregar
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSectorFilter("todos")}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            sectorFilter === "todos"
              ? "border-primary/40 bg-primary/15 text-primary"
              : "border-border text-muted-foreground hover:bg-muted/50",
          )}
        >
          Todos ({rows.length})
        </button>
        {Array.from(new Set(rows.map((r) => r.sector)))
          .sort((a, b) => a.localeCompare(b, "es"))
          .map((s) => {
            const count = rows.filter((r) => r.sector === s).length;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSectorFilter(s)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  sectorFilter === s
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50",
                )}
              >
                {s} ({count})
              </button>
            );
          })}
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Cargando teléfonos…</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <Phone className="size-5" />
            No hay internos para mostrar.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {bySector.map(([sector, list]) => (
          <Card key={sector} className="panel overflow-hidden">
            <CardHeader className="border-b border-border/60 bg-muted/20 py-3">
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4 text-primary" />
                {sector}
                <Badge variant="secondary" className="ml-1 tabular-nums">
                  {list.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead className="w-28">Interno</TableHead>
                    <TableHead className="hidden sm:table-cell">Notas</TableHead>
                    {canWrite && <TableHead className="w-24 text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.nombre}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => void copyInterno(row.interno)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-sm font-semibold tabular-nums hover:bg-muted"
                          title="Copiar interno"
                        >
                          {row.interno}
                          <Copy className="size-3 opacity-60" />
                        </button>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {row.notas || "—"}
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="inline-flex gap-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-destructive"
                              onClick={() => {
                                if (confirm(`¿Eliminar ${row.nombre} (${row.interno})?`))
                                  remove.mutate(row.id);
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar interno" : "Agregar interno"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Input
                list="sectores-sugeridos"
                value={form.sector}
                onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                placeholder="Ej. Consultorios"
              />
              <datalist id="sectores-sugeridos">
                {sectores.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre / puesto</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Cons. 1 / Santino"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Interno</Label>
                <Input
                  value={form.interno}
                  onChange={(e) => setForm((f) => ({ ...f, interno: e.target.value }))}
                  placeholder="2501"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Orden</Label>
                <Input
                  type="number"
                  value={form.orden}
                  onChange={(e) => setForm((f) => ({ ...f, orden: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Input
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                placeholder="Ej. línea externa, referencia"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Guardando…" : editing ? "Guardar" : "Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
