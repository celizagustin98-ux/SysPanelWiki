import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookmarkPlus, MessageSquareText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/lib/api/client";

type Respuesta = { id: string; titulo: string; texto: string; usos: number };

export function useRespuestas() {
  return useQuery({
    queryKey: ["ticket_respuestas"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await api.from("ticket_respuestas").select("*").order("usos", { ascending: false });
      return (data ?? []) as Respuesta[];
    },
  });
}

/**
 * Botón de respuestas guardadas para comentarios y resoluciones: elegir una la agrega al texto,
 * y el texto que se está escribiendo se puede guardar como respuesta nueva.
 */
export function RespuestasGuardadas({ texto, onElegir }: { texto: string; onElegir: (t: string) => void }) {
  const qc = useQueryClient();
  const { data: respuestas = [] } = useRespuestas();
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [nombre, setNombre] = useState<string | null>(null);
  const refrescar = () => qc.invalidateQueries({ queryKey: ["ticket_respuestas"] });

  const visibles = respuestas.filter((r) => `${r.titulo} ${r.texto}`.toLowerCase().includes(filtro.trim().toLowerCase()));

  const elegir = async (r: Respuesta) => {
    onElegir(r.texto);
    setAbierto(false);
    await api.from("ticket_respuestas").update({ usos: r.usos + 1 }).eq("id", r.id);
    void refrescar();
  };

  const guardar = async () => {
    const titulo = (nombre ?? "").trim() || texto.trim().slice(0, 40);
    if (!texto.trim()) return toast.error("Escribí primero el texto a guardar");
    const { error } = await api.from("ticket_respuestas").insert({ titulo, texto: texto.trim() });
    if (error) return toast.error(error.message);
    toast.success("Respuesta guardada");
    setNombre(null);
    void refrescar();
  };

  const borrar = async (r: Respuesta) => {
    const { error } = await api.from("ticket_respuestas").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    void refrescar();
  };

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground" title="Respuestas guardadas">
          <MessageSquareText className="size-3.5" /> Respuestas
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        {respuestas.length > 4 && <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…" className="mb-2 h-8 text-xs" autoFocus />}
        {visibles.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {respuestas.length ? "Sin coincidencias." : "Todavía no hay respuestas guardadas. Escribí una y guardala abajo."}
          </p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {visibles.map((r) => (
              <li key={r.id} className="group flex items-start gap-1">
                <button type="button" onClick={() => void elegir(r)} className="fila-clic min-w-0 flex-1 rounded-md px-2 py-1.5 text-left">
                  <p className="truncate text-[13px] font-medium">{r.titulo}</p>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.texto}</p>
                </button>
                <button type="button" onClick={() => void borrar(r)} className="mt-1 rounded p-1 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100" aria-label="Borrar respuesta">
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 border-t border-border/60 pt-2">
          {nombre === null ? (
            <button type="button" disabled={!texto.trim()} onClick={() => setNombre("")} className="flex items-center gap-1.5 px-1 text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline">
              <BookmarkPlus className="size-3.5" /> Guardar el texto actual como respuesta
            </button>
          ) : (
            <div className="flex gap-1.5">
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void guardar();
                  }
                }}
                placeholder="Nombre (ej. Reinicio de equipo)"
                className="h-8 text-xs"
                autoFocus
              />
              <Button type="button" size="sm" className="h-8" onClick={() => void guardar()}>
                Guardar
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
