import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/backend/core/auth-middleware";
import { DURACION_PERMISO_MS, olvidarPermisos } from "@/backend/core/clave-ver";
import { assertAdmin, hashPassword, one, query, verifyPassword } from "@/backend/core/db";

export type EstadoClaveVer = { configurada: boolean; actualizada: string | null; segundos: number };

export const claveVerEstado = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async (): Promise<EstadoClaveVer> => {
    const fila = await one<{ configurada: boolean; clave_ver_actualizada: string | null }>(
      `select clave_ver_hash is not null as configurada, clave_ver_actualizada from app_settings where singleton = true`,
    ).catch(() => null);
    return { configurada: !!fila?.configurada, actualizada: fila?.clave_ver_actualizada ?? null, segundos: DURACION_PERMISO_MS / 1000 };
  });

/** Define o cambia la clave de visualización. Se confirma con la contraseña del administrador. */
export const claveVerGuardar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { miClave: string; nueva: string }) => {
    const nueva = String(d?.nueva ?? "");
    if (nueva.length < 6) throw new Error("La clave de visualización debe tener al menos 6 caracteres");
    if (nueva.length > 128) throw new Error("La clave es demasiado larga");
    if (/^(.)\1+$/.test(nueva) || /^(0?123456|654321)/.test(nueva)) throw new Error("Elegí una clave menos obvia");
    return { miClave: String(d?.miClave ?? ""), nueva };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const yo = await one<{ password_hash: string }>(`select password_hash from app_users where id = $1`, [context.userId]);
    if (!yo || !(await verifyPassword(data.miClave, yo.password_hash))) throw new Error("Tu contraseña de usuario no es correcta");
    // No puede ser igual a la contraseña con la que el administrador entra al sistema.
    if (await verifyPassword(data.nueva, yo.password_hash)) throw new Error("Usá una clave distinta a tu contraseña de ingreso");
    await query(`update app_settings set clave_ver_hash = $1, clave_ver_actualizada = now() where singleton = true`, [await hashPassword(data.nueva)]);
    olvidarPermisos();
    const actor = await one<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [context.userId]);
    await query(
      `insert into audit_log (actor_id, actor_nombre, actor_email, modulo, accion, entidad_desc, detalle)
       values ($1, $2, $3, 'configuracion', 'editar', 'Clave de visualización', '{"tabla":"app_settings","campo":"clave_ver"}'::jsonb)`,
      [context.userId, actor?.full_name ?? "", actor?.email ?? ""],
    );
    return { ok: true };
  });
