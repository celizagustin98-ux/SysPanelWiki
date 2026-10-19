import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  format,
  parseISO,
  startOfDay,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileDown,
  Palmtree,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { abrirPdfLiquidacion } from "@/lib/guardia-liquidacion-pdf";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  type Guardia,
  type Operario,
  type OperarioRow,
  SEED_OPERARIOS,
  colorForIndex,
  coversNight,
  getPeriodContaining,
  isFeriado,
  isVacacion,
  nightEndIso,
  nightStartIso,
  normalizeName,
  parseLocal,
  periodLabel,
  removeNightFromGuardia,
  shiftPeriod,
  weekdayLetter,
  ymd,
} from "@/components/guardias/domain";
import { OperariosDialog } from "@/components/guardias/dialogs";

function asText(v: unknown, fallback = "") {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "object" && v && "toISOString" in v && typeof (v as any).toISOString === "function") {
    try {
      return (v as any).toISOString();
    } catch {
      /* fallthrough */
    }
  }
  return fallback;
}

export function GuardiasPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(() => getPeriodContaining(new Date()));
  const [cellDialog, setCellDialog] = useState<null | { op: Operario; day: Date }>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfTitulo, setPdfTitulo] = useState("Liquidación de guardias");
  const [pdfNotas, setPdfNotas] = useState(
    "Feriado = sábado, domingo o feriado nacional. Cada noche cuenta 20:00–08:00. Las vacaciones (V) no suman.",
  );
  const [pdfPie, setPdfPie] = useState("SysPanelWiki · Documento de liquidación interna");
  const [busy, setBusy] = useState(false);

  const days = useMemo(
    () => eachDayOfInterval({ start: period.desde, end: period.hasta }),
    [period.desde, period.hasta],
  );

  const { data: operarioRows = [], isLoading: loadingOps } = useQuery({
    queryKey: ["guardia_operarios"],
    queryFn: async () => {
      const { data, error } = await api
        .from("guardia_operarios")
        .select("id, nombre, code, activo, orden")
        .order("orden");
      if (error) {
        return SEED_OPERARIOS.map((s, i) => ({
          id: `seed-${i}`,
          nombre: s.nombre,
          code: s.code,
          activo: true,
          orden: s.orden,
        })) as OperarioRow[];
      }
      let rows = ((data ?? []) as any[]).map((r, i) => ({
        id: asText(r.id, `tmp-${i}`),
        nombre: asText(r.nombre).trim(),
        code: asText(r.code, "?").trim() || "?",
        activo: r.activo !== false,
        orden: Number(r.orden) || 0,
      })) as OperarioRow[];
      if (rows.length === 0) {
        await api.from("guardia_operarios").insert(
          SEED_OPERARIOS.map((s) => ({
            nombre: s.nombre,
            code: s.code,
            activo: true,
            orden: s.orden,
          })),
        );
        const again = await api
          .from("guardia_operarios")
          .select("id, nombre, code, activo, orden")
          .order("orden");
        rows = ((again.data ?? []) as any[]).map((r, i) => ({
          id: asText(r.id, `tmp-${i}`),
          nombre: asText(r.nombre).trim(),
          code: asText(r.code, "?").trim() || "?",
          activo: r.activo !== false,
          orden: Number(r.orden) || 0,
        })) as OperarioRow[];
      }
      return rows.filter((r) => r.nombre);
    },
  });

  const operarios: Operario[] = useMemo(() => {
    return operarioRows
      .filter((r) => r.activo)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map((r, i) => ({
        id: r.id,
        nombre: asText(r.nombre),
        code: asText(r.code, "?"),
        color: colorForIndex(i),
      }));
  }, [operarioRows]);

  const { data: guardias = [], isLoading } = useQuery({
    queryKey: ["guardias"],
    queryFn: async () => {
      const { data, error } = await api.from("guardias").select("*").order("desde");
      if (error) throw error;
      return ((data ?? []) as any[]).map((g) => ({
        ...g,
        operador_nombre: asText(g.operador_nombre),
        desde: asText(g.desde),
        hasta: asText(g.hasta),
        notas: g.notas == null ? null : asText(g.notas),
      })) as Guardia[];
    },
  });

  const periodGuardias = useMemo(() => {
    const a = startOfDay(period.desde).getTime();
    const b = addDays(startOfDay(period.hasta), 1).getTime();
    return guardias.filter((g) => {
      const s = parseLocal(g.desde)?.getTime() ?? new Date(g.desde).getTime();
      const e = parseLocal(g.hasta)?.getTime() ?? new Date(g.hasta).getTime();
      if (Number.isNaN(s) || Number.isNaN(e)) return false;
      return s < b && e > a;
    });
  }, [guardias, period.desde, period.hasta]);

  const assignmentByDay = useMemo(() => {
    const map = new Map<string, Guardia>();
    for (const day of days) {
      const hit = periodGuardias.find((g) => coversNight(g, day) && !isVacacion(g));
      if (hit) map.set(ymd(day), hit);
    }
    return map;
  }, [days, periodGuardias]);

  const vacacionesByDayName = useMemo(() => {
    const set = new Set<string>();
    for (const day of days) {
      for (const g of periodGuardias) {
        if (isVacacion(g) && coversNight(g, day)) {
          set.add(`${normalizeName(g.operador_nombre)}|${ymd(day)}`);
        }
      }
    }
    return set;
  }, [days, periodGuardias]);

  const now = new Date();
  const actual = periodGuardias.find((g) => {
    const s = parseLocal(g.desde) ?? new Date(g.desde);
    const e = parseLocal(g.hasta) ?? new Date(g.hasta);
    return s <= now && e >= now && !isVacacion(g);
  });

  const huecos = useMemo(
    () => days.filter((d) => !assignmentByDay.has(ymd(d))),
    [days, assignmentByDay],
  );

  const liquidacion = useMemo(() => {
    return operarios.map((op) => {
      let normales = 0;
      let feriados = 0;
      for (const day of days) {
        const g = assignmentByDay.get(ymd(day));
        if (!g) continue;
        if (normalizeName(g.operador_nombre) !== normalizeName(op.nombre)) continue;
        if (isFeriado(day)) feriados += 1;
        else normales += 1;
      }
      return { ...op, normales, feriados, total: normales + feriados };
    });
  }, [days, assignmentByDay, operarios]);

  const vacacionesResumen = useMemo(() => {
    return operarios
      .map((op) => {
        const diasVac = days.filter((d) =>
          vacacionesByDayName.has(`${normalizeName(op.nombre)}|${ymd(d)}`),
        );
        if (diasVac.length === 0) return null;
        const labels = diasVac.map((d) => format(d, "dd/MM"));
        return {
          ...op,
          cantidad: diasVac.length,
          dias: labels,
          desde: diasVac[0],
          hasta: diasVac[diasVac.length - 1],
        };
      })
      .filter(Boolean) as Array<
      Operario & { cantidad: number; dias: string[]; desde: Date; hasta: Date }
    >;
  }, [operarios, days, vacacionesByDayName]);

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["guardias"] });
    await qc.refetchQueries({ queryKey: ["guardias"] });
  };
  const refreshOps = async () => {
    await qc.invalidateQueries({ queryKey: ["guardia_operarios"] });
    await qc.refetchQueries({ queryKey: ["guardia_operarios"] });
  };

  function cellFor(
    op: Operario,
    day: Date,
  ): { kind: "empty" | "code" | "F" | "V"; label: string } {
    const key = `${normalizeName(op.nombre)}|${ymd(day)}`;
    if (vacacionesByDayName.has(key)) return { kind: "V", label: "V" };
    const g = assignmentByDay.get(ymd(day));
    if (!g) return { kind: "empty", label: "" };
    if (normalizeName(g.operador_nombre) !== normalizeName(op.nombre)) {
      return { kind: "empty", label: "" };
    }
    if (isFeriado(day)) return { kind: "F", label: "F" };
    return { kind: "code", label: op.code };
  }

  async function assignCell(op: Operario, day: Date, mode: "guardia" | "vacacion" | "quitar") {
    setBusy(true);
    try {
      const existing = assignmentByDay.get(ymd(day));
      const vacKey = `${normalizeName(op.nombre)}|${ymd(day)}`;
      const hasVac = vacacionesByDayName.has(vacKey);

      if (hasVac) {
        const vacG = periodGuardias.find(
          (g) =>
            isVacacion(g) &&
            coversNight(g, day) &&
            normalizeName(g.operador_nombre) === normalizeName(op.nombre),
        );
        if (vacG) await removeNightFromGuardia(vacG, day);
      }

      if (mode === "quitar") {
        if (existing && normalizeName(existing.operador_nombre) === normalizeName(op.nombre)) {
          await removeNightFromGuardia(existing, day);
        }
        toast.success("Celda liberada");
        await refresh();
        setCellDialog(null);
        return;
      }

      if (existing && normalizeName(existing.operador_nombre) !== normalizeName(op.nombre)) {
        await removeNightFromGuardia(existing, day);
      } else if (
        existing &&
        normalizeName(existing.operador_nombre) === normalizeName(op.nombre) &&
        mode === "guardia"
      ) {
        toast.message("Ya estaba asignado");
        setCellDialog(null);
        return;
      }

      const payload = {
        operador_nombre: op.nombre,
        desde: nightStartIso(day),
        hasta: nightEndIso(day),
        notas: mode === "vacacion" ? "vacaciones" : "Guardia 1 noche",
      };
      const { error } = await api.from("guardias").insert(payload);
      if (error) throw new Error(error.message);
      toast.success(mode === "vacacion" ? "Vacaciones cargadas" : "Guardia asignada");
      await refresh();
      setCellDialog(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  }

  function exportPdf() {
    abrirPdfLiquidacion({
      periodoLabel: periodLabel(period.desde, period.hasta),
      desde: format(period.desde, "dd/MM/yyyy"),
      hasta: format(period.hasta, "dd/MM/yyyy"),
      titulo: pdfTitulo,
      notas: pdfNotas,
      pie: pdfPie,
      filas: liquidacion.map((r) => ({
        code: r.code,
        nombre: r.nombre,
        normales: r.normales,
        feriados: r.feriados,
        total: r.total,
      })),
    });
    setPdfOpen(false);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Guardias"
        description="Planilla 21→20 · clic en celda para asignar"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setPeriod((p) => shiftPeriod(p, -1))}
              aria-label="Período anterior"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="min-w-[10rem] text-center">
              <p className="text-sm font-semibold">{periodLabel(period.desde, period.hasta)}</p>
              <p className="text-[11px] text-muted-foreground">
                {format(period.desde, "dd/MM")} → {format(period.hasta, "dd/MM/yyyy")}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => setPeriod((p) => shiftPeriod(p, 1))}
              aria-label="Período siguiente"
            >
              <ChevronRight className="size-4" />
            </Button>
            <OperariosDialog rows={operarioRows} onDone={refreshOps} />
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="panel">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
              <UserRound className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">De guardia ahora</p>
              <p className="truncate font-semibold">
                {actual?.operador_nombre ?? "Sin cobertura"}
              </p>
              {actual && (
                <p className="text-[11px] text-muted-foreground">
                  hasta {format(parseLocal(actual.hasta) ?? parseISO(actual.hasta), "dd/MM HH:mm")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="panel">
          <CardContent className="flex items-center gap-3 p-4">
            <div
              className={cn(
                "grid size-10 place-items-center rounded-lg",
                huecos.length
                  ? "bg-destructive/15 text-destructive"
                  : "bg-primary/15 text-primary",
              )}
            >
              {huecos.length ? (
                <AlertTriangle className="size-5" />
              ) : (
                <CheckCircle2 className="size-5" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Cobertura del período</p>
              <p className="font-semibold">
                {huecos.length === 0
                  ? "Completa"
                  : `${huecos.length} día${huecos.length === 1 ? "" : "s"} sin asignar`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="panel sm:col-span-2 xl:col-span-1">
          <CardContent className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Referencia
            </span>
            {operarios.map((o) => (
              <span
                key={o.code + o.nombre}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold",
                  o.color,
                )}
              >
                {o.code}{" "}
                <span className="font-normal opacity-90">
                  {asText(o.nombre).split(" ").pop()}
                </span>
              </span>
            ))}
            <span className="inline-flex items-center rounded border border-rose-400/40 bg-rose-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              F Feriado
            </span>
            <span className="inline-flex items-center rounded border border-lime-400/40 bg-lime-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              V Vacaciones
            </span>
          </CardContent>
        </Card>
      </div>

      <Card className="panel overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarRange className="size-4 text-primary" />
            Planilla {periodLabel(period.desde, period.hasta)}
            {canWrite && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                · clic en celda para asignar o quitar
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 border border-border bg-muted/80 px-2 py-1.5 text-left font-semibold">
                    Empleado
                  </th>
                  {days.map((d) => {
                    const fer = isFeriado(d);
                    const isFirst = d.getDate() === 1;
                    return (
                      <th
                        key={ymd(d)}
                        className={cn(
                          "min-w-[2.25rem] border border-border px-0.5 py-1 text-center font-medium",
                          fer && !isFirst && "bg-rose-500/10",
                          isFirst && "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100",
                        )}
                        title={format(d, "EEEE dd/MM", { locale: es })}
                      >
                        <div className="text-[10px] text-muted-foreground">{weekdayLetter(d)}</div>
                        <div className="tabular-nums">{format(d, "d/M")}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {operarios.length === 0 && !loadingOps && (
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="border border-border p-4 text-muted-foreground"
                    >
                      No hay empleados. Usá Cargar Empleado para el plantel.
                    </td>
                  </tr>
                )}
                {operarios.map((op) => (
                  <tr key={op.id ?? op.nombre}>
                    <td className="sticky left-0 z-10 border border-border bg-card px-2 py-1 font-medium whitespace-nowrap">
                      {op.nombre}
                    </td>
                    {days.map((d) => {
                      const cell = cellFor(op, d);
                      const isFirst = d.getDate() === 1;
                      return (
                        <td
                          key={ymd(d)}
                          className={cn(
                            "border border-border p-0.5 text-center",
                            isFeriado(d) && !isFirst && "bg-rose-500/5",
                            isFirst && "bg-emerald-500/10",
                            canWrite && "cursor-pointer hover:bg-accent/50",
                          )}
                          onClick={() => {
                            if (!canWrite) return;
                            setCellDialog({ op, day: d });
                          }}
                        >
                          {cell.kind !== "empty" && (
                            <span
                              className={cn(
                                "inline-flex size-7 min-w-7 items-center justify-center rounded-md border text-xs font-extrabold shadow-sm",
                                cell.kind === "code" && op.color,
                                cell.kind === "F" && "border-rose-400 bg-rose-600 text-white",
                                cell.kind === "V" && "border-lime-400 bg-lime-600 text-white",
                              )}
                            >
                              {cell.label}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Cargando turnos…</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <Card className="panel">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList className="size-4 text-primary" />
                Liquidación del período
              </CardTitle>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setPdfOpen(true)}
              >
                <FileDown className="size-3.5" /> Exportar PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operario</TableHead>
                  <TableHead className="text-right">Normales</TableHead>
                  <TableHead className="text-right">Feriados</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liquidacion.map((row) => (
                  <TableRow key={row.code + row.nombre}>
                    <TableCell>
                      <span
                        className={cn(
                          "mr-2 inline-flex size-5 items-center justify-center rounded border text-[10px] font-bold",
                          row.color,
                        )}
                      >
                        {row.code}
                      </span>
                      {row.nombre}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{row.normales}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-rose-600 dark:text-rose-300">
                      {row.feriados}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.total}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Palmtree className="size-4 text-lime-500" />
              Vacaciones del período
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {vacacionesResumen.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nadie tiene vacaciones cargadas en este período.
              </p>
            )}
            {vacacionesResumen.map((v) => (
              <div
                key={v.code + v.nombre}
                className="flex items-start gap-3 rounded-lg border border-lime-500/30 bg-lime-500/5 px-3 py-2.5 text-sm"
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex size-7 items-center justify-center rounded-md border text-xs font-extrabold",
                    v.color,
                  )}
                >
                  {v.code}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{v.nombre}</p>
                    <Badge variant="secondary" className="tabular-nums">
                      {v.cantidad} día{v.cantidad === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {format(v.desde, "dd/MM")} → {format(v.hasta, "dd/MM")}
                    {v.dias.length <= 8
                      ? ` · ${v.dias.join(", ")}`
                      : ` · ${v.dias.slice(0, 6).join(", ")}…`}
                  </p>
                </div>
                <span className="inline-flex items-center rounded border border-lime-400 bg-lime-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  V
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Exportar liquidación PDF</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>Título del documento</Label>
              <Input value={pdfTitulo} onChange={(e) => setPdfTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Texto / criterio</Label>
              <Textarea value={pdfNotas} onChange={(e) => setPdfNotas(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Pie de página</Label>
              <Input value={pdfPie} onChange={(e) => setPdfPie(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPdfOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={exportPdf}>
              <FileDown className="size-4" /> Generar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cellDialog} onOpenChange={(o) => !o && setCellDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Celda de planilla</DialogTitle>
          </DialogHeader>
          {cellDialog && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{cellDialog.op.nombre}</span>
                <br />
                {format(cellDialog.day, "EEEE d 'de' MMMM", { locale: es })}
                {isFeriado(cellDialog.day) && (
                  <Badge variant="secondary" className="ml-2">
                    Feriado
                  </Badge>
                )}
              </p>
              <div className="grid gap-2">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void assignCell(cellDialog.op, cellDialog.day, "guardia")}
                >
                  Asignar guardia ({cellDialog.op.code}
                  {isFeriado(cellDialog.day) ? " → F" : ""})
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void assignCell(cellDialog.op, cellDialog.day, "vacacion")}
                >
                  Marcar vacaciones (V)
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void assignCell(cellDialog.op, cellDialog.day, "quitar")}
                >
                  Quitar de esta celda
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
