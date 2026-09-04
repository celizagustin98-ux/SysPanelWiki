import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  isSaturday,
  isSunday,
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
  Plus,
  Trash2,
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/integrations/api/client";
import { abrirPdfLiquidacion } from "@/lib/guardia-liquidacion-pdf";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/guardias")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Guardias | SysPanelWiki" },
      {
        name: "description",
        content: "Planilla de guardias por período 21–20, feriados y liquidación.",
      },
    ],
  }),
  component: GuardiasPage,
});

type Guardia = {
  id: string;
  operador_nombre: string;
  desde: string;
  hasta: string;
  notas: string | null;
};

type Operario = { nombre: string; code: string; color: string };

const OPERARIOS: Operario[] = [
  {
    nombre: "CELIZ AGUSTIN",
    code: "A",
    color: "bg-teal-500/25 text-teal-800 dark:text-teal-200 border-teal-500/40",
  },
  {
    nombre: "CORDOBA SANTINO",
    code: "S",
    color: "bg-sky-500/25 text-sky-800 dark:text-sky-200 border-sky-500/40",
  },
  {
    nombre: "SANTILLAN KEVIN",
    code: "K",
    color: "bg-violet-500/25 text-violet-800 dark:text-violet-200 border-violet-500/40",
  },
  {
    nombre: "SILETTO JOSE",
    code: "J",
    color: "bg-indigo-500/25 text-indigo-800 dark:text-indigo-200 border-indigo-500/40",
  },
];

const CODE_BY_NAME = Object.fromEntries(OPERARIOS.map((o) => [normalizeName(o.nombre), o]));

const FERIADOS_FIJOS = [
  "01-01",
  "03-24",
  "04-02",
  "05-01",
  "05-25",
  "06-20",
  "07-09",
  "12-08",
  "12-25",
];

const FERIADOS_EXTRA = new Set([
  "2025-03-03",
  "2025-03-04",
  "2025-04-17",
  "2025-04-18",
  "2025-06-16",
  "2025-08-15",
  "2025-11-17",
  "2025-11-21",
  "2025-12-24",
  "2025-12-26",
  "2026-03-23",
  "2026-03-24",
  "2026-04-02",
  "2026-04-03",
  "2026-06-15",
  "2026-08-17",
  "2026-10-12",
  "2026-11-20",
  "2026-11-23",
  "2027-03-29",
  "2027-03-30",
]);

