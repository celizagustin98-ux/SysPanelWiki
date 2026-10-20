import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Orden<K extends string> = { campo: K; asc: boolean } | null;

/** Ordena filas por la columna elegida (clic en el encabezado: asc → desc → sin orden). */
export function useOrden<T, K extends string>(
  filas: T[],
  valores: Record<K, (fila: T) => unknown>,
  inicial: Orden<K> = null,
) {
  const [orden, setOrden] = useState<Orden<K>>(inicial);
  const ordenadas = useMemo(() => {
    if (!orden) return filas;
    const get = valores[orden.campo];
    const dir = orden.asc ? 1 : -1;
    return [...filas].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null || va === "") return 1;
      if (vb == null || vb === "") return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return (
        String(va).localeCompare(String(vb), "es", { numeric: true, sensitivity: "base" }) * dir
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filas, orden]);
  const alternar = (campo: K) =>
    setOrden((o) =>
      !o || o.campo !== campo ? { campo, asc: true } : o.asc ? { campo, asc: false } : null,
    );
  return { ordenadas, orden, alternar };
}

/** Encabezado de columna ordenable. */
export function ThOrden<K extends string>({
  campo,
  orden,
  onOrden,
  children,
  className,
  alinear = "left",
}: {
  campo: K;
  orden: Orden<K>;
  onOrden: (campo: K) => void;
  children: ReactNode;
  className?: string;
  alinear?: "left" | "right" | "center";
}) {
  const activo = orden?.campo === campo;
  const Icono = !activo ? ChevronsUpDown : orden.asc ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium",
        alinear === "right" && "text-right",
        alinear === "center" && "text-center",
        className,
      )}
      aria-sort={activo ? (orden.asc ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onOrden(campo)}
        className={cn(
          "inline-flex items-center gap-1 rounded tracking-[inherit] transition-colors [text-transform:inherit] hover:text-foreground",
          activo && "text-foreground",
          alinear === "right" && "flex-row-reverse",
        )}
      >
        {children}
        <Icono className={cn("size-3", !activo && "opacity-40")} />
      </button>
    </th>
  );
}

/** Clase común del encabezado de las tablas de datos. */
export const THEAD_CLASE =
  "border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground";

export type OpcionFiltro = { valor: string; label: string; n?: number };

/** Filtro rápido en forma de chips con contador. */
export function FiltroChips({
  opciones,
  valor,
  onChange,
  className,
}: {
  opciones: OpcionFiltro[];
  valor: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)} role="radiogroup">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            "h-8 rounded-full border px-3 text-xs font-medium capitalize transition-colors",
            valor === o.valor
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
          {o.n != null && <span className="num ml-1.5 opacity-70">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export type ColumnaCsv<T> = { titulo: string; valor: (fila: T) => unknown };

/** Descarga las filas visibles como CSV (abre directo en Excel, con acentos). */
export function exportarCsv<T>(nombre: string, columnas: ColumnaCsv<T>[], filas: T[]) {
  const celda = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toLocaleString("es-AR") : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    columnas.map((c) => celda(c.titulo)).join(";"),
    ...filas.map((f) => columnas.map((c) => celda(c.valor(f))).join(";")),
  ];
  const blob = new Blob([String.fromCharCode(0xfeff), lineas.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function BotonCsv({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8"
      onClick={onClick}
      disabled={disabled}
    >
      <Download className="size-3.5" /> Excel
    </Button>
  );
}

/** Pie de tabla con el conteo de filas. */
export function PieTabla({
  mostrando,
  total,
  children,
}: {
  mostrando: number;
  total: number;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground">
      <span>
        {mostrando === total
          ? `${total} registro${total === 1 ? "" : "s"}`
          : `${mostrando} de ${total} registros`}
      </span>
      {children}
    </div>
  );
}
