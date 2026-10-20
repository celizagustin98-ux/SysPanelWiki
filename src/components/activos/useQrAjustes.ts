import { useQuery } from "@tanstack/react-query";
import { qrAjustes, type QrAjustes } from "@/backend/api/qr.functions";

const PREDETERMINADOS: QrAjustes = { pedirClave: "turno", reportePublico: true, anchoMm: 57, urlBase: null, tienePin: false };

/** Ajustes del QR (cuándo pedir clave, reporte público, ancho del rollo) y si el usuario tiene PIN. */
export function useQrAjustes(enabled = true) {
  const q = useQuery({
    queryKey: ["qr-ajustes"],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      try {
        return await qrAjustes();
      } catch {
        // Base sin la migración 20261026_qr.sql: valores por defecto.
        return PREDETERMINADOS;
      }
    },
  });
  return { ...q, ajustes: q.data ?? PREDETERMINADOS };
}
