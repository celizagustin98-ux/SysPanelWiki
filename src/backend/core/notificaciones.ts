import { one, query } from "./db";

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

    if (table === "tareas") {
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

  const vencidos = await seguro(() =>
    one<{ n: number }>(
      `select count(*)::int n from tareas where asignado_a = $1 and estado not in ('resuelto','cerrado','cancelado') and vence_el < current_date`,
      [userId],
    ),
  );
  if (vencidos?.n) alertas.push({ id: "vencidos", tipo: "ticket", tono: "crit", titulo: `${vencidos.n} ticket${vencidos.n === 1 ? "" : "s"} tuyo${vencidos.n === 1 ? "" : "s"} vencido${vencidos.n === 1 ? "" : "s"}`, cuerpo: "Pasaron su fecha límite.", link: "/tareas" });

  const sinAsignar = await seguro(() => one<{ n: number; criticos: number }>(`select count(*)::int n, count(*) filter (where prioridad in ('critica','alta'))::int criticos from tareas where asignado_a is null and estado not in ('resuelto','cerrado','cancelado')`));
  if (sinAsignar?.criticos) alertas.push({ id: "sin-asignar", tipo: "ticket", tono: "warn", titulo: `${sinAsignar.criticos} ticket${sinAsignar.criticos === 1 ? "" : "s"} urgente${sinAsignar.criticos === 1 ? "" : "s"} sin asignar`, cuerpo: `${sinAsignar.n} en total esperan a alguien.`, link: "/tareas" });

  const reparaciones = await seguro(() => one<{ n: number }>(`select count(*)::int n from inventario_reparaciones where fecha_fin is null and fecha_inicio < current_date - 7`));
  if (reparaciones?.n) alertas.push({ id: "reparaciones", tipo: "activo", tono: "warn", titulo: `${reparaciones.n} reparación${reparaciones.n === 1 ? "" : "es"} abierta${reparaciones.n === 1 ? "" : "s"} hace más de 7 días`, cuerpo: "Revisá el estado con el servicio técnico.", link: "/inventario" });

  const garantias = await seguro(() => one<{ n: number }>(`select count(*)::int n from inventario where garantia_hasta between current_date and current_date + 30 and estado <> 'baja'`));
  if (garantias?.n) alertas.push({ id: "garantias", tipo: "activo", tono: "info", titulo: `${garantias.n} garantía${garantias.n === 1 ? "" : "s"} vence${garantias.n === 1 ? "" : "n"} este mes`, cuerpo: "Equipos con garantía en los próximos 30 días.", link: "/inventario" });

  const instructivos = await seguro(() => one<{ n: number }>(`select count(*)::int n from wiki_docs d where not exists (select 1 from wiki_attachments a where a.doc_id = d.id)`));
  if (instructivos?.n) alertas.push({ id: "instructivos", tipo: "doc", tono: "info", titulo: `${instructivos.n} instructivo${instructivos.n === 1 ? "" : "s"} sin PDF`, cuerpo: "Cargá el documento para que se pueda consultar.", link: "/instructivos" });

  return alertas;
}
