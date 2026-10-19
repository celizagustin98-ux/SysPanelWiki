import { createMiddleware } from "@tanstack/react-start";
import { getToken } from "./client";

// Adjunta el token guardado en el navegador a cada server function.
// Antes pedía la sesión al servidor en cada llamada: duplicaba todos los viajes.
export const attachAppAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getToken();
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});
