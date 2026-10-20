import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/backend/core/auth-middleware";
import { assertAdmin, one, query, readFileAsDataUrl, removeFile, saveFile } from "@/backend/core/db";

/** Marca configurada en Configuración → General. Los campos vacíos usan los valores de src/lib/brand.ts. */
export type MarcaConfig = {
  nombre: string | null;
  area: string | null;
  color: string | null;
  pie: string | null;
  logo: string | null;
};

const BUCKET = "marca";
const MAX_LOGO_BYTES = 512 * 1024;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

type Fila = { org_nombre: string | null; org_area: string | null; org_logo: string | null; color_primario: string | null; pie_documentos: string | null };

async function leerFila() {
  try {
    return await one<Fila>(`select org_nombre, org_area, org_logo, color_primario, pie_documentos from app_settings where singleton = true`);
  } catch {
    // Base sin la migración 20261025_marca.sql: se usan los valores por defecto.
    return null;
  }
}

async function logoDataUrl(path: string | null) {
  if (!path) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  try {
    return await readFileAsDataUrl(BUCKET, path, MIME[ext] ?? "image/png");
  } catch {
    return null;
  }
}

/** Pública: la pantalla de login también muestra la marca. */
export const marcaObtener = createServerFn({ method: "GET" }).handler(async (): Promise<MarcaConfig> => {
  const fila = await leerFila();
  return {
    nombre: fila?.org_nombre || null,
    area: fila?.org_area || null,
    color: fila?.color_primario || null,
    pie: fila?.pie_documentos || null,
    logo: await logoDataUrl(fila?.org_logo ?? null),
  };
});

function texto(v: unknown, max: number) {
  const s = String(v ?? "").trim();
  if (s.length > max) throw new Error(`Máximo ${max} caracteres`);
  return s || null;
}

export const marcaGuardar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator(
    (data: {
      nombre?: string | null;
      area?: string | null;
      color?: string | null;
      pie?: string | null;
      /** Logo nuevo en base64 con su extensión; `quitarLogo` vuelve al isotipo por defecto. */
      logo?: { base64: string; ext: string } | null;
      quitarLogo?: boolean;
    }) => {
      const color = texto(data?.color, 7);
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error("El color debe tener el formato #RRGGBB");
      let logo: { base64: string; ext: string } | null = null;
      if (data?.logo) {
        const ext = String(data.logo.ext ?? "").toLowerCase();
        if (!MIME[ext]) throw new Error("El logo debe ser PNG, JPG, WEBP o SVG");
        const base64 = String(data.logo.base64 ?? "");
        if (Math.floor((base64.length * 3) / 4) > MAX_LOGO_BYTES) throw new Error("El logo no puede superar 512 KB");
        logo = { base64, ext };
      }
      return {
        nombre: texto(data?.nombre, 60),
        area: texto(data?.area, 80),
        color: color?.toLowerCase() ?? null,
        pie: texto(data?.pie, 200),
        logo,
        quitarLogo: !!data?.quitarLogo,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const anterior = await leerFila();
    if (anterior === null) throw new Error("Falta aplicar la migración 20261025_marca.sql (npm run db:init)");
    let logoPath = anterior.org_logo;
    if (data.logo) {
      logoPath = `logo-${Date.now()}.${data.logo.ext}`;
      await saveFile(BUCKET, logoPath, data.logo.base64);
    } else if (data.quitarLogo) {
      logoPath = null;
    }
    await query(
      `update app_settings set org_nombre = $1, org_area = $2, color_primario = $3, pie_documentos = $4, org_logo = $5 where singleton = true`,
      [data.nombre, data.area, data.color, data.pie, logoPath],
    );
    if (anterior.org_logo && anterior.org_logo !== logoPath) await removeFile(BUCKET, anterior.org_logo).catch(() => {});

    const actor = await one<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [context.userId]);
    await query(
      `insert into audit_log (actor_id, actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle)
       values ($1, $2, $3, 'configuracion', 'editar', 'marca', $4, $5::jsonb)`,
      [
        context.userId,
        actor?.full_name ?? "",
        actor?.email ?? "",
        `Marca: ${data.nombre ?? "por defecto"}`,
        JSON.stringify({ nombre: data.nombre, area: data.area, color: data.color, pie: data.pie, logo: data.logo ? "nuevo" : data.quitarLogo ? "quitado" : "sin cambios" }),
      ],
    );
    return { ok: true };
  });
