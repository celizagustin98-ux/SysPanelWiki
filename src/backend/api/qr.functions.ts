import { createServerFn } from "@tanstack/react-start";
import { requireAppAuth } from "@/backend/core/auth-middleware";
import { assertAdmin, hashPassword, hasModulePermission, one, pool, query, verifyPassword } from "@/backend/core/db";
import { validarPin } from "@/backend/core/seguridad";

/* ───────────────────────────── Ajustes del QR ───────────────────────────── */

export type QrAjustes = {
  pedirClave: "siempre" | "turno" | "nunca";
  reportePublico: boolean;
  anchoMm: number;
  /** Dirección base del QR impreso; null = la del navegador. */
  urlBase: string | null;
  tienePin: boolean;
};

async function leerAjustes(userId: string): Promise<QrAjustes> {
  const s = await one<{ qr_pedir_clave: string; qr_reporte_publico: boolean; etiqueta_ancho_mm: number; qr_url_base: string | null }>(
    `select qr_pedir_clave, qr_reporte_publico, etiqueta_ancho_mm, qr_url_base from app_settings where singleton = true`,
  ).catch(() => null);
  const u = await one<{ tiene: boolean }>(`select qr_pin_hash is not null as tiene from app_users where id = $1`, [userId]).catch(() => null);
  const pedir = s?.qr_pedir_clave;
  return {
    pedirClave: pedir === "siempre" || pedir === "nunca" ? pedir : "turno",
    reportePublico: s?.qr_reporte_publico ?? true,
    anchoMm: s?.etiqueta_ancho_mm ?? 57,
    urlBase: s?.qr_url_base || null,
    tienePin: !!u?.tiene,
  };
}

export const qrAjustes = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .handler(async ({ context }) => leerAjustes(context.userId));

export const qrGuardarAjustes = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { pedirClave: string; reportePublico: boolean; anchoMm: number; urlBase?: string | null }) => {
    if (!["siempre", "turno", "nunca"].includes(d?.pedirClave)) throw new Error("Opción inválida");
    const ancho = Number(d?.anchoMm);
    if (![57, 80].includes(ancho)) throw new Error("El rollo debe ser de 57 u 80 mm");
    const urlBase = String(d?.urlBase ?? "").trim().replace(/\/+$/, "");
    if (urlBase && !/^https?:\/\/[^\s/]+$/i.test(urlBase)) throw new Error("La dirección debe ser como https://172.20.1.134:3443");
    return { pedirClave: d.pedirClave, reportePublico: !!d.reportePublico, anchoMm: ancho, urlBase: urlBase || null };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await query(`update app_settings set qr_pedir_clave = $1, qr_reporte_publico = $2, etiqueta_ancho_mm = $3, qr_url_base = $4 where singleton = true`, [
      data.pedirClave,
      data.reportePublico,
      data.anchoMm,
      data.urlBase,
    ]);
    return leerAjustes(context.userId);
  });

/* ─────────────────────────── Clave o PIN al escanear ─────────────────────────── */

const intentos = new Map<string, { n: number; hasta: number }>();
/** Fallos seguidos de PIN por usuario: al llegar a 10 se borra el PIN y se pide la contraseña. */
const fallosPin = new Map<string, number>();

function frenar(userId: string) {
  const now = Date.now();
  const i = intentos.get(userId);
  if (i && i.hasta > now && i.n >= 5) throw new Error("Demasiados intentos. Esperá un minuto.");
}
function fallo(userId: string) {
  const now = Date.now();
  const i = intentos.get(userId);
  const prev = i && i.hasta > now ? i : { n: 0, hasta: now + 60_000 };
  intentos.set(userId, { n: prev.n + 1, hasta: prev.hasta });
}

