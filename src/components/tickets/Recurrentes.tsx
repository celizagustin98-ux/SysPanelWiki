import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarSync, Loader2, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { confirmar } from "@/components/Confirmar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { CATEGORIAS, PRIORIDADES, TIPOS, prioLabel } from "./constants";
import { FRECUENCIAS, type Frecuencia } from "./recurrencia";

type Recurrente = {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: string;
  prioridad: string;
  categoria: string;
  sector: string | null;
  asignado_a: string | null;
  frecuencia: Frecuencia;
  proxima: string;
  dias_para_vencer: number | null;
  activo: boolean;
  ultima_creada: string | null;
};

/** Al abrir la bandeja se crean los tickets periódicos que ya tocan (una vez por sesión del navegador). */
export function useGenerarRecurrentes(onCreados: () => void) {
  useEffect(() => {
    let cancelado = false;
    void api.rpc("generar_tickets_recurrentes").then((r) => {
      const n = (r.data as { creados?: number } | null)?.creados ?? 0;
      if (!cancelado && n > 0) {
        toast.info(n === 1 ? "Se creó 1 ticket programado" : `Se crearon ${n} tickets programados`);
        onCreados();
      }
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const fecha = (f: string) => new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
const hoy = () => new Date().toLocaleDateString("sv-SE");

/** Tareas periódicas (revisar respaldos, limpiar servidores…) que se convierten en tickets solas. */
export function Recurrentes({ perfiles, canWrite }: { perfiles: { id: string; full_name: string }[]; canWrite: boolean }) {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<Recurrente | "nueva" | null>(null);
  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["ticket_recurrentes"],
    enabled: abierto,
    queryFn: async () => {
      const { data } = await api.from("ticket_recurrentes").select("*").order("proxima");
      return ((data ?? []) as Recurrente[]).map((r) => ({ ...r, proxima: String(r.proxima).slice(0, 10) }));
    },
  });
  const refrescar = () => qc.invalidateQueries({ queryKey: ["ticket_recurrentes"] });
  const nombre = (id: string | null) => perfiles.find((p) => p.id === id)?.full_name ?? "Cola";

  const pausar = async (r: Recurrente) => {
    const { error } = await api.from("ticket_recurrentes").update({ activo: !r.activo }).eq("id", r.id);
    if (error) return toast.error(error.message);
    void refrescar();
  };
  const borrar = async (r: Recurrente) => {
    if (!(await confirmar(`¿Eliminar «${r.titulo}»?`, { detalle: "Los tickets ya creados no se borran.", peligro: true }))) return;
    const { error } = await api.from("ticket_recurrentes").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    void refrescar();
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-9" onClick={() => setAbierto(true)} title="Tickets que se crean solos cada cierto tiempo">
        <CalendarSync className="size-4" /> Programados
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tickets programados</DialogTitle>
            <DialogDescription>Tareas que se repiten (revisar respaldos, limpiar servidores, controles mensuales). El ticket se crea solo el día que toca.</DialogDescription>
          </DialogHeader>
          {isLoading ? (
            <div className="skeleton h-24" />
          ) : lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay tareas programadas.</p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border">
              {lista.map((r) => (
                <li key={r.id} className={cn("flex items-center gap-3 px-3 py-2.5", !r.activo && "opacity-55")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{r.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {FRECUENCIAS.find((f) => f.value === r.frecuencia)?.label} · {r.activo ? `próximo ${fecha(r.proxima)}` : "pausado"} · {nombre(r.asignado_a)}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 gap-0.5">
                      <Button size="icon" variant="ghost" className="size-8" title={r.activo ? "Pausar" : "Reanudar"} onClick={() => void pausar(r)}>
                        {r.activo ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" onClick={() => setEditando(r)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Eliminar" onClick={() => void borrar(r)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canWrite && (
            <DialogFooter>
              <Button onClick={() => setEditando("nueva")}>
                <Plus className="size-4" /> Nueva tarea programada
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
      {editando && (
        <FormRecurrente
          r={editando === "nueva" ? null : editando}
          perfiles={perfiles}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void refrescar();
          }}
        />
      )}
    </>
  );
}

function FormRecurrente({ r, perfiles, onClose, onGuardado }: { r: Recurrente | null; perfiles: { id: string; full_name: string }[]; onClose: () => void; onGuardado: () => void }) {
  const [f, setF] = useState({
    titulo: r?.titulo ?? "",
    descripcion: r?.descripcion ?? "",
    tipo: r?.tipo ?? "mantenimiento",
    prioridad: r?.prioridad ?? "media",
    categoria: r?.categoria ?? "Servidor",
    sector: r?.sector ?? "",
    asignado_a: r?.asignado_a ?? "none",
    frecuencia: (r?.frecuencia ?? "mensual") as Frecuencia,
    proxima: r?.proxima ?? hoy(),
    dias_para_vencer: r?.dias_para_vencer != null ? String(r.dias_para_vencer) : "3",
  });
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    if (f.titulo.trim().length < 3) return toast.error("Poné un título claro");
    const payload = {
      titulo: f.titulo.trim(),
      descripcion: f.descripcion.trim() || null,
      tipo: f.tipo,
      prioridad: f.prioridad,
      categoria: f.categoria,
      sector: f.sector.trim() || null,
      asignado_a: f.asignado_a === "none" ? null : f.asignado_a,
      frecuencia: f.frecuencia,
      proxima: f.proxima,
      dias_para_vencer: f.dias_para_vencer.trim() ? Math.max(0, Number(f.dias_para_vencer) || 0) : null,
    };
    setGuardando(true);
    const { error } = r ? await api.from("ticket_recurrentes").update(payload).eq("id", r.id) : await api.from("ticket_recurrentes").insert(payload);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(r ? "Tarea programada actualizada" : "Tarea programada creada");
    onGuardado();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{r ? "Editar tarea programada" : "Nueva tarea programada"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Título del ticket</Label>
            <Input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Ej.: Revisar respaldos del servidor" autoFocus />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Qué hay que hacer</Label>
            <Textarea value={f.descripcion} onChange={(e) => set("descripcion", e.target.value)} rows={3} placeholder={"- Verificar que el respaldo de anoche terminó\n- Probar restaurar un archivo"} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Se repite</Label>
            <Select value={f.frecuencia} onValueChange={(v) => set("frecuencia", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FRECUENCIAS.map((x) => (
                  <SelectItem key={x.value} value={x.value}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Próxima vez</Label>
            <Input type="date" value={f.proxima} onChange={(e) => set("proxima", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Asignar a</Label>
            <Select value={f.asignado_a} onValueChange={(v) => set("asignado_a", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Cola (sin asignar)</SelectItem>
                {perfiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Días para resolverlo</Label>
            <Input value={f.dias_para_vencer} onChange={(e) => set("dias_para_vencer", e.target.value)} inputMode="numeric" className="num" placeholder="Sin vencimiento" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={f.tipo} onValueChange={(v) => set("tipo", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.key} value={t.key}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Prioridad</Label>
            <Select value={f.prioridad} onValueChange={(v) => set("prioridad", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORIDADES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {prioLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Categoría</Label>
            <Select value={f.categoria} onValueChange={(v) => set("categoria", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sector</Label>
            <Input value={f.sector} onChange={(e) => set("sector", e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
