import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Clock, Copy, Loader2, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  DIAS_SEMANA,
  type HoraExtra,
  type HorarioDia,
  type Operario,
  formatHoras,
  hhmm,
  horasDelDia,
  horasEntre,
  normalizeName,
  resumirExtras,
  tipoExtraSugerido,
  ymd,
} from "@/components/guardias/domain";

// ── Datos ──────────────────────────────────────────────────────────────

export function useHorarios() {
  return useQuery({
    queryKey: ["guardia_horarios"],
    queryFn: async () => {
      const { data, error } = await api.from("guardia_horarios").select("*");
      if (error) throw error;
      return ((data ?? []) as HorarioDia[]).map((h) => ({ ...h, dia: Number(h.dia) }));
    },
  });
}

/** Horas extras del período (21 → 20). Las usa la solapa Horarios y la liquidación. */
export function useHorasExtras(desde: Date, hasta: Date) {
  return useQuery({
    queryKey: ["guardia_horas_extras", ymd(desde), ymd(hasta)],
    queryFn: async () => {
      const { data, error } = await api
        .from("guardia_horas_extras")
        .select("*")
        .gte("fecha", ymd(desde))
        .lte("fecha", ymd(hasta))
        .order("fecha");
      if (error) throw error;
      return ((data ?? []) as HoraExtra[]).map((e) => ({ ...e, fecha: String(e.fecha).slice(0, 10), horas: Number(e.horas) || 0 }));
    },
  });
}

function fechaCorta(fecha: string) {
  const [y, m, d] = fecha.split("-").map(Number);
  return format(new Date(y, m - 1, d), "EEE dd/MM", { locale: es });
}

function Codigo({ op, className }: { op: Operario; className?: string }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-md border text-[11px] font-bold", op.color || "border-border bg-muted text-muted-foreground", className)}>
      {op.code}
    </span>
  );
}

// ── Horario semanal ────────────────────────────────────────────────────

