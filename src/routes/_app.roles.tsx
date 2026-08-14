import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/roles")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracion", replace: true });
  },
  component: () => null,
});
