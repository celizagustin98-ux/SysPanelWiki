import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BookOpen,
  Boxes,
  CalendarClock,
  KanbanSquare,
  Printer,
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
      { title: "Dashboard | Intranet Área de Sistemas" },
      { name: "description", content: "Estadísticas en tiempo real, guardia del día y tareas asignadas." },
      { property: "og:title", content: "Dashboard | Intranet Área de Sistemas" },
      { property: "og:description", content: "Panel operativo del Área de Sistemas." },
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
    { label: "Equipos en inventario", value: data?.equipos ?? 0, icon: Boxes, to: "/inventario" },
    { label: "Tareas abiertas", value: data?.tareas ?? 0, icon: KanbanSquare, to: "/tareas" },
    { label: "Tóners en stock", value: data?.stockTotal ?? 0, icon: Printer, to: "/toners" },
    { label: "Credenciales guardadas", value: data?.credenciales ?? 0, icon: ShieldCheck, to: "/credenciales" },
  ] as const;

  return (
    <div>
      <PageHeader
        title={`Hola, ${profile?.full_name?.split(" ")[0] || "equipo"}`}
        description="Estado operativo del Área de Sistemas en tiempo real."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="panel transition-transform hover:-translate-y-0.5">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="grid size-11 place-items-center rounded-lg bg-accent text-accent-foreground">
                  <s.icon className="size-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="panel lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" /> Guardia de hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.guardia ? (
              <div>
                <p className="text-lg font-semibold">{data.guardia.operador_nombre}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(data.guardia.desde).toLocaleString("es-AR")} →{" "}
                  {new Date(data.guardia.hasta).toLocaleString("es-AR")}
                </p>
                <Badge className="mt-3">En turno ahora</Badge>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No hay guardia activa en este momento.
              </p>
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
              <p className="text-sm text-muted-foreground">Todavía no hay instructivos.</p>
            )}
            {(data?.docs ?? []).map((d) => (
              <Link
                key={d.id}
                to="/instructivos"
                search={{ doc: d.id }}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
              >
                <span className="truncate">{d.title}</span>
                <span className="text-xs text-muted-foreground">{d.views} vistas</span>
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
              <p className="text-sm text-muted-foreground">No tenés tareas asignadas.</p>
            )}
            {(data?.misTareas ?? []).map((t) => (
              <Link
                key={t.id}
                to="/tareas"
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
              >
                <span className="truncate">{t.titulo}</span>
                <Badge variant="secondary" className="capitalize">
                  {t.prioridad}
                </Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {(data?.stockCritico ?? []).length > 0 && (
        <Card className="panel mt-6 border-destructive/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="size-4" /> Stock crítico de tóners
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {data!.stockCritico.map((t) => (
              <Badge key={t.nombre} variant="destructive">
                {t.nombre}: {t.stock}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
