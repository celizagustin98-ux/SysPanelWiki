// Bot Sistema: avisos programados por Telegram y respuesta a comandos del grupo del área.
// Corre dentro del servidor (como los respaldos diarios). Lee la configuración de la tabla
// `ajustes` (clave 'avisos_telegram'), que se edita en Configuración → Bot Sistema.
// Cada aviso se registra en `bot_envios` con una clave única, así nunca se manda dos veces
// lo mismo aunque haya varios servidores o se reinicie.
import { createDecipheriv, createHash } from "node:crypto";
import { disco, estadoRespaldos } from "./respaldos.mjs";

/** Mismos valores que SLA_HORAS (src/components/tickets/sla.ts): horas para resolver por prioridad. */
const SLA_RESOLUCION = { critica: 4, alta: 24, media: 72, baja: 168 };

const OPCIONES_DEFECTO = {
  hora_resumen: "08:00",
  hora_guardia: "19:30",
  solo_habiles: true,
  sin_asignar_horas: 2,
  disco_pct: 90,
  silencio_nocturno: true,
  comandos: true,
};

// ── Descifrado del token (mismo esquema que src/backend/core/crypto-secrets.ts) ──
function claves() {
  const raw = String(process.env.SECRETS_ENCRYPTION_KEY || "").trim();
  const derivada = createHash("sha256").update(`syswiki-secrets:${process.env.DATABASE_URL || "syswiki-dev-insecure-key"}`).digest();
  return raw.length >= 16 ? [createHash("sha256").update(raw).digest(), derivada] : [derivada];
}
function descifrar(valor) {
  if (!valor || !String(valor).startsWith("enc:v1:")) return String(valor || "");
  const [, , iv, tag, data] = String(valor).split(":");
  for (const k of claves()) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
    } catch {
      /* prueba con la otra clave */
    }
  }
  throw new Error("No se pudo descifrar el token del bot");
}

const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const hoyIso = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const enVentana = (ahora, hora, horas = 3) => {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  const desde = new Date(ahora);
  desde.setHours(h || 0, m || 0, 0, 0);
  return ahora >= desde && ahora - desde < horas * 3600_000;
};
const lista = (filas, fmt, max = 10) => filas.slice(0, max).map((f) => `• ${fmt(f)}`).join("\n") + (filas.length > max ? `\n… y ${filas.length - max} más` : "");

