import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", replace: true });
  },
  head: () => ({
    meta: [
      { title: "SysIntranet | Wiki Area" },
      {
        name: "description",
        content:
          "Wiki operativa integral: guardias, inventario, tóners, tareas y bóveda de credenciales.",
      },
      { property: "og:title", content: "SysIntranet | Wiki Area" },
      {
        property: "og:description",
        content: "Wiki operativa, guardias, inventario, tóners, tareas y credenciales en un solo lugar.",
      },
    ],
  }),
  component: () => null,
});
