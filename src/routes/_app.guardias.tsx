import { createFileRoute } from "@tanstack/react-router";
import { GuardiasPage } from "@/components/guardias/GuardiasPage";

export const Route = createFileRoute("/_app/guardias")({
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
