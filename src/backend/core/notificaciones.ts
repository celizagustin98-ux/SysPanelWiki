import { one, query } from "./db";
import { decryptSecret } from "@/backend/core/crypto-secrets";

type Nueva = { userId: string; tipo: string; titulo: string; cuerpo?: string | null; link?: string | null; actorNombre?: string | null };

/** Crea notificaciones personales. Nunca rompe la operación que la dispara. */
export async function notificar(items: Nueva[]) {
  const validos = items.filter((n) => n.userId);
  if (!validos.length) return;
  try {
    const values: unknown[] = [];
    const tuples = validos.map((n) => {
      values.push(n.userId, n.tipo, n.titulo, n.cuerpo ?? null, n.link ?? null, n.actorNombre ?? null);
      const k = values.length;
      return `($${k - 5}, $${k - 4}, $${k - 3}, $${k - 2}, $${k - 1}, $${k})`;
    });
    await query(`insert into notificaciones (user_id, tipo, titulo, cuerpo, link, actor_nombre) values ${tuples.join(", ")}`, values);
  } catch (error) {
    console.error("No se pudo crear la notificación", error);
  }
}

function ticketLabel(t: Record<string, unknown>) {
  return t.numero ? `TK-${t.numero}` : "Ticket";
}

export const EVENTOS_EXTERNOS = ["ticket_critico", "version_pendiente", "version_problemas"] as const;

/**
 * Aviso urgente fuera del sistema (Telegram). Se configura en Configuración → Avisos externos;
 * si no está configurado o el evento está apagado, no hace nada. Nunca corta la operación que lo disparó.
 */
export async function avisoExterno(evento: (typeof EVENTOS_EXTERNOS)[number] | "prueba", texto: string) {
  try {
    const cfg = await one<{ valor: { token?: string; chat_id?: string; eventos?: string[] } | null }>(`select valor from ajustes where clave = 'avisos_telegram'`);
    const v = cfg?.valor;
    if (!v?.token || !v.chat_id) return { ok: false, motivo: "Falta configurar el bot y el chat" };
    if (evento !== "prueba" && Array.isArray(v.eventos) && !v.eventos.includes(evento)) return { ok: false, motivo: "Evento apagado" };
    const token = decryptSecret(v.token);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: v.chat_id, text: texto, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) {
      const p = (await r.json().catch(() => null)) as { description?: string } | null;
      return { ok: false, motivo: p?.description ?? `Telegram respondió ${r.status}` };
    }
    return { ok: true, motivo: "" };
  } catch (error) {
    console.error("No se pudo enviar el aviso externo", error);
    return { ok: false, motivo: error instanceof Error ? error.message : "Sin conexión con Telegram" };
  }
}