/** Confirma la identidad al abrir un equipo escaneado: con la contraseña o con el PIN. */
export const qrVerificar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { clave?: string; pin?: string }) => ({ clave: String(d?.clave ?? ""), pin: String(d?.pin ?? "") }))
  .handler(async ({ data, context }) => {
    frenar(context.userId);
    const u = await one<{ password_hash: string; qr_pin_hash: string | null }>(`select password_hash, qr_pin_hash from app_users where id = $1`, [context.userId]);
    const ok = data.pin
      ? !!u?.qr_pin_hash && (await verifyPassword(data.pin, u.qr_pin_hash))
      : !!u && (await verifyPassword(data.clave, u.password_hash));
    if (!ok) {
      fallo(context.userId);
      if (data.pin) {
        const n = (fallosPin.get(context.userId) ?? 0) + 1;
        fallosPin.set(context.userId, n);
        if (n >= 10) {
          await query(`update app_users set qr_pin_hash = null where id = $1`, [context.userId]);
          fallosPin.delete(context.userId);
          throw new Error("Demasiados PIN incorrectos: el PIN se borró. Entrá con tu contraseña y creá uno nuevo.");
        }
      }
      throw new Error(data.pin ? "PIN incorrecto" : "Clave incorrecta");
    }
    intentos.delete(context.userId);
    fallosPin.delete(context.userId);
    return { ok: true };
  });

/** Crea o cambia el PIN de escaneo (pide la contraseña). Sin pin, lo quita. */
export const qrGuardarPin = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { clave: string; pin?: string | null }) => {
    const pin = d?.pin ? String(d.pin) : null;
    if (pin) validarPin(pin);
    return { clave: String(d?.clave ?? ""), pin };
  })
  .handler(async ({ data, context }) => {
    frenar(context.userId);
    const u = await one<{ password_hash: string }>(`select password_hash from app_users where id = $1`, [context.userId]);
    if (!u || !(await verifyPassword(data.clave, u.password_hash))) {
      fallo(context.userId);
      throw new Error("Clave incorrecta");
    }
    await query(`update app_users set qr_pin_hash = $1 where id = $2`, [data.pin ? await hashPassword(data.pin) : null, context.userId]);
    return { ok: true, tienePin: !!data.pin };
  });

/* ─────────────────────────── Escaneos y etiquetas ─────────────────────────── */

async function nombreDe(userId: string) {
  return (await one<{ full_name: string }>(`select full_name from profiles where id = $1`, [userId]))?.full_name ?? null;
}

async function exigir(userId: string, accion: "ver" | "crear" | "editar") {
  if (!(await hasModulePermission(userId, "inventario", accion))) throw new Error("Tu rol no tiene permiso en Activos IT");
}

/** Activo por código (o por id, para las etiquetas viejas que codificaban el id). */
export const qrResolver = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { codigo?: string; id?: string }) => ({ codigo: String(d?.codigo ?? "").trim(), id: String(d?.id ?? "").trim() }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "ver");
    const fila = data.id
      ? await one<{ id: string; codigo: string }>(`select id, codigo from inventario where id::text = $1`, [data.id])
      : await one<{ id: string; codigo: string }>(`select id, codigo from inventario where upper(codigo) = upper($1) order by created_at limit 1`, [data.codigo]);
    const libre = !fila && data.codigo ? await one<{ codigo: string }>(`select codigo from inventario_etiquetas_libres where upper(codigo) = upper($1)`, [data.codigo]) : null;
    return { id: fila?.id ?? null, codigo: fila?.codigo ?? data.codigo, libre: !!libre };
  });

export const qrRegistrarEscaneo = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { inventarioId: string; accion?: string; detalle?: string }) => ({
    inventarioId: String(d?.inventarioId ?? ""),
    accion: String(d?.accion ?? "ver").slice(0, 40),
    detalle: d?.detalle ? String(d.detalle).slice(0, 300) : null,
  }))
  .handler(async ({ data, context }) => {
    await query(
      `insert into inventario_escaneos (inventario_id, codigo, user_id, usuario_nombre, accion, detalle)
       select id, codigo, $2, $3, $4, $5 from inventario where id = $1`,
      [data.inventarioId, context.userId, await nombreDe(context.userId), data.accion, data.detalle],
    );
    return { ok: true };
  });

/** Marca etiquetas como impresas (o pendientes de reimprimir). */
export const etiquetasMarcar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { ids: string[]; impresas: boolean }) => ({ ids: (d?.ids ?? []).map(String).slice(0, 2000), impresas: !!d?.impresas }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "editar");
    if (!data.ids.length) return { n: 0 };
    const r = data.impresas
      ? await query(`update inventario set etiqueta_impresa_at = now(), etiqueta_reimprimir = false where id = any($1::uuid[])`, [data.ids])
      : await query(`update inventario set etiqueta_reimprimir = true where id = any($1::uuid[])`, [data.ids]);
    return { n: r.rowCount ?? 0 };
  });

