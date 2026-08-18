import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/inventario")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Inventario | SysIntranet | Area Wiki" },
      {
        name: "description",
        content: "Inventario operativo por planta, sector, rubro, tipo y propiedad.",
      },
      { property: "og:title", content: "Inventario | SysIntranet | Area Wiki" },
      { property: "og:description", content: "Control de bienes y stock del area." },
    ],
  }),
  component: InventarioPage,
});

const INVENTARIO_COLUMNS = [
  "Planta",
  "Sector",
  "Rubro",
  "Tipo",
  "Descripcion",
  "Cantidad",
  "Marca",
  "N° de serie",
  "Propiedad",
  "Ultima vez controlada",
] as const;

type InventarioColumn = (typeof INVENTARIO_COLUMNS)[number];

type Item = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  planta: string | null;
  sector: string | null;
  rubro: string | null;
  tipo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  propiedad: string | null;
  ultima_vez_controlada: string | null;
  estado: string;
  asignado_a: string | null;
  notas: string | null;
  created_at?: string;
  updated_at?: string;
};

type ItemPayload = {
  codigo: string;
  nombre: string;
  categoria: string;
  planta: string;
  sector: string;
  rubro: string;
  tipo: string;
  descripcion: string;
  cantidad: number;
  marca: string;
  modelo: string;
  numero_serie: string;
  propiedad: string;
  ultima_vez_controlada: string | null;
  estado: string;
  asignado_a: string;
  notas: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function itemField(item: Item, column: InventarioColumn) {
  const map: Record<InventarioColumn, string | number | null | undefined> = {
    Planta: item.planta,
    Sector: item.sector,
    Rubro: item.rubro ?? item.categoria,
    Tipo: item.tipo ?? item.modelo,
    Descripcion: item.descripcion ?? item.nombre,
    Cantidad: item.cantidad ?? 1,
    Marca: item.marca,
    "N° de serie": item.numero_serie,
    Propiedad: item.propiedad,
    "Ultima vez controlada": item.ultima_vez_controlada,
  };
  return map[column] ?? "";
}

function csvEscape(value: unknown) {
  const raw = String(value ?? "");
  return /[",\n\r;]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCsv(rows: Item[]) {
  const lines = [
    INVENTARIO_COLUMNS.join(","),
    ...rows.map((row) => INVENTARIO_COLUMNS.map((column) => csvEscape(itemField(row, column))).join(",")),
  ];
  downloadText("inventario.csv", lines.join("\n"), "text/csv;charset=utf-8");
}

function exportJson(rows: Item[]) {
  const data = rows.map((row) =>
    Object.fromEntries(INVENTARIO_COLUMNS.map((column) => [column, itemField(row, column)])),
  );
  downloadText("inventario.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

function printRows(rows: Item[]) {
  const tableRows = rows
    .map(
      (row) =>
        `<tr>${INVENTARIO_COLUMNS.map((column) => `<td>${String(itemField(row, column) ?? "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`,
    )
    .join("");
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Inventario</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          h1 { font-size: 20px; margin: 0 0 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th { background: #111827; color: white; text-align: left; }
          th, td { border: 1px solid #d1d5db; padding: 6px; vertical-align: top; }
          tr:nth-child(even) td { background: #f9fafb; }
        </style>
      </head>
      <body>
        <h1>Inventario</h1>
        <table>
          <thead><tr>${INVENTARIO_COLUMNS.map((column) => `<th>${column}</th>`).join("")}</tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>`;
  const win = window.open("", "_blank");
  if (!win) return toast.error("El navegador bloqueó la ventana de impresión");
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

function parseCsv(textContent: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < textContent.length; i += 1) {
    const char = textContent[i];
    const next = textContent[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const HEADER_ALIASES: Record<string, InventarioColumn> = {
  planta: "Planta",
  sector: "Sector",
  rubro: "Rubro",
  tipo: "Tipo",
  descripcion: "Descripcion",
  cantidad: "Cantidad",
  marca: "Marca",
  "n de serie": "N° de serie",
  "numero de serie": "N° de serie",
  "nro de serie": "N° de serie",
  propiedad: "Propiedad",
  "ultima vez controlada": "Ultima vez controlada",
};

function makePayload(input: Record<InventarioColumn, string>, index = 0): ItemPayload {
  const descripcion = text(input.Descripcion);
  const numeroSerie = text(input["N° de serie"]);
  const cantidad = Number(text(input.Cantidad) || 1);
  if (!descripcion) throw new Error("La descripción es obligatoria");
  if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error("La cantidad no es válida");

  const rubro = text(input.Rubro);
  const tipo = text(input.Tipo);
  const codigoBase = numeroSerie || `${text(input.Planta)}-${text(input.Sector)}-${descripcion}`;

  return {
    codigo: codigoBase.replace(/\s+/g, "-").slice(0, 80) || `INV-${Date.now()}-${index}`,
    nombre: descripcion,
    categoria: rubro || "general",
    planta: text(input.Planta),
    sector: text(input.Sector),
    rubro,
    tipo,
    descripcion,
    cantidad,
    marca: text(input.Marca),
    modelo: tipo,
    numero_serie: numeroSerie,
    propiedad: text(input.Propiedad),
    ultima_vez_controlada: text(input["Ultima vez controlada"]) || null,
    estado: "en_uso",
    asignado_a: "",
    notas: "",
  };
}

function parseImportFile(content: string) {
  const rows = parseCsv(content);
  if (rows.length < 2) throw new Error("El archivo no tiene registros para importar");

  const headers = rows[0].map((header) => HEADER_ALIASES[normalizeHeader(header)]);
  const missing = INVENTARIO_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    throw new Error(`Faltan columnas: ${missing.join(", ")}`);
  }

  return rows.slice(1).map((row, index) => {
    const record = Object.fromEntries(INVENTARIO_COLUMNS.map((column) => [column, ""])) as Record<
      InventarioColumn,
      string
    >;
    headers.forEach((column, cellIndex) => {
      if (column) record[column] = row[cellIndex] ?? "";
    });
    try {
      return makePayload(record, index);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Registro inválido";
      throw new Error(`Fila ${index + 2}: ${message}`);
    }
  });
}

function uniqueOptions(rows: Item[], getter: (row: Item) => string | null | undefined) {
  return [...new Set(rows.map((row) => text(getter(row))).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

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

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const record = Object.fromEntries(
      INVENTARIO_COLUMNS.map((column) => [column, text(fd.get(column))]),
    ) as Record<InventarioColumn, string>;

    let payload: ItemPayload;
    try {
      payload = makePayload(record);
    } catch (error) {
      return toast.error(error instanceof Error ? error.message : "Datos inválidos");
    }

    const { error } = item
      ? await api.from("inventario").update(payload).eq("id", item.id)
      : await api.from("inventario").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(item ? "Inventario actualizado" : "Registro cargado");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar registro" : "Nuevo registro de inventario"}</DialogTitle>
          <DialogDescription>
            Cargá las mismas columnas que se usan en la planilla del módulo.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            {INVENTARIO_COLUMNS.map((column) => (
              <div key={column} className="space-y-1.5">
                <Label>{column}</Label>
                <Input
                  name={column}
                  type={column === "Cantidad" ? "number" : column === "Ultima vez controlada" ? "date" : "text"}
                  min={column === "Cantidad" ? 0 : undefined}
                  defaultValue={String(item ? itemField(item, column) : column === "Cantidad" ? 1 : "")}
                  required={column === "Descripcion" || column === "Cantidad"}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [previewCount, setPreviewCount] = useState(0);
  const [records, setRecords] = useState<ItemPayload[]>([]);

  const reset = () => {
    setFileName("");
    setPreviewCount(0);
    setRecords([]);
  };

  const loadFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error("Guardá el Excel como CSV y subí ese archivo para importar sin dependencias extra.");
      return;
    }
    try {
      const parsed = parseImportFile(await file.text());
      setFileName(file.name);
      setPreviewCount(parsed.length);
      setRecords(parsed);
      toast.success(`${parsed.length} registro(s) listos para importar`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo leer el archivo");
    }
  };

  const importRows = async () => {
    if (records.length === 0) return toast.error("Primero seleccioná un archivo válido");
    const { error } = await api.from("inventario").insert(records);
    if (error) return toast.error(error.message);
    toast.success(`${records.length} registro(s) importados`);
    setOpen(false);
    reset();
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importación masiva</DialogTitle>
          <DialogDescription>
            Exportá tu Excel como CSV y respetá exactamente las columnas del módulo.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => downloadText("plantilla-inventario.csv", `${INVENTARIO_COLUMNS.join(",")}\n`, "text/csv;charset=utf-8")}
          >
            <FileSpreadsheet className="size-4" /> Descargar plantilla CSV
          </Button>
          <div className="space-y-1.5">
            <Label>Archivo CSV</Label>
            <Input accept=".csv,text/csv" type="file" onChange={(e) => loadFile(e.target.files?.[0])} />
          </div>
          {fileName && (
            <div className="rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
              <p className="font-medium">{fileName}</p>
              <p className="text-muted-foreground">{previewCount} registro(s) detectados para importar.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" disabled={records.length === 0} onClick={importRows}>
            Importar registros
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full md:w-44">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="todos">{label}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function InventarioPage() {
  const { canWrite, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [planta, setPlanta] = useState("todos");
  const [sector, setSector] = useState("todos");
  const [rubro, setRubro] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [propiedad, setPropiedad] = useState("todos");

  const { data = [] } = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const { data, error } = await api
        .from("inventario")
        .select("*")
        .order("updated_at", { ascending: false });
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
      toast.success("Registro eliminado");
      qc.invalidateQueries({ queryKey: ["inventario"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = useMemo(
    () => ({
      plantas: uniqueOptions(data, (row) => row.planta),
      sectores: uniqueOptions(data, (row) => row.sector),
      rubros: uniqueOptions(data, (row) => row.rubro ?? row.categoria),
      tipos: uniqueOptions(data, (row) => row.tipo ?? row.modelo),
      propiedades: uniqueOptions(data, (row) => row.propiedad),
    }),
    [data],
  );

  const rows = useMemo(
    () =>
      data.filter((item) => {
        const searchable = INVENTARIO_COLUMNS.map((column) => itemField(item, column)).join(" ");
        return (
          searchable.toLowerCase().includes(q.toLowerCase()) &&
          (planta === "todos" || item.planta === planta) &&
          (sector === "todos" || item.sector === sector) &&
          (rubro === "todos" || (item.rubro ?? item.categoria) === rubro) &&
          (tipo === "todos" || (item.tipo ?? item.modelo) === tipo) &&
          (propiedad === "todos" || item.propiedad === propiedad)
        );
      }),
    [data, q, planta, sector, rubro, tipo, propiedad],
  );

  const totalCantidad = rows.reduce((sum, row) => sum + Number(row.cantidad ?? 0), 0);
  const sinControl = rows.filter((row) => !row.ultima_vez_controlada).length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["inventario"] });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        description="Base central de bienes por planta, sector, rubro, tipo, propiedad y control."
        action={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <ImportDialog onDone={refresh} />
              <ItemDialog
                trigger={
                  <Button>
                    <Plus className="size-4" /> Nuevo registro
                  </Button>
                }
                onDone={refresh}
              />
            </div>
          ) : null
        }
      />

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="panel">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Registros visibles</p>
            <p className="mt-1 text-2xl font-semibold">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Cantidad total</p>
            <p className="mt-1 text-2xl font-semibold">{totalCantidad}</p>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Sectores</p>
            <p className="mt-1 text-2xl font-semibold">{options.sectores.length}</p>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Sin control registrado</p>
            <p className="mt-1 text-2xl font-semibold">{sinControl}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="panel">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-64 flex-1">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por planta, sector, descripcion, marca, serie o propiedad"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => exportCsv(rows)}>
              <Download className="size-4" /> CSV
            </Button>
            <Button variant="outline" onClick={() => exportJson(rows)}>
              <FileJson className="size-4" /> JSON
            </Button>
            <Button variant="outline" onClick={() => printRows(rows)}>
              <Printer className="size-4" /> PDF
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            <FilterSelect label="Todas las plantas" value={planta} onChange={setPlanta} options={options.plantas} />
            <FilterSelect label="Todos los sectores" value={sector} onChange={setSector} options={options.sectores} />
            <FilterSelect label="Todos los rubros" value={rubro} onChange={setRubro} options={options.rubros} />
            <FilterSelect label="Todos los tipos" value={tipo} onChange={setTipo} options={options.tipos} />
            <FilterSelect
              label="Todas las propiedades"
              value={propiedad}
              onChange={setPropiedad}
              options={options.propiedades}
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Filter className="size-4" />
              <span>
                Mostrando {rows.length} de {data.length} registro(s)
              </span>
            </div>
            <Badge variant="secondary">Columnas normalizadas para importacion</Badge>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/70">
            <Table>
              <TableHeader>
                <TableRow>
                  {INVENTARIO_COLUMNS.map((column) => (
                    <TableHead key={column} className="whitespace-nowrap">
                      {column}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    {INVENTARIO_COLUMNS.map((column) => (
                      <TableCell
                        key={column}
                        className={column === "Cantidad" ? "text-right tabular-nums" : "min-w-32"}
                      >
                        {column === "Cantidad" ? (
                          <Badge variant="secondary">{itemField(item, column) || 0}</Badge>
                        ) : (
                          itemField(item, column) || "-"
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="whitespace-nowrap text-right">
                      {canWrite && (
                        <ItemDialog
                          item={item}
                          trigger={
                            <Button size="icon" variant="ghost" title="Editar registro">
                              <Pencil className="size-4" />
                            </Button>
                          }
                          onDone={refresh}
                        />
                      )}
                      {isAdmin && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Eliminar registro"
                          onClick={() => {
                            if (confirm("¿Eliminar este registro de inventario?")) del.mutate(item.id);
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={INVENTARIO_COLUMNS.length + 1}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      No hay registros que coincidan con la busqueda o los filtros.
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
