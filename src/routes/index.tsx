import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
  head: () => ({
    meta: [
      { title: "Nodara · Área de Sistemas" },
      {
        name: "description",
        content:
          "Wiki operativa integral: guardias, inventario, tóners, tareas y bóveda de credenciales.",
      },
      { property: "og:title", content: "Nodara" },
      {
        property: "og:description",
        content: "Wiki operativa, guardias, inventario, tóners, tareas y credenciales en un solo lugar.",
      },
    ],
  }),
  component: () => null,
});