export function iniciarBot({ one, query }) {
  let cfg = null;
  let ocupado = false;
  let offset = 0;

  async function leerConfig() {
    const fila = await one(`select valor from ajustes where clave = 'avisos_telegram'`).catch(() => null);
    const v = fila?.valor;
    if (!v?.token || !v?.chat_id) return null;
    try {
      return { token: descifrar(v.token), chat: String(v.chat_id), eventos: new Set(v.eventos || []), op: { ...OPCIONES_DEFECTO, ...(v.opciones || {}) } };
    } catch (e) {
      console.error("[bot]", e.message);
      return null;
    }
  }

  async function telegram(metodo, cuerpo) {
    const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${metodo}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(10_000),
    });
    const p = await r.json().catch(() => ({}));
    if (!r.ok || p.ok === false) throw new Error(p.description || `Telegram respondió ${r.status}`);
    return p.result;
  }

  /** Claves que todavía no se avisaron (y las marca como avisadas). */
  async function nuevas(evento, claves, texto = "") {
    if (!claves.length) return [];
    const r = await query(
      `insert into bot_envios (clave, evento, texto) select unnest($1::text[]), $2, $3 on conflict (clave) do nothing returning clave`,
      [claves, evento, texto.slice(0, 500)],
    );
    return r.rows.map((x) => x.clave);
  }

  /** Manda un aviso si el evento está prendido y no se mandó antes (por su clave). Fuera de horario solo pasan los urgentes. */
  async function avisar(evento, clave, texto, { urgente = false } = {}) {
    if (!cfg.eventos.has(evento)) return false;
    const h = new Date().getHours();
    if (cfg.op.silencio_nocturno && !urgente && (h >= 22 || h < 7)) return false;
    const [ok] = await nuevas(evento, [clave], texto);
    if (!ok) return false;
    try {
      await telegram("sendMessage", { chat_id: cfg.chat, text: texto, disable_web_page_preview: true });
      await query(`update bot_envios set ok = true where clave = $1`, [clave]);
    } catch (e) {
      await query(`update bot_envios set ok = false, error = $2 where clave = $1`, [clave, String(e.message).slice(0, 300)]);
    }
    return true;
  }

  /** Avisa una sola vez por elemento, agrupando en un mensaje los que aparecen juntos. */
  async function avisarGrupo(evento, filas, clave, titulo, fmt, opciones) {
    if (!cfg.eventos.has(evento) || !filas.length) return;
    const h = new Date().getHours();
    if (cfg.op.silencio_nocturno && !opciones?.urgente && (h >= 22 || h < 7)) return;
    const nuevasClaves = new Set(await nuevas(evento, filas.map(clave)));
    const aMandar = filas.filter((f) => nuevasClaves.has(clave(f)));
    if (!aMandar.length) return;
    const texto = `${titulo(aMandar.length)}\n${lista(aMandar, fmt)}`;
    try {
      await telegram("sendMessage", { chat_id: cfg.chat, text: texto, disable_web_page_preview: true });
      await query(`update bot_envios set ok = true, texto = $2 where clave = any($1::text[])`, [[...nuevasClaves], texto.slice(0, 500)]);
    } catch (e) {
      await query(`update bot_envios set ok = false, error = $2 where clave = any($1::text[])`, [[...nuevasClaves], String(e.message).slice(0, 300)]);
    }
  }

  // ── Datos que usan varios avisos y los comandos ──
  async function resumenHoy() {
    const t = await one(
      `select count(*) filter (where estado not in ('resuelto','cerrado','cancelado'))::int abiertos,
              count(*) filter (where estado not in ('resuelto','cerrado','cancelado') and asignado_a is null)::int sin_asignar,
              count(*) filter (where estado not in ('resuelto','cerrado','cancelado') and vence_el < current_date)::int vencidos,
              count(*) filter (where estado not in ('resuelto','cerrado','cancelado') and prioridad in ('critica','alta'))::int urgentes,
              count(*) filter (where created_at >= current_date - 1 and created_at < current_date)::int ayer,
              count(*) filter (where coalesce(resuelto_en, cerrado_en) >= current_date - 1 and coalesce(resuelto_en, cerrado_en) < current_date)::int resueltos_ayer
         from tareas`,
    ).catch(() => null);
    const guardia = await one(`select operador_nombre from guardias where desde::date = current_date and coalesce(notas,'') not ilike '%vacacion%' order by desde limit 1`).catch(() => null);
    const toners = (await query(`select nombre, stock from toner_modelos where stock <= stock_minimo order by stock limit 8`).catch(() => ({ rows: [] }))).rows;
    const versiones = await one(`select count(*)::int n from sistema_actualizaciones where estado = 'pendiente'`).catch(() => null);
    const mant = await one(`select count(*)::int n from inventario where mant_proximo < current_date`).catch(() => null);
    const intercambios = await one(`select count(*)::int n from guardia_intercambios where estado = 'pendiente'`).catch(() => null);
    return { t, guardia: guardia?.operador_nombre ?? null, toners, versiones: versiones?.n ?? 0, mant: mant?.n ?? 0, intercambios: intercambios?.n ?? 0 };
  }

  function textoResumen(r, titulo) {
    const l = [titulo];
    if (r.t) {
      l.push(`🎫 Tickets abiertos: ${r.t.abiertos} (sin asignar ${r.t.sin_asignar}, urgentes ${r.t.urgentes}, vencidos ${r.t.vencidos})`);
      l.push(`   Ayer: ${r.t.ayer} nuevos · ${r.t.resueltos_ayer} resueltos`);
    }
    l.push(`🌙 Guardia de hoy: ${r.guardia ?? "sin asignar"}`);
    if (r.toners.length) l.push(`🖨️ Tóners bajo el mínimo: ${r.toners.map((x) => `${x.nombre} (${x.stock})`).join(", ")}`);
    if (r.versiones) l.push(`🆕 Versiones para subir: ${r.versiones}`);
    if (r.mant) l.push(`🛠️ Mantenimientos vencidos: ${r.mant}`);
    if (r.intercambios) l.push(`🔁 Intercambios de guardia para aprobar: ${r.intercambios}`);
    return l.join("\n");
  }

  // ── Revisión periódica ──
  async function revisar() {
    const ahora = new Date();
    const dia = hoyIso(ahora);
    const habil = ahora.getDay() !== 0 && ahora.getDay() !== 6;

    // Resumen diario (y el semanal los lunes) a la hora elegida.
    if (enVentana(ahora, cfg.op.hora_resumen) && (habil || !cfg.op.solo_habiles)) {
      if (cfg.eventos.has("resumen_diario") && !(await one(`select 1 from bot_envios where clave = $1`, [`resumen:${dia}`])))
        await avisar("resumen_diario", `resumen:${dia}`, textoResumen(await resumenHoy(), `☀️ Buen día. Resumen del ${ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}`), { urgente: true });
      if (ahora.getDay() === 1) {
        const s = await one(
          `select (select count(*) from tareas where created_at >= current_date - 7 and created_at < current_date)::int creados,
                  (select count(*) from tareas where coalesce(resuelto_en, cerrado_en) >= current_date - 7 and coalesce(resuelto_en, cerrado_en) < current_date)::int resueltos,
                  (select coalesce(sum(cantidad), 0) from toner_movimientos where tipo in ('uso','consumo','salida','reposicion') and created_at >= current_date - 7)::int toners,
                  (select count(*) from insumos_pedidos where created_at >= current_date - 7)::int pedidos,
                  (select count(*) from sistema_actualizaciones where fecha >= current_date - 7 and fecha < current_date)::int versiones,
                  (select coalesce(sum(horas), 0) from guardia_horas_extras where fecha >= current_date - 7 and fecha < current_date)::numeric horas`,
        ).catch(() => null);
        if (s)
          await avisar(
            "resumen_semanal",
            `semana:${dia}`,
            `📊 Semana pasada\n🎫 Tickets: ${s.creados} nuevos · ${s.resueltos} resueltos\n🖨️ Tóners usados: ${s.toners}\n🛒 Pedidos de compra: ${s.pedidos}\n🆕 Versiones subidas: ${s.versiones}\n⏱️ Horas extras: ${Number(s.horas).toLocaleString("es-AR")} h`,
            { urgente: true },
          );
      }
    }

    // Guardia de esta noche.
    if (enVentana(ahora, cfg.op.hora_guardia, 2)) {
      const g = await one(`select operador_nombre from guardias where desde::date = current_date and coalesce(notas,'') not ilike '%vacacion%' order by desde limit 1`).catch(() => null);
      await avisar("guardia_hoy", `guardia:${dia}`, g ? `🌙 Esta noche de guardia: ${g.operador_nombre} (20:00 a 08:00)` : "🌙 Atención: esta noche no hay nadie asignado de guardia.", { urgente: true });
    }

    // Tickets.
    const sinAsignar = (
      await query(
        `select id, numero, titulo, prioridad from tareas where asignado_a is null and estado not in ('resuelto','cerrado','cancelado')
           and created_at < now() - make_interval(hours => $1::int) order by created_at`,
        [Math.max(1, Number(cfg.op.sin_asignar_horas) || 2)],
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("ticket_sin_asignar", sinAsignar, (t) => `sinasignar:${t.id}`, (n) => `🕒 ${n} ticket${n === 1 ? "" : "s"} sin tomar hace más de ${cfg.op.sin_asignar_horas} h`, (t) => `TK-${t.numero} ${t.titulo} (${t.prioridad})`);

    const fueraSla = (
      await query(
        `select id, numero, titulo, prioridad from tareas where estado not in ('resuelto','cerrado','cancelado','esperando')
           and created_at < now() - make_interval(hours => (case prioridad when 'critica' then $1 when 'alta' then $2 when 'baja' then $4 else $3 end)::int)
         order by created_at`,
        [SLA_RESOLUCION.critica, SLA_RESOLUCION.alta, SLA_RESOLUCION.media, SLA_RESOLUCION.baja],
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("ticket_sla", fueraSla, (t) => `sla:${t.id}`, (n) => `⏰ ${n} ticket${n === 1 ? "" : "s"} pasaron su plazo de resolución (SLA)`, (t) => `TK-${t.numero} ${t.titulo} (${t.prioridad})`);

    const vencidos = (
      await query(`select id, numero, titulo, vence_el from tareas where vence_el < current_date and estado not in ('resuelto','cerrado','cancelado') order by vence_el`).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("ticket_vencido", vencidos, (t) => `vence:${t.id}:${String(t.vence_el).slice(0, 10)}`, (n) => `📅 ${n} ticket${n === 1 ? "" : "s"} con la fecha límite vencida`, (t) => `TK-${t.numero} ${t.titulo}`);

    // Stock, compras y activos.
    const toners = (await query(`select id, nombre, stock, stock_minimo from toner_modelos where stock <= stock_minimo`).catch(() => ({ rows: [] }))).rows;
    await avisarGrupo("toner_bajo", toners, (m) => `toner:${m.id}:${m.stock}`, () => "🖨️ Tóners bajo el mínimo", (m) => `${m.nombre}: quedan ${m.stock} (mínimo ${m.stock_minimo})`);

    const pedidos = (
      await query(
        `select id, numero, estado, destinatario from insumos_pedidos
          where (estado = 'aprobado' and aprobado_at > now() - interval '1 day') or (estado = 'recibido' and recibido_at > now() - interval '1 day')`,
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("pedido_estado", pedidos, (p) => `pedido:${p.id}:${p.estado}`, () => "🛒 Novedades de pedidos de compra", (p) => `SOL-${String(p.numero).padStart(4, "0")} ${p.estado === "recibido" ? "recibido completo" : "aprobado por " + p.destinatario}`);

    const mant = (await query(`select id, codigo, coalesce(nullif(descripcion,''), nombre) nombre, sector, mant_proximo from inventario where mant_proximo <= current_date order by mant_proximo`).catch(() => ({ rows: [] }))).rows;
    await avisarGrupo("mantenimiento", mant, (a) => `mant:${a.id}:${String(a.mant_proximo).slice(0, 10)}`, (n) => `🛠️ ${n} mantenimiento${n === 1 ? "" : "s"} preventivo${n === 1 ? "" : "s"} para hacer`, (a) => `${a.codigo} ${a.nombre}${a.sector ? ` · ${a.sector}` : ""}`);

    const garantias = (
      await query(`select id, codigo, coalesce(nullif(descripcion,''), nombre) nombre, garantia_hasta from inventario where garantia_hasta between current_date and current_date + 30 order by garantia_hasta`).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("garantia", garantias, (a) => `garantia:${a.id}:${String(a.garantia_hasta).slice(0, 10)}`, () => "🧾 Garantías que vencen en los próximos 30 días", (a) => `${a.codigo} ${a.nombre} (${new Date(a.garantia_hasta).toLocaleDateString("es-AR")})`);

    // Oficina y guardias.
    const sinSubir = (
      await query(`select id, sistema, version from sistema_actualizaciones where estado = 'pendiente' and coalesce(aviso_fecha, fecha) <= current_date - 2`).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("version_sin_subir", sinSubir, (v) => `versub:${v.id}`, () => "⏳ Versiones que llevan más de 2 días sin subir", (v) => `${v.sistema}${v.version ? ` v${v.version}` : ""}`);

    const intercambios = (await query(`select id, fecha, de_nombre, a_nombre from guardia_intercambios where estado = 'pendiente'`).catch(() => ({ rows: [] }))).rows;
    await avisarGrupo("intercambio_guardia", intercambios, (i) => `intercambio:${i.id}`, () => "🔁 Intercambio de guardia para aprobar", (i) => `${i.a_nombre} cubre a ${i.de_nombre} el ${new Date(i.fecha).toLocaleDateString("es-AR")}`);

    // Servidor.
    const rs = estadoRespaldos();
    const ultimo = rs.respaldos?.[0]?.fecha ? new Date(rs.respaldos[0].fecha) : null;
    if (rs.ultimoError || !ultimo || ahora - ultimo > 26 * 3600_000)
      await avisar("respaldo", `respaldo:${dia}`, `💾 Respaldo de la base: ${rs.ultimoError ? `falló (${rs.ultimoError.mensaje})` : ultimo ? `el último es de hace ${Math.round((ahora - ultimo) / 3600_000)} h` : "todavía no hay ninguno"}.`, { urgente: true });
    const d = disco();
    if (d && d.total) {
      const uso = Math.round((1 - d.libre / d.total) * 100);
      if (uso >= (Number(cfg.op.disco_pct) || 90)) await avisar("disco", `disco:${dia}`, `🧱 Disco del servidor al ${uso}% (quedan ${(d.libre / 1024 ** 3).toFixed(1)} GB).`, { urgente: true });
    }

    // Seguridad.
    const intentos = (
      await query(
        `select coalesce(detalle->>'usuario', actor_nombre) usuario, count(*)::int n from audit_log
          where accion = 'login_fallido' and created_at > now() - interval '15 minutes' group by 1 having count(*) >= 5`,
      ).catch(() => ({ rows: [] }))
    ).rows;
    for (const x of intentos) await avisar("login_fallido", `login:${x.usuario}:${dia}:${ahora.getHours()}`, `🔐 ${x.n} intentos fallidos de ingreso con el usuario «${x.usuario}» en los últimos 15 minutos.`, { urgente: true });

    const clavesRotar = (
      await query(
        `select id, servicio from credenciales where rotar_cada_dias is not null and coalesce(last_rotated_at, updated_at, created_at) < now() - rotar_cada_dias * interval '1 day'`,
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("clave_rotar", clavesRotar, (c) => `clave:${c.id}:${dia.slice(0, 7)}`, () => "🔑 Claves que toca cambiar", (c) => c.servicio);
  }

  // ── Comandos del grupo: /estado, /tickets, /guardia, /toners, /pendientes, /ayuda ──
  async function comandos() {
    const updates = await telegram("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] }).catch(() => []);
    for (const u of updates) {
      offset = u.update_id + 1;
      const msg = u.message;
      // Solo se responde en el chat configurado: nadie de afuera puede consultar datos del área.
      if (!msg?.text || String(msg.chat?.id) !== cfg.chat) continue;
      const cmd = msg.text.trim().split(/[\s@]/)[0].toLowerCase();
      let r = "";
      if (cmd === "/estado" || cmd === "/start") r = textoResumen(await resumenHoy(), "📋 Estado del área ahora");
      else if (cmd === "/tickets") {
        const filas = (
          await query(
            `select numero, titulo, prioridad, asignado_a is null sin from tareas where estado not in ('resuelto','cerrado','cancelado')
              order by case prioridad when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, created_at limit 12`,
          ).catch(() => ({ rows: [] }))
        ).rows;
        r = filas.length ? `🎫 Tickets abiertos más urgentes\n${lista(filas, (t) => `TK-${t.numero} ${t.titulo} (${t.prioridad}${t.sin ? ", sin asignar" : ""})`, 12)}` : "🎫 No hay tickets abiertos.";
      } else if (cmd === "/guardia") {
        const filas = (
          await query(`select to_char(desde::date, 'DD/MM') d, operador_nombre from guardias where desde::date >= current_date and coalesce(notas,'') not ilike '%vacacion%' order by desde limit 7`).catch(() => ({ rows: [] }))
        ).rows;
        r = filas.length ? `🌙 Próximas guardias\n${lista(filas, (g) => `${g.d}: ${g.operador_nombre}`)}` : "🌙 No hay guardias cargadas para los próximos días.";
      } else if (cmd === "/toners") {
        const filas = (await query(`select nombre, stock, stock_minimo from toner_modelos order by (stock - stock_minimo), nombre limit 12`).catch(() => ({ rows: [] }))).rows;
        r = `🖨️ Stock de tóners\n${lista(filas, (m) => `${m.nombre}: ${m.stock}${m.stock <= m.stock_minimo ? " ⚠️" : ""}`, 12)}`;
      } else if (cmd === "/pendientes") {
        const v = (await query(`select sistema, version from sistema_actualizaciones where estado = 'pendiente' order by fecha`).catch(() => ({ rows: [] }))).rows;
        const i = (await query(`select fecha, de_nombre, a_nombre from guardia_intercambios where estado = 'pendiente' order by fecha`).catch(() => ({ rows: [] }))).rows;
        r = [v.length ? `🆕 Versiones para subir\n${lista(v, (x) => `${x.sistema}${x.version ? ` v${x.version}` : ""}`)}` : "🆕 No hay versiones pendientes.", i.length ? `🔁 Intercambios para aprobar\n${lista(i, (x) => `${x.a_nombre} por ${x.de_nombre} (${new Date(x.fecha).toLocaleDateString("es-AR")})`)}` : ""]
          .filter(Boolean)
          .join("\n\n");
      } else if (cmd === "/ayuda" || cmd === "/help")
        r = "🤖 Comandos del Bot Sistema\n/estado — resumen del área ahora\n/tickets — tickets abiertos más urgentes\n/guardia — próximas guardias\n/toners — stock de tóners\n/pendientes — versiones e intercambios esperando";
      if (r) await telegram("sendMessage", { chat_id: cfg.chat, text: r, reply_to_message_id: msg.message_id }).catch(() => {});
    }
  }

  async function ciclo(soloComandos) {
    if (ocupado) return;
    ocupado = true;
    try {
      cfg = await leerConfig();
      if (!cfg) return;
      if (cfg.op.comandos) await comandos();
      if (!soloComandos) await revisar();
    } catch (e) {
      console.error("[bot]", e instanceof Error ? e.message : e);
    } finally {
      ocupado = false;
    }
  }

  // Avisos cada minuto; comandos cada 15 s para que la respuesta se sienta inmediata.
  setTimeout(() => void ciclo(false), 20_000).unref();
  setInterval(() => void ciclo(false), 60_000).unref();
  setInterval(() => void ciclo(true), 15_000).unref();
  console.log(`[bot] Bot Sistema iniciado (${hhmm(new Date())})`);
  return { ciclo };
}