/** Reserva códigos correlativos para etiquetas en blanco (alta al escanear). */
export const etiquetasLibresGenerar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { cantidad: number }) => ({ cantidad: Math.max(1, Math.min(200, Math.floor(Number(d?.cantidad) || 0))) }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "crear");
    const nombre = await nombreDe(context.userId);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("lock table inventario_etiquetas_libres in exclusive mode");
      const { rows } = await client.query<{ codigo: string }>(`select codigo from inventario union all select codigo from inventario_etiquetas_libres`);
      // Mismo criterio que el alta manual: el prefijo más usado y el número siguiente.
      const conteo = new Map<string, { n: number; max: number; ancho: number }>();
      for (const { codigo } of rows) {
        const m = /^([A-Za-z]+-?)(\d+)$/.exec((codigo ?? "").trim());
        if (!m) continue;
        const prev = conteo.get(m[1]) ?? { n: 0, max: 0, ancho: m[2].length };
        conteo.set(m[1], { n: prev.n + 1, max: Math.max(prev.max, Number(m[2])), ancho: Math.max(prev.ancho, m[2].length) });
      }
      const [prefijo, info] = [...conteo.entries()].sort((a, b) => b[1].n - a[1].n)[0] ?? ["INV-", { n: 0, max: 0, ancho: 5 }];
      const lote = `L${new Date().toISOString().slice(0, 10)}-${Date.now().toString(36).slice(-4)}`;
      const codigos: string[] = [];
      for (let i = 1; i <= data.cantidad; i++) {
        const codigo = `${prefijo}${String(info.max + i).padStart(info.ancho, "0")}`;
        codigos.push(codigo);
        await client.query(`insert into inventario_etiquetas_libres (codigo, lote, impresa_at, created_by_nombre) values ($1, $2, now(), $3) on conflict do nothing`, [codigo, lote, nombre]);
      }
      await client.query("commit");
      return { codigos, lote };
    } catch (error) {
      await client.query("rollback").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

/** Después de dar de alta un equipo con un código preimpreso. */
export const etiquetaLibreUsar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { codigo: string; inventarioId: string }) => ({ codigo: String(d?.codigo ?? ""), inventarioId: String(d?.inventarioId ?? "") }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "crear");
    await query(`update inventario_etiquetas_libres set usada_at = now(), inventario_id = $2 where upper(codigo) = upper($1)`, [data.codigo, data.inventarioId]);
    await query(`update inventario set etiqueta_impresa_at = coalesce(etiqueta_impresa_at, now()) where id = $1`, [data.inventarioId]);
    return { ok: true };
  });

/* ─────────────────────────── Auditoría física ─────────────────────────── */

export type AuditoriaItem = {
  id: string;
  inventario_id: string | null;
  codigo: string;
  resultado: "encontrado" | "otro_lugar" | "desconocido";
  sector_registrado: string | null;
  ubicacion_detalle: string | null;
  escaneado_por_nombre: string | null;
  escaneado_at: string;
  descripcion: string | null;
  rubro: string | null;
};

export type Faltante = { id: string; codigo: string; descripcion: string | null; rubro: string | null; ubicacion_detalle: string | null; asignado_a: string | null };

function filtroLugar(alias: string, planta: string | null, sector: string | null, desde = 1) {
  const cond: string[] = [];
  const vals: unknown[] = [];
  if (sector) {
    vals.push(sector);
    cond.push(`${alias}.sector = $${desde + vals.length - 1}`);
  }
  if (planta) {
    vals.push(planta);
    cond.push(`${alias}.planta = $${desde + vals.length - 1}`);
  }
  return { where: cond.length ? cond.join(" and ") : "true", vals };
}

