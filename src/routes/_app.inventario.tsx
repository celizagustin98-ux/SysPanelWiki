import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  History,
  Info,
  Loader2,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Upload,
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
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";

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
  "Estado",
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
  estado: string;
  ultima_vez_controlada: string | null;
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
  estado: string;
  ultima_vez_controlada: string | null;
  asignado_a: string;
  notas: string;
};

type Control = {
  id: string;
  inventario_id: string;
  controlado_por_nombre: string | null;
  fecha_control: string;
  estado: string;
  observacion: string | null;
  created_at: string;
};

const ESTADOS = ["operativo", "observado", "reparacion", "baja"] as const;
const PAGE_SIZES = [25, 50, 100, 200] as const;

function estadoLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    operativo: "Operativo",
    en_uso: "Operativo",
    observado: "Observado",
    reparacion: "Reparación",
    baja: "Baja",
    nuevo: "Nuevo",
  };
  return labels[value || ""] ?? text(value || "Operativo");
}

function normalizeEstado(value: string) {
  const normalized = text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("baja")) return "baja";
  if (normalized.includes("repar")) return "reparacion";
  if (normalized.includes("observ")) return "observado";
  return "operativo";
}

function text(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
}

function parseCantidad(value: string) {
  const normalized = text(value).replace(/\./g, "").replace(",", ".");
  return Number(normalized || 1);
}

function normalizeDateValue(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return raw;

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function toDateInputValue(value: unknown) {
  return normalizeDateValue(value) ?? "";
}

function formatDateForDisplay(value: unknown) {
  const normalized = normalizeDateValue(value);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text(value);
  return date.toLocaleDateString("es-AR");
}

function normalizeItem(row: Item): Item {
  return {
    ...row,
    ultima_vez_controlada: normalizeDateValue(row.ultima_vez_controlada),
    created_at: row.created_at ? text(row.created_at) : undefined,
    updated_at: row.updated_at ? text(row.updated_at) : undefined,
  };
}

function normalizeControl(row: Control): Control {
  return {
    ...row,
    fecha_control: normalizeDateValue(row.fecha_control) ?? text(row.fecha_control),
    created_at: text(row.created_at),
  };
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
    Estado: estadoLabel(item.estado),
    "Ultima vez controlada": formatDateForDisplay(item.ultima_vez_controlada),
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
    INVENTARIO_COLUMNS.map(csvEscape).join(";"),
    ...rows.map((row) => INVENTARIO_COLUMNS.map((column) => csvEscape(itemField(row, column))).join(";")),
  ];
  downloadText("inventario.csv", `\ufeff${lines.join("\r\n")}`, "text/csv;charset=utf-8");
}

