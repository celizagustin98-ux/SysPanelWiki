/** Utilidades del QR de Activos IT: qué codifica la etiqueta y cuándo pedir la clave. */

/** Dirección corta que codifica la etiqueta: /q/INV-00123 (QR menos denso, se lee mejor). */
export function urlQr(codigo: string, base?: string | null) {
  const origen = base || (typeof window === "undefined" ? "" : window.location.origin);
  return `${origen}/q/${encodeURIComponent(codigo)}`;
}

/**
 * Interpreta lo leído por la cámara o un lector USB:
 * - /q/INV-00123 (etiquetas nuevas)
 * - /inventario?item=<id> (etiquetas viejas)
 * - el código suelto (lector de códigos de barras o tipeado)
 */
export function leerQr(texto: string): { codigo?: string; id?: string } | null {
  const t = texto.trim();
  if (!t) return null;
  try {
    const u = new URL(t, typeof window === "undefined" ? "http://x" : window.location.origin);
    const q = /\/q\/([^/?#]+)/.exec(u.pathname);
    if (q) return { codigo: decodeURIComponent(q[1]) };
    const item = u.searchParams.get("item");
    if (item) return { id: item };
  } catch {
    /* no es una URL */
  }
  if (/^[\w.-]{2,80}$/.test(t)) return { codigo: t };
  return null;
}

/* ───────────── Confirmación de identidad al escanear ───────────── */

const KEY = "nodara.qr.ok";
const HORAS_TURNO = 8;

export type PedirClave = "siempre" | "turno" | "nunca";

function vigenciaMs(pedir: PedirClave) {
  if (pedir === "nunca") return Number.POSITIVE_INFINITY;
  if (pedir === "turno") return HORAS_TURNO * 3_600_000;
  return 10 * 60_000; // "siempre": la confirmación sirve para los próximos minutos de esta pestaña
}

/** True si no hace falta pedir clave o PIN según el ajuste del sistema. */
export function qrDesbloqueado(pedir: PedirClave) {
  if (pedir === "nunca") return true;
  try {
    const store = pedir === "siempre" ? sessionStorage : localStorage;
    return Date.now() - Number(store.getItem(KEY) || 0) < vigenciaMs(pedir);
  } catch {
    return false;
  }
}

export function marcarQrDesbloqueado() {
  try {
    const ahora = String(Date.now());
    sessionStorage.setItem(KEY, ahora);
    localStorage.setItem(KEY, ahora);
  } catch {
    /* sin almacenamiento */
  }
}

export function olvidarQrDesbloqueo() {
  try {
    sessionStorage.removeItem(KEY);
    localStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento */
  }
}
