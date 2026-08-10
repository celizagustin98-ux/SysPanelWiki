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
  const [desde, setDesde] = useState(format(new Date(), "yyyy-MM-dd"));
  const [hasta, setHasta] = useState(format(addMonths(new Date(), 1), "yyyy-MM-dd"));
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [duracionDias, setDuracionDias] = useState(7);
  const [operarios, setOperarios] = useState("");
  const [notas, setNotas] = useState("Guardia del período");
  const [saving, setSaving] = useState(false);

  const preview = useMemo(
    () => generarTurnosPeriodo({ desde, hasta, horaInicio, duracionDias, operarios, notas }),
    [desde, hasta, horaInicio, duracionDias, operarios, notas],
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
                      ? `${diasPeriodo} días de cobertura entre ${formatDateInput(desde)} y ${formatDateInput(hasta)}.`
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
              <Label>Hora de relevo</Label>
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
                placeholder={"Agustin Celiz\nMaría Gomez\nCarlos Ruiz"}
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
  const detallePeriodo = periodoActual
    ? `${format(periodoActual.desde, "dd/MM")} -> ${format(periodoActual.hasta, "dd/MM")}`
    : format(cursor, "MMMM yyyy", { locale: es });
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
  const inicio = buildDateTime(desde, horaInicio);
  const finPeriodo = buildDateTime(hasta, horaInicio);

  if (Number.isNaN(inicio.getTime()) || Number.isNaN(finPeriodo.getTime())) {
    return { turnos: [], error: "Revisá las fechas del período" };
  }
  if (finPeriodo <= inicio) return { turnos: [], error: "La fecha hasta debe ser posterior a desde" };

  const turnos: Omit<Guardia, "id">[] = [];
  let cursor = inicio;
  let index = 0;

  while (cursor < finPeriodo && turnos.length < 400) {
    const hastaTurno = new Date(cursor);
    hastaTurno.setDate(hastaTurno.getDate() + diasPorTurno);
    const final = hastaTurno > finPeriodo ? finPeriodo : hastaTurno;

    turnos.push({
      operador_nombre: nombres[index % nombres.length],
      desde: cursor.toISOString(),
      hasta: final.toISOString(),
      notas,
    });

    cursor = final;
    index += 1;
  }

  return { turnos, error: null };
}

function buildDateTime(date: string, time: string) {
  return new Date(`${date}T${time || "00:00"}`);
}