function exportJson(rows: Item[]) {
  const data = rows.map((row) =>
    Object.fromEntries(INVENTARIO_COLUMNS.map((column) => [column, itemField(row, column)])),
  );
  downloadText("inventario.json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
}

function xmlEscape(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function exportXlsx(rows: Item[]) {
  const matrix = [
    [...INVENTARIO_COLUMNS],
    ...rows.map((row) => INVENTARIO_COLUMNS.map((column) => String(itemField(row, column) ?? ""))),
  ];
  const sheetData = matrix
    .map((row, rowIndex) => {
      const cells = row
        .map((value, columnIndex) => {
          const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const widths = INVENTARIO_COLUMNS.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="22" customWidth="1"/>`).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventario" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${widths}</cols><sheetData>${sheetData}</sheetData></worksheet>`,
    ),
  };
  const zipped = zipSync(files);
  const blob = new Blob([zipped], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "inventario.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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

function splitCsvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function detectCsvDelimiter(textContent: string) {
  const firstLine = textContent
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0);
  if (!firstLine) return ",";

  const candidates = [";", ",", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: splitCsvLine(firstLine, delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter ?? ",";
}

function parseCsv(textContent: string) {
  const delimiter = detectCsvDelimiter(textContent);
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
    } else if (char === delimiter && !inQuotes) {
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
    .replace(/^\ufeff/, "")
    .replace(/\uFFFD/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[°º]/g, "")
    .replace(/[#.:;,_-]/g, " ")
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
  description: "Descripcion",
  cantidad: "Cantidad",
  marca: "Marca",
  "n de serie": "N° de serie",
  "n serie": "N° de serie",
  "nro serie": "N° de serie",
  "numero de serie": "N° de serie",
  "numero serie": "N° de serie",
  "nro de serie": "N° de serie",
  serie: "N° de serie",
  serial: "N° de serie",
  "serial number": "N° de serie",
  propiedad: "Propiedad",
  owner: "Propiedad",
  estado: "Estado",
  status: "Estado",
  condicion: "Estado",
  "ultima vez controlada": "Ultima vez controlada",
  "ultimo control": "Ultima vez controlada",
  "ultima controlada": "Ultima vez controlada",
  "fecha control": "Ultima vez controlada",
  "fecha de control": "Ultima vez controlada",
};

function makePayload(input: Record<InventarioColumn, string>, index = 0): ItemPayload {
  const descripcion = text(input.Descripcion);
  const numeroSerie = text(input["N° de serie"]);
  const cantidad = parseCantidad(input.Cantidad);
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
    estado: normalizeEstado(input.Estado),
    ultima_vez_controlada: normalizeDateValue(input["Ultima vez controlada"]),
    asignado_a: "",
    notas: "",
  };
}

function payloadToRecord(payload: ItemPayload): Record<InventarioColumn, string> {
  return {
    Planta: payload.planta,
    Sector: payload.sector,
    Rubro: payload.rubro,
    Tipo: payload.tipo,
    Descripcion: payload.descripcion,
    Cantidad: String(payload.cantidad),
    Marca: payload.marca,
    "N° de serie": payload.numero_serie,
    Propiedad: payload.propiedad,
    Estado: estadoLabel(payload.estado),
    "Ultima vez controlada": payload.ultima_vez_controlada ?? "",
  };
}

function parseImportFile(content: string) {
  const rows = parseCsv(content);
  return parseImportRows(rows);
}

function parseImportRows(rows: string[][]) {
  if (!Array.isArray(rows)) throw new Error("No se pudo leer la hoja del Excel.");
  if (rows.length < 2) throw new Error("El archivo no tiene registros para importar");

  const rawHeaders = rows[0];
  if (!Array.isArray(rawHeaders)) throw new Error("La primera fila del archivo no tiene encabezados válidos.");
  const headers = rawHeaders.map((header) => HEADER_ALIASES[normalizeHeader(header)]);
  const missing = INVENTARIO_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length > 0) {
    const detected = rawHeaders.map((header) => text(header)).filter(Boolean).join(" | ");
    throw new Error(
      `Faltan columnas: ${missing.join(", ")}. Columnas detectadas: ${detected || "ninguna"}`,
    );
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

function pickSpreadsheetRows(input: unknown): unknown[][] {
  if (Array.isArray(input)) {
    if (input.every((row) => Array.isArray(row))) return input as unknown[][];
    const firstSheet = input.find(
      (sheet): sheet is { data: unknown } =>
        typeof sheet === "object" && sheet !== null && "data" in sheet && Array.isArray(sheet.data),
    );
    if (firstSheet && Array.isArray(firstSheet.data)) return firstSheet.data as unknown[][];
  }

  if (typeof input === "object" && input !== null) {
    const data = "data" in input ? (input as { data?: unknown }).data : undefined;
    const rows = "rows" in input ? (input as { rows?: unknown }).rows : undefined;
    if (Array.isArray(data)) return pickSpreadsheetRows(data);
    if (Array.isArray(rows)) return pickSpreadsheetRows(rows);
  }

  throw new Error("No se pudo interpretar la hoja del Excel. Revisá que el archivo tenga una tabla en la primera hoja.");
}

function normalizeSpreadsheetRows(input: unknown) {
  const rows = pickSpreadsheetRows(input);
  return rows
    .filter((row): row is unknown[] => Array.isArray(row))
    .map((row) =>
      row.map((cell) => {
        if (cell instanceof Date) return cell.toISOString().slice(0, 10);
        return text(cell);
      }),
    )
    .filter((row) => row.some((cell) => cell !== ""));
}

function readTextFromArrayBuffer(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;
  return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
}

async function parseSpreadsheetFile(file: File) {
  if (/\.xls$/i.test(file.name)) {
    throw new Error("El formato .xls es antiguo. Guardá el archivo como .xlsx o CSV UTF-8 y volvé a importarlo.");
  }

  if (/\.xlsx$/i.test(file.name)) {
    const excel = await import("read-excel-file/browser");
    try {
      const rows = await excel.default(file);
      return parseImportRows(normalizeSpreadsheetRows(rows));
    } catch (primaryError) {
      try {
        const readSheet = (excel as { readSheet?: (input: File) => Promise<unknown> }).readSheet;
        if (!readSheet) throw primaryError;
        const rows = await readSheet(file);
        return parseImportRows(normalizeSpreadsheetRows(rows));
      } catch {
        throw new Error(
          "No se pudo leer el Excel. Verificá que sea .xlsx, que tenga datos en la primera hoja y que la primera fila tenga los encabezados.",
        );
      }
    }
  }

  const buffer = await file.arrayBuffer();
  return parseImportFile(readTextFromArrayBuffer(buffer));
}

function uniqueOptions(rows: Item[], getter: (row: Item) => string | null | undefined) {
  return [...new Set(rows.map((row) => text(getter(row))).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function daysSince(dateValue: unknown) {
  const normalized = normalizeDateValue(dateValue);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((localToday.getTime() - date.getTime()) / 86400000);
}

function controlBadgeVariant(item: Item): "default" | "secondary" | "destructive" | "outline" {
  const days = daysSince(item.ultima_vez_controlada);
  if (days === null) return "destructive";
  if (days > 180) return "destructive";
  if (days > 90) return "outline";
  return "secondary";
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
  const [estado, setEstado] = useState(item?.estado || "operativo");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const record = Object.fromEntries(
      INVENTARIO_COLUMNS.map((column) => [column, text(fd.get(column))]),
    ) as Record<InventarioColumn, string>;
    record.Estado = estado;

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
                {column === "Estado" ? (
                  <Select value={estado} onValueChange={setEstado}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ESTADOS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {estadoLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    name={column}
                    type={column === "Cantidad" ? "number" : column === "Ultima vez controlada" ? "date" : "text"}
                    min={column === "Cantidad" ? 0 : undefined}
                    defaultValue={
                      item
                        ? column === "Ultima vez controlada"
                          ? toDateInputValue(item.ultima_vez_controlada)
                          : String(itemField(item, column))
                        : column === "Cantidad"
                          ? 1
                          : ""
                    }
                    required={column === "Descripcion" || column === "Cantidad"}
                  />
                )}
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
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputId = useId();

  const reset = () => {
    setFileName("");
    setPreviewCount(0);
    setRecords([]);
    setIsReading(false);
    setIsImporting(false);
  };

  const loadFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      toast.error("Subí un archivo .xlsx o CSV.");
      return;
    }
    try {
      setIsReading(true);
      const parsed = await parseSpreadsheetFile(file);
      setFileName(file.name);
      setPreviewCount(parsed.length);
      setRecords(parsed);
      toast.success(`${parsed.length} registro(s) listos para importar`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer el archivo";
      toast.error(message === "e.map is not a function" ? "No se pudo interpretar la hoja del Excel." : message);
    } finally {
      setIsReading(false);
    }
  };

  const importRows = async () => {
    if (records.length === 0) return toast.error("Primero seleccioná un archivo válido");
    setIsImporting(true);
    try {
      const { error } = await api.from("inventario").insert(records);
      if (error) return toast.error(error.message);
      toast.success(`${records.length} registro(s) importados`);
      setOpen(false);
      reset();
      onDone();
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" /> Importar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importación masiva</DialogTitle>
          <DialogDescription>
            Subí un Excel .xlsx o CSV con las mismas columnas del módulo. La primera hoja del Excel será importada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <div className="flex items-start gap-2 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-medium">Columnas requeridas</p>
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {INVENTARIO_COLUMNS.map((column) => (
                    <span
                      key={column}
                      className="rounded-md border border-border/70 bg-background px-2 py-1 text-xs text-muted-foreground"
                    >
                      {column}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="secondary"
              className="h-11 justify-center gap-2 font-semibold"
              onClick={() =>
                downloadText(
                  "plantilla-inventario.csv",
                  `\ufeff${INVENTARIO_COLUMNS.map(csvEscape).join(";")}\r\n`,
                  "text/csv;charset=utf-8",
                )
              }
            >
              <FileSpreadsheet className="size-4" /> Plantilla CSV
            </Button>
            <Button
              type="button"
              variant={fileName ? "secondary" : "outline"}
              className="h-11 justify-center gap-2 font-semibold"
              disabled={isReading || isImporting}
              asChild
            >
              <label htmlFor={fileInputId}>
                <Upload className="size-4" />
                {fileName ? "Cambiar archivo" : "Seleccionar archivo"}
              </label>
            </Button>
          </div>
          <input
            id={fileInputId}
            className="hidden"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            type="file"
            onChange={(e) => loadFile(e.target.files?.[0])}
          />
          <label
            htmlFor={fileInputId}
            className="group cursor-pointer rounded-lg border border-dashed border-border/80 bg-background/60 p-5 text-center transition hover:border-primary/60 hover:bg-primary/5"
          >
            <FileSpreadsheet className="mx-auto size-9 text-muted-foreground transition group-hover:text-primary" />
            <p className="mt-2 text-sm font-semibold">
              {fileName ? fileName : "Arrastrá o seleccioná un archivo Excel o CSV"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Formatos admitidos: .xlsx y .csv. Para .xls antiguo, guardalo como .xlsx.
            </p>
          </label>
          {isReading && (
            <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
              <Loader2 className="size-4 animate-spin text-primary" />
              Leyendo archivo y validando columnas...
            </div>
          )}
          {fileName && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                <div>
                  <p className="font-medium">{fileName}</p>
                  <p className="text-muted-foreground">{previewCount} registro(s) detectados para importar.</p>
                </div>
              </div>
            </div>
          )}
          {records.length > 0 && (
            <div className="grid gap-3 rounded-lg border border-border/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Archivo validado</p>
                  <p className="text-xs text-muted-foreground">
                    Si la cantidad coincide, importá los registros. No hace falta revisar una tabla ancha.
                  </p>
                </div>
                <Badge variant="secondary">{records.length} registro(s)</Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/35 p-3">
                  <p className="text-xs text-muted-foreground">Primera planta</p>
                  <p className="truncate text-sm font-semibold">{records[0]?.planta || "-"}</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-3">
                  <p className="text-xs text-muted-foreground">Primer sector</p>
                  <p className="truncate text-sm font-semibold">{records[0]?.sector || "-"}</p>
                </div>
                <div className="rounded-lg bg-muted/35 p-3">
                  <p className="text-xs text-muted-foreground">Primer rubro</p>
                  <p className="truncate text-sm font-semibold">{records[0]?.rubro || "-"}</p>
                </div>
              </div>
              <div className="grid gap-2">
                {records.slice(0, 5).map((record, index) => (
                  <div key={`${record.codigo}-${index}`} className="rounded-lg border border-border/70 bg-background p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold">{record.descripcion}</p>
                      <Badge variant="outline">Fila {index + 2}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[record.planta, record.sector, record.rubro, record.tipo, record.numero_serie]
                        .filter(Boolean)
                        .join(" · ") || "Sin detalle adicional"}
                    </p>
                  </div>
                ))}
                {records.length > 5 && (
                  <p className="text-xs text-muted-foreground">
                    Se muestran 5 ejemplos. Al importar se guardan los {records.length} registros validados.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="grid gap-2 sm:flex sm:justify-end">
          <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="w-full font-semibold sm:w-auto"
            disabled={records.length === 0 || isImporting || isReading}
            onClick={importRows}
          >
            {isImporting ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {isImporting ? "Importando..." : "Importar registros"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ControlDialog({
  item,
  trigger,
  onDone,
}: {
  item: Item;
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState(item.estado || "operativo");
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fecha = text(fd.get("fecha_control")) || new Date().toISOString().slice(0, 10);
    const observacion = text(fd.get("observacion"));
    setIsSaving(true);
    try {
      const { error } = await api.rpc("controlar_inventario", {
        _inventario_id: item.id,
        _fecha_control: fecha,
        _estado: estado,
        _observacion: observacion,
      });
      if (error) return toast.error(error.message);
      toast.success("Control registrado en historial");
      setOpen(false);
      onDone();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Controlar inventario</DialogTitle>
          <DialogDescription>
            Registrá el control de este activo. Queda historial con fecha, estado y responsable.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <p className="text-sm font-semibold">{item.descripcion || item.nombre}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {[item.planta, item.sector, item.numero_serie].filter(Boolean).join(" · ") || "Sin datos adicionales"}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fecha de control</Label>
              <Input name="fecha_control" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {estadoLabel(value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observación</Label>
            <Input name="observacion" placeholder="Ej: verificado en sitio, requiere revisión, enviado a reparación..." />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? <Loader2 className="size-4 animate-spin" /> : <ClipboardCheck className="size-4" />}
              Guardar control
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistorialDialog({ item, trigger }: { item: Item; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["inventario-controles", item.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await api
        .from("inventario_controles")
        .select("*")
        .eq("inventario_id", item.id)
        .order("fecha_control", { ascending: false });
      if (error) {
        toast.error(error.message || "No se pudo cargar el historial");
        return [] as Control[];
      }
      return (data as Control[]).map(normalizeControl);
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historial de controles</DialogTitle>
          <DialogDescription>{item.descripcion || item.nombre}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          {isLoading && (
            <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
              <Loader2 className="size-4 animate-spin text-primary" />
              Cargando historial...
            </div>
          )}
          {!isLoading && data.length === 0 && (
            <div className="rounded-lg border border-dashed border-border/70 py-10 text-center text-sm text-muted-foreground">
              Este registro todavía no tiene controles guardados.
            </div>
          )}
          {data.map((control) => (
            <article key={control.id} className="rounded-lg border border-border/70 bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{formatDateForDisplay(control.fecha_control)}</p>
                  <p className="text-xs text-muted-foreground">
                    {control.controlado_por_nombre || "Usuario no identificado"}
                  </p>
                </div>
                <Badge variant="secondary">{estadoLabel(control.estado)}</Badge>
              </div>
              {control.observacion && <p className="mt-2 text-sm text-muted-foreground">{control.observacion}</p>}
            </article>
          ))}
        </div>
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
  const { canWrite, isAdmin, can } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [planta, setPlanta] = useState("todos");
  const [sector, setSector] = useState("todos");
  const [rubro, setRubro] = useState("todos");
  const [tipo, setTipo] = useState("todos");
  const [propiedad, setPropiedad] = useState("todos");
  const [estado, setEstado] = useState("todos");
  const [control, setControl] = useState("todos");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(50);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const deferredQ = useDeferredValue(q);

  const { data = [], isFetching } = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const { data, error } = await api
        .from("inventario")
        .select(
          "id,codigo,nombre,categoria,planta,sector,rubro,tipo,descripcion,cantidad,marca,modelo,numero_serie,propiedad,estado,ultima_vez_controlada,asignado_a,notas,created_at,updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data as Item[]).map(normalizeItem);
    },
    staleTime: 30_000,
  });

  const deleteInventoryItem = async (id: string) => {
    const controls = await api.from("inventario_controles").delete().eq("inventario_id", id);
    if (controls.error) throw controls.error;
    const item = await api.from("inventario").delete().eq("id", id);
    if (item.error) throw item.error;
  };

  const del = useMutation({
    mutationFn: deleteInventoryItem,
    onSuccess: (_data, id) => {
      toast.success("Registro eliminado");
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["inventario-controles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await deleteInventoryItem(id);
      return ids.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} registro(s) eliminado(s)`);
      setSelectedIds(new Set());
      qc.invalidateQueries({ queryKey: ["inventario"] });
      qc.invalidateQueries({ queryKey: ["inventario-controles"] });
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
      estados: uniqueOptions(data, (row) => estadoLabel(row.estado)),
    }),
    [data],
  );

  const rows = useMemo(
    () =>
      data.filter((item) => {
        const searchable = INVENTARIO_COLUMNS.map((column) => itemField(item, column)).join(" ");
        const days = daysSince(item.ultima_vez_controlada);
        const controlMatch =
          control === "todos" ||
          (control === "sin_control" && days === null) ||
          (control === "vencido_90" && (days === null || days > 90)) ||
          (control === "vencido_180" && (days === null || days > 180));
        return (
          searchable.toLowerCase().includes(deferredQ.toLowerCase()) &&
          (planta === "todos" || item.planta === planta) &&
          (sector === "todos" || item.sector === sector) &&
          (rubro === "todos" || (item.rubro ?? item.categoria) === rubro) &&
          (tipo === "todos" || (item.tipo ?? item.modelo) === tipo) &&
          (propiedad === "todos" || item.propiedad === propiedad) &&
          (estado === "todos" || estadoLabel(item.estado) === estado) &&
          controlMatch
        );
      }),
    [data, deferredQ, planta, sector, rubro, tipo, propiedad, estado, control],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const allVisibleSelected = paginatedRows.length > 0 && paginatedRows.every((row) => selectedIds.has(row.id));
  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of paginatedRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  };

  const totalCantidad = rows.reduce((sum, row) => sum + Number(row.cantidad ?? 0), 0);
  const sinControl = rows.filter((row) => !row.ultima_vez_controlada).length;
  const control90 = rows.filter((row) => {
    const days = daysSince(row.ultima_vez_controlada);
    return days === null || days > 90;
  }).length;
  const control180 = rows.filter((row) => {
    const days = daysSince(row.ultima_vez_controlada);
    return days === null || days > 180;
  }).length;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inventario"] });
    qc.invalidateQueries({ queryKey: ["inventario-controles"] });
  };
  const canCreate = can("inventario", "create");
  const canEdit = can("inventario", "edit");
  const canDelete = can("inventario", "delete") || isAdmin;

  useEffect(() => {
    setPage(1);
  }, [deferredQ, planta, sector, rubro, tipo, propiedad, estado, control]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventario"
        description="Base central de bienes por planta, sector, rubro, tipo, propiedad y control."
        action={
          canWrite ? (
            <div className="grid w-full gap-2 sm:w-auto sm:grid-flow-col">
              <ImportDialog onDone={refresh} />
              {canCreate && (
                <ItemDialog
                  trigger={
                    <Button>
                      <Plus className="size-4" /> Nuevo registro
                    </Button>
                  }
                  onDone={refresh}
                />
              )}
            </div>
          ) : null
        }
      />

      <div className="grid gap-3 md:grid-cols-5">
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
        <Card className="panel">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Control vencido</p>
            <p className="mt-1 text-2xl font-semibold">{control180}</p>
            <p className="text-xs text-muted-foreground">{control90} con más de 90 días</p>
          </CardContent>
        </Card>
      </div>

      <Card className="panel">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-center">
            <div className="relative min-w-0">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por planta, sector, descripcion, marca, serie o propiedad"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <Button variant="outline" onClick={() => exportXlsx(rows)}>
                <FileSpreadsheet className="size-4" /> Excel
              </Button>
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
          </div>

          <div className="grid gap-2 md:grid-cols-7">
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
            <FilterSelect label="Todos los estados" value={estado} onChange={setEstado} options={options.estados} />
            <Select value={control} onValueChange={(value) => { setControl(value); setPage(1); }}>
              <SelectTrigger className="w-full md:w-44">
                <SelectValue placeholder="Control" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los controles</SelectItem>
                <SelectItem value="sin_control">Sin control</SelectItem>
                <SelectItem value="vencido_90">Más de 90 días</SelectItem>
                <SelectItem value="vencido_180">Más de 180 días</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="size-4" />
              <span>
                Mostrando {paginatedRows.length} de {rows.length} filtrado(s), {data.length} total(es)
              </span>
              {isFetching && <Badge variant="outline">Actualizando...</Badge>}
              {canDelete && selectedRows.length > 0 && (
                <Badge variant="secondary">{selectedRows.length} seleccionado(s)</Badge>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {canDelete && selectedRows.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={bulkDelete.isPending}
                  onClick={() => setPendingDeleteIds(selectedRows.map((row) => row.id))}
                >
                  <Trash2 className="size-4" />
                  {bulkDelete.isPending ? "Eliminando..." : "Eliminar seleccionados"}
                </Button>
              )}
              <Badge variant="secondary">Columnas normalizadas para importacion</Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-sm">
            <div className="text-muted-foreground">
              Página {safePage} de {totalPages}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value) as typeof pageSize);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZES.map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value} por página
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>

          <div className="grid gap-3 lg:hidden">
            {paginatedRows.map((item) => (
              <article key={item.id} className="rounded-lg border border-border/70 bg-background p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {canDelete && (
                      <Checkbox
                        checked={selectedIds.has(item.id)}
                        aria-label="Seleccionar registro"
                        onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                      />
                    )}
                    <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.descripcion || item.nombre}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[item.planta, item.sector, item.rubro ?? item.categoria, item.tipo ?? item.modelo]
                          .filter(Boolean)
                          .join(" · ") || "Sin ubicación"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {item.cantidad ?? 0}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  {(["Marca", "N° de serie", "Propiedad", "Estado", "Ultima vez controlada"] as InventarioColumn[]).map(
                    (column) => (
                      <div key={column} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{column}</dt>
                        <dd className="truncate font-medium">
                          {column === "Ultima vez controlada" ? (
                            <Badge variant={controlBadgeVariant(item)}>{itemField(item, column) || "Sin control"}</Badge>
                          ) : (
                            itemField(item, column) || "-"
                          )}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
                {canWrite && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-4">
                    {canEdit && (
                      <ItemDialog
                        item={item}
                        trigger={
                          <Button size="sm" variant="outline">
                            <Pencil className="size-4" /> Modificar
                          </Button>
                        }
                        onDone={refresh}
                      />
                    )}
                    {canEdit && (
                      <ControlDialog
                        item={item}
                        trigger={
                          <Button size="sm" variant="outline">
                            <ClipboardCheck className="size-4" /> Controlar
                          </Button>
                        }
                        onDone={refresh}
                      />
                    )}
                    <HistorialDialog
                      item={item}
                      trigger={
                        <Button size="sm" variant="outline">
                          <History className="size-4" /> Historial
                        </Button>
                      }
                    />
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setPendingDeleteIds([item.id])}
                      >
                        <Trash2 className="size-4" /> Eliminar
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
            {rows.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
                No hay registros que coincidan con la busqueda o los filtros.
              </div>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-border/70 lg:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  {canDelete && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        aria-label="Seleccionar registros visibles"
                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                      />
                    </TableHead>
                  )}
                  {INVENTARIO_COLUMNS.map((column) => (
                    <TableHead key={column} className="whitespace-normal break-words text-xs">
                      {column}
                    </TableHead>
                  ))}
                  <TableHead className="w-64 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((item) => (
                  <TableRow key={item.id} data-state={selectedIds.has(item.id) ? "selected" : undefined}>
                    {canDelete && (
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          aria-label="Seleccionar registro"
                          onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                        />
                      </TableCell>
                    )}
                    {INVENTARIO_COLUMNS.map((column) => (
                      <TableCell
                        key={column}
                        className={cn(
                          "max-w-0 break-words text-xs",
                          column === "Cantidad" && "text-right tabular-nums",
                          column === "Descripcion" && "text-sm font-medium",
                        )}
                      >
                        {column === "Cantidad" ? (
                          <Badge variant="secondary">{itemField(item, column) || 0}</Badge>
                        ) : column === "Estado" ? (
                          <Badge variant={item.estado === "baja" ? "destructive" : "secondary"}>
                            {itemField(item, column) || "Operativo"}
                          </Badge>
                        ) : column === "Ultima vez controlada" ? (
                          <Badge variant={controlBadgeVariant(item)}>{itemField(item, column) || "Sin control"}</Badge>
                        ) : (
                          itemField(item, column) || "-"
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                      {canEdit && (
                        <ItemDialog
                          item={item}
                          trigger={
                            <Button size="sm" variant="ghost" title="Modificar registro">
                              <Pencil className="size-4" /> Modificar
                            </Button>
                          }
                          onDone={refresh}
                        />
                      )}
                      {canEdit && (
                        <ControlDialog
                          item={item}
                          trigger={
                            <Button size="sm" variant="ghost" title="Registrar control">
                              <ClipboardCheck className="size-4" /> Controlar
                            </Button>
                          }
                          onDone={refresh}
                        />
                      )}
                      <HistorialDialog
                        item={item}
                        trigger={
                          <Button size="sm" variant="ghost" title="Ver historial">
                            <History className="size-4" /> Historial
                          </Button>
                        }
                      />
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Eliminar registro"
                          onClick={() => setPendingDeleteIds([item.id])}
                        >
                          <Trash2 className="size-4 text-destructive" /> Eliminar
                        </Button>
                      )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={INVENTARIO_COLUMNS.length + 1 + (canDelete ? 1 : 0)}
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
      <AlertDialog open={pendingDeleteIds.length > 0} onOpenChange={(open) => !open && setPendingDeleteIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDeleteIds.length > 1 ? "Eliminar registros seleccionados" : "Eliminar registro"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción elimina {pendingDeleteIds.length} registro(s) de inventario y su historial de controles.
              No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const ids = pendingDeleteIds;
                setPendingDeleteIds([]);
                if (ids.length === 1) del.mutate(ids[0]);
                else bulkDelete.mutate(ids);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
