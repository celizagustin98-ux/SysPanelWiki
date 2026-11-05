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
// Formato de los mensajes: HTML de Telegram (negrita, cursiva). Todo dato que viene de la base se escapa.
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sinHtml = (t) => String(t).replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const SEP = "\n\n";
/** Bloque de un tema: título en negrita y sus renglones con sangría. */
const bloque = (icono, titulo, renglones) => [`${icono} <b>${esc(titulo)}</b>`, ...renglones.filter(Boolean).map((r) => `   ${r}`)].join("\n");
/** Lista con viñetas, hasta `max` elementos (el resto se resume en una línea). */
const lista = (filas, fmt, max = 10) => {
  const items = filas.slice(0, max).map((f) => `• ${fmt(f)}`);
  // Si cada elemento tiene detalle (dos renglones), se separan con una línea en blanco para que no se mezclen.
  const sep = items.some((i) => i.includes("\n")) ? "\n\n" : "\n";
  return items.join(sep) + (filas.length > max ? `${sep}<i>… y ${filas.length - max} más</i>` : "");
};
const ticket = (t) => `<b>TK-${esc(t.numero)}</b> ${esc(t.titulo)}`;
const PRIORIDAD = { critica: "🔴 crítica", alta: "🟠 alta", media: "🟡 media", baja: "⚪ baja" };
const pie = () => `${SEP}<i>Nodara · ${new Date().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23" })}</i>`;

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
      body: JSON.stringify(metodo === "sendMessage" ? { parse_mode: "HTML", disable_web_page_preview: true, ...cuerpo } : cuerpo),
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
      [claves, evento, sinHtml(texto).slice(0, 500)],
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
      await telegram("sendMessage", { chat_id: cfg.chat, text: texto + pie() });
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
    const texto = `${titulo(aMandar.length)}${SEP}${lista(aMandar, fmt)}`;
    try {
      await telegram("sendMessage", { chat_id: cfg.chat, text: texto + pie() });
      await query(`update bot_envios set ok = true, texto = $2 where clave = any($1::text[])`, [[...nuevasClaves], sinHtml(texto).slice(0, 500)]);
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
    const partes = [`<b>${esc(titulo)}</b>`];
    if (r.t)
      partes.push(
        bloque("🎫", "Tickets", [
          `Abiertos: <b>${r.t.abiertos}</b>`,
          `Sin asignar: <b>${r.t.sin_asignar}</b>`,
          `Urgentes: <b>${r.t.urgentes}</b>`,
          `Vencidos: <b>${r.t.vencidos}</b>`,
          `<i>Ayer: ${r.t.ayer} nuevos · ${r.t.resueltos_ayer} resueltos</i>`,
        ]),
      );
    partes.push(bloque("🌙", "Guardia de hoy", [r.guardia ? esc(r.guardia) : "⚠️ Sin asignar"]));
    if (r.toners.length) partes.push(bloque("🖨️", "Tóners bajo el mínimo", r.toners.map((x) => `• ${esc(x.nombre)} — quedan <b>${x.stock}</b>`)));
    const pendientes = [
      r.versiones && `🆕 Versiones para subir: <b>${r.versiones}</b>`,
      r.mant && `🛠️ Mantenimientos vencidos: <b>${r.mant}</b>`,
      r.intercambios && `🔁 Intercambios para aprobar: <b>${r.intercambios}</b>`,
    ].filter(Boolean);
    if (pendientes.length) partes.push(`📌 <b>Pendientes</b>\n${pendientes.map((p) => `   ${p}`).join("\n")}`);
    return partes.join(SEP);
  }

  // ── Revisión periódica ──
  async function revisar() {
    const ahora = new Date();
    const dia = hoyIso(ahora);
    const habil = ahora.getDay() !== 0 && ahora.getDay() !== 6;

    // Resumen diario (y el semanal los lunes) a la hora elegida.
    if (enVentana(ahora, cfg.op.hora_resumen) && (habil || !cfg.op.solo_habiles)) {
      if (cfg.eventos.has("resumen_diario") && !(await one(`select 1 from bot_envios where clave = $1`, [`resumen:${dia}`])))
        await avisar("resumen_diario", `resumen:${dia}`, textoResumen(await resumenHoy(), `☀️ Buen día · ${ahora.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}`), { urgente: true });
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
            [
              "📊 <b>Resumen de la semana pasada</b>",
              bloque("🎫", "Tickets", [`Nuevos: <b>${s.creados}</b>`, `Resueltos: <b>${s.resueltos}</b>`]),
              bloque("🖨️", "Tóners", [`Usados: <b>${s.toners}</b>`]),
              bloque("🛒", "Compras", [`Pedidos: <b>${s.pedidos}</b>`]),
              bloque("🆕", "Sistemas", [`Versiones subidas: <b>${s.versiones}</b>`]),
              bloque("⏱️", "Horas extras", [`<b>${Number(s.horas).toLocaleString("es-AR")} h</b>`]),
            ].join(SEP),
            { urgente: true },
          );
      }
    }

    // Guardia de esta noche.
    if (enVentana(ahora, cfg.op.hora_guardia, 2)) {
      const g = await one(`select operador_nombre from guardias where desde::date = current_date and coalesce(notas,'') not ilike '%vacacion%' order by desde limit 1`).catch(() => null);
      await avisar("guardia_hoy", `guardia:${dia}`, g ? `🌙 <b>Guardia de esta noche</b>${SEP}   👤 <b>${esc(g.operador_nombre)}</b>\n   🕗 20:00 a 08:00` : `⚠️ <b>Guardia de esta noche</b>${SEP}   No hay nadie asignado.`, { urgente: true });
    }

    // Tickets.
    const sinAsignar = (
      await query(
        `select id, numero, titulo, prioridad from tareas where asignado_a is null and estado not in ('resuelto','cerrado','cancelado')
           and created_at < now() - make_interval(hours => $1::int) order by created_at`,
        [Math.max(1, Number(cfg.op.sin_asignar_horas) || 2)],
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("ticket_sin_asignar", sinAsignar, (t) => `sinasignar:${t.id}`, (n) => `🕒 <b>${n} ticket${n === 1 ? "" : "s"} sin tomar</b>\n<i>Hace más de ${cfg.op.sin_asignar_horas} h sin responsable</i>`, (t) => `${ticket(t)}\n   ${PRIORIDAD[t.prioridad] ?? esc(t.prioridad)}`);

    const fueraSla = (
      await query(
        `select id, numero, titulo, prioridad from tareas where estado not in ('resuelto','cerrado','cancelado','esperando')
           and created_at < now() - make_interval(hours => (case prioridad when 'critica' then $1 when 'alta' then $2 when 'baja' then $4 else $3 end)::int)
         order by created_at`,
        [SLA_RESOLUCION.critica, SLA_RESOLUCION.alta, SLA_RESOLUCION.media, SLA_RESOLUCION.baja],
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("ticket_sla", fueraSla, (t) => `sla:${t.id}`, (n) => `⏰ <b>${n} ticket${n === 1 ? "" : "s"} fuera de SLA</b>\n<i>Pasaron el plazo de resolución de su prioridad</i>`, (t) => `${ticket(t)}\n   ${PRIORIDAD[t.prioridad] ?? esc(t.prioridad)}`);

    const vencidos = (
      await query(`select id, numero, titulo, vence_el from tareas where vence_el < current_date and estado not in ('resuelto','cerrado','cancelado') order by vence_el`).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("ticket_vencido", vencidos, (t) => `vence:${t.id}:${String(t.vence_el).slice(0, 10)}`, (n) => `📅 <b>${n} ticket${n === 1 ? "" : "s"} con la fecha límite vencida</b>`, (t) => `${ticket(t)}\n   Vencía el ${new Date(t.vence_el).toLocaleDateString("es-AR")}`);

    // Stock, compras y activos.
    const toners = (await query(`select id, nombre, stock, stock_minimo from toner_modelos where stock <= stock_minimo`).catch(() => ({ rows: [] }))).rows;
    await avisarGrupo("toner_bajo", toners, (m) => `toner:${m.id}:${m.stock}`, () => "🖨️ <b>Tóners bajo el mínimo</b>", (m) => `<b>${esc(m.nombre)}</b>\n   Quedan ${m.stock} · mínimo ${m.stock_minimo}`);

    const pedidos = (
      await query(
        `select id, numero, estado, destinatario from insumos_pedidos
          where (estado = 'aprobado' and aprobado_at > now() - interval '1 day') or (estado = 'recibido' and recibido_at > now() - interval '1 day')`,
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("pedido_estado", pedidos, (p) => `pedido:${p.id}:${p.estado}`, () => "🛒 <b>Novedades de pedidos de compra</b>", (p) => `<b>SOL-${String(p.numero).padStart(4, "0")}</b>\n   ${p.estado === "recibido" ? "✅ Recibido completo" : `👍 Aprobado por ${esc(p.destinatario)}`}`);

    const mant = (await query(`select id, codigo, coalesce(nullif(descripcion,''), nombre) nombre, sector, mant_proximo from inventario where mant_proximo <= current_date order by mant_proximo`).catch(() => ({ rows: [] }))).rows;
    await avisarGrupo("mantenimiento", mant, (a) => `mant:${a.id}:${String(a.mant_proximo).slice(0, 10)}`, (n) => `🛠️ <b>${n} mantenimiento${n === 1 ? "" : "s"} preventivo${n === 1 ? "" : "s"} para hacer</b>`, (a) => `<b>${esc(a.codigo)}</b> ${esc(a.nombre)}${a.sector ? `\n   📍 ${esc(a.sector)}` : ""}`);

    const garantias = (
      await query(`select id, codigo, coalesce(nullif(descripcion,''), nombre) nombre, garantia_hasta from inventario where garantia_hasta between current_date and current_date + 30 order by garantia_hasta`).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("garantia", garantias, (a) => `garantia:${a.id}:${String(a.garantia_hasta).slice(0, 10)}`, () => "🧾 <b>Garantías que vencen en 30 días</b>", (a) => `<b>${esc(a.codigo)}</b> ${esc(a.nombre)}\n   Vence el ${new Date(a.garantia_hasta).toLocaleDateString("es-AR")}`);

    // Oficina y guardias.
    const sinSubir = (
      await query(`select id, sistema, version from sistema_actualizaciones where estado = 'pendiente' and coalesce(aviso_fecha, fecha) <= current_date - 2`).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("version_sin_subir", sinSubir, (v) => `versub:${v.id}`, () => "⏳ <b>Versiones sin subir hace más de 2 días</b>", (v) => `<b>${esc(v.sistema)}</b>${v.version ? ` v${esc(v.version)}` : ""}`);

    const intercambios = (await query(`select id, fecha, de_nombre, a_nombre from guardia_intercambios where estado = 'pendiente'`).catch(() => ({ rows: [] }))).rows;
    await avisarGrupo("intercambio_guardia", intercambios, (i) => `intercambio:${i.id}`, () => "🔁 <b>Intercambio de guardia para aprobar</b>", (i) => `<b>${esc(i.a_nombre)}</b> cubre a <b>${esc(i.de_nombre)}</b>\n   📅 ${new Date(i.fecha).toLocaleDateString("es-AR")}`);

    // Servidor.
    const rs = estadoRespaldos();
    const ultimo = rs.respaldos?.[0]?.fecha ? new Date(rs.respaldos[0].fecha) : null;
    if (rs.ultimoError || !ultimo || ahora - ultimo > 26 * 3600_000)
      await avisar("respaldo", `respaldo:${dia}`, `💾 <b>Respaldo de la base</b>${SEP}   ${rs.ultimoError ? `❌ Falló: ${esc(rs.ultimoError.mensaje)}` : ultimo ? `⚠️ El último es de hace ${Math.round((ahora - ultimo) / 3600_000)} h` : "⚠️ Todavía no hay ninguno"}`, { urgente: true });
    const d = disco();
    if (d && d.total) {
      const uso = Math.round((1 - d.libre / d.total) * 100);
      if (uso >= (Number(cfg.op.disco_pct) || 90)) await avisar("disco", `disco:${dia}`, `🧱 <b>Disco del servidor casi lleno</b>${SEP}   Uso: <b>${uso}%</b>\n   Libre: ${(d.libre / 1024 ** 3).toFixed(1)} GB`, { urgente: true });
    }

    // Seguridad.
    const intentos = (
      await query(
        `select coalesce(detalle->>'usuario', actor_nombre) usuario, count(*)::int n from audit_log
          where accion = 'login_fallido' and created_at > now() - interval '15 minutes' group by 1 having count(*) >= 5`,
      ).catch(() => ({ rows: [] }))
    ).rows;
    for (const x of intentos) await avisar("login_fallido", `login:${x.usuario}:${dia}:${ahora.getHours()}`, `🔐 <b>Intentos de ingreso fallidos</b>${SEP}   Usuario: <b>${esc(x.usuario)}</b>\n   ${x.n} intentos en los últimos 15 minutos`, { urgente: true });

    const clavesRotar = (
      await query(
        `select id, servicio from credenciales where rotar_cada_dias is not null and coalesce(last_rotated_at, updated_at, created_at) < now() - rotar_cada_dias * interval '1 day'`,
      ).catch(() => ({ rows: [] }))
    ).rows;
    await avisarGrupo("clave_rotar", clavesRotar, (c) => `clave:${c.id}:${dia.slice(0, 7)}`, () => "🔑 <b>Claves que toca cambiar</b>", (c) => esc(c.servicio));
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
      if (cmd === "/estado" || cmd === "/start") r = textoResumen(await resumenHoy(), "📋 Estado del área");
      else if (cmd === "/tickets") {
        const filas = (
          await query(
            `select numero, titulo, prioridad, asignado_a is null sin from tareas where estado not in ('resuelto','cerrado','cancelado')
              order by case prioridad when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end, created_at limit 12`,
          ).catch(() => ({ rows: [] }))
        ).rows;
        r = filas.length
          ? `🎫 <b>Tickets abiertos más urgentes</b>${SEP}${lista(filas, (t) => `${ticket(t)}\n   ${PRIORIDAD[t.prioridad] ?? esc(t.prioridad)}${t.sin ? " · sin asignar" : ""}`, 12)}`
          : "🎫 No hay tickets abiertos.";
      } else if (cmd === "/guardia") {
        const filas = (
          await query(`select to_char(desde::date, 'DD/MM') d, operador_nombre from guardias where desde::date >= current_date and coalesce(notas,'') not ilike '%vacacion%' order by desde limit 7`).catch(() => ({ rows: [] }))
        ).rows;
        r = filas.length ? `🌙 <b>Próximas guardias</b>${SEP}${lista(filas, (g) => `<b>${g.d}</b> · ${esc(g.operador_nombre)}`)}` : "🌙 No hay guardias cargadas para los próximos días.";
      } else if (cmd === "/toners") {
        const filas = (await query(`select nombre, stock, stock_minimo from toner_modelos order by (stock - stock_minimo), nombre limit 12`).catch(() => ({ rows: [] }))).rows;
        r = `🖨️ <b>Stock de tóners</b>${SEP}${lista(filas, (m) => `${m.stock <= m.stock_minimo ? "⚠️" : "✅"} ${esc(m.nombre)}: <b>${m.stock}</b>`, 12)}`;
      } else if (cmd === "/pendientes") {
        const v = (await query(`select sistema, version from sistema_actualizaciones where estado = 'pendiente' order by fecha`).catch(() => ({ rows: [] }))).rows;
        const i = (await query(`select fecha, de_nombre, a_nombre from guardia_intercambios where estado = 'pendiente' order by fecha`).catch(() => ({ rows: [] }))).rows;
        r = [
          v.length ? `🆕 <b>Versiones para subir</b>\n${lista(v, (x) => `<b>${esc(x.sistema)}</b>${x.version ? ` v${esc(x.version)}` : ""}`)}` : "🆕 No hay versiones pendientes.",
          i.length ? `🔁 <b>Intercambios para aprobar</b>\n${lista(i, (x) => `${esc(x.a_nombre)} por ${esc(x.de_nombre)} · ${new Date(x.fecha).toLocaleDateString("es-AR")}`)}` : "",
        ]
          .filter(Boolean)
          .join(SEP);
      } else if (cmd === "/ayuda" || cmd === "/help")
        r = [
          "🤖 <b>Comandos del Bot Sistema</b>",
          ["/estado — resumen del área ahora", "/tickets — tickets abiertos más urgentes", "/guardia — próximas guardias", "/toners — stock de tóners", "/pendientes — versiones e intercambios esperando"].join("\n"),
        ].join(SEP);
      if (r) await telegram("sendMessage", { chat_id: cfg.chat, text: r + pie(), reply_to_message_id: msg.message_id }).catch(() => {});
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
