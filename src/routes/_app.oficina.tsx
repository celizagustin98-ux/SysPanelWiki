import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BriefcaseBusiness, Mail, UserRound } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { api } from "@/integrations/api/client";

export const Route = createFileRoute("/_app/oficina")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Oficina | Directorio" },
      { name: "description", content: "Directorio interno del equipo de sistemas." },
      { property: "og:title", content: "Oficina | Directorio" },
    ],
  }),
  component: OficinaPage,
});

type Persona = {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  role: string | null;
};

function OficinaPage() {
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["directorio_usuarios"],
    queryFn: async () => {
      const { data, error } = await api.rpc("directorio_usuarios");
      if (error) throw error;
      return (data ?? []) as Persona[];
    },
  });

  const filtered = data.filter((p) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return [p.full_name, p.email, p.username, p.role]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(term));
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oficina"
        description="Directorio del equipo: contactos internos y roles."
      />

      <Input
        className="max-w-md"
        placeholder="Buscar por nombre, correo o rol…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((p) => (
          <Card key={p.id} className="panel">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="grid size-10 place-items-center rounded-lg bg-primary/15 text-primary">
                <UserRound className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium tracking-tight">{p.full_name || "Sin nombre"}</p>
                <p className="truncate text-xs text-muted-foreground">@{p.username || "—"}</p>
                <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                  <Mail className="size-3.5 shrink-0" />
                  {p.email || "—"}
                </p>
                <Badge variant="secondary" className="mt-2 capitalize">
                  {p.role || "consulta"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && (
          <Card className="panel sm:col-span-2 xl:col-span-3">
            <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
              <BriefcaseBusiness className="size-5" />
              No hay contactos para mostrar.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
