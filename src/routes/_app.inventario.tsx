import { createFileRoute, useNavigate } from "@tanstack/react-router";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import { strToU8, zipSync } from "fflate";
import {
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileJson,
  FileSpreadsheet,
  Boxes,
  Info,
  Loader2,
  Pencil,
  Plus,
  Printer,
  MoreHorizontal,
  QrCode,
  SlidersHorizontal,
  X,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QrLock, qrVerificado } from "@/components/activos/QrLock";
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
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { StatTile } from "@/components/StatTile";
import { cn } from "@/lib/utils";
import { estadoInfo, garantiaInfo, diasHasta } from "@/components/activos/catalogo";
import { ACTIVO_COLUMNAS_SQL, ActivoDialog, ControlDialog, type Activo } from "@/components/activos/dialogs";
import { FichaActivo, badgeVariant, iconoCategoria } from "@/components/activos/FichaActivo";

export const Route = createFileRoute("/_app/inventario")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ item: (s.item as string) || undefined }),
  head: () => ({
    meta: [
      { title: "Activos IT · SysIntranet" },
      {
        name: "description",
        content: "Inventario operativo por planta, sector, rubro, tipo y propiedad.",
      },

    ],
  }),
  component: InventarioPage,
});

const INVENTARIO_COLUMNS = [
  "Código",
  "Rubro",
  "Descripcion",
  "Marca",
  "Tipo",
  "N° de serie",
  "Estado",
  "Planta",
  "Sector",
  "Asignado a",
  "Hostname",
  "IP",
  "MAC",
  "Propiedad",
  "Proveedor",
  "Fecha de compra",
  "Garantía hasta",
  "Cantidad",
  "Ultima vez controlada",
] as const;

/** Nombre visible de cada columna (las claves internas se mantienen por compatibilidad con planillas viejas). */
const COLUMN_LABEL: Partial<Record<(typeof INVENTARIO_COLUMNS)[number], string>> = {
  Rubro: "Categoría",
  Tipo: "Modelo",
  Descripcion: "Descripción",
  "Ultima vez controlada": "Último control",
};
const colLabel = (c: (typeof INVENTARIO_COLUMNS)[number]) => COLUMN_LABEL[c] ?? c;

type InventarioColumn = (typeof INVENTARIO_COLUMNS)[number];

type Item = Activo;

