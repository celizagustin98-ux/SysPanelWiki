import { createFileRoute } from "@tanstack/react-router";
import { GuardiasPage } from "@/components/guardias/GuardiasPage";

export const Route = createFileRoute("/_app/guardias")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Guardias · Nodara" },
      {
        name: "description",
        content: "Planilla de guardias por período 21–20, feriados y liquidación.",
      },
    ],
  }),
  component: GuardiasPage,
});
