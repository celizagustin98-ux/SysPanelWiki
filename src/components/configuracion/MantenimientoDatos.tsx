import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Bell, Database, FileClock, History, KeyRound, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Estado = {
  baseBytes: number;
  tablas: { tabla: string; filas: number; bytes: number }[];
  depurable: { auditoria: number; notificaciones: number; revisiones: number; sesiones: number };
};

function tamano(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const LIMPIEZAS = [
  {
    tipo: "auditoria",
    icon: History,
    titulo: "Auditoría de más de 12 meses",
    hint: "Eventos viejos del registro de cambios.",
  },
  {
    tipo: "notificaciones",
    icon: Bell,
    titulo: "Notificaciones leídas",
    hint: "Avisos que ya se vieron.",
  },
  {
    tipo: "revisiones",
    icon: FileClock,
    titulo: "Versiones viejas de instructivos",
    hint: "Se conservan las últimas 20 de cada documento.",
  },
  {
    tipo: "sesiones",
    icon: KeyRound,
    titulo: "Sesiones vencidas",
    hint: "Ingresos que ya expiraron.",
  },
] as const;

/** Tamaño de la base y depuración de información que ya no aporta. */
export function MantenimientoDatos() {
  const qc = useQueryClient();
  const [limpiando, setLimpiando] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["estado-datos"],
    queryFn: async () => {
      const { data, error } = await api.rpc("estado_datos");
      if (error) throw new Error(error.message);
      return data as Estado;
    },
  });

  const limpiar = async (tipo: string, titulo: string) => {
    if (!window.confirm(`¿Eliminar definitivamente: ${titulo.toLowerCase()}?`)) return;
    setLimpiando(tipo);
    const { data: r, error } = await api.rpc("depurar_datos", { _tipo: tipo, _meses: 12 });
    setLimpiando(null);
    if (error) return toast.error(error.message);
    toast.success(`${(r as { eliminadas: number }).eliminadas} registros eliminados`);
    void qc.invalidateQueries({ queryKey: ["estado-datos"] });
  };

  const top = (data?.tablas ?? []).slice(0, 8);
  const max = Math.max(1, ...top.map((t) => t.bytes));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">Base de datos</h3>
          </div>
          <span className="num text-sm font-semibold">{data ? tamano(data.baseBytes) : "—"}</span>
        </header>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-6" />
            ))}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {top.map((t) => (
              <li
                key={t.tabla}
                className="grid grid-cols-[minmax(0,1fr)_70px_64px] items-center gap-2 text-xs"
              >
                <div className="relative h-6 overflow-hidden rounded-md bg-muted/40">
                  <div
                    className="absolute inset-y-0 left-0 rounded-md bg-primary/15"
                    style={{ width: `${(t.bytes / max) * 100}%` }}
                  />
                  <span className="relative px-2 font-mono leading-6">{t.tabla}</span>
                </div>
                <span className="num text-right text-muted-foreground">
                  {t.filas.toLocaleString("es-AR")} filas
                </span>
                <span className="num text-right">{tamano(t.bytes)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <header className="mb-3 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Información que se puede depurar</h3>
        </header>
        <ul className="divide-y divide-border/70">
          {LIMPIEZAS.map((l) => {
            const n = data?.depurable?.[l.tipo] ?? 0;
            const Icono = l.icon;
            return (
              <li key={l.tipo} className="flex items-center gap-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icono className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{l.titulo}</p>
                  <p className="text-[11px] text-muted-foreground">{l.hint}</p>
                </div>
                <span className={cn("num text-sm", n ? "font-semibold" : "text-muted-foreground")}>
                  {n.toLocaleString("es-AR")}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  disabled={!n || limpiando === l.tipo}
                  onClick={() => void limpiar(l.tipo, l.titulo)}
                >
                  {limpiando === l.tipo ? <Loader2 className="size-3.5 animate-spin" /> : "Depurar"}
                </Button>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nada de esto afecta tickets, activos, tóners ni documentos vigentes.
        </p>
      </section>
    </div>
  );
}
