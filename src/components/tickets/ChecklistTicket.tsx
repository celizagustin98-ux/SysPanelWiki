import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCheck, ListChecks, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export type ItemChecklist = { id: string; titulo: string; hecha: boolean; orden: number; hecha_por_nombre: string | null; hecha_at: string | null };

const clave = (tareaId: string) => ["subtareas", tareaId];

export function useChecklist(tareaId: string) {
  return useQuery({
    queryKey: clave(tareaId),
    queryFn: async () => {
      const { data } = await api.from("tarea_subtareas").select("*").eq("tarea_id", tareaId).order("orden").order("created_at");
      return (data ?? []) as ItemChecklist[];
    },
  });
}

/** Renglones de un texto pegado o escrito: cada uno es una tarea (se ignoran viñetas y numeración). */
export function lineasChecklist(texto: string) {
  return texto
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•·]|\d+[.)]|\[\s?[xX ]?\s?\])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 50);
}

/** Crea las tareas del checklist de un ticket recién creado (desde el alta, una plantilla o un programado). */
export async function crearChecklist(tareaId: string, titulos: string[]) {
  if (!titulos.length) return;
  await api.from("tarea_subtareas").insert(titulos.map((titulo, orden) => ({ tarea_id: tareaId, titulo, orden })));
}

/**
 * Checklist de tareas del ticket: tildar es instantáneo (se guarda en segundo plano),
 * queda quién la tildó y cuándo, se pueden pegar varias tareas de una y editar el texto con un clic.
 */
