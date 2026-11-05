import { createFileRoute } from "@tanstack/react-router";
import { GuardiasPage } from "@/components/guardias/GuardiasPage";

export const Route = createFileRoute("/_app/guardias")({
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
