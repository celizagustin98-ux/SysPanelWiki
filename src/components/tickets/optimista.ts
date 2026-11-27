import type { QueryClient } from "@tanstack/react-query";

/**
 * Cambio optimista de un ticket: se ve al instante en todas las listas cargadas (activos, historial, uno suelto)
 * y devuelve cómo deshacerlo si el servidor rechaza el cambio.
 */
export function aplicarEnTickets(qc: QueryClient, id: string, values: Record<string, unknown>) {
  const previos = qc.getQueriesData({ queryKey: ["tareas"] });
  qc.setQueriesData({ queryKey: ["tareas"] }, (viejo: unknown) => {
    if (Array.isArray(viejo)) return viejo.map((t) => (t && (t as { id?: string }).id === id ? { ...t, ...values } : t));
    if (viejo && typeof viejo === "object" && (viejo as { id?: string }).id === id) return { ...viejo, ...values };
    return viejo;
  });
  return () => previos.forEach(([clave, datos]) => qc.setQueryData(clave, datos));
}
