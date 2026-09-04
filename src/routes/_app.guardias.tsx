import { createFileRoute } from "@tanstack/react-router";
import { GuardiasPage } from "@/components/guardias/GuardiasPage";

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
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-lg space-y-3 p-8 text-center">
      <h1 className="text-xl font-semibold">No se pudo cargar Guardias</h1>
      <p className="text-sm text-muted-foreground">
        {(error as Error)?.message || "Error desconocido"}
      </p>
      <a href="/dashboard" className="text-sm text-primary underline">
        Volver al inicio
      </a>
    </div>
  ),
});
