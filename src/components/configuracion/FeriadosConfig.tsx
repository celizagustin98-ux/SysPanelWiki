import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { useFeriados } from "@/lib/feriados";
import { formatFecha } from "@/lib/utils";
import { cn } from "@/lib/utils";

/** ABM de feriados: alimentan la planilla y la liquidación de Guardias. */
export function FeriadosConfig({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const { data: feriados = [], isLoading } = useFeriados();
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);

  const anios = useMemo(() => {
    const set = new Set(feriados.map((f) => Number(f.fecha.slice(0, 4))));
    set.add(new Date().getFullYear());
    set.add(new Date().getFullYear() + 1);
    return [...set].sort();
  }, [feriados]);
  const delAnio = feriados.filter((f) => f.fecha.startsWith(String(anio)));
  const hoy = new Date().toISOString().slice(0, 10);
  const proximo = feriados.find((f) => f.fecha >= hoy);

  const agregar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fecha = String(fd.get("fecha") ?? "");
    const nombre = String(fd.get("nombre") ?? "").trim() || "Feriado";
    if (!fecha) return toast.error("Elegí la fecha");
    setSaving(true);
    const { error } = await api.from("feriados").insert({ fecha, nombre });
    setSaving(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "Esa fecha ya está cargada" : error.message);
    toast.success(`Feriado ${formatFecha(fecha)} agregado`);
    (e.target as HTMLFormElement).reset();
    setAnio(Number(fecha.slice(0, 4)));
    void qc.invalidateQueries({ queryKey: ["feriados"] });
  };

  const quitar = async (fecha: string) => {
    const { error } = await api.from("feriados").delete().eq("fecha", fecha);
    if (error) return toast.error(error.message);
    toast.success("Feriado quitado");
    void qc.invalidateQueries({ queryKey: ["feriados"] });
  };

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="size-4 text-primary" /> Feriados {anio}
            <span className="num rounded bg-muted px-1.5 text-[11px] text-muted-foreground">{delAnio.length}</span>
          </p>
          <div className="flex gap-1">
            {anios.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAnio(a)}
                className={cn("num rounded-md px-2.5 py-1 text-xs font-medium", a === anio ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-muted")}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8" />)}</div>
        ) : delAnio.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">No hay feriados cargados para {anio}.</p>
        ) : (
          <ul className="divide-y divide-border/60 stagger">
            {delAnio.map((f) => {
              const d = new Date(Number(f.fecha.slice(0, 4)), Number(f.fecha.slice(5, 7)) - 1, Number(f.fecha.slice(8, 10)));
              const pasado = f.fecha < hoy;
              return (
                <li key={f.fecha} className={cn("flex items-center gap-3 px-4 py-2", pasado && "opacity-55")}>
                  <span className="num w-24 text-xs font-semibold">{formatFecha(f.fecha)}</span>
                  <span className="w-10 text-xs capitalize text-muted-foreground">{d.toLocaleDateString("es-AR", { weekday: "short" })}</span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{f.nombre}</span>
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="size-7" aria-label="Quitar feriado" onClick={() => void quitar(f.fecha)}>
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <aside className="space-y-3">
        {proximo && (
          <div className="kpi-cell">
            <p className="kpi-label">Próximo feriado</p>
            <p className="mt-1.5 text-base font-semibold">{proximo.nombre}</p>
            <p className="num text-xs text-muted-foreground">{formatFecha(proximo.fecha, { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
        )}
        {canEdit && (
          <form onSubmit={agregar} className="panel space-y-2.5 p-4">
            <p className="eyebrow">Agregar feriado</p>
            <Input type="date" name="fecha" required className="h-9" />
            <Input name="nombre" placeholder="Nombre (ej. Carnaval)" className="h-9" />
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Plus />} Agregar
            </Button>
          </form>
        )}
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          Los sábados y domingos ya cuentan como feriado para las guardias. Acá se cargan los feriados nacionales, puentes y días no laborables.
        </p>
      </aside>
    </div>
  );
}