type ItemPayload = {
  hostname?: string | null;
  ip?: string | null;
  mac?: string | null;
  proveedor?: string | null;
  fecha_compra?: string | null;
  garantia_hasta?: string | null;
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


const PAGE_SIZES = [25, 50, 100, 200] as const;

function estadoLabel(value: string | null | undefined) {
  return estadoInfo(value).label;
}

function normalizeEstado(value: string) {
  const normalized = text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalized.includes("baja")) return "baja";
  if (normalized.includes("repar")) return "reparacion";
  if (normalized.includes("observ")) return "observado";
  if (normalized.includes("deposit") || normalized.includes("stock") || normalized.includes("dispon")) return "deposito";
  if (normalized.includes("fuera") || normalized.includes("roto") || normalized.includes("no funciona")) return "fuera_servicio";
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


function itemField(item: Item, column: InventarioColumn) {
  const map: Record<InventarioColumn, string | number | null | undefined> = {
    "Código": item.codigo,
    "Asignado a": item.asignado_a,
    Hostname: item.hostname,
    IP: item.ip,
    MAC: item.mac,
    Proveedor: item.proveedor,
    "Fecha de compra": formatDateForDisplay(item.fecha_compra),
    "Garantía hasta": formatDateForDisplay(item.garantia_hasta),
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

/** Dirección que abre la ficha del equipo (es lo que codifica el QR). */
function itemUrl(id: string) {
  return `${window.location.origin}/inventario?item=${encodeURIComponent(id)}`;
}

function esc(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Hoja A4 de etiquetas con QR (3 columnas), lista para imprimir y pegar en cada equipo. */
async function printEtiquetas(rows: Item[]) {
  if (!rows.length) return toast.error("No hay equipos para imprimir");
  if (rows.length > 300) return toast.error("Filtrá hasta 300 equipos por hoja de etiquetas");
  const win = window.open("", "_blank");
  if (!win) return toast.error("El navegador bloqueó la ventana de impresión");
  const etiquetas = await Promise.all(
    rows.map(async (r) => {
      const svg = await QRCode.toString(itemUrl(r.id), { type: "svg", margin: 0, errorCorrectionLevel: "M" });
      return `<div class="et">
        <div class="qr">${svg}</div>
        <div class="tx">
          <div class="cod">${esc(r.codigo || "")}</div>
          <div class="desc">${esc(r.descripcion || r.nombre)}</div>
          <div class="ubi">${esc([r.sector, r.planta].filter(Boolean).join(" · "))}</div>
          <div class="sn">${r.numero_serie ? "S/N " + esc(r.numero_serie) : ""}</div>
        </div>
      </div>`;
    }),
  );
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Etiquetas de inventario</title>
    <style>
      @page { size: A4; margin: 8mm; }
      body { margin: 0; font-family: Arial, sans-serif; color: #111; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
      .et { display: flex; gap: 2.5mm; align-items: center; border: 0.3mm dashed #999; border-radius: 2mm; padding: 2.5mm; height: 30mm; box-sizing: border-box; break-inside: avoid; }
      .qr { width: 24mm; height: 24mm; flex-shrink: 0; }
      .qr svg { width: 100%; height: 100%; }
      .tx { min-width: 0; font-size: 7.5pt; line-height: 1.25; }
      .cod { font-family: monospace; font-weight: bold; font-size: 9pt; }
      .desc { font-weight: bold; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .ubi, .sn { color: #444; }
      .pie { margin-top: 4mm; font-size: 7pt; color: #777; }
    </style></head><body>
    <div class="grid">${etiquetas.join("")}</div>
    <div class="pie">SysIntranet · Área de Sistemas — escaneá el QR para abrir la ficha y registrar el control.</div>
    <script>window.onload = () => { window.focus(); window.print(); };</script>
    </body></html>`);
  win.document.close();
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
          <thead><tr>${INVENTARIO_COLUMNS.map((column) => `<th>${colLabel(column)}</th>`).join("")}</tr></thead>
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
  codigo: "Código",
  "codigo de activo": "Código",
  "asset tag": "Código",
  etiqueta: "Código",
  categoria: "Rubro",
  category: "Rubro",
  modelo: "Tipo",
  model: "Tipo",
  "asignado a": "Asignado a",
  asignado: "Asignado a",
  usuario: "Asignado a",
  hostname: "Hostname",
  "nombre de equipo": "Hostname",
  ip: "IP",
  "direccion ip": "IP",
  mac: "MAC",
  "direccion mac": "MAC",
  proveedor: "Proveedor",
  supplier: "Proveedor",
  "fecha de compra": "Fecha de compra",
  "purchase date": "Fecha de compra",
  garantia: "Garantía hasta",
  "garantia hasta": "Garantía hasta",
  "vencimiento garantia": "Garantía hasta",
};

function makePayload(input: Record<InventarioColumn, string>, index = 0): ItemPayload {
  const descripcion = text(input.Descripcion);
  const numeroSerie = text(input["N° de serie"]);
  const cantidad = parseCantidad(input.Cantidad);
  if (!descripcion) throw new Error("La descripción es obligatoria");
  if (!Number.isFinite(cantidad) || cantidad < 0) throw new Error("La cantidad no es válida");

  const rubro = text(input.Rubro);
  const tipo = text(input.Tipo);
  const codigoBase = text(input["Código"]) || numeroSerie || `${text(input.Planta)}-${text(input.Sector)}-${descripcion}`;

  return {
    codigo: codigoBase.replace(/\s+/g, "-").slice(0, 80) || `INV-${Date.now()}-${index}`,
    hostname: text(input.Hostname) || null,
    ip: text(input.IP) || null,
    mac: text(input.MAC).toUpperCase() || null,
    proveedor: text(input.Proveedor) || null,
    fecha_compra: normalizeDateValue(input["Fecha de compra"]),
    garantia_hasta: normalizeDateValue(input["Garantía hasta"]),
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
    asignado_a: text(input["Asignado a"]),
    notas: "",
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
            <div className="rounded-lg border border-ok/30 bg-ok/14 p-3 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
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
  const navigate = useNavigate();
  const { item: itemParam } = Route.useSearch();
  // Abierto desde un QR (carga directa con ?item=): se pide la clave antes de mostrar nada.
  const [bloqueadoQr, setBloqueadoQr] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!new URLSearchParams(window.location.search).get("item") && !qrVerificado();
  });
  const abrirFicha = (id: string | null) =>
    navigate({ to: "/inventario", search: { item: id ?? undefined }, replace: !id });
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
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(25);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const deferredQ = useDeferredValue(q);

  const { data = [], isFetching } = useQuery({
    queryKey: ["inventario"],
    queryFn: async () => {
      const { data, error } = await api
        .from("inventario")
        .select(ACTIVO_COLUMNAS_SQL)
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
        const searchable = INVENTARIO_COLUMNS.map((column) => itemField(item, column)).join(" ") + " " + (item.sistema_operativo ?? "");
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

  const codigos = useMemo(() => data.map((d) => d.codigo), [data]);
  const categoriasConteo = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data) {
      const c = d.rubro || d.categoria || "Otro";
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const filtrosExtra = [planta, tipo, propiedad, control].filter((v) => v !== "todos").length;
  const hayFiltros = filtrosExtra > 0 || [rubro, sector, estado].some((v) => v !== "todos") || !!q;
  const limpiarFiltros = () => {
    setQ("");
    setPlanta("todos");
    setSector("todos");
    setRubro("todos");
    setTipo("todos");
    setPropiedad("todos");
    setEstado("todos");
    setControl("todos");
    setPage(1);
  };
  const contarEstado = (v: string) => rows.filter((r) => estadoInfo(r.estado).value === v).length;
  const enUso = contarEstado("operativo");
  const enDeposito = contarEstado("deposito");
  const enReparacion = contarEstado("reparacion");
  const fueraServicio = contarEstado("fuera_servicio");
  const garantiaPorVencer = rows.filter((r) => {
    const d = diasHasta(r.garantia_hasta);
    return d != null && d >= 0 && d <= 90;
  }).length;
  const sinControl = rows.filter((row) => !row.ultima_vez_controlada).length;
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
  const fichaItem = itemParam ? (data.find((i) => i.id === itemParam) ?? null) : null;
  const canDelete = can("inventario", "delete") || isAdmin;

  useEffect(() => {
    setPage(1);
  }, [deferredQ, planta, sector, rubro, tipo, propiedad, estado, control]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  if (bloqueadoQr) {
    return <QrLock codigo={fichaItem?.codigo} onOk={() => setBloqueadoQr(false)} />;
  }

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Activos IT"
        description="Planilla técnica, asignaciones, reparaciones y controles de cada equipo."
        action={
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <MoreHorizontal /> Más
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs text-muted-foreground">Con los {rows.length} filtrados</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => void printEtiquetas(rows)}>
                  <QrCode /> Imprimir etiquetas QR
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportXlsx(rows)}>
                  <FileSpreadsheet /> Exportar a Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportCsv(rows)}>
                  <Download /> Exportar CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportJson(rows)}>
                  <FileJson /> Exportar JSON
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => printRows(rows)}>
                  <Printer /> Listado para imprimir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {canWrite && <ImportDialog onDone={refresh} />}
            {canWrite && canCreate && (
              <ActivoDialog
                codigos={codigos}
                plantas={options.plantas}
                sectores={options.sectores}
                trigger={
                  <Button>
                    <Plus className="size-4" /> Nuevo activo
                  </Button>
                }
                onDone={refresh}
              />
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5 stagger">
        {[
          { label: "Activos", value: data.length, hint: `${enUso} en uso · ${enDeposito} en depósito`, tone: "neutral" as const, filtro: "todos" },
          { label: "En reparación", value: enReparacion, hint: "servicio técnico", tone: enReparacion ? ("warn" as const) : ("ok" as const), filtro: "En reparación" },
          { label: "Fuera de servicio", value: fueraServicio, hint: "sin funcionar", tone: fueraServicio ? ("crit" as const) : ("ok" as const), filtro: "Fuera de servicio" },
          { label: "Garantía por vencer", value: garantiaPorVencer, hint: "próximos 90 días", tone: garantiaPorVencer ? ("warn" as const) : ("neutral" as const), filtro: null },
          { label: "Control vencido", value: control180, hint: `${sinControl} sin controlar`, tone: control180 ? ("crit" as const) : ("ok" as const), filtro: "control" },
        ].map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={!k.filtro}
            onClick={() => {
              if (k.filtro === "control") setControl(control === "vencido_180" ? "todos" : "vencido_180");
              else if (k.filtro) setEstado(estado === k.filtro || k.filtro === "todos" ? "todos" : k.filtro);
              setPage(1);
            }}
            className={cn(
              "text-left transition-transform disabled:cursor-default enabled:hover:-translate-y-0.5",
              ((k.filtro === "control" && control === "vencido_180") || (k.filtro && k.filtro !== "todos" && estado === k.filtro)) &&
                "rounded-xl ring-2 ring-primary",
            )}
          >
            <StatTile label={k.label} value={k.value} hint={k.hint} tone={k.tone} className="h-full py-3" />
          </button>
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none]">
        {[["todos", data.length] as const, ...categoriasConteo].map(([cat, n]) => {
          const Icono = cat === "todos" ? Boxes : iconoCategoria(cat);
          const activo = rubro === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setRubro(cat);
                setPage(1);
              }}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activo ? "border-primary bg-primary/12 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <Icono className="size-3.5" />
              {cat === "todos" ? "Todas" : cat}
              <span className="num text-[10.5px] opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <Card className="panel overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border p-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Buscar código, descripción, IP, hostname, serie, sector, persona…"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect label="Todos los estados" value={estado} onChange={(v) => { setEstado(v); setPage(1); }} options={options.estados} />
              <FilterSelect label="Todos los sectores" value={sector} onChange={(v) => { setSector(v); setPage(1); }} options={options.sectores} />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-9">
                    <SlidersHorizontal /> Filtros
                    {filtrosExtra > 0 && <span className="num rounded bg-primary px-1.5 text-[10px] text-primary-foreground">{filtrosExtra}</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="grid w-72 gap-2">
                  <p className="eyebrow">Más filtros</p>
                  <FilterSelect label="Todas las plantas" value={planta} onChange={(v) => { setPlanta(v); setPage(1); }} options={options.plantas} />
                  <FilterSelect label="Todos los modelos" value={tipo} onChange={(v) => { setTipo(v); setPage(1); }} options={options.tipos} />
                  <FilterSelect label="Todas las propiedades" value={propiedad} onChange={(v) => { setPropiedad(v); setPage(1); }} options={options.propiedades} />
                  <Select value={control} onValueChange={(value) => { setControl(value); setPage(1); }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Control" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos los controles</SelectItem>
                      <SelectItem value="sin_control">Nunca controlados</SelectItem>
                      <SelectItem value="vencido_90">Más de 90 días</SelectItem>
                      <SelectItem value="vencido_180">Más de 180 días</SelectItem>
                    </SelectContent>
                  </Select>
                </PopoverContent>
              </Popover>
              {hayFiltros && (
                <Button variant="ghost" className="h-9" onClick={limpiarFiltros}>
                  <X /> Limpiar
                </Button>
              )}
            </div>
          </div>

          {(isFetching || (canDelete && selectedRows.length > 0)) && (
            <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                {canDelete && selectedRows.length > 0 ? `${selectedRows.length} seleccionado(s)` : "Actualizando…"}
              </span>
              {canDelete && selectedRows.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={bulkDelete.isPending}
                  onClick={() => setPendingDeleteIds(selectedRows.map((row) => row.id))}
                >
                  <Trash2 className="size-3.5" />
                  {bulkDelete.isPending ? "Eliminando…" : "Eliminar seleccionados"}
                </Button>
              )}
            </div>
          )}

          <div className="grid gap-2 p-3 lg:hidden">
            {paginatedRows.map((item) => {
              const est = estadoInfo(item.estado);
              const Icono = iconoCategoria(item.rubro || item.categoria);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => abrirFicha(item.id)}
                  className="panel flex w-full items-center gap-3 p-3 text-left transition-colors active:bg-accent/50"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Icono className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="num block text-[11px] text-primary">{item.codigo}</span>
                    <span className="block truncate text-sm font-semibold">{item.descripcion || item.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[item.sector, item.planta].filter(Boolean).join(" · ") || "Sin ubicación"}
                      {item.asignado_a ? ` · ${item.asignado_a}` : ""}
                    </span>
                  </span>
                  <Badge variant={badgeVariant(est.tono)} className="shrink-0">
                    {est.label}
                  </Badge>
                </button>
              );
            })}
            {rows.length === 0 && (
              <div className="rounded-lg border border-dashed border-border/70 py-12 text-center text-sm text-muted-foreground">
                No hay activos que coincidan con la búsqueda o los filtros.
              </div>
            )}
          </div>

          <div className="hidden overflow-auto lg:block lg:max-h-[calc(100dvh-30rem)] lg:min-h-64">
            <Table className="min-w-[1080px]">
              <TableHeader className="sticky top-0 z-10 [&_th]:bg-muted">
                <TableRow>
                  {canDelete && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allVisibleSelected}
                        aria-label="Seleccionar visibles"
                        onCheckedChange={(checked) => toggleAllVisible(checked === true)}
                      />
                    </TableHead>
                  )}
                  <TableHead>Código</TableHead>
                  <TableHead>Activo</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead>Asignado a</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Red</TableHead>
                  <TableHead>Garantía</TableHead>
                  <TableHead>Último control</TableHead>
                  <TableHead className="sticky right-0 bg-card text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((item) => {
                  const est = estadoInfo(item.estado);
                  const gar = garantiaInfo(item.garantia_hasta);
                  const Icono = iconoCategoria(item.rubro || item.categoria);
                  return (
                    <TableRow key={item.id} data-state={selectedIds.has(item.id) ? "selected" : undefined} className="cursor-pointer" onClick={() => abrirFicha(item.id)}>
                      {canDelete && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(item.id)}
                            aria-label="Seleccionar"
                            onCheckedChange={(checked) => toggleSelected(item.id, checked === true)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="num whitespace-nowrap text-xs font-semibold text-primary">{item.codigo}</TableCell>
                      <TableCell className="max-w-[260px]">
                        <div className="flex items-center gap-2.5">
                          <Icono className="size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium">{item.descripcion || item.nombre}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {[item.rubro ?? item.categoria, item.marca, item.modelo ?? item.tipo].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] text-xs">
                        <p className="truncate">{item.sector || "—"}</p>
                        <p className="truncate text-muted-foreground">{item.planta}</p>
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-xs">{item.asignado_a || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge variant={badgeVariant(est.tono)}>{est.label}</Badge>
                      </TableCell>
                      <TableCell className="num max-w-[160px] text-xs">
                        <p className="truncate">{item.ip || "—"}</p>
                        <p className="truncate text-muted-foreground">{item.hostname}</p>
                      </TableCell>
                      <TableCell className="text-xs">
                        {item.garantia_hasta ? (
                          <span className="flex items-center gap-1.5">
                            <span className="led" data-tone={gar.tono === "neutral" ? undefined : gar.tono} />
                            {formatDateForDisplay(item.garantia_hasta)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={controlBadgeVariant(item)}>{itemField(item, "Ultima vez controlada") || "Sin control"}</Badge>
                      </TableCell>
                      <TableCell className="sticky right-0 bg-card text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-0.5">
                          <Button size="icon" variant="ghost" className="size-8" title="Planilla técnica" aria-label="Planilla técnica" onClick={() => abrirFicha(item.id)}>
                            <QrCode className="size-4" />
                          </Button>
                          {canEdit && (
                            <ControlDialog
                              item={item}
                              onDone={refresh}
                              trigger={
                                <Button size="icon" variant="ghost" className="size-8" title="Registrar control" aria-label="Registrar control">
                                  <ClipboardCheck className="size-4" />
                                </Button>
                              }
                            />
                          )}
                          {canEdit && (
                            <ActivoDialog
                              item={item}
                              codigos={codigos}
                              plantas={options.plantas}
                              sectores={options.sectores}
                              onDone={refresh}
                              trigger={
                                <Button size="icon" variant="ghost" className="size-8" title="Editar" aria-label="Editar">
                                  <Pencil className="size-4" />
                                </Button>
                              }
                            />
                          )}
                          {canDelete && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              title="Eliminar"
                              aria-label="Eliminar"
                              onClick={() => setPendingDeleteIds([item.id])}
                            >
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                      No hay activos que coincidan con la búsqueda o los filtros.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <span className="num">
              {rows.length === 0 ? "0" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, rows.length)}`} de {rows.length}
              {rows.length !== data.length ? ` (filtrados de ${data.length})` : ""}
            </span>
            <div className="flex items-center gap-1.5">
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value) as typeof pageSize);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[118px] text-xs">
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
              <Button variant="outline" size="sm" className="h-8" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="num px-1">
                {safePage}/{totalPages}
              </span>
              <Button variant="outline" size="sm" className="h-8" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Sheet open={!!fichaItem} onOpenChange={(o) => !o && abrirFicha(null)}>
        <SheetContent side="right" className="w-full p-0 sm:max-w-xl">
          <SheetTitle className="sr-only">Planilla técnica del activo</SheetTitle>
          {fichaItem && (
            <FichaActivo
              item={fichaItem}
              canEdit={canEdit}
              codigos={codigos}
              plantas={options.plantas}
              sectores={options.sectores}
              onPrintEtiqueta={(it) => void printEtiquetas([it])}
              onChanged={refresh}
            />
          )}
        </SheetContent>
      </Sheet>

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
