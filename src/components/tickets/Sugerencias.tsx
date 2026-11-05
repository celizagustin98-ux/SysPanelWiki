import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, History, Plus } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { estadoLabel } from "./constants";

type Sugerido = { id: string; title: string; usos: number; etiquetado: boolean };

export function useInstructivosSugeridos(categoria: string | null | undefined) {
  return useQuery({
    queryKey: ["instructivos_sugeridos", categoria],
    enabled: !!categoria && categoria !== "Otro",
    staleTime: 5 * 60_000,
    queryFn: async () => ((await api.rpc("instructivos_sugeridos", { _categoria: categoria })).data ?? []) as Sugerido[],
  });
}

/** Instructivos que suelen servir para esta categoría (por etiqueta o porque se usaron en tickets parecidos). */
export function InstructivosSugeridos({
  categoria,
  excluir = [],
  onVincular,
  className,
}: {
  categoria: string | null | undefined;
  excluir?: string[];
  onVincular?: (id: string) => void;
  className?: string;
}) {
  const { data = [] } = useInstructivosSugeridos(categoria);
  const lista = data.filter((d) => !excluir.includes(d.id));
  if (!lista.length) return null;
  return (
    <div className={cn("rounded-lg border border-info/30 bg-info/6 p-2.5", className)}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-info">
        <BookOpen className="size-3.5" /> Instructivos que pueden servir
      </p>
      <ul className="space-y-0.5">
        {lista.map((d) => (
          <li key={d.id} className="flex items-center gap-1.5 text-[13px]">
            <Link to="/instructivos" search={{ doc: d.id, folder: undefined }} target="_blank" className="min-w-0 flex-1 truncate text-primary hover:underline">
              {d.title}
            </Link>
            {onVincular && (
              <button type="button" onClick={() => onVincular(d.id)} className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground">
                <Plus className="size-3" /> Vincular
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type TicketCorto = { id: string; numero: number | null; titulo: string; estado: string; created_at: string };

/** Aviso al cargar un ticket: ese equipo ya tuvo tickets en los últimos 90 días (posible falla repetida). */
export function AvisoEquipoReciente({ activoId, excluir }: { activoId: string | null | undefined; excluir?: string }) {
  const { data = [] } = useQuery({
    queryKey: ["tareas", "del-activo", activoId],
    enabled: !!activoId,
    queryFn: async () => {
      const desde = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data } = await api.from("tareas").select("id, numero, titulo, estado, created_at").eq("activo_id", activoId!).gte("created_at", desde).order("created_at", { ascending: false }).limit(6);
      return (data ?? []) as TicketCorto[];
    },
  });
  const lista = data.filter((t) => t.id !== excluir);
  if (!lista.length) return null;
  return (
    <div className="rounded-lg border border-warn/40 bg-warn/8 p-2.5 text-[12.5px]">
      <p className="mb-1 flex items-center gap-1.5 font-semibold">
        <History className="size-3.5" /> Este equipo tuvo {lista.length} {lista.length === 1 ? "ticket" : "tickets"} en los últimos 90 días
      </p>
      <ul className="space-y-0.5 text-muted-foreground">
        {lista.map((t) => (
          <li key={t.id} className="truncate">
            <Link to="/tareas" search={{ ticket: t.id }} className="hover:text-foreground hover:underline">
              <span className="num">#{t.numero ?? "—"}</span> {t.titulo}
            </Link>{" "}
            · {new Date(t.created_at).toLocaleDateString("es-AR")} · {estadoLabel(t.estado)}
          </li>
        ))}
      </ul>
      {lista.length >= 2 && <p className="mt-1 text-[11px]">Si se repite la misma falla, conviene revisar el equipo a fondo o pedir su reemplazo.</p>}
    </div>
  );
}