function normalizeName(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function ymd(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function isFeriado(d: Date) {
  if (isSaturday(d) || isSunday(d)) return true;
  if (FERIADOS_EXTRA.has(ymd(d))) return true;
  return FERIADOS_FIJOS.includes(format(d, "MM-dd"));
}

function getPeriodContaining(ref: Date) {
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const day = ref.getDate();
  let startY = y;
  let startM = m;
  if (day < 21) {
    startM = m - 1;
    if (startM < 0) {
      startM = 11;
      startY = y - 1;
    }
  }
  const desde = new Date(startY, startM, 21);
  let endM = startM + 1;
  let endY = startY;
  if (endM > 11) {
    endM = 0;
    endY += 1;
  }
  const hasta = new Date(endY, endM, 20);
  return { desde, hasta, key: `${ymd(desde)}_${ymd(hasta)}` };
}

function shiftPeriod(period: { desde: Date; hasta: Date }, delta: number) {
  return getPeriodContaining(addDays(period.desde, delta * 28));
}

function periodLabel(desde: Date, hasta: Date) {
  const a = format(desde, "MMMM", { locale: es });
  const b = format(hasta, "MMMM", { locale: es });
  const year = format(hasta, "yyyy");
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (a === b) return `${cap(a)} ${year}`;
  return `${cap(a)}/${cap(b).slice(0, 4)} ${year}`;
}

function weekdayLetter(d: Date) {
  return (["D", "L", "M", "X", "J", "V", "S"] as const)[d.getDay()];
}

function nightStartIso(day: Date) {
  const d = startOfDay(day);
  d.setHours(20, 0, 0, 0);
  return d.toISOString();
}

function nightEndIso(day: Date) {
  const d = startOfDay(addDays(day, 1));
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

function coversNight(g: Guardia, day: Date) {
  const start = new Date(g.desde).getTime();
  const end = new Date(g.hasta).getTime();
  const night = new Date(nightStartIso(day)).getTime();
  return start <= night && end > night;
}

function isVacacion(g: Guardia) {
  return (g.notas ?? "").toLowerCase().includes("vacacion");
}

/** Quita una noche de un tramo: borra, o parte en antes/después. */
async function removeNightFromGuardia(g: Guardia, day: Date) {
  const nightStart = new Date(nightStartIso(day)).getTime();
  const nightEnd = new Date(nightEndIso(day)).getTime();
  const gStart = new Date(g.desde).getTime();
  const gEnd = new Date(g.hasta).getTime();

  // Si el tramo es solo esa noche → borrar
  if (gStart >= nightStart - 60_000 && gEnd <= nightEnd + 60_000) {
    const { error } = await api.from("guardias").delete().eq("id", g.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error: delErr } = await api.from("guardias").delete().eq("id", g.id);
  if (delErr) throw new Error(delErr.message);

  const inserts: { operador_nombre: string; desde: string; hasta: string; notas: string | null }[] =
    [];

  // Parte anterior (noches antes de `day`)
  if (gStart < nightStart) {
    inserts.push({
      operador_nombre: g.operador_nombre,
      desde: g.desde,
      hasta: nightStartIso(day), // termina cuando arrancaría esa noche
      notas: g.notas,
    });
  }
  // Parte posterior (noches después de `day`)
  if (gEnd > nightEnd) {
    inserts.push({
      operador_nombre: g.operador_nombre,
      desde: nightEndIso(day),
      hasta: g.hasta,
      notas: g.notas,
    });
  }

  if (inserts.length) {
    const { error } = await api.from("guardias").insert(inserts);
    if (error) throw new Error(error.message);
  }
}

function GuardiasPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [period, setPeriod] = useState(() => getPeriodContaining(new Date()));
  const [cellDialog, setCellDialog] = useState<null | { op: Operario; day: Date }>(null);
  const [busy, setBusy] = useState(false);

  const days = useMemo(
    () => eachDayOfInterval({ start: period.desde, end: period.hasta }),
    [period.desde, period.hasta],
  );

  const { data: guardias = [], isLoading } = useQuery({
    queryKey: ["guardias"],
    queryFn: async () => {
      const { data, error } = await api.from("guardias").select("*").order("desde");
      if (error) throw error;
      return (data ?? []) as Guardia[];
    },
  });

  const periodGuardias = useMemo(() => {
    const a = startOfDay(period.desde).getTime();
    const b = addDays(startOfDay(period.hasta), 1).getTime();
    return guardias.filter((g) => {
      const s = new Date(g.desde).getTime();
      const e = new Date(g.hasta).getTime();
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
  const actual = periodGuardias.find(
    (g) => new Date(g.desde) <= now && new Date(g.hasta) >= now && !isVacacion(g),
  );

  const huecos = useMemo(
    () => days.filter((d) => !assignmentByDay.has(ymd(d))),
    [days, assignmentByDay],
  );

  const liquidacion = useMemo(() => {
    return OPERARIOS.map((op) => {
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
  }, [days, assignmentByDay]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from("guardias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Turno eliminado");
      qc.invalidateQueries({ queryKey: ["guardias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["guardias"] });

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

      // Quitar vacación del operario ese día
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
        refresh();
        setCellDialog(null);
        return;
      }

      // Si otro operario cubría esa noche, sacarlo
      if (existing && normalizeName(existing.operador_nombre) !== normalizeName(op.nombre)) {
        await removeNightFromGuardia(existing, day);
      } else if (
        existing &&
        normalizeName(existing.operador_nombre) === normalizeName(op.nombre) &&
        mode === "guardia"
      ) {
        // ya está asignado como guardia
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
      refresh();
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
      filas: liquidacion.map((r) => ({
        code: r.code,
        nombre: r.nombre,
        normales: r.normales,
        feriados: r.feriados,
        total: r.total,
      })),
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Guardias"
        description="Planilla 21→20 · clic en celda para asignar · liquidación"
      >
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
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setPeriod(getPeriodContaining(new Date()))}
          >
            Hoy
          </Button>
          {canWrite && <AsignarSemanaDialog period={period} onDone={refresh} />}
          <Button type="button" size="sm" variant="outline" onClick={exportPdf}>
            <FileDown className="size-4" /> PDF liquidación
          </Button>
        </div>
      </PageHeader>

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
                  hasta {format(parseISO(actual.hasta), "dd/MM HH:mm")}
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
            {OPERARIOS.map((o) => (
              <span
                key={o.code}
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold",
                  o.color,
                )}
              >
                {o.code}{" "}
                <span className="font-normal opacity-80">{o.nombre.split(" ").pop()}</span>
              </span>
            ))}
            <span className="inline-flex items-center rounded border border-rose-400/40 bg-rose-500/20 px-1.5 py-0.5 text-xs font-semibold text-rose-800 dark:text-rose-200">
              F Feriado
            </span>
            <span className="inline-flex items-center rounded border border-lime-500/40 bg-lime-500/20 px-1.5 py-0.5 text-xs font-semibold text-lime-800 dark:text-lime-200">
              V Vacaciones
            </span>
            <span className="inline-flex items-center rounded border border-emerald-500/40 bg-emerald-500/20 px-1.5 py-0.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
              1 Día 1 del mes
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
                · clic en una celda para asignar o quitar
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
                {OPERARIOS.map((op) => (
                  <tr key={op.code}>
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
                          {cell.kind !== "empty" ? (
                            <span
                              className={cn(
                                "inline-flex size-6 items-center justify-center rounded border text-[11px] font-bold",
                                cell.kind === "code" && op.color,
                                cell.kind === "F" &&
                                  "border-rose-400/50 bg-rose-500/25 text-rose-900 dark:text-rose-100",
                                cell.kind === "V" &&
                                  "border-lime-500/50 bg-lime-500/25 text-lime-900 dark:text-lime-100",
                              )}
                            >
                              {cell.label}
                            </span>
                          ) : (
                            canWrite && (
                              <span className="inline-block size-6 rounded border border-dashed border-border/60 opacity-0 hover:opacity-100" />
                            )
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
              <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={exportPdf}>
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
                  <TableRow key={row.code}>
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
                    <TableCell className="text-right tabular-nums font-medium">
                      {row.normales}
                    </TableCell>
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
            <p className="mt-3 text-[11px] text-muted-foreground">
              Feriado = sábado, domingo o feriado nacional. Cada celda = noche 20:00–08:00.
            </p>
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Tramos cargados en el período</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {periodGuardias.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay turnos en este período.</p>
            )}
            {periodGuardias
              .slice()
              .sort((a, b) => +new Date(a.desde) - +new Date(b.desde))
              .map((g) => {
                const op = CODE_BY_NAME[normalizeName(g.operador_nombre)];
                const dias = differenceInCalendarDays(new Date(g.hasta), new Date(g.desde)) || 1;
                return (
                  <div
                    key={g.id}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded border text-[11px] font-bold",
                        op?.color ?? "bg-muted",
                      )}
                    >
                      {isVacacion(g) ? "V" : op?.code ?? "?"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{g.operador_nombre}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(parseISO(g.desde), "dd/MM HH:mm")} →{" "}
                        {format(parseISO(g.hasta), "dd/MM HH:mm")}
                        {g.notas ? ` · ${g.notas}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary" className="tabular-nums">
                      {dias}d
                    </Badge>
                    {canWrite && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        onClick={() => {
                          if (confirm("¿Eliminar este tramo?")) del.mutate(g.id);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      </div>

      {/* Dialog clic en celda */}
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

function AsignarSemanaDialog({
  period,
  onDone,
}: {
  period: { desde: Date; hasta: Date };
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [operador, setOperador] = useState(OPERARIOS[0].nombre);
  const [inicio, setInicio] = useState(format(period.desde, "yyyy-MM-dd"));
  const [dias, setDias] = useState(7);
  const [vacaciones, setVacaciones] = useState(false);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);

  const preview = useMemo(() => {
    const startDay = parseISO(inicio);
    if (Number.isNaN(startDay.getTime()) || dias < 1) return null;
    const lastNight = addDays(startDay, dias - 1);
    return {
      desde: nightStartIso(startDay),
      hasta: nightEndIso(lastNight),
      label: `${format(startDay, "dd/MM")} → ${format(lastNight, "dd/MM")} (${dias} noches)`,
    };
  }, [inicio, dias]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview) return toast.error("Revisá fechas");
    setSaving(true);
    const payload = {
      operador_nombre: operador,
      desde: preview.desde,
      hasta: preview.hasta,
      notas: vacaciones
        ? `vacaciones${notas ? ` · ${notas}` : ""}`
        : notas || `Guardia ${dias} noche(s)`,
    };
    const { error } = await api.from("guardias").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(vacaciones ? "Vacaciones registradas" : "Guardia asignada");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Asignar tramo
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar tramo de guardia</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Operario</Label>
            <Select value={operador} onValueChange={setOperador}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERARIOS.map((o) => (
                  <SelectItem key={o.code} value={o.nombre}>
                    {o.code} — {o.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Primera noche</Label>
              <Input
                type="date"
                value={inicio}
                min={format(period.desde, "yyyy-MM-dd")}
                max={format(period.hasta, "yyyy-MM-dd")}
                onChange={(e) => setInicio(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cantidad de noches</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={dias}
                onChange={(e) => setDias(Number(e.target.value) || 1)}
                required
              />
            </div>
          </div>
          {preview && (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              {preview.label} · 20:00 → 08:00
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={vacaciones}
              onChange={(e) => setVacaciones(e.target.checked)}
            />
            Marcar como vacaciones (V)
          </label>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