/** Reglas de notificación según lo que cambió en la base. */
export async function notificarCambios(
  table: string,
  accion: "insert" | "update",
  actorId: string,
  filas: Record<string, unknown>[],
  antes: Record<string, unknown>[] = [],
) {
  try {
    if (!filas.length) return;
    const actor = await one<{ full_name: string }>(`select full_name from profiles where id = $1`, [actorId]);
    const actorNombre = actor?.full_name ?? "";

    if (table === "sistema_actualizaciones" && accion === "update") {
      const previo = new Map(antes.map((r) => [String(r.id), r]));
      for (const a of filas) {
        if (a.estado === "con_problemas" && previo.get(String(a.id))?.estado !== "con_problemas")
          await avisoExterno("version_problemas", `⚠️ ${String(a.sistema)}${a.version ? ` v${String(a.version)}` : ""} quedó con problemas después de actualizar (marcado por ${actorNombre}).`);
      }
      return;
    }

    if (table === "tareas") {
      if (accion === "insert")
        for (const t of filas)
          if (t.prioridad === "critica")
            await avisoExterno("ticket_critico", `🔴 Ticket crítico ${ticketLabel(t)}: ${String(t.titulo ?? "")}${t.sector ? ` · ${String(t.sector)}` : ""} (cargó ${actorNombre})`);
      const previo = new Map(antes.map((r) => [String(r.id), r]));
      const nuevas: Nueva[] = [];
      for (const t of filas) {
        const asignado = t.asignado_a ? String(t.asignado_a) : "";
        const anterior = previo.get(String(t.id));
        const cambioAsignado = accion === "insert" ? !!asignado : asignado && asignado !== String(anterior?.asignado_a ?? "");
        if (cambioAsignado && asignado !== actorId) {
          nuevas.push({
            userId: asignado,
            tipo: "ticket",
            titulo: `${ticketLabel(t)} asignado a vos`,
            cuerpo: `${String(t.titulo ?? "")}${t.prioridad ? ` · prioridad ${t.prioridad}` : ""}`,
            link: "/tareas",
            actorNombre,
          });
        }
        // Avisar al creador cuando su ticket se resuelve o se cierra.
        const creador = t.created_by ? String(t.created_by) : t.solicitante_id ? String(t.solicitante_id) : "";
        const estadoAntes = String(anterior?.estado ?? "");
        if (accion === "update" && creador && creador !== actorId && t.estado !== estadoAntes && (t.estado === "resuelto" || t.estado === "cerrado")) {
          nuevas.push({
            userId: creador,
            tipo: "ticket",
            titulo: `${ticketLabel(t)} ${t.estado === "resuelto" ? "resuelto" : "cerrado"}`,
            cuerpo: String(t.titulo ?? ""),
            link: "/tareas",
            actorNombre,
          });
        }
      }
      await notificar(nuevas);
    }

    if (table === "tarea_comentarios" && accion === "insert") {
      for (const c of filas) {
        const t = await one<Record<string, unknown>>(`select id, numero, titulo, asignado_a, created_by, solicitante_id from tareas where id = $1`, [c.tarea_id]);
        if (!t) continue;
        const destinos = new Set([t.asignado_a, t.created_by, t.solicitante_id].filter(Boolean).map(String));
        destinos.delete(actorId);
        await notificar(
          [...destinos].map((userId) => ({
            userId,
            tipo: "comentario",
            titulo: `Nuevo comentario en ${ticketLabel(t)}`,
            cuerpo: String(c.contenido ?? "").slice(0, 140),
            link: "/tareas",
            actorNombre,
          })),
        );
      }
    }
  } catch (error) {
    console.error("Error al generar notificaciones", error);
  }
}

export type Alerta = { id: string; tipo: string; tono: "crit" | "warn" | "info"; titulo: string; cuerpo: string; link: string };

