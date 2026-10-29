import { randomBytes } from "node:crypto";
import { one, verifyPassword } from "@/backend/core/db";

/**
 * Clave de visualización: la define un administrador en Configuración → Seguridad y se pide
 * para ver o copiar cualquier clave guardada (Credenciales, emails de la Agenda).
 * Al acertarla se entrega un permiso que vale 1 minuto: durante ese tiempo no se vuelve a pedir.
 */
export const DURACION_PERMISO_MS = 60_000;
const MAX_FALLOS = 5;
const BLOQUEO_MS = 5 * 60_000;

const permisos = new Map<string, { token: string; expira: number }>();
const fallos = new Map<string, { n: number; hasta: number }>();

export async function claveVerHash() {
  const fila = await one<{ clave_ver_hash: string | null }>(`select clave_ver_hash from app_settings where singleton = true`).catch(() => null);
  return fila?.clave_ver_hash ?? null;
}

/** Valida la clave (o un permiso vigente) y devuelve el permiso para el próximo minuto. */
export async function autorizarRevelado(userId: string, args: Record<string, unknown> | undefined) {
  const ahora = Date.now();
  const vigente = permisos.get(userId);
  const token = String(args?._permiso ?? "");
  if (token && vigente && vigente.token === token && vigente.expira > ahora) return vigente;

  const hash = await claveVerHash();
  if (!hash) throw new Error("Todavía no hay una clave de visualización. Un administrador la define en Configuración → Seguridad.");
  const bloqueo = fallos.get(userId);
  if (bloqueo && bloqueo.hasta > ahora) {
    throw new Error(`Demasiados intentos. Esperá ${Math.ceil((bloqueo.hasta - ahora) / 60_000)} min y volvé a probar.`);
  }
  const clave = String(args?._clave ?? "");
  if (!clave) throw new Error("PEDIR_CLAVE");
  if (!(await verifyPassword(clave, hash))) {
    // Fallos seguidos (un bloqueo ya vencido arranca la cuenta de cero).
    const n = (bloqueo && bloqueo.hasta === 0 ? bloqueo.n : 0) + 1;
    fallos.set(userId, n >= MAX_FALLOS ? { n: 0, hasta: ahora + BLOQUEO_MS } : { n, hasta: 0 });
    throw new Error(n >= MAX_FALLOS ? "Clave incorrecta. Se bloqueó por 5 minutos." : `Clave incorrecta (${MAX_FALLOS - n} intentos más)`);
  }
  fallos.delete(userId);
  const nuevo = { token: randomBytes(24).toString("base64url"), expira: ahora + DURACION_PERMISO_MS };
  permisos.set(userId, nuevo);
  return nuevo;
}

/** Al cambiar la clave, los permisos entregados dejan de valer. */
export function olvidarPermisos() {
  permisos.clear();
  fallos.clear();
}
