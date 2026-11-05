import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, ListChecks, Loader2, Pencil, Play, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Ejecucion = { id: string; completos: number; total: number; ejecutado_por_nombre: string | null; created_at: string; notas: string | null; ticket_numero: number | null };

/** Pasos numerados o con viñeta del texto del PDF ("1. Abrir…", "- Verificar…", "Paso 3: …"). */
export function detectarPasos(texto: string): string[] {
  const pasos: string[] = [];
  for (const bruto of texto.split(/\r?\n/)) {
    const m = bruto.trim().match(/^(?:paso\s*)?(?:\d{1,2}[.)-]|[•·*-])\s*:?\s*(.{4,200})$/i);
    if (m) pasos.push(m[1].trim().replace(/\s+/g, " "));
  }
  return pasos.slice(0, 40);
}

/** Checklist del instructivo: pasos editables y ejecución tildando cada uno (queda registrada). */
export function ChecklistInstructivo({ docId, titulo, pasos, canWrite, onChanged }: { docId: string; titulo: string; pasos: string[]; canWrite: boolean; onChanged: () => Promise<void> }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [ejecutando, setEjecutando] = useState(false);
  const [hechos, setHechos] = useState<boolean[]>([]);
  const [notas, setNotas] = useState("");
  const [ticket, setTicket] = useState("none");
  const [guardando, setGuardando] = useState(false);

  const { data: historial = [] } = useQuery({
    queryKey: ["instructivo_ejecuciones", docId],
    queryFn: async () => ((await api.from("instructivo_ejecuciones").select("*").eq("doc_id", docId).order("created_at", { ascending: false }).limit(5)).data ?? []) as Ejecucion[],
  });
  const { data: misTickets = [] } = useQuery({
    queryKey: ["tareas", "mios-abiertos", profile?.id],
    enabled: ejecutando && !!profile?.id,
    queryFn: async () =>
      (((await api.from("tareas").select("id, numero, titulo, estado").eq("asignado_a", profile!.id).order("updated_at", { ascending: false }).limit(30)).data ?? []) as { id: string; numero: number; titulo: string; estado: string }[]).filter(
        (t) => !["resuelto", "cerrado", "cancelado"].includes(t.estado),
      ),
  });

  const guardarPasos = async (lista: string[]) => {
    const { error } = await api.from("wiki_docs").update({ pasos: lista }).eq("id", docId);
    if (error) return toast.error(error.message);
    toast.success(lista.length ? `${lista.length} pasos guardados` : "Checklist quitado");
    setEditando(false);
    await onChanged();
  };

  const detectar = async () => {
    const { data } = await api.from("wiki_docs").select("texto_pdf").eq("id", docId).maybeSingle();
    const encontrados = detectarPasos(String((data as { texto_pdf?: string } | null)?.texto_pdf ?? ""));
    if (!encontrados.length) return toast.error("No se encontraron pasos numerados en el PDF (o todavía no se indexó su texto). Cargalos a mano.");
    setBorrador(encontrados.join("\n"));
    setEditando(true);
    toast.success(`Se detectaron ${encontrados.length} pasos: revisalos y guardá`);
  };

  const finalizar = async () => {
    setGuardando(true);
    const t = misTickets.find((x) => x.id === ticket);
    const { error } = await api.from("instructivo_ejecuciones").insert({
      doc_id: docId,
      doc_titulo: titulo,
      pasos: JSON.stringify(pasos.map((p, i) => ({ texto: p, hecho: !!hechos[i] }))),
      completos: hechos.filter(Boolean).length,
      total: pasos.length,
      notas: notas.trim() || null,
      tarea_id: t?.id ?? null,
      ticket_numero: t?.numero ?? null,
      ejecutado_por_nombre: profile?.full_name ?? null,
    });
    if (!error && t) {
      // El ticket queda con el instructivo vinculado y el detalle de lo hecho.
      await api.from("tarea_instructivos").insert({ tarea_id: t.id, doc_id: docId });
      await api.from("tarea_comentarios").insert({
        tarea_id: t.id,
        autor_id: profile?.id,
        contenido: `Checklist «${titulo}»: ${hechos.filter(Boolean).length}/${pasos.length} pasos${notas.trim() ? ` · ${notas.trim()}` : ""}`,
      });
    }
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success("Checklist registrado");
    setEjecutando(false);
    void qc.invalidateQueries({ queryKey: ["instructivo_ejecuciones", docId] });
  };

  return (
    <section className="space-y-2 border-t border-border/70 pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5">
          <ListChecks className="size-3.5" /> Checklist
        </p>
        {canWrite && !editando && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => {
              setBorrador(pasos.join("\n"));
              setEditando(true);
            }}
          >
            <Pencil className="size-3" /> {pasos.length ? "Editar pasos" : "Cargar pasos"}
          </button>
        )}
      </div>

      {editando ? (
        <div className="space-y-2">
          <Textarea value={borrador} onChange={(e) => setBorrador(e.target.value)} rows={7} placeholder={"Un paso por renglón:\nAbrir el panel de control\nVerificar la conexión\n…"} className="text-[13px]" />
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => void guardarPasos(borrador.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))}>
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => void detectar()}>
              <Wand2 className="size-3.5" /> Detectar del PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : pasos.length ? (
        <>
          <p className="text-xs text-muted-foreground">{pasos.length} pasos para seguir mientras se hace el trabajo.</p>
          <Button
            size="sm"
            className="w-full"
            onClick={() => {
              setHechos(pasos.map(() => false));
              setNotas("");
              setTicket("none");
              setEjecutando(true);
            }}
          >
            <Play className="size-3.5" /> Ejecutar checklist
          </Button>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin pasos cargados.{" "}
          {canWrite && (
            <button type="button" className="text-primary hover:underline" onClick={() => void detectar()}>
              Detectarlos del PDF
            </button>
          )}
        </p>
      )}

      {historial.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-muted-foreground">
          {historial.map((h) => (
            <li key={h.id} className="flex items-center gap-1">
              <CheckCircle2 className={cn("size-3 shrink-0", h.completos === h.total ? "text-ok" : "text-warn")} />
              {new Date(h.created_at).toLocaleDateString("es-AR")} · {h.ejecutado_por_nombre ?? "—"} · {h.completos}/{h.total}
              {h.ticket_numero ? ` · #${h.ticket_numero}` : ""}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={ejecutando} onOpenChange={(o) => !guardando && setEjecutando(o)}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>Tildá cada paso a medida que lo hacés. Al terminar queda registrado quién lo hizo y cuándo.</DialogDescription>
          </DialogHeader>
          <div className="meter" style={{ ["--meter" as string]: "var(--ok)" }}>
            <span style={{ width: `${pasos.length ? (hechos.filter(Boolean).length / pasos.length) * 100 : 0}%` }} />
          </div>
          <ol className="linea-tiempo space-y-1">
            {pasos.map((p, i) => (
              <li key={i}>
                <label className={cn("fila-clic flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm", hechos[i] && "text-muted-foreground line-through")}>
                  <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--ok)]" checked={!!hechos[i]} onChange={() => setHechos((h) => h.map((x, j) => (j === i ? !x : x)))} />
                  <span>
                    <span className="num mr-1.5 text-xs text-muted-foreground">{i + 1}.</span>
                    {p}
                  </span>
                </label>
              </li>
            ))}
          </ol>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Ticket (opcional)</Label>
              <Select value={ticket} onValueChange={setTicket}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin ticket</SelectItem>
                  {misTickets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      #{t.numero} · {t.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notas</Label>
              <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observaciones" className="h-9" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEjecutando(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void finalizar()} disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Terminar ({hechos.filter(Boolean).length}/{pasos.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
