import { createFileRoute } from "@tanstack/react-router";
import { GuardiasPage, consultaGuardias } from "@/components/guardias/GuardiasPage";

export const Route = createFileRoute("/_app/guardias")({
  // Precarga los datos al pasar el mouse por el menú (preload "intent"): la pantalla abre ya cargada.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(consultaGuardias);
  },
  validateSearch: (s: Record<string, unknown>): { tab?: "planilla" | "horarios" | "liquidacion" } =>
    s.tab === "horarios" || s.tab === "liquidacion" || s.tab === "planilla" ? { tab: s.tab } : {},
  ssr: false,
  head: () => ({
    meta: [
      { title: "Guardias / Horarios · Nodara" },
      {
        name: "description",
        content: "Guardias por período 21–20, horario semanal, horas extras y liquidación.",
      },
    ],
  }),
  component: GuardiasPage,
});