export const auditoriaCrear = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { nombre: string; planta?: string | null; sector?: string | null }) => {
    const nombre = String(d?.nombre ?? "").trim().slice(0, 120);
    if (nombre.length < 3) throw new Error("Poné un nombre a la auditoría");
    return { nombre, planta: d?.planta ? String(d.planta) : null, sector: d?.sector ? String(d.sector) : null };
  })
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "editar");
    const f = filtroLugar("i", data.planta, data.sector);
    const esperados = await one<{ n: number }>(`select count(*)::int as n from inventario i where ${f.where} and coalesce(i.estado, '') <> 'baja'`, f.vals);
    const fila = await one<{ id: string }>(
      `insert into inventario_auditorias (nombre, planta, sector, esperados, creada_por, creada_por_nombre) values ($1, $2, $3, $4, $5, $6) returning id`,
      [data.nombre, data.planta, data.sector, esperados?.n ?? 0, context.userId, await nombreDe(context.userId)],
    );
    return { id: fila!.id };
  });

/** Registra un código escaneado en la auditoría y opcionalmente lo da por controlado. */
export const auditoriaEscanear = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { auditoriaId: string; codigo?: string; id?: string; ubicacion?: string | null; marcarControl?: boolean }) => ({
    auditoriaId: String(d?.auditoriaId ?? ""),
    codigo: String(d?.codigo ?? "").trim().slice(0, 80),
    id: String(d?.id ?? "").trim(),
    ubicacion: d?.ubicacion ? String(d.ubicacion).trim().slice(0, 120) : null,
    marcarControl: d?.marcarControl !== false,
  }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "editar");
    const aud = await one<{ estado: string; planta: string | null; sector: string | null }>(`select estado, planta, sector from inventario_auditorias where id = $1`, [data.auditoriaId]);
    if (!aud) throw new Error("Auditoría inexistente");
    if (aud.estado !== "abierta") throw new Error("La auditoría está cerrada");
    const activo = data.id
      ? await one<{ id: string; codigo: string; sector: string | null; planta: string | null; descripcion: string | null; nombre: string; rubro: string | null }>(
          `select id, codigo, sector, planta, descripcion, nombre, rubro from inventario where id::text = $1`,
          [data.id],
        )
      : await one<{ id: string; codigo: string; sector: string | null; planta: string | null; descripcion: string | null; nombre: string; rubro: string | null }>(
          `select id, codigo, sector, planta, descripcion, nombre, rubro from inventario where upper(codigo) = upper($1) order by created_at limit 1`,
          [data.codigo],
        );
    const codigo = activo?.codigo ?? data.codigo;
    if (!codigo) throw new Error("Código vacío");
    const enLugar = !!activo && (!aud.sector || activo.sector === aud.sector) && (!aud.planta || activo.planta === aud.planta);
    const resultado = !activo ? "desconocido" : enLugar ? "encontrado" : "otro_lugar";
    const nombre = await nombreDe(context.userId);
    const previo = await one<{ id: string }>(`select id from inventario_auditoria_items where auditoria_id = $1 and upper(codigo) = upper($2)`, [data.auditoriaId, codigo]);
    await query(
      `insert into inventario_auditoria_items (auditoria_id, inventario_id, codigo, resultado, sector_registrado, ubicacion_detalle, escaneado_por_nombre)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (auditoria_id, codigo) do update set resultado = excluded.resultado, ubicacion_detalle = coalesce(excluded.ubicacion_detalle, inventario_auditoria_items.ubicacion_detalle), escaneado_at = now()`,
      [data.auditoriaId, activo?.id ?? null, codigo, resultado, activo ? [activo.sector, activo.planta].filter(Boolean).join(" · ") || null : null, data.ubicacion, nombre],
    );
    if (activo) {
      // Solo se actualiza la ubicación de lo que está en su lugar; lo de otro sector espera a "Mover acá".
      if (data.ubicacion && resultado === "encontrado") await query(`update inventario set ubicacion_detalle = $2 where id = $1`, [activo.id, data.ubicacion]);
      if (data.marcarControl && resultado === "encontrado" && !previo) {
        await query(`update inventario set ultima_vez_controlada = current_date where id = $1`, [activo.id]);
        await query(
          `insert into inventario_controles (inventario_id, controlado_por, controlado_por_nombre, estado, observacion)
           select id, $2, $3, estado, 'Auditoría física' from inventario where id = $1`,
          [activo.id, context.userId, nombre],
        ).catch(() => {});
      }
      await query(`insert into inventario_escaneos (inventario_id, codigo, user_id, usuario_nombre, accion) values ($1, $2, $3, $4, 'auditoria')`, [
        activo.id,
        activo.codigo,
        context.userId,
        nombre,
      ]);
    }
    return {
      repetido: !!previo,
      resultado,
      codigo,
      descripcion: activo ? activo.descripcion || activo.nombre : null,
      lugar: activo ? [activo.sector, activo.planta].filter(Boolean).join(" · ") : null,
    };
  });

