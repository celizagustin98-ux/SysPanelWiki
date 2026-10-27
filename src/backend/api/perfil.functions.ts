import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/backend/core/auth-middleware";
import { invalidateAuthCache, one, query } from "@/backend/core/db";

/** Perfil propio: cada usuario edita solo el suyo (el rol, usuario y email los maneja un administrador). */
export type MiPerfil = {
  full_name: string;
  email: string;
  username: string | null;
  cargo: string | null;
  telefono: string | null;
  interno: string | null;
  sobre_mi: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

/** La foto llega ya recortada y achicada desde el navegador; igual se limita el tamaño. */
const MAX_FOTO = 400_000;
const FOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

function texto(v: unknown, max: number, campo: string) {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  if (s.length > max) throw new Error(`${campo}: máximo ${max} caracteres`);
  return s || null;
}

export const perfilObtener = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }): Promise<MiPerfil> => {
    const p = await one<MiPerfil>(
      `select full_name, email, username, cargo, telefono, interno, sobre_mi, avatar_url, created_at
         from profiles where id = $1`,
      [context.userId],
    );
    if (!p) throw new Error("Perfil no encontrado");
    return p;
  });

export const perfilGuardar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (d: {
      full_name: string;
      cargo?: string | null;
      telefono?: string | null;
      interno?: string | null;
      sobre_mi?: string | null;
      /** undefined = no tocar la foto, null = quitarla, string = foto nueva. */
      avatar_url?: string | null;
    }) => {
      const nombre = texto(d?.full_name, 80, "Nombre");
      if (!nombre || nombre.length < 2) throw new Error("Ingresá tu nombre");
      let foto: string | null | undefined = undefined;
      if (d?.avatar_url === null) foto = null;
      else if (typeof d?.avatar_url === "string") {
        if (d.avatar_url.length > MAX_FOTO || !FOTO_RE.test(d.avatar_url)) throw new Error("La foto no es válida o es muy grande");
        foto = d.avatar_url;
      }
      const sobreMi = String(d?.sobre_mi ?? "").trim();
      if (sobreMi.length > 300) throw new Error("Sobre mí: máximo 300 caracteres");
      return {
        full_name: nombre,
        cargo: texto(d?.cargo, 80, "Puesto"),
        telefono: texto(d?.telefono, 40, "Teléfono"),
        interno: texto(d?.interno, 20, "Interno"),
        sobre_mi: sobreMi || null,
        avatar_url: foto,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const sets = ["full_name = $2", "cargo = $3", "telefono = $4", "interno = $5", "sobre_mi = $6", "updated_at = now()"];
    const valores: unknown[] = [context.userId, data.full_name, data.cargo, data.telefono, data.interno, data.sobre_mi];
    if (data.avatar_url !== undefined) {
      valores.push(data.avatar_url);
      sets.push(`avatar_url = $${valores.length}`);
    }
    await query(`update profiles set ${sets.join(", ")} where id = $1`, valores);
    invalidateAuthCache(context.userId);
    return { ok: true };
  });
