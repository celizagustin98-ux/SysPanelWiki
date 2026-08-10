import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  KanbanSquare,
  Printer,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/AppShell";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Dashboard | SysIntranet | Área Wiki" },
      { name: "description", content: "Estadísticas en tiempo real, guardia del día y tareas asignadas." },
      { property: "og:title", content: "Dashboard | SysIntranet | Área Wiki" },
      { property: "og:description", content: "Panel operativo para sistemas." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user, profile } = useAuth();

  const { data } = useQuery({
    queryKey: ["dashboard", user?.id],
    queryFn: async () => {
      const now = new Date().toISOString();
      const [equipos, tareas, toners, docs, guardia, misTareas, criticos] = await Promise.all([
        api.from("inventario").select("id", { count: "exact", head: true }),
        api.from("tareas").select("id", { count: "exact", head: true }).neq("estado", "hecha"),
        api.from("toner_modelos").select("stock, stock_minimo, nombre"),
        api.from("wiki_docs").select("id, title, views").order("views", { ascending: false }).limit(5),
        api
          .from("guardias")
          .select("*")
          .lte("desde", now)
          .gte("hasta", now)
          .order("desde")
          .limit(1),
        api
          .from("tareas")
          .select("id, titulo, estado, prioridad")
          .eq("asignado_a", user?.id ?? "")
          .neq("estado", "hecha")
          .limit(6),
        api.from("credenciales").select("id", { count: "exact", head: true }),
      ]);
      const stockTotal = (toners.data ?? []).reduce((a, t) => a + t.stock, 0);
      const stockCritico = (toners.data ?? []).filter((t) => t.stock <= t.stock_minimo);
      return {
        equipos: equipos.count ?? 0,
        tareas: tareas.count ?? 0,
        stockTotal,
        stockCritico,
        docs: docs.data ?? [],
        guardia: guardia.data?.[0] ?? null,
        misTareas: misTareas.data ?? [],
        credenciales: criticos.count ?? 0,
      };
    },
  });

  const stats = [
    {
      label: "Inventario TI",
      value: data?.equipos ?? 0,
      detail: "activos registrados",
      icon: Boxes,
      to: "/inventario",
    },
    {
      label: "Mesa de trabajo",
      value: data?.tareas ?? 0,
      detail: "tareas abiertas",
      icon: KanbanSquare,
      to: "/tareas",
    },
    {
      label: "Stock de tóners",
      value: data?.stockTotal ?? 0,
      detail: `${data?.stockCritico.length ?? 0} críticos`,
      icon: Printer,
      to: "/toners",
    },
    {
      label: "Bóveda segura",
      value: data?.credenciales ?? 0,
      detail: "credenciales guardadas",
      icon: ShieldCheck,
      to: "/credenciales",
    },
  ] as const;

  const criticalCount = data?.stockCritico.length ?? 0;
  const taskCount = data?.tareas ?? 0;
  const operationalStatus =
    criticalCount > 0 ? "Atención requerida" : taskCount > 0 ? "Operación activa" : "Operación estable";
  const operationalTone =
    criticalCount > 0
      ? "border-destructive/35 bg-destructive/8 text-destructive"
      : "border-primary/25 bg-primary/10 text-primary";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de Operaciones TI"
        description={`Hola, ${profile?.full_name?.split(" ")[0] || "equipo"}. Resumen ejecutivo del área de sistemas.`}
      />

      <section className="panel overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="border-b border-border p-5 lg:border-b-0 lg:border-r">
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                <Server className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Estado general</p>
                <h2 className="text-2xl font-semibold tracking-tight">{operationalStatus}</h2>
              </div>
              <Badge className={`ml-auto border ${operationalTone}`} variant="outline">
                <Activity className="mr-1 size-3" />
                En tiempo real
              </Badge>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">Guardia</p>
                <p className="mt-1 truncate text-sm font-semibold">
                  {data?.guardia?.operador_nombre ?? "Sin guardia activa"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">Pendientes</p>
                <p className="mt-1 text-sm font-semibold">{taskCount} tickets y tareas abiertos</p>
              </div>
              <div className="rounded-lg border border-border bg-background/40 p-3">
                <p className="text-xs uppercase text-muted-foreground">Alertas</p>
                <p className="mt-1 text-sm font-semibold">{criticalCount} modelos bajo mínimo</p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm font-medium text-muted-foreground">Prioridad operativa</p>
            <div className="mt-4 space-y-3">
              <StatusLine
                active={criticalCount === 0}
                label="Stock de insumos controlado"
                value={criticalCount === 0 ? "OK" : `${criticalCount} críticos`}
              />
              <StatusLine
                active={Boolean(data?.guardia)}
                label="Cobertura de guardia"
                value={data?.guardia ? "Activa" : "Sin cobertura"}
              />
              <StatusLine
                active={taskCount < 10}
                label="Carga de tareas"
                value={taskCount < 10 ? "Normal" : "Alta"}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="panel group transition-colors hover:border-primary/40">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <s.icon className="size-5" />
                  </div>
                  <ArrowUpRight className="size-4 text-muted-foreground transition-colors group-hover:text-primary" />
                </div>
                <div className="mt-4">
                  <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
                  <div className="mt-1 flex items-end gap-2">
                    <p className="text-3xl font-semibold tabular-nums">{s.value}</p>
                    <p className="pb-1 text-xs text-muted-foreground">{s.detail}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr_1fr]">
        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" /> Guardia de hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.guardia ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xl font-semibold">{data.guardia.operador_nombre}</p>
                  <p className="text-sm text-muted-foreground">
                  {new Date(data.guardia.desde).toLocaleString("es-AR")} →{" "}
                  {new Date(data.guardia.hasta).toLocaleString("es-AR")}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-primary">
                  <CheckCircle2 className="size-4" />
                  En turno ahora
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                No hay guardia activa en este momento.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4 text-primary" /> Instructivos más visitados
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.docs ?? []).length === 0 && (
              <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                Todavía no hay instructivos consultados.
              </div>
            )}
            {(data?.docs ?? []).map((d, index) => (
              <Link
                key={d.id}
                to="/instructivos"
                search={{ doc: d.id }}
                className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-sm hover:border-border hover:bg-accent/40"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{d.title}</span>
                  <span className="text-xs text-muted-foreground">{d.views} vistas</span>
                </span>
                <FileText className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="panel">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <KanbanSquare className="size-4 text-primary" /> Mis tareas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.misTareas ?? []).length === 0 && (
              <div className="rounded-lg border border-border bg-background/40 p-4 text-sm text-muted-foreground">
                No tenés tareas asignadas.
              </div>
            )}
            {(data?.misTareas ?? []).map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-sm hover:border-border hover:bg-accent/40"
              >
                <Clock3 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{t.titulo}</span>
                <Badge variant="secondary" className="capitalize">
                  {t.prioridad}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {(data?.stockCritico ?? []).length > 0 && (
        <Card className="panel border-destructive/40">
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="size-4" /> Stock crítico de tóners
              </CardTitle>
              <Link to="/toners" className="text-sm font-medium text-primary hover:underline">
                Gestionar stock
              </Link>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data!.stockCritico.map((t) => (
              <div
                key={t.nombre}
                className="flex items-center justify-between gap-3 rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium">{t.nombre}</span>
                <Badge variant="destructive" className="shrink-0">
                  {t.stock}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusLine({
  active,
  label,
  value,
}: {
  active: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`size-2 rounded-full ${active ? "bg-primary" : "bg-destructive"}`}
          aria-hidden="true"
        />
        <span className="truncate text-sm">{label}</span>
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{value}</span>
    </div>
  );
}