export const auditoriaDetalle = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "ver");
    const aud = await one<{
      id: string;
      numero: number;
      nombre: string;
      planta: string | null;
      sector: string | null;
      estado: string;
      notas: string | null;
      esperados: number;
      creada_por_nombre: string | null;
      created_at: string;
      cerrada_at: string | null;
      cerrada_por_nombre: string | null;
    }>(`select * from inventario_auditorias where id = $1`, [data.id]);
    if (!aud) throw new Error("Auditoría inexistente");
    const items = await query<AuditoriaItem>(
      `select a.id, a.inventario_id, a.codigo, a.resultado, a.sector_registrado, a.ubicacion_detalle, a.escaneado_por_nombre, a.escaneado_at,
              coalesce(i.descripcion, i.nombre) as descripcion, coalesce(i.rubro, i.categoria) as rubro
         from inventario_auditoria_items a left join inventario i on i.id = a.inventario_id
        where a.auditoria_id = $1 order by a.escaneado_at desc`,
      [data.id],
    );
    const f = filtroLugar("i", aud.planta, aud.sector, 2);
    const faltantes = await query<Faltante>(
      `select i.id, i.codigo, coalesce(i.descripcion, i.nombre) as descripcion, coalesce(i.rubro, i.categoria) as rubro, i.ubicacion_detalle, i.asignado_a
         from inventario i
        where ${f.where} and coalesce(i.estado, '') <> 'baja'
          and not exists (select 1 from inventario_auditoria_items a where a.auditoria_id = $1 and a.inventario_id = i.id)
        order by i.codigo
        limit 3000`,
      [data.id, ...f.vals],
    );
    return { auditoria: aud, items: items.rows, faltantes: faltantes.rows };
  });

export const auditoriaCerrar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { id: string; notas?: string | null }) => ({ id: String(d?.id ?? ""), notas: d?.notas ? String(d.notas).slice(0, 2000) : null }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "editar");
    await query(`update inventario_auditorias set estado = 'cerrada', cerrada_at = now(), cerrada_por_nombre = $2, notas = coalesce($3, notas) where id = $1`, [
      data.id,
      await nombreDe(context.userId),
      data.notas,
    ]);
    return { ok: true };
  });

/** Pasa al sector de la auditoría un equipo que se encontró en otro lugar. */
export const auditoriaReubicar = createServerFn({ method: "POST" })
  .middleware([requireAppAuth])
  .validator((d: { auditoriaId: string; itemId: string }) => ({ auditoriaId: String(d?.auditoriaId ?? ""), itemId: String(d?.itemId ?? "") }))
  .handler(async ({ data, context }) => {
    await exigir(context.userId, "editar");
    const aud = await one<{ planta: string | null; sector: string | null }>(`select planta, sector from inventario_auditorias where id = $1`, [data.auditoriaId]);
    const it = await one<{ inventario_id: string | null }>(`select inventario_id from inventario_auditoria_items where id = $1 and auditoria_id = $2`, [data.itemId, data.auditoriaId]);
    if (!aud || !it?.inventario_id) throw new Error("No se encontró el equipo");
    const ubi = await one<{ ubicacion_detalle: string | null }>(`select ubicacion_detalle from inventario_auditoria_items where id = $1`, [data.itemId]);
    await query(
      `update inventario set sector = coalesce($2, sector), planta = coalesce($3, planta), ubicacion_detalle = coalesce($4, ubicacion_detalle) where id = $1`,
      [it.inventario_id, aud.sector, aud.planta, ubi?.ubicacion_detalle ?? null],
    );
    await query(`update inventario_auditoria_items set resultado = 'encontrado' where id = $1`, [data.itemId]);
    return { ok: true };
  });