/** Alertas del área calculadas en el momento (no se guardan). */
export async function alertasArea(userId: string): Promise<Alerta[]> {
  const alertas: Alerta[] = [];
  const seguro = async <T>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const toners = await seguro(() => query<{ nombre: string; stock: number; stock_minimo: number }>(`select nombre, stock, stock_minimo from toner_modelos where stock <= stock_minimo order by stock asc limit 6`));
  if (toners?.rows.length) {
    alertas.push({
      id: "toners",
      tipo: "toner",
      tono: toners.rows.some((t) => t.stock === 0) ? "crit" : "warn",
      titulo: `${toners.rows.length} tóner${toners.rows.length === 1 ? "" : "s"} bajo el mínimo`,
      cuerpo: toners.rows.map((t) => `${t.nombre} (${t.stock})`).join(", "),
      link: "/toners",
    });
  }

  const claves = await seguro(() =>
    query<{ servicio: string }>(
      `select servicio from credenciales
        where responsable_id = $1 and rotar_cada_dias is not null
          and coalesce(last_rotated_at, updated_at, created_at) < now() - rotar_cada_dias * interval '1 day'
        order by servicio limit 8`,
      [userId],
    ),
  );
  if (claves?.rows.length)
    alertas.push({
      id: "claves-rotar",
      tipo: "clave",
      tono: "warn",
      titulo: `${claves.rows.length} clave${claves.rows.length === 1 ? "" : "s"} a tu cargo para cambiar`,
      cuerpo: claves.rows.map((c) => c.servicio).join(", "),
      link: "/credenciales",
    });

  const esAdmin = await seguro(() => one<{ ok: boolean }>(`select exists(select 1 from user_roles where user_id = $1 and role = 'administrador') ok`, [userId]));
  if (esAdmin?.ok) {
    // Primera semana del mes: el reporte del mes anterior ya se puede presentar.
    const hoy = new Date();
    if (hoy.getDate() <= 7) {
      const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1).toLocaleDateString("es-AR", { month: "long", year: "numeric" });
      alertas.push({
        id: `reporte-${hoy.getFullYear()}-${hoy.getMonth()}`,
        tipo: "doc",
        tono: "info",
        titulo: `Reporte de ${mesAnterior} listo`,
        cuerpo: "Tickets, compras, tóners, actualizaciones y horas extras del mes, en PDF.",
        link: "/configuracion?seccion=reportes",
      });
    }
    const intercambios = await seguro(() => one<{ n: number }>(`select count(*)::int n from guardia_intercambios where estado = 'pendiente'`));
    if (intercambios?.n)
      alertas.push({
        id: "intercambios",
        tipo: "guardia",
        tono: "info",
        titulo: `${intercambios.n} intercambio${intercambios.n === 1 ? "" : "s"} de guardia para aprobar`,
        cuerpo: "Pedidos entre compañeros esperando tu aprobación.",
        link: "/guardias",
      });
  }

  const versiones = await seguro(() =>
    query<{ sistema: string; version: string | null; dias: number }>(
      `select sistema, version, (current_date - coalesce(aviso_fecha, fecha))::int dias from sistema_actualizaciones
        where estado = 'pendiente' and coalesce(aviso_fecha, fecha) <= current_date - 2 order by fecha limit 5`,
    ),
  );
  if (versiones?.rows.length)
    alertas.push({
      id: "versiones",
      tipo: "actualizacion",
      tono: "warn",
      titulo: `${versiones.rows.length} versión${versiones.rows.length === 1 ? "" : "es"} sin subir hace más de 2 días`,
      cuerpo: versiones.rows.map((v) => `${v.sistema}${v.version ? ` v${v.version}` : ""} (${v.dias} d)`).join(", "),
      link: "/oficina?tab=actualizaciones",
    });

  const mant = await seguro(() =>
    one<{ n: number; vencidos: number }>(
      `select count(*)::int n, count(*) filter (where mant_proximo < current_date)::int vencidos from inventario where mant_proximo is not null and mant_proximo <= current_date + 7`,
    ),
  );
  if (mant?.n)
    alertas.push({
      id: "mantenimiento",
      tipo: "activo",
      tono: mant.vencidos ? "warn" : "info",
      titulo: mant.vencidos ? `${mant.vencidos} mantenimiento${mant.vencidos === 1 ? "" : "s"} preventivo${mant.vencidos === 1 ? "" : "s"} vencido${mant.vencidos === 1 ? "" : "s"}` : `${mant.n} mantenimiento${mant.n === 1 ? "" : "s"} esta semana`,
      cuerpo: "Equipos con el preventivo programado.",
      link: "/inventario",
    });

  const vencidos = await seguro(() =>
    one<{ n: number }>(
      `select count(*)::int n from tareas where asignado_a = $1 and estado not in ('resuelto','cerrado','cancelado') and vence_el < current_date`,
      [userId],
    ),
  );
  if (vencidos?.n) alertas.push({ id: "vencidos", tipo: "ticket", tono: "crit", titulo: `${vencidos.n} ticket${vencidos.n === 1 ? "" : "s"} tuyo${vencidos.n === 1 ? "" : "s"} vencido${vencidos.n === 1 ? "" : "s"}`, cuerpo: "Pasaron su fecha límite.", link: "/tareas" });

  const sinAsignar = await seguro(() => one<{ n: number; criticos: number }>(`select count(*)::int n, count(*) filter (where prioridad in ('critica','alta'))::int criticos from tareas where asignado_a is null and estado not in ('resuelto','cerrado','cancelado')`));
  if (sinAsignar?.criticos) alertas.push({ id: "sin-asignar", tipo: "ticket", tono: "warn", titulo: `${sinAsignar.criticos} ticket${sinAsignar.criticos === 1 ? "" : "s"} urgente${sinAsignar.criticos === 1 ? "" : "s"} sin asignar`, cuerpo: `${sinAsignar.n} en total esperan a alguien.`, link: "/tareas" });

  // SLA por prioridad (mismas horas que en Tickets): sin tomar y sin resolver a tiempo.
  const fueraSla = await seguro(() =>
    one<{ sin_tomar: number; sin_resolver: number }>(
      `select count(*) filter (where asignado_a is null and created_at + (case prioridad when 'critica' then 1 when 'alta' then 4 when 'media' then 8 else 24 end) * interval '1 hour' < now())::int sin_tomar,
              count(*) filter (where asignado_a is not null and estado <> 'esperando' and created_at + (case prioridad when 'critica' then 4 when 'alta' then 24 when 'media' then 72 else 168 end) * interval '1 hour' < now())::int sin_resolver
         from tareas where estado not in ('resuelto','cerrado','cancelado')`,
    ),
  );
  if (fueraSla && fueraSla.sin_tomar + fueraSla.sin_resolver > 0) {
    const partes = [
      fueraSla.sin_tomar ? `${fueraSla.sin_tomar} sin tomar` : "",
      fueraSla.sin_resolver ? `${fueraSla.sin_resolver} sin resolver a tiempo` : "",
    ].filter(Boolean);
    alertas.push({ id: "sla", tipo: "ticket", tono: "crit", titulo: `${fueraSla.sin_tomar + fueraSla.sin_resolver} ticket${fueraSla.sin_tomar + fueraSla.sin_resolver === 1 ? "" : "s"} fuera de SLA`, cuerpo: partes.join(" · "), link: "/tareas" });
  }

  const reparaciones = await seguro(() => one<{ n: number }>(`select count(*)::int n from inventario_reparaciones where fecha_fin is null and fecha_inicio < current_date - 7`));
  if (reparaciones?.n) alertas.push({ id: "reparaciones", tipo: "activo", tono: "warn", titulo: `${reparaciones.n} reparación${reparaciones.n === 1 ? "" : "es"} abierta${reparaciones.n === 1 ? "" : "s"} hace más de 7 días`, cuerpo: "Revisá el estado con el servicio técnico.", link: "/inventario" });

  const garantias = await seguro(() => one<{ n: number }>(`select count(*)::int n from inventario where garantia_hasta between current_date and current_date + 30 and estado <> 'baja'`));
  if (garantias?.n) alertas.push({ id: "garantias", tipo: "activo", tono: "info", titulo: `${garantias.n} garantía${garantias.n === 1 ? "" : "s"} vence${garantias.n === 1 ? "" : "n"} este mes`, cuerpo: "Equipos con garantía en los próximos 30 días.", link: "/inventario" });

  const clavesViejas = await seguro(() =>
    one<{ n: number }>(
      `select count(*)::int n from oficina_contactos c
        where coalesce(c.secreto, '') <> '' and coalesce(c.vigente, true) and coalesce(c.activo, true)
          and coalesce((select max(h.created_at) from oficina_contactos_historial h where h.contacto_id = c.id and h.campo = 'secreto'), c.created_at)
              < now() - interval '6 months'`,
    ),
  );
  if (clavesViejas?.n) alertas.push({ id: "claves-viejas", tipo: "clave", tono: "info", titulo: `${clavesViejas.n} clave${clavesViejas.n === 1 ? "" : "s"} de la agenda sin cambiar hace más de 6 meses`, cuerpo: "Revisalas en Oficina → Agenda → Emails de la empresa.", link: "/oficina" });

  const revisar = await seguro(() => one<{ n: number }>(`select count(*)::int n from wiki_docs where review_by is not null and review_by <= current_date`));
  if (revisar?.n) alertas.push({ id: "instructivos-revisar", tipo: "doc", tono: "warn", titulo: `${revisar.n} instructivo${revisar.n === 1 ? "" : "s"} para revisar`, cuerpo: "Llegó la fecha de revisión: confirmá que siguen vigentes.", link: "/instructivos" });

  const instructivos = await seguro(() => one<{ n: number }>(`select count(*)::int n from wiki_docs d where not exists (select 1 from wiki_attachments a where a.doc_id = d.id)`));
  if (instructivos?.n) alertas.push({ id: "instructivos", tipo: "doc", tono: "info", titulo: `${instructivos.n} instructivo${instructivos.n === 1 ? "" : "s"} sin PDF`, cuerpo: "Cargá el documento para que se pueda consultar.", link: "/instructivos" });

  return alertas;
}