export function HorarioSemanal({ operarios, canWrite }: { operarios: Operario[]; canWrite: boolean }) {
  const { data: horarios = [], isLoading } = useHorarios();
  const [editando, setEditando] = useState<Operario | null>(null);

  const porOperario = useMemo(() => {
    const m = new Map<string, HorarioDia[]>();
    for (const h of horarios) m.set(h.operario_id, [...(m.get(h.operario_id) ?? []), h]);
    return m;
  }, [horarios]);

  const totalSemana = (op: Operario) => (porOperario.get(op.id ?? "") ?? []).reduce((s, h) => s + horasDelDia(h), 0);
  const totalEquipo = operarios.reduce((s, op) => s + totalSemana(op), 0);

  return (
    <Card className="panel overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Clock className="size-4 text-primary" />
            Horario semanal
            <span className="text-xs font-normal text-muted-foreground">· desde – hasta de cada empleado y total de la semana</span>
          </CardTitle>
          <Badge variant="secondary" className="num">
            Equipo: {formatHoras(totalEquipo)} / semana
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead>
              <tr className="bg-muted/40 text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
                <th className="sticky left-0 z-10 border-b border-r border-border bg-muted px-3 py-2 text-left font-semibold">Empleado</th>
                {DIAS_SEMANA.map((d, i) => (
                  <th key={d} className={cn("border-b border-border px-2 py-2 text-center font-semibold", i >= 5 && "bg-muted/70")}>
                    {d.slice(0, 3)}
                  </th>
                ))}
                <th className="border-b border-l border-border px-3 py-2 text-right font-semibold">Total semana</th>
                {canWrite && <th className="w-12 border-b border-border" />}
              </tr>
            </thead>
            <tbody>
              {operarios.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-4 text-muted-foreground">
                    No hay empleados. Usá Cargar Empleado para el plantel.
                  </td>
                </tr>
              )}
              {operarios.map((op) => {
                const dias = porOperario.get(op.id ?? "") ?? [];
                const total = totalSemana(op);
                return (
                  <tr key={op.id ?? op.nombre} className="group/row hover:bg-accent/30">
                    <td className="sticky left-0 z-10 whitespace-nowrap border-b border-r border-border bg-card px-3 py-2 font-medium group-hover/row:bg-accent">
                      <span className="flex items-center gap-2">
                        <Codigo op={op} />
                        {op.nombre}
                      </span>
                    </td>
                    {DIAS_SEMANA.map((d, i) => {
                      const h = dias.find((x) => x.dia === i);
                      return (
                        <td key={d} className={cn("border-b border-border/70 px-1.5 py-2 text-center", i >= 5 && "bg-muted/40")}>
                          {h ? (
                            <span className="num block leading-tight">
                              {hhmm(h.desde)}–{hhmm(h.hasta)}
                              {h.desde2 && h.hasta2 && (
                                <span className="block text-muted-foreground">
                                  {hhmm(h.desde2)}–{hhmm(h.hasta2)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">{dias.length ? "Franco" : "—"}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="num border-b border-l border-border px-3 py-2 text-right text-sm font-semibold">
                      {total ? formatHoras(total) : <span className="text-xs font-normal text-muted-foreground">Sin cargar</span>}
                    </td>
                    {canWrite && (
                      <td className="border-b border-border px-1 text-center">
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Editar horario de ${op.nombre}`} onClick={() => setEditando(op)}>
                          <Pencil className="size-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {isLoading && <div className="skeleton m-4 h-16" />}
      </CardContent>
      {editando && <EditarHorario op={editando} actuales={porOperario.get(editando.id ?? "") ?? []} onClose={() => setEditando(null)} />}
    </Card>
  );
}

type FilaDia = { trabaja: boolean; desde: string; hasta: string; cortado: boolean; desde2: string; hasta2: string };

function EditarHorario({ op, actuales, onClose }: { op: Operario; actuales: HorarioDia[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [guardando, setGuardando] = useState(false);
  const [filas, setFilas] = useState<FilaDia[]>(() =>
    DIAS_SEMANA.map((_, i) => {
      const h = actuales.find((x) => x.dia === i);
      return h
        ? { trabaja: true, desde: hhmm(h.desde), hasta: hhmm(h.hasta), cortado: !!(h.desde2 && h.hasta2), desde2: hhmm(h.desde2), hasta2: hhmm(h.hasta2) }
        : { trabaja: i < 5 && actuales.length === 0, desde: "08:00", hasta: "16:00", cortado: false, desde2: "", hasta2: "" };
    }),
  );

  const set = (i: number, cambios: Partial<FilaDia>) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, ...cambios } : x)));
  const horasFila = (f: FilaDia) => (f.trabaja ? horasEntre(f.desde, f.hasta) + (f.cortado ? horasEntre(f.desde2, f.hasta2) : 0) : 0);
  const total = filas.reduce((s, f) => s + horasFila(f), 0);

  const copiarLunes = () => setFilas((f) => f.map((x, i) => (i > 0 && i < 5 ? { ...f[0] } : x)));

  const guardar = async () => {
    if (!op.id) return;
    const invalida = filas.findIndex((f) => f.trabaja && (!f.desde || !f.hasta || (f.cortado && (!f.desde2 || !f.hasta2))));
    if (invalida >= 0) return toast.error(`Completá el horario del ${DIAS_SEMANA[invalida].toLowerCase()}`);
    setGuardando(true);
    try {
      const del = await api.from("guardia_horarios").delete().eq("operario_id", op.id);
      if (del.error) throw new Error(del.error.message);
      const nuevas = filas
        .map((f, dia) => ({ f, dia }))
        .filter(({ f }) => f.trabaja)
        .map(({ f, dia }) => ({
          operario_id: op.id,
          dia,
          desde: f.desde,
          hasta: f.hasta,
          desde2: f.cortado ? f.desde2 : null,
          hasta2: f.cortado ? f.hasta2 : null,
        }));
      if (nuevas.length) {
        const ins = await api.from("guardia_horarios").insert(nuevas);
        if (ins.error) throw new Error(ins.error.message);
      }
      toast.success("Horario guardado");
      await qc.invalidateQueries({ queryKey: ["guardia_horarios"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Codigo op={op} /> Horario de {op.nombre}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          {filas.map((f, i) => (
            <div key={DIAS_SEMANA[i]} className={cn("grid items-center gap-2 rounded-lg border border-border px-3 py-2 sm:grid-cols-[110px_1fr_auto]", !f.trabaja && "bg-muted/40")}>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={f.trabaja} onChange={(e) => set(i, { trabaja: e.target.checked })} />
                {DIAS_SEMANA[i]}
              </label>
              {f.trabaja ? (
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  <Input type="time" value={f.desde} onChange={(e) => set(i, { desde: e.target.value })} className="h-8 w-[108px]" aria-label="Desde" />
                  <span className="text-muted-foreground">a</span>
                  <Input type="time" value={f.hasta} onChange={(e) => set(i, { hasta: e.target.value })} className="h-8 w-[108px]" aria-label="Hasta" />
                  {f.cortado ? (
                    <>
                      <span className="px-1 text-muted-foreground">y</span>
                      <Input type="time" value={f.desde2} onChange={(e) => set(i, { desde2: e.target.value })} className="h-8 w-[108px]" aria-label="Desde (2º tramo)" />
                      <span className="text-muted-foreground">a</span>
                      <Input type="time" value={f.hasta2} onChange={(e) => set(i, { hasta2: e.target.value })} className="h-8 w-[108px]" aria-label="Hasta (2º tramo)" />
                      <button type="button" className="text-xs text-muted-foreground hover:text-crit" onClick={() => set(i, { cortado: false })}>
                        quitar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="text-xs text-primary hover:underline" onClick={() => set(i, { cortado: true, desde2: "17:00", hasta2: "21:00" })}>
                      + horario cortado
                    </button>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Franco</span>
              )}
              <span className="num text-right text-sm font-semibold">{f.trabaja ? formatHoras(horasFila(f)) : "—"}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={copiarLunes}>
            <Copy /> Copiar el lunes a martes–viernes
          </Button>
          <p className="text-sm">
            Total de la semana: <strong className="num">{formatHoras(total)}</strong>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void guardar()} disabled={guardando}>
            {guardando && <Loader2 className="animate-spin" />} Guardar horario
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Horas extras ───────────────────────────────────────────────────────

export function HorasExtras({
  operarios,
  desde,
  hasta,
  periodo,
  canWrite,
}: {
  operarios: Operario[];
  desde: Date;
  hasta: Date;
  periodo: string;
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const { data: extras = [], isLoading } = useHorasExtras(desde, hasta);
  const [editando, setEditando] = useState<HoraExtra | "nueva" | null>(null);
  const [filtro, setFiltro] = useState("todos");

  const resumen = useMemo(() => resumirExtras(extras, operarios).filter((r) => r.total > 0), [extras, operarios]);
  const visibles = filtro === "todos" ? extras : extras.filter((e) => normalizeName(e.operador_nombre) === filtro);
  const tot = resumen.reduce((s, r) => ({ h50: s.h50 + r.h50, h100: s.h100 + r.h100 }), { h50: 0, h100: 0 });
  const opDe = (nombre: string) => operarios.find((o) => normalizeName(o.nombre) === normalizeName(nombre)) ?? { nombre, code: "—", color: "" };

  const eliminar = async (e: HoraExtra) => {
    if (!window.confirm(`¿Eliminar ${formatHoras(e.horas)} extra de ${e.operador_nombre} del ${fechaCorta(e.fecha)}?`)) return;
    const { error } = await api.from("guardia_horas_extras").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Horas extras eliminadas");
    await qc.invalidateQueries({ queryKey: ["guardia_horas_extras"] });
  };

  return (
    <Card className="panel overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Timer className="size-4 text-primary" />
            Horas extras · {periodo}
            <span className="text-xs font-normal text-muted-foreground">· van en la liquidación del período</span>
          </CardTitle>
          {canWrite && (
            <Button size="sm" onClick={() => setEditando("nueva")} disabled={!operarios.length}>
              <Plus /> Cargar horas extras
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="kpi-cell">
            <p className="kpi-label">Al 50% · días hábiles</p>
            <p className="num mt-1 text-lg font-semibold">{formatHoras(tot.h50)}</p>
          </div>
          <div className="kpi-cell">
            <p className="kpi-label">Al 100% · fin de semana y feriados</p>
            <p className="num mt-1 text-lg font-semibold text-crit">{formatHoras(tot.h100)}</p>
          </div>
          <div className="kpi-cell">
            <p className="kpi-label">Total del período</p>
            <p className="num mt-1 text-lg font-semibold">{formatHoras(tot.h50 + tot.h100)}</p>
          </div>
        </div>

        {resumen.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFiltro("todos")}
              className={cn("rounded-full border px-3 py-1 text-xs", filtro === "todos" ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground")}
            >
              Todos · {extras.length}
            </button>
            {resumen.map((r) => {
              const clave = normalizeName(r.operario.nombre);
              return (
                <button
                  key={clave}
                  type="button"
                  onClick={() => setFiltro(filtro === clave ? "todos" : clave)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-3 text-xs",
                    filtro === clave ? "border-primary/50 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Codigo op={r.operario} className="size-5 rounded-full text-[10px]" />
                  {r.operario.nombre.split(" ").pop()} · <span className="num font-semibold">{formatHoras(r.total)}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Fecha</th>
                <th className="px-3 py-2 text-left font-semibold">Empleado</th>
                <th className="px-3 py-2 text-left font-semibold">Desde – hasta</th>
                <th className="px-3 py-2 text-right font-semibold">Horas</th>
                <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                <th className="px-3 py-2 text-left font-semibold">Motivo</th>
                {canWrite && <th className="w-20" />}
              </tr>
            </thead>
            <tbody>
              {!isLoading && visibles.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    No hay horas extras cargadas en este período.
                  </td>
                </tr>
              )}
              {visibles.map((e) => (
                <tr key={e.id} className="border-t border-border/70 hover:bg-accent/30">
                  <td className="num whitespace-nowrap px-3 py-2 first-letter:uppercase">{fechaCorta(e.fecha)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="flex items-center gap-2">
                      <Codigo op={opDe(e.operador_nombre)} />
                      {e.operador_nombre}
                    </span>
                  </td>
                  <td className="num whitespace-nowrap px-3 py-2">
                    {hhmm(e.desde)} – {hhmm(e.hasta)}
                  </td>
                  <td className="num px-3 py-2 text-right font-semibold">{formatHoras(e.horas)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={e.tipo === "100" ? "crit" : "info"}>Al {e.tipo}%</Badge>
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-2 text-muted-foreground" title={e.motivo ?? ""}>
                    {e.motivo || "—"}
                  </td>
                  {canWrite && (
                    <td className="whitespace-nowrap px-1 text-right">
                      <Button size="icon" variant="ghost" className="size-7" aria-label="Editar" onClick={() => setEditando(e)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-7" aria-label="Eliminar" onClick={() => void eliminar(e)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {isLoading && <div className="skeleton m-3 h-12" />}
        </div>
      </CardContent>
      {editando && (
        <EditarExtra
          extra={editando === "nueva" ? null : editando}
          operarios={operarios}
          fechaInicial={ymd(new Date() > hasta || new Date() < desde ? hasta : new Date())}
          onClose={() => setEditando(null)}
        />
      )}
    </Card>
  );
}

function EditarExtra({ extra, operarios, fechaInicial, onClose }: { extra: HoraExtra | null; operarios: Operario[]; fechaInicial: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [guardando, setGuardando] = useState(false);
  const [opId, setOpId] = useState(() => extra?.operario_id ?? operarios.find((o) => normalizeName(o.nombre) === normalizeName(extra?.operador_nombre))?.id ?? operarios[0]?.id ?? "");
  const [fecha, setFecha] = useState(extra?.fecha ?? fechaInicial);
  const [desde, setDesde] = useState(hhmm(extra?.desde) || "16:00");
  const [hasta, setHasta] = useState(hhmm(extra?.hasta) || "18:00");
  const [motivo, setMotivo] = useState(extra?.motivo ?? "");
  const horas = horasEntre(desde, hasta);

  const guardar = async () => {
    const op = operarios.find((o) => o.id === opId);
    if (!op && !extra) return toast.error("Elegí el empleado");
    if (!fecha || !desde || !hasta) return toast.error("Completá fecha, desde y hasta");
    if (!horas) return toast.error("El horario no suma horas");
    setGuardando(true);
    const datos = {
      operario_id: op?.id ?? extra?.operario_id ?? null,
      operador_nombre: op?.nombre ?? extra?.operador_nombre ?? "",
      fecha,
      desde,
      hasta,
      horas,
      // Sábado, domingo o feriado = 100%; día hábil = 50% (sale de la fecha).
      tipo: tipoExtraSugerido(fecha),
      motivo: motivo.trim() || null,
    };
    const { error } = extra
      ? await api.from("guardia_horas_extras").update({ ...datos, updated_at: new Date().toISOString() }).eq("id", extra.id)
      : await api.from("guardia_horas_extras").insert(datos);
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(extra ? "Horas extras actualizadas" : "Horas extras cargadas");
    await qc.invalidateQueries({ queryKey: ["guardia_horas_extras"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{extra ? "Editar horas extras" : "Cargar horas extras"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Empleado</Label>
            <Select value={opId} onValueChange={setOpId}>
              <SelectTrigger>
                <SelectValue placeholder={extra?.operador_nombre ?? "Elegí el empleado"} />
              </SelectTrigger>
              <SelectContent>
                {operarios.map((o) => (
                  <SelectItem key={o.id} value={o.id ?? o.nombre}>
                    {o.code} · {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <Label>Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </div>
          </div>
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            Total: <strong className="num">{formatHoras(horas)}</strong>
            {hasta && desde && hasta <= desde && <span className="text-xs text-muted-foreground"> · termina al día siguiente</span>}
          </div>
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ej.: migración del servidor, cobertura de compañero…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
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
