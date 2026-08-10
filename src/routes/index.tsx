import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Intranet Sistemas | Wiki, guardias, inventario y tareas" },
      {
        name: "description",
        content:
          "Wiki operativa integral: guardias, inventario, tóners, tareas y bóveda de credenciales.",
      },
      { property: "og:title", content: "Intranet Sistemas" },
      {
        property: "og:description",
        content: "Wiki operativa, guardias, inventario, tóners, tareas y credenciales en un solo lugar.",
      },
    ],
  }),
  component: IndexRedirect,
});

function IndexRedirect() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    navigate({ to: session ? "/dashboard" : "/auth", replace: true });
  }, [loading, session, navigate]);

  return (
    <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
      Cargando…
    </div>
  );
}
