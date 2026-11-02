import { createFileRoute, redirect } from "@tanstack/react-router";

// Auditoría se unificó en Configuración: los links viejos llevan a esa sección.
export const Route = createFileRoute("/_app/auditoria")({
  beforeLoad: () => {
    throw redirect({ to: "/configuracion", search: { seccion: "auditoria" } });
  },
});
