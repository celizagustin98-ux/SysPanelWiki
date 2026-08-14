import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, Clock3 } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/oficina")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Oficina | SysIntranet | Area Wiki" },
      {
        name: "description",
        content: "Modulo Oficina en desarrollo.",
      },
      { property: "og:title", content: "Oficina | SysIntranet | Area Wiki" },
      {
        property: "og:description",
        content: "Modulo Oficina en desarrollo.",
      },
    ],
  }),
  component: OficinaPage,
});

function OficinaPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Oficina" description="Modulo en desarrollo." />

      <section className="panel p-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid size-12 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BriefcaseBusiness className="size-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">Oficina</h2>
              <Badge variant="secondary" className="gap-1">
                <Clock3 className="size-3" />
                En desarrollo
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Este modulo queda reservado hasta definir sus funciones.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
