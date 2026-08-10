import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  ListChecks,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/guardias")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Guardias | SysIntranet | Área Wiki" },
      { name: "description", content: "Calendario de guardias con turnos por operador y rango horario." },
      { property: "og:title", content: "Guardias | SysIntranet | Área Wiki" },
      { property: "og:description", content: "Planificación de turnos." },
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

function GuardiaDialog({
  guardia,
  trigger,
  onDone,
}: {
  guardia?: Guardia;
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toLocal = (iso?: string) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : "");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      operador_nombre: String(fd.get("operador_nombre")),
      desde: new Date(String(fd.get("desde"))).toISOString(),
      hasta: new Date(String(fd.get("hasta"))).toISOString(),
      notas: String(fd.get("notas") || ""),
    };
    if (new Date(payload.hasta) <= new Date(payload.desde))
      return toast.error("La fecha de fin debe ser posterior al inicio");
    const { error } = guardia
      ? await api.from("guardias").update(payload).eq("id", guardia.id)
      : await api.from("guardias").insert(payload);
    if (error) return toast.error(error.message);
    toast.success(guardia ? "Guardia actualizada" : "Guardia cargada");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{guardia ? "Editar guardia" : "Nueva guardia"}</DialogTitle>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Operador</Label>
            <Input name="operador_nombre" defaultValue={guardia?.operador_nombre} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Desde</Label>
              <Input type="datetime-local" name="desde" defaultValue={toLocal(guardia?.desde)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Hasta</Label>
              <Input type="datetime-local" name="hasta" defaultValue={toLocal(guardia?.hasta)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea name="notas" defaultValue={guardia?.notas ?? ""} />
          </div>
          <DialogFooter>
            <Button type="submit">Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PeriodoGuardiasDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const periodoSugerido = useMemo(() => getCurrentGuardiaPeriod(), []);
  const [desde, setDesde] = useState(periodoSugerido.desde);
  const [hasta, setHasta] = useState(periodoSugerido.hasta);
  const [horaInicio, setHoraInicio] = useState("20:00");
  const [duracionDias, setDuracionDias] = useState(7);
  const [operarios, setOperarios] = useState("");
  const [notas, setNotas] = useState("Guardia del período");
  const [saving, setSaving] = useState(false);

  const preview = useMemo(
    () => generarTurnosPeriodo({ desde, hasta, horaInicio, duracionDias, operarios, notas }),
    [desde, hasta, horaInicio, duracionDias, operarios, notas],
  );
  const sheetPreview = useMemo(
    () =>
      buildGuardiaSheet(preview.turnos.map((turno, index) => ({ ...turno, id: `preview-${index}` })), {
        periodStart: desde,
        periodEnd: hasta,
      }),
    [desde, hasta, preview.turnos],
  );
  const nombres = useMemo(
    () =>
      operarios
        .split(/\r?\n/)
        .map((nombre) => nombre.trim())
        .filter(Boolean),
    [operarios],
  );
  const diasPeriodo = useMemo(() => calcularDiasCalendario(desde, hasta), [desde, hasta]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (preview.error) return toast.error(preview.error);
    if (preview.turnos.length === 0) return toast.error("No hay turnos para cargar");

    setSaving(true);
    const { error } = await api.from("guardias").insert(preview.turnos);
    setSaving(false);

    if (error) return toast.error(error.message);
    toast.success(`${preview.turnos.length} guardias cargadas para el período`);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <CalendarRange className="size-4" /> Cargar período
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nuevo período de guardias</DialogTitle>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={submit}>
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardList className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Planificación del período</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {diasPeriodo > 0
                      ? `${diasPeriodo} días de liquidación entre ${formatDateInput(desde)} y ${formatDateInput(hasta)}. Relevo semanal: lunes 20:00 a lunes 08:00.`
                      : "Seleccioná el rango de cobertura."}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                  <p className="text-lg font-semibold">{diasPeriodo || "-"}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Días</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                  <p className="text-lg font-semibold">{nombres.length || "-"}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Operarios</p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 px-3 py-2">
                  <p className="text-lg font-semibold">{preview.error ? "-" : preview.turnos.length}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Turnos</p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Inicio del período</Label>
              <Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Fin del período</Label>
              <Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Hora de inicio</Label>
              <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Días por turno</Label>
              <Input
                type="number"
                min={1}
                max={31}
                value={duracionDias}
                onChange={(e) => setDuracionDias(Number(e.target.value))}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-1.5">
              <Label>Operarios del período</Label>
              <Textarea
                className="min-h-52"
                placeholder={"Agustin Celiz\nSilvia Perez\nKarina Gomez\nJorge Ruiz"}
                value={operarios}
                onChange={(e) => setOperarios(e.target.value)}
                required
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {nombres.slice(0, 8).map((nombre) => (
                  <Badge key={nombre} variant="outline" className="border-primary/25 bg-primary/5 text-primary">
                    {nombre}
                  </Badge>
                ))}
                {nombres.length > 8 && <Badge variant="outline">+{nombres.length - 8}</Badge>}
              </div>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/40 p-4">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" />
                <p className="text-sm font-semibold">Vista previa</p>
              </div>
              {preview.error ? (
                <p className="mt-3 text-sm text-destructive">{preview.error}</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">{preview.turnos.length} turnos a crear</p>
                  <div className="mt-3 max-h-52 space-y-2 overflow-auto pr-1">
                    {preview.turnos.slice(0, 10).map((g, index) => (
                      <div key={`${g.operador_nombre}-${g.desde}-${index}`} className="rounded-xl border border-border/50 bg-muted/30 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold">{g.operador_nombre}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{formatGuardiaRange(g)}</p>
                      </div>
                    ))}
                    {preview.turnos.length > 10 && (
                      <p className="text-xs text-muted-foreground">+{preview.turnos.length - 10} turnos más</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {!preview.error && preview.turnos.length > 0 && (
            <GuardiaSheetView
              title="Planilla previa"
              description="Sábados, domingos y feriados nacionales se marcan como F para liquidación."
              sheet={sheetPreview}
              compact
            />
          )}

          <div className="space-y-1.5">
            <Label>Notas para estos turnos</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving || !!preview.error}>
              {saving ? "Cargando período..." : "Guardar período"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuardiasPage() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(new Date());

  const { data = [] } = useQuery({
    queryKey: ["guardias"],
    queryFn: async () => {
      const { data, error } = await api.from("guardias").select("*").order("desde");
      if (error) throw error;
      return data as Guardia[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await api.from("guardias").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Guardia eliminada");
      qc.invalidateQueries({ queryKey: ["guardias"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const now = new Date();
  const sortedGuardias = useMemo(
    () => [...data].sort((a, b) => new Date(a.desde).getTime() - new Date(b.desde).getTime()),
    [data],
  );
  const actual = sortedGuardias.find((g) => new Date(g.desde) <= now && new Date(g.hasta) >= now);
  const proximas = sortedGuardias.filter((g) => new Date(g.hasta) >= now).slice(0, 4);
  const guardiasDelMes = sortedGuardias.filter(
    (g) => new Date(g.desde) <= endOfMonth(cursor) && new Date(g.hasta) >= startOfMonth(cursor),
  );
  const operadoresDelMes = new Set(guardiasDelMes.map((g) => g.operador_nombre.trim()).filter(Boolean)).size;
  const periodoActual = actual ? calcularPeriodoCobertura(actual, sortedGuardias) : null;
  const diasCubiertosMes = days.filter((day) =>
    isSameMonth(day, cursor)
      ? sortedGuardias.some((g) => new Date(g.desde) <= endOfDay(day) && new Date(g.hasta) >= startOfDay(day))
      : false,
  ).length;
  const diasCubiertos = periodoActual ? inclusiveCalendarDays(periodoActual.desde, periodoActual.hasta) : diasCubiertosMes;
  const operadoresPeriodo = periodoActual?.operadores ?? operadoresDelMes;
  const turnosPeriodo = periodoActual?.turnos ?? guardiasDelMes.length;
  const periodoLiquidacion = actual ? getGuardiaPeriodForDate(now) : null;
  const detallePeriodo = periodoActual
    ? `${format(periodoLiquidacion?.desdeDate ?? periodoActual.desde, "dd/MM")} -> ${format(periodoLiquidacion?.hastaDate ?? periodoActual.hasta, "dd/MM")}`
    : format(cursor, "MMMM yyyy", { locale: es });
  const planillaGuardias = useMemo(() => {
    const bounds = periodoLiquidacion
      ? { periodStart: periodoLiquidacion.desde, periodEnd: periodoLiquidacion.hasta }
      : undefined;
    const source = periodoActual && periodoLiquidacion
      ? sortedGuardias.filter((guardia) => {
          const desde = new Date(guardia.desde);
          const hasta = new Date(guardia.hasta);
          return desde <= endOfDay(periodoLiquidacion.hastaDate) && hasta >= startOfDay(periodoLiquidacion.desdeDate);
        })
      : guardiasDelMes;
    return buildGuardiaSheet(source, bounds);
  }, [guardiasDelMes, periodoActual, periodoLiquidacion, sortedGuardias]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["guardias"] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guardias"
        description="Cobertura operativa del área de Sistemas."
        action={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              <PeriodoGuardiasDialog onDone={refresh} />
              <GuardiaDialog
                trigger={
                  <Button>
                    <Plus className="size-4" /> Cargar guardia
                  </Button>
                }
                onDone={refresh}
              />
            </div>
          ) : null
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.75fr)]">
        <Card className={cn("overflow-hidden border-primary/30 bg-card/80", actual && "shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]")}>
          <CardContent className="p-0">
            <div className="border-b border-primary/20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                    <Radio className="size-6" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">Turno actual</p>
                      {actual && <Badge className="bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/15">En curso</Badge>}
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                      {actual ? actual.operador_nombre : "Sin guardia activa"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {actual
                        ? `Cobertura hasta ${format(new Date(actual.hasta), "EEEE d 'de' MMMM, HH:mm", { locale: es })}`
                        : "No hay un operador asignado para este momento."}
                    </p>
                  </div>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3 text-sm">
                  <p className="text-xs text-muted-foreground">Estado de cobertura</p>
                  <p className={cn("mt-1 font-semibold", actual ? "text-emerald-300" : "text-amber-300")}>
                    {actual ? "Operativa" : "Sin cobertura"}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-3">
              <MetricCard
                icon={<CalendarCheck className="size-4" />}
                label={periodoActual ? "Días del período" : "Días cubiertos"}
                value={`${diasCubiertos}`}
                detail={detallePeriodo}
              />
              <MetricCard
                icon={<UsersRound className="size-4" />}
                label="Operadores"
                value={`${operadoresPeriodo}`}
                detail={periodoActual ? "En el período activo" : "Con guardias este mes"}
              />
              <MetricCard
                icon={<ShieldCheck className="size-4" />}
                label="Turnos"
                value={`${turnosPeriodo}`}
                detail={periodoActual ? "Del período activo" : "Programados en calendario"}
              />
            </div>

            {actual?.notas ? (
              <div className="mx-5 mb-5 rounded-xl border border-border/60 bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Notas del turno</p>
                <p className="mt-2 text-sm leading-relaxed">{actual.notas}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="size-4 text-primary" />
              Próximos turnos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {proximas.map((g) => {
              const activa = new Date(g.desde) <= now && new Date(g.hasta) >= now;
              return (
                <div
                  key={g.id}
                  className={cn(
                    "rounded-xl border border-border/60 bg-background/40 p-3",
                    activa && "border-primary/40 bg-primary/5",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{g.operador_nombre}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatGuardiaRange(g)}</p>
                    </div>
                    {activa ? <Badge>Actual</Badge> : <Badge variant="outline">Próxima</Badge>}
                  </div>
                </div>
              );
            })}
            {proximas.length === 0 && (
              <div className="rounded-xl border border-dashed border-border/70 p-5 text-center text-sm text-muted-foreground">
                No hay guardias próximas cargadas.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {planillaGuardias.days.length > 0 && (
        <GuardiaSheetView
          title="Planilla del período"
          description="Matriz diaria de guardias. F incluye feriados nacionales de Argentina y fines de semana."
          sheet={planillaGuardias}
        />
      )}

      <Card className="panel">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60">
          <div>
            <CardTitle className="flex items-center gap-2 text-base capitalize">
              <CalendarDays className="size-4 text-primary" />
              {format(cursor, "MMMM yyyy", { locale: es })}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Vista mensual de cobertura y relevos.</p>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCursor(new Date())}>
              Hoy
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-5">
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-muted-foreground">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="rounded-lg bg-muted/40 py-2 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-2">
            {days.map((day) => {
              const items = data.filter(
                (g) => new Date(g.desde) <= endOfDay(day) && new Date(g.hasta) >= startOfDay(day),
              );
              const visibleItems = items.slice(0, 2);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-[118px] rounded-xl border border-border/60 bg-background/30 p-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5",
                    !isSameMonth(day, cursor) && "opacity-35",
                    isSameDay(day, now) && "border-primary bg-primary/10",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{format(day, "d")}</span>
                    {items.length > 0 && (
                      <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        {items.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {visibleItems.map((g) => (
                      <div
                        key={g.id}
                        className="rounded-lg border border-primary/15 bg-primary/10 px-2 py-1"
                        title={`${g.operador_nombre} · ${format(new Date(g.desde), "dd/MM HH:mm")} → ${format(new Date(g.hasta), "dd/MM HH:mm")}`}
                      >
                        <p className="truncate text-[11px] font-medium text-primary">{g.operador_nombre}</p>
                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{formatDayRange(g, day)}</p>
                      </div>
                    ))}
                    {items.length > visibleItems.length && (
                      <p className="px-1 text-[10px] text-muted-foreground">+{items.length - visibleItems.length} turno más</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Agenda de guardias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sortedGuardias.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/30 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <UserRound className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{g.operador_nombre}</p>
                  <p className="text-xs text-muted-foreground">{formatGuardiaRange(g)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {new Date(g.desde) <= now && new Date(g.hasta) >= now && <Badge>Activa</Badge>}
                {canWrite && (
                  <>
                    <GuardiaDialog
                      guardia={g}
                      trigger={
                        <Button size="sm" variant="ghost">
                          Editar
                        </Button>
                      }
                      onDone={refresh}
                    />
                    <Button size="icon" variant="ghost" onClick={() => del.mutate(g.id)}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
          {data.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Sin guardias cargadas.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

type GuardiaSheet = {
  days: Date[];
  operadores: {
    nombre: string;
    codigo: string;
    colorClass: string;
    normales: number;
    nocturnos: number;
    feriados: number;
  }[];
  cells: Record<string, Record<string, "guardia" | "feriado" | null>>;
  periodLabel: string;
};

function GuardiaSheetView({
  title,
  description,
  sheet,
  compact,
}: {
  title: string;
  description: string;
  sheet: GuardiaSheet;
  compact?: boolean;
}) {
  if (sheet.days.length === 0) return null;

  return (
    <Card className="panel overflow-hidden">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarRange className="size-4 text-primary" />
              {title}
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
          <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">
            {sheet.periodLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className={cn("space-y-4", compact ? "p-4" : "p-5")}>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="overflow-hidden rounded-xl border border-border/70 bg-background/40">
            <div className="overflow-x-auto">
              <Table className="min-w-[920px] text-xs">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="sticky left-0 z-20 w-44 bg-muted/80 text-foreground">Empleado</TableHead>
                    {sheet.days.map((day) => {
                      const feriado = isNonWorkingDay(day);
                      return (
                        <TableHead
                          key={day.toISOString()}
                          className={cn(
                            "min-w-10 border-l border-border/50 px-1 text-center",
                            feriado ? "bg-rose-500/15 text-rose-300" : "bg-muted/60",
                          )}
                          title={feriado ? getHolidayName(day) || "Fin de semana" : undefined}
                        >
                          <div className="font-semibold capitalize">{format(day, "EEEEE", { locale: es })}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{format(day, "d/M")}</div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.operadores.map((operador) => (
                    <TableRow key={operador.nombre} className="hover:bg-primary/5">
                      <TableCell className="sticky left-0 z-10 w-44 bg-background font-semibold">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "grid size-7 shrink-0 place-items-center rounded-md text-xs font-bold text-white",
                              operador.colorClass,
                            )}
                          >
                            {operador.codigo}
                          </span>
                          <span className="truncate">{operador.nombre}</span>
                        </div>
                      </TableCell>
                      {sheet.days.map((day) => {
                        const key = dateKey(day);
                        const cell = sheet.cells[operador.nombre]?.[key] ?? null;
                        return (
                          <TableCell
                            key={key}
                            className={cn(
                              "border-l border-border/50 px-1 text-center font-semibold",
                              cell === "feriado" && "bg-rose-500/15 text-rose-300",
                              cell === "guardia" && "bg-primary/10 text-primary",
                            )}
                          >
                            {cell === "feriado" ? "F" : cell === "guardia" ? operador.codigo : ""}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Referencia</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {sheet.operadores.map((operador) => (
                  <div key={operador.nombre} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 p-2">
                    <span className={cn("grid size-7 place-items-center rounded-md text-xs font-bold text-white", operador.colorClass)}>
                      {operador.codigo}
                    </span>
                    <span className="truncate text-xs font-medium">{operador.nombre}</span>
                  </div>
                ))}
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 p-2 text-rose-200">
                  <span className="grid size-7 place-items-center rounded-md bg-rose-400/80 text-xs font-bold text-rose-950">F</span>
                  <span className="text-xs font-medium">Feriado / finde</span>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border/70 bg-background">
              <div className="border-b border-border/60 bg-primary/10 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Liquidación guardia</p>
              </div>
              <div className="overflow-x-auto">
                <Table className="min-w-[360px] text-xs">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-36 bg-muted/50">Concepto</TableHead>
                      {sheet.operadores.map((operador) => (
                        <TableHead key={operador.codigo} className={cn("text-center text-white", operador.colorClass)}>
                          {operador.codigo}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <LiquidacionRow label="Normales" values={sheet.operadores.map((operador) => operador.normales)} />
                    <LiquidacionRow label="Nocturnos" values={sheet.operadores.map((operador) => operador.nocturnos)} />
                    <LiquidacionRow label="Feriados" values={sheet.operadores.map((operador) => operador.feriados)} />
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LiquidacionRow({ label, values }: { label: string; values: number[] }) {
  return (
    <TableRow>
      <TableCell className="bg-muted/30 text-xs font-semibold uppercase tracking-[0.08em]">{label}</TableCell>
      {values.map((value, index) => (
        <TableCell key={`${label}-${index}`} className="text-center font-semibold">
          {value}
        </TableCell>
      ))}
    </TableRow>
  );
}

function formatGuardiaRange(g: Guardia) {
  return `${format(new Date(g.desde), "dd/MM/yyyy HH:mm")} -> ${format(new Date(g.hasta), "dd/MM/yyyy HH:mm")}`;
}

function formatDayRange(g: Guardia, day: Date) {
  const desde = new Date(g.desde);
  const hasta = new Date(g.hasta);
  const startsToday = isSameDay(desde, day);
  const endsToday = isSameDay(hasta, day);

  if (startsToday && endsToday) return `${format(desde, "HH:mm")} a ${format(hasta, "HH:mm")}`;
  if (startsToday) return `Desde ${format(desde, "HH:mm")}`;
  if (endsToday) return `Hasta ${format(hasta, "HH:mm")}`;
  return "Día completo";
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function inclusiveCalendarDays(desde: Date, hasta: Date) {
  return Math.max(0, differenceInCalendarDays(startOfDay(hasta), startOfDay(desde)) + 1);
}

function calcularDiasCalendario(desde: string, hasta: string) {
  if (!desde || !hasta) return 0;
  const start = new Date(`${desde}T00:00`);
  const end = new Date(`${hasta}T00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return inclusiveCalendarDays(start, end);
}

function formatDateInput(value: string) {
  const date = new Date(`${value}T00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return format(date, "dd/MM/yyyy");
}

function calcularPeriodoCobertura(actual: Guardia, guardias: Guardia[]) {
  let desde = new Date(actual.desde);
  let hasta = new Date(actual.hasta);
  const ids = new Set<string>([actual.id]);
  const toleranceMs = 60_000;
  let changed = true;

  while (changed) {
    changed = false;

    for (const guardia of guardias) {
      const guardiaDesde = new Date(guardia.desde);
      const guardiaHasta = new Date(guardia.hasta);
      const connected = guardiaDesde.getTime() <= hasta.getTime() + toleranceMs && guardiaHasta.getTime() >= desde.getTime() - toleranceMs;

      if (!connected) continue;

      if (!ids.has(guardia.id)) {
        ids.add(guardia.id);
        changed = true;
      }
      if (guardiaDesde < desde) desde = guardiaDesde;
      if (guardiaHasta > hasta) hasta = guardiaHasta;
    }
  }

  const turnos = guardias.filter((guardia) => ids.has(guardia.id));
  return {
    desde,
    hasta,
    turnos: turnos.length,
    operadores: new Set(turnos.map((guardia) => guardia.operador_nombre.trim()).filter(Boolean)).size,
  };
}

function generarTurnosPeriodo({
  desde,
  hasta,
  horaInicio,
  duracionDias,
  operarios,
  notas,
}: {
  desde: string;
  hasta: string;
  horaInicio: string;
  duracionDias: number;
  operarios: string;
  notas: string;
}): { turnos: Omit<Guardia, "id">[]; error: string | null } {
  const nombres = operarios
    .split(/\r?\n/)
    .map((nombre) => nombre.trim())
    .filter(Boolean);

  if (nombres.length === 0) return { turnos: [], error: "Cargá al menos un operario" };
  if (!desde || !hasta || !horaInicio) return { turnos: [], error: "Completá las fechas y la hora de inicio" };

  const diasPorTurno = Math.max(1, Math.min(31, Number(duracionDias || 1)));
  const inicioPeriodo = buildDateTime(desde, "00:00");
  const finPeriodo = endOfDay(buildDateTime(hasta, "00:00"));
  const inicio = mondayOnOrBefore(inicioPeriodo, horaInicio);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(finPeriodo.getTime()) || Number.isNaN(inicioPeriodo.getTime())) {
    return { turnos: [], error: "Revisá las fechas del período" };
  }
  if (finPeriodo <= inicioPeriodo) return { turnos: [], error: "La fecha hasta debe ser posterior a desde" };

  const turnos: Omit<Guardia, "id">[] = [];
  let cursor = inicio;
  let index = 0;

  while (cursor <= finPeriodo && turnos.length < 400) {
    const hastaTurno = new Date(cursor);
    hastaTurno.setDate(hastaTurno.getDate() + diasPorTurno);
    hastaTurno.setHours(8, 0, 0, 0);

    if (hastaTurno >= inicioPeriodo && cursor <= finPeriodo) {
      turnos.push({
        operador_nombre: nombres[index % nombres.length],
        desde: cursor.toISOString(),
        hasta: hastaTurno.toISOString(),
        notas,
      });
    }

    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + diasPorTurno);
    cursor.setHours(Number(horaInicio.split(":")[0] ?? 20), Number(horaInicio.split(":")[1] ?? 0), 0, 0);
    index += 1;
  }

  return { turnos, error: null };
}

function getCurrentGuardiaPeriod() {
  return getGuardiaPeriodForDate(new Date());
}

function getGuardiaPeriodForDate(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const currentDay = date.getDate();
  const desdeDate = currentDay >= 21 ? new Date(year, month, 21) : new Date(year, month - 1, 21);
  const hastaDate = currentDay >= 21 ? new Date(year, month + 1, 20) : new Date(year, month, 20);

  return {
    desde: format(desdeDate, "yyyy-MM-dd"),
    hasta: format(hastaDate, "yyyy-MM-dd"),
    desdeDate,
    hastaDate,
  };
}

function mondayOnOrBefore(date: Date, time: string) {
  const [hours = "20", minutes = "00"] = time.split(":");
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? 6 : day - 1;
  result.setDate(result.getDate() - diff);
  result.setHours(Number(hours), Number(minutes), 0, 0);
  return result;
}

function countNocturnosEnPeriodo(guardia: Guardia, periodStart: Date, periodEnd: Date) {
  const desde = new Date(guardia.desde);
  const hasta = new Date(guardia.hasta);
  return eachDayOfInterval({ start: periodStart, end: periodEnd }).filter((day) => {
    if (isNonWorkingDay(day)) return false;
    const nightStart = new Date(day);
    nightStart.setHours(20, 0, 0, 0);
    const nightEnd = addDays(nightStart, 1);
    nightEnd.setHours(8, 0, 0, 0);
    return desde <= nightEnd && hasta >= nightStart;
  }).length;
}

function buildGuardiaSheet(
  guardias: Guardia[],
  bounds?: {
    periodStart?: string;
    periodEnd?: string;
  },
): GuardiaSheet {
  if (guardias.length === 0) {
    return { days: [], operadores: [], cells: {}, periodLabel: "Sin período" };
  }

  const sorted = [...guardias].sort((a, b) => new Date(a.desde).getTime() - new Date(b.desde).getTime());
  const detectedStart = startOfDay(
    sorted.reduce((min, guardia) => {
      const desde = new Date(guardia.desde);
      return desde < min ? desde : min;
    }, new Date(sorted[0].desde)),
  );
  const detectedEnd = startOfDay(
    sorted.reduce((max, guardia) => {
      const hasta = new Date(guardia.hasta);
      return hasta > max ? hasta : max;
    }, new Date(sorted[0].hasta)),
  );
  const start = bounds?.periodStart ? buildDateTime(bounds.periodStart, "00:00") : detectedStart;
  const end = bounds?.periodEnd ? buildDateTime(bounds.periodEnd, "00:00") : detectedEnd;
  const days = eachDayOfInterval({ start, end });
  const names = [...new Set(sorted.map((guardia) => guardia.operador_nombre.trim()).filter(Boolean))];
  const codes = buildOperatorCodes(names);
  const cells: GuardiaSheet["cells"] = {};
  const palette = [
    "bg-teal-500",
    "bg-sky-500",
    "bg-violet-500",
    "bg-blue-800",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-fuchsia-500",
    "bg-slate-600",
  ];

  for (const name of names) {
    cells[name] = {};
    for (const day of days) {
      const key = dateKey(day);
      const worksThatDay = sorted.some(
        (guardia) =>
          guardia.operador_nombre.trim() === name &&
          new Date(guardia.desde) <= endOfDay(day) &&
          new Date(guardia.hasta) >= startOfDay(day),
      );
      cells[name][key] = worksThatDay ? (isNonWorkingDay(day) ? "feriado" : "guardia") : null;
    }
  }

  const operadores = names.map((name, index) => {
    const values = Object.values(cells[name]);
    const guardiasOperador = sorted.filter((guardia) => guardia.operador_nombre.trim() === name);
    const nocturnos = guardiasOperador.reduce((total, guardia) => total + countNocturnosEnPeriodo(guardia, start, end), 0);
    return {
      nombre: name,
      codigo: codes.get(name) ?? initialsCode(name),
      colorClass: palette[index % palette.length],
      normales: values.filter((value) => value === "guardia").length,
      nocturnos,
      feriados: values.filter((value) => value === "feriado").length,
    };
  });

  return {
    days,
    operadores,
    cells,
    periodLabel: `${format(start, "dd/MM/yyyy")} al ${format(end, "dd/MM/yyyy")}`,
  };
}

function buildOperatorCodes(names: string[]) {
  const used = new Set<string>();
  const result = new Map<string, string>();

  for (const name of names) {
    const base = initialsCode(name);
    let code = base;
    if (!code) {
      code = "?";
    }
    let suffix = 2;
    while (used.has(code)) {
      code = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(code);
    result.set(name, code);
  }

  return result;
}

function initialsCode(name: string) {
  const firstWord = name
    .trim()
    .split(/\s+/)
    .find(Boolean);
  return (firstWord?.[0] ?? "?").toUpperCase();
}

function isNonWorkingDay(day: Date) {
  const weekDay = day.getDay();
  return weekDay === 0 || weekDay === 6 || Boolean(getHolidayName(day));
}

function getHolidayName(day: Date) {
  const year = day.getFullYear();
  const key = `${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  const fixed: Record<string, string> = {
    "01-01": "Año Nuevo",
    "03-24": "Día Nacional de la Memoria",
    "04-02": "Día del Veterano y de los Caídos en Malvinas",
    "05-01": "Día del Trabajador",
    "05-25": "Día de la Revolución de Mayo",
    "06-20": "Paso a la Inmortalidad de Manuel Belgrano",
    "07-09": "Día de la Independencia",
    "12-08": "Inmaculada Concepción de María",
    "12-25": "Navidad",
  };
  if (fixed[key]) return fixed[key];

  const easter = calculateEasterSunday(year);
  const variable = new Map<string, string>([
    [dateKey(addDays(easter, -48)), "Carnaval"],
    [dateKey(addDays(easter, -47)), "Carnaval"],
    [dateKey(addDays(easter, -2)), "Viernes Santo"],
    [dateKey(nearestMonday(new Date(year, 5, 17))), "Paso a la Inmortalidad de Martín Miguel de Güemes"],
    [dateKey(thirdMonday(new Date(year, 7, 1))), "Paso a la Inmortalidad de José de San Martín"],
    [dateKey(secondMonday(new Date(year, 9, 1))), "Día del Respeto a la Diversidad Cultural"],
    [dateKey(fourthMonday(new Date(year, 10, 1))), "Día de la Soberanía Nacional"],
  ]);

  return variable.get(dateKey(day)) ?? null;
}

function calculateEasterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function nearestMonday(date: Date) {
  const monday = new Date(date);
  while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
  return monday;
}

function secondMonday(monthStart: Date) {
  return nthMonday(monthStart, 2);
}

function thirdMonday(monthStart: Date) {
  return nthMonday(monthStart, 3);
}

function fourthMonday(monthStart: Date) {
  return nthMonday(monthStart, 4);
}

function nthMonday(monthStart: Date, nth: number) {
  const date = new Date(monthStart);
  let count = 0;
  while (date.getMonth() === monthStart.getMonth()) {
    if (date.getDay() === 1) {
      count += 1;
      if (count === nth) return date;
    }
    date.setDate(date.getDate() + 1);
  }
  return date;
}

function dateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}`);
}