export function ChecklistTicket({ tareaId, canWrite, onCambio }: { tareaId: string; canWrite: boolean; onCambio?: () => void }) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const { data: items = [] } = useChecklist(tareaId);
  const [nueva, setNueva] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const hechas = items.filter((i) => i.hecha).length;
  const progreso = items.length ? Math.round((hechas / items.length) * 100) : 0;

  /** Cambio optimista: la pantalla responde al instante y si el servidor falla se vuelve atrás. */
  const cambiar = async (cambio: (lista: ItemChecklist[]) => ItemChecklist[], guardar: () => PromiseLike<{ error: unknown }>) => {
    const previo = qc.getQueryData<ItemChecklist[]>(clave(tareaId)) ?? [];
    qc.setQueryData(clave(tareaId), cambio(previo));
    const { error } = await guardar();
    if (error) {
      qc.setQueryData(clave(tareaId), previo);
      toast.error("No se pudo guardar el cambio");
    }
    // El avance que se ve en la lista de tickets también se actualiza.
    void qc.invalidateQueries({ queryKey: ["subtareas", "resumen"] });
    onCambio?.();
  };

  const tildar = (i: ItemChecklist, hecha: boolean) => {
    const extra = hecha ? { hecha_por_nombre: profile?.full_name ?? null, hecha_at: new Date().toISOString() } : { hecha_por_nombre: null, hecha_at: null };
    return cambiar(
      (l) => l.map((x) => (x.id === i.id ? { ...x, hecha, ...extra } : x)),
      () => api.from("tarea_subtareas").update({ hecha, ...extra }).eq("id", i.id),
    );
  };

  const todas = () => {
    const pendientes = items.filter((i) => !i.hecha);
    const extra = { hecha: true, hecha_por_nombre: profile?.full_name ?? null, hecha_at: new Date().toISOString() };
    return cambiar(
      (l) => l.map((x) => (x.hecha ? x : { ...x, ...extra })),
      async () => {
        const r = await Promise.all(pendientes.map((i) => api.from("tarea_subtareas").update(extra).eq("id", i.id)));
        return { error: r.find((x) => x.error)?.error ?? null };
      },
    );
  };

  const agregar = async (desde = nueva) => {
    const titulos = lineasChecklist(desde);
    if (!titulos.length) return;
    setNueva("");
    const base = items.reduce((m, i) => Math.max(m, i.orden), -1) + 1;
    const { error } = await api.from("tarea_subtareas").insert(titulos.map((titulo, k) => ({ tarea_id: tareaId, titulo, orden: base + k })));
    if (error) return toast.error(error.message);
    if (titulos.length > 1) toast.success(`${titulos.length} tareas agregadas`);
    await qc.invalidateQueries({ queryKey: clave(tareaId) });
    void qc.invalidateQueries({ queryKey: ["subtareas", "resumen"] });
    onCambio?.();
  };

  const renombrar = (i: ItemChecklist) => {
    const t = texto.trim();
    setEditando(null);
    if (!t || t === i.titulo) return;
    return cambiar(
      (l) => l.map((x) => (x.id === i.id ? { ...x, titulo: t } : x)),
      () => api.from("tarea_subtareas").update({ titulo: t }).eq("id", i.id),
    );
  };

  const quitar = (i: ItemChecklist) =>
    cambiar(
      (l) => l.filter((x) => x.id !== i.id),
      () => api.from("tarea_subtareas").delete().eq("id", i.id),
    );

  return (
    <section className="rounded-xl border border-border/70 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <ListChecks className="size-3.5" /> Checklist de tareas
        </p>
        {items.length > 0 && (
          <span className={cn("num rounded-full px-2 py-0.5 text-[11px] font-semibold", hechas === items.length ? "bg-ok/14 text-ok" : "bg-muted text-muted-foreground")}>
            {hechas}/{items.length}
          </span>
        )}
        {canWrite && items.length > 1 && hechas < items.length && (
          <button type="button" onClick={() => void todas()} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <CheckCheck className="size-3.5" /> Marcar todas
          </button>
        )}
      </div>
      {items.length > 0 && (
        <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all duration-300", hechas === items.length ? "bg-ok" : "bg-primary")} style={{ width: `${progreso}%` }} />
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((i) => (
          <li key={i.id} className="group flex items-start gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/50">
            <Checkbox className="mt-0.5" checked={i.hecha} disabled={!canWrite} onCheckedChange={(v) => void tildar(i, v === true)} />
            <div className="min-w-0 flex-1">
              {editando === i.id ? (
                <Input
                  autoFocus
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onBlur={() => void renombrar(i)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void renombrar(i);
                    if (e.key === "Escape") setEditando(null);
                  }}
                  className="h-7 text-sm"
                />
              ) : (
                <button
                  type="button"
                  disabled={!canWrite}
                  onClick={() => {
                    setEditando(i.id);
                    setTexto(i.titulo);
                  }}
                  className={cn("w-full text-left text-sm transition-colors", i.hecha && "text-muted-foreground line-through", canWrite && "cursor-text")}
                  title={canWrite ? "Clic para editar" : undefined}
                >
                  {i.titulo}
                </button>
              )}
              {i.hecha && i.hecha_por_nombre && (
                <p className="text-[11px] text-muted-foreground">
                  ✓ {i.hecha_por_nombre}
                  {i.hecha_at ? ` · ${new Date(i.hecha_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}` : ""}
                </p>
              )}
            </div>
            {canWrite && (
              <button type="button" onClick={() => void quitar(i)} className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 [@media(pointer:coarse)]:opacity-60" aria-label="Quitar tarea">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {items.length === 0 && <p className="px-1.5 text-xs text-muted-foreground">Sin tareas. Agregá lo que hay que hacer (podés pegar varias, una por renglón).</p>}
      {canWrite && (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void agregar();
          }}
        >
          <Input
            className="h-8"
            placeholder="Agregar tarea… (ej. Cambiar monitor)"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onPaste={(e) => {
              // Pegar varias líneas agrega todas las tareas de una.
              const t = e.clipboardData.getData("text");
              if (t.includes("\n")) {
                e.preventDefault();
                void agregar(t);
              }
            }}
          />
          <Button type="submit" size="icon" variant="secondary" className="size-8 shrink-0" aria-label="Agregar tarea">
            <Plus className="size-4" />
          </Button>
        </form>
      )}
    </section>
  );
}
