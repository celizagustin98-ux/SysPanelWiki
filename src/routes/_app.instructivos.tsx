import { createFileRoute } from "@tanstack/react-router";
import { InstructivosPage } from "@/components/instructivos/InstructivosPage";

export const Route = createFileRoute("/_app/instructivos")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({ doc: (s.doc as string) || undefined }),
  head: () => ({
    meta: [
      { title: "Instructivos | Base de conocimiento" },
      {
        name: "description",
        content: "Base de conocimiento operativa con carpetas, texto, PDFs y búsqueda.",
      },
      { property: "og:title", content: "Instructivos | Base de conocimiento" },
    ],
  }),
  component: InstructivosPage,
});
