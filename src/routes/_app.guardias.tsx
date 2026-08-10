import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addMonths,
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
import { ChevronLeft, ChevronRight, Plus, Radio, Trash2 } from "lucide-react";
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
      { title: "Guardias | SysWiki Panel" },
      { name: "description", content: "Calendario de guardias con turnos por operador y rango horario." },
      { property: "og:title", content: "Guardias | SysWiki Panel" },
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
  const actual = data.find((g) => new Date(g.desde) <= now && new Date(g.hasta) >= now);
  const refresh = () => qc.invalidateQueries({ queryKey: ["guardias"] });

  return (
    <div>
      <PageHeader
        title="Guardias"
        description="Turnos del área con rango de fechas y horas."
        action={
          canWrite ? (
            <GuardiaDialog
              trigger={
                <Button>
                  <Plus className="size-4" /> Cargar guardia
                </Button>
              }
              onDone={refresh}
            />
          ) : null
        }
      />

      <Card className={cn("panel mb-6", actual && "border-primary/50")}>
        <CardContent className="flex flex-wrap items-center gap-4 p-5">
          <div className="grid size-11 place-items-center rounded-lg bg-primary/15 text-primary">
            <Radio className="size-5" />
          </div>
          {actual ? (
            <div>
              <p className="text-sm text-muted-foreground">Turno actual</p>
              <p className="text-lg font-semibold">{actual.operador_nombre}</p>
              <p className="text-xs text-muted-foreground">
                Hasta {format(new Date(actual.hasta), "PPpp", { locale: es })}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No hay nadie de guardia en este momento.</p>
          )}
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base capitalize">
            {format(cursor, "MMMM yyyy", { locale: es })}
          </CardTitle>
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
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="py-1 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const items = data.filter(
                (g) => new Date(g.desde) <= endOfDay(day) && new Date(g.hasta) >= startOfDay(day),
              );
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-24 rounded-lg border border-border/60 p-1.5 text-left",
                    !isSameMonth(day, cursor) && "opacity-40",
                    isSameDay(day, now) && "border-primary bg-primary/5",
                  )}
                >
                  <span className="text-xs font-medium">{format(day, "d")}</span>
                  <div className="mt-1 space-y-1">
                    {items.map((g) => (
                      <div
                        key={g.id}
                        className="truncate rounded bg-primary/15 px-1.5 py-0.5 text-[11px] text-primary"
                        title={`${g.operador_nombre} · ${format(new Date(g.desde), "dd/MM HH:mm")} → ${format(new Date(g.hasta), "dd/MM HH:mm")}`}
                      >
                        {g.operador_nombre}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="panel mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Listado de guardias</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.map((g) => (
            <div
              key={g.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium">{g.operador_nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(g.desde), "dd/MM/yyyy HH:mm")} →{" "}
                  {format(new Date(g.hasta), "dd/MM/yyyy HH:mm")}
                </p>
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
