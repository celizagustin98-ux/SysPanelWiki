import { createServerFn } from "@tanstack/react-start";
import { randomUUID } from "node:crypto";
import {
  assertAdmin,
  assertCanWrite,
  cleanIdentifier,
  createSession,
  deleteSession,
  getSession,
  hashPassword,
  hasModulePermission,
  invalidateAuthCache,
  invalidatePermissionCache,
  one,
  query,
  readFileAsDataUrl,
  removeFile,
  requireSession,
  saveFile,
  verifyPassword,
} from "@/backend/core/db";
import { decryptSecret, encryptSecret, maskCredentialRow } from "@/backend/core/crypto-secrets";

type Filter = { column: string; op: "eq" | "neq" | "gte" | "lte"; value: unknown };
type Order = { column: string; ascending?: boolean };
type SelectInput = {
  token?: string | null;
  table: string;
  columns?: string;
  filters?: Filter[];
  order?: Order[];
  limit?: number;
  maybeSingle?: boolean;
  count?: "exact";
  head?: boolean;
};
type MutateInput = {
  token?: string | null;
  table: string;
  action: "insert" | "update" | "delete";
  values?: Record<string, unknown> | Record<string, unknown>[];
  filters?: Filter[];
};

const TABLES = new Set([
  "app_settings",
  "audit_log",
  "credenciales",
  "guardia_operarios",
  "guardias",
  "inventario",
  "inventario_asignaciones",
  "inventario_controles",
  "inventario_reparaciones",
  "oficina_telefonos",
  "profiles",
  "role_permissions",
  "tarea_comentarios",
  "tarea_instructivos",
  "tarea_subtareas",
  "tareas",
  "toner_modelos",
  "toner_movimientos",
  "toner_pedido_items",
  "toner_pedidos",
  "toner_unidades",
  "user_roles",
  "wiki_attachments",
  "wiki_doc_revisions",
  "wiki_docs",
  "wiki_folders",
]);

const WRITABLE_BY_TECH = new Set([
  "guardia_operarios",
  "guardias",
  "inventario",
  "inventario_asignaciones",
  "inventario_controles",
  "inventario_reparaciones",
  "oficina_telefonos",
  "tarea_comentarios",
  "tarea_instructivos",
  "tarea_subtareas",
  "tareas",
  "toner_modelos",
  "toner_movimientos",
  "toner_pedido_items",
  "toner_pedidos",
  "toner_unidades",
  "wiki_attachments",
  "wiki_docs",
  "wiki_folders",
]);

const AUDIT_META: Record<string, { modulo: string; fields: string[] }> = {
  app_settings: { modulo: "configuracion", fields: ["version_actual"] },
  credenciales: { modulo: "credenciales", fields: ["servicio", "usuario", "ip", "url"] },
  guardia_operarios: { modulo: "guardias", fields: ["nombre", "code"] },
  guardias: { modulo: "guardias", fields: ["operador_nombre", "desde", "hasta"] },
  inventario: { modulo: "inventario", fields: ["planta", "sector", "descripcion", "numero_serie"] },
  inventario_controles: { modulo: "inventario", fields: ["fecha_control", "estado", "observacion"] },
  inventario_reparaciones: { modulo: "inventario", fields: ["titulo", "proveedor", "fecha_inicio"] },
  inventario_asignaciones: { modulo: "inventario", fields: ["asignado_a", "sector"] },
  oficina_telefonos: { modulo: "oficina", fields: ["sector", "nombre", "interno"] },
  profiles: { modulo: "usuarios", fields: ["full_name", "email", "username"] },
  role_permissions: { modulo: "roles", fields: ["role", "modulo"] },
  tareas: { modulo: "tareas", fields: ["numero", "titulo", "estado", "prioridad"] },
  tarea_comentarios: { modulo: "tareas", fields: ["contenido"] },
  tarea_instructivos: { modulo: "tareas", fields: ["tarea_id", "doc_id"] },
  tarea_subtareas: { modulo: "tareas", fields: ["titulo"] },
  toner_modelos: { modulo: "toners", fields: ["nombre", "marca", "prefijo"] },
  toner_movimientos: { modulo: "toners", fields: ["tipo", "cantidad", "responsable", "sector", "toner_entra"] },
  toner_unidades: { modulo: "toners", fields: ["codigo", "estado"] },
  toner_pedidos: { modulo: "toners", fields: ["numero", "estado", "proveedor"] },
  toner_pedido_items: { modulo: "toners", fields: ["pedido_id", "modelo_id", "cantidad"] },
  user_roles: { modulo: "usuarios", fields: ["user_id", "role"] },
  wiki_attachments: { modulo: "instructivos", fields: ["file_name", "doc_id"] },
  wiki_docs: { modulo: "instructivos", fields: ["title"] },
  wiki_folders: { modulo: "instructivos", fields: ["name"] },
  wiki_doc_revisions: { modulo: "instructivos", fields: ["title"] },
};

function tableName(table: string) {
  cleanIdentifier(table);
  if (!TABLES.has(table)) throw new Error("Tabla no permitida");
  return table;
}

function parseColumns(columns = "*") {
  if (columns.includes("(")) return "*";
  if (columns.trim() === "*") return "*";
  return columns.split(",").map((c) => cleanIdentifier(c.trim())).join(", ");
}

function appendFilters(filters: Filter[] | undefined, values: unknown[]) {
  const clauses: string[] = [];
  for (const f of filters ?? []) {
    const column = cleanIdentifier(f.column);
    values.push(f.value);
    const op = f.op === "neq" ? "<>" : f.op === "gte" ? ">=" : f.op === "lte" ? "<=" : "=";
    clauses.push(`${column} ${op} $${values.length}`);
  }
  return clauses.length ? ` where ${clauses.join(" and ")}` : "";
}

function appendOrder(order: Order[] | undefined) {
  if (!order?.length) return "";
  return ` order by ${order.map((o) => `${cleanIdentifier(o.column)} ${o.ascending === false ? "desc" : "asc"}`).join(", ")}`;
}

function rowDescription(table: string, row: Record<string, unknown>) {
  const meta = AUDIT_META[table];
  const parts = (meta?.fields ?? ["id"]).map((field) => row[field]).filter((value) => value !== null && value !== undefined && String(value).trim() !== "").map((value) => String(value));
  return parts.slice(0, 3).join(" - ") || String(row.id ?? "");
}

async function writeAudit(
  actorId: string,
  table: string,
  accion: "crear" | "editar" | "eliminar" | "asignar_rol" | "revelar" | "login" | "login_fallido",
  rows: Record<string, unknown>[],
  detalle: Record<string, unknown> = {},
  moduloOverride?: string,
) {
  const meta = AUDIT_META[table];
  const modulo = moduloOverride || meta?.modulo;
  if (!modulo || rows.length === 0) return;
  const actor = await one<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [actorId]);
  // Un solo insert para todas las filas (antes era una consulta por fila, en secuencia).
  const values: unknown[] = [];
  const tuples = rows.slice(0, 50).map((row) => {
    values.push(actorId, actor?.full_name ?? String(detalle.actor_nombre ?? ""), actor?.email ?? String(detalle.actor_email ?? ""), modulo, accion, row.id ? String(row.id) : null, rowDescription(table, row) || String(detalle.entidad_desc ?? ""), JSON.stringify({ tabla: table, ...detalle }));
    const n = values.length;
    return `($${n - 7}, $${n - 6}, $${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n}::jsonb)`;
  });
  await query(
    `insert into audit_log (actor_id, actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle) values ${tuples.join(", ")}`,
    values,
  );
}

function prepareCredentialPayload(payload: Record<string, unknown>) {
  const next = { ...payload };
  if ("secreto" in next) next.secreto = encryptSecret(next.secreto as string | null | undefined);
  return next;
}

async function snapshotWikiDoc(sessionUserId: string, filters: Filter[] | undefined) {
  const values: unknown[] = [];
  const where = appendFilters(filters, values);
  if (!where) return;
  const current = await query<Record<string, unknown>>(`select * from wiki_docs${where}`, values);
  if (!current.rows.length) return;
  const actor = await one<{ full_name: string }>(`select full_name from profiles where id = $1`, [sessionUserId]);
  for (const doc of current.rows) {
    try {
      await query(`insert into wiki_doc_revisions (doc_id, title, content, tags, created_by, created_by_nombre) values ($1, $2, $3, $4, $5, $6)`, [doc.id, doc.title, doc.content ?? "", doc.tags ?? [], sessionUserId, actor?.full_name ?? ""]);
    } catch {
      /* migration may not be applied yet */
    }
  }
}

async function assignTicketNumero(row: Record<string, unknown>) {
  const next = { ...row };
  if (next.numero == null) {
    try {
      const seq = await one<{ n: number }>(`select nextval('ticket_numero_seq')::int as n`);
      next.numero = seq?.n ?? null;
    } catch {
      try {
        const max = await one<{ n: number }>(`select coalesce(max(numero), 1000)::int + 1 as n from tareas`);
        next.numero = max?.n ?? 1001;
      } catch {
        /* column may not exist until migration */
      }
    }
  }
  if (!next.estado) next.estado = "nuevo";
  if (!next.tipo) next.tipo = "pedido";
  return next;
}

async function assertWriteAccess(userId: string, table: string) {
  if (["app_settings", "role_permissions", "user_roles", "profiles"].includes(table)) {
    await assertAdmin(userId);
    return;
  }
  if (table === "credenciales") {
    await assertCanWrite(userId);
    return;
  }
  if (table === "wiki_doc_revisions") {
    await assertAdmin(userId);
    return;
  }
  if (WRITABLE_BY_TECH.has(table)) {
    await assertCanWrite(userId);
    return;
  }
  await assertAdmin(userId);
}

function filterValue(filters: Filter[] | undefined, column: string) {
  return filters?.find((filter) => filter.op === "eq" && filter.column === column)?.value;
}

async function assertReadAccess(userId: string, table: string, filters: Filter[] | undefined) {
  if (["audit_log", "app_settings"].includes(table)) {
    await assertAdmin(userId);
    return;
  }
  if (table === "credenciales") {
    await assertCanWrite(userId);
    return;
  }
  if (table === "wiki_doc_revisions") return;
  if (table === "profiles") {
    const requestedId = filterValue(filters, "id");
    if (requestedId && requestedId !== userId) await assertAdmin(userId);
    return;
  }
  if (table === "user_roles") {
    const requestedUserId = filterValue(filters, "user_id");
    if (requestedUserId !== userId) await assertAdmin(userId);
    return;
  }
}

function withJoinedModels(table: string, rows: any[]) {
  return async () => {
    if (!["toner_movimientos", "toner_unidades", "toner_pedido_items"].includes(table) || rows.length === 0) return rows;
    const ids = [...new Set(rows.map((r) => r.modelo_id).filter(Boolean))];
    if (ids.length === 0) return rows;
    const models = await query<{ id: string; nombre: string }>(`select id, nombre from toner_modelos where id = any($1::uuid[])`, [ids]);
    const byId = new Map(models.rows.map((m) => [m.id, { nombre: m.nombre }]));
    return rows.map((r) => ({ ...r, toner_modelos: byId.get(r.modelo_id) ?? null }));
  };
}

function sanitizeRows(table: string, rows: any[]) {
  if (table !== "credenciales") return rows;
  return rows.map((row) => maskCredentialRow(row));
}

export const apiSelect = createServerFn({ method: "POST" })
  .validator((data: SelectInput) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    const table = tableName(data.table);
    await assertReadAccess(session.user.id, table, data.filters);
    const values: unknown[] = [];
    const where = appendFilters(data.filters, values);
    if (data.count === "exact" && data.head) {
      const result = await query<{ count: string }>(`select count(*)::text as count from ${table}${where}`, values);
      return { data: null, count: Number(result.rows[0]?.count ?? 0), error: null };
    }
    const cols = parseColumns(data.columns);
    let sql = `select ${cols} from ${table}${where}${appendOrder(data.order)}`;
    if (data.limit) {
      values.push(data.limit);
      sql += ` limit $${values.length}`;
    }
    const result = await query(sql, values);
    const rows = sanitizeRows(table, await withJoinedModels(table, result.rows)());
    return { data: data.maybeSingle ? (rows[0] ?? null) : rows, count: null, error: null };
  });

export const apiMutate = createServerFn({ method: "POST" })
  .validator((data: MutateInput) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    const table = tableName(data.table);
    await assertWriteAccess(session.user.id, table);
    if ((data.action === "update" || data.action === "delete") && !data.filters?.length) {
      throw new Error("Operación bloqueada: falta indicar qué registros modificar");
    }
    if (table === "role_permissions") invalidatePermissionCache();
    if (table === "user_roles" || table === "profiles") invalidateAuthCache();
    const values: unknown[] = [];
    const where = appendFilters(data.filters, values);

    if (data.action === "delete") {
      const before = await query<Record<string, unknown>>(`select * from ${table}${where}`, values);
      if (table === "inventario" && before.rows.length > 0) {
        const ids = before.rows.map((row) => row.id).filter(Boolean).map(String);
        if (ids.length > 0) await query(`delete from inventario_controles where inventario_id = any($1::uuid[])`, [ids]);
      }
      if (table === "toner_pedidos" && before.rows.length > 0) {
        const ids = before.rows.map((row) => row.id).filter(Boolean).map(String);
        if (ids.length > 0) await query(`delete from toner_pedido_items where pedido_id = any($1::uuid[])`, [ids]);
      }
      await query(`delete from ${table}${where}`, values);
      await writeAudit(session.user.id, table, "eliminar", before.rows);
      return { data: null, error: null };
    }

    if (data.action === "update") {
      let payload = data.values as Record<string, unknown>;
      if (table === "credenciales") payload = prepareCredentialPayload(payload);
      if (table === "wiki_docs") await snapshotWikiDoc(session.user.id, data.filters);
      const assignments = Object.keys(payload).map((key) => {
        values.push(payload[key]);
        return `${cleanIdentifier(key)} = $${values.length}`;
      });
      if (assignments.length === 0) throw new Error("Sin datos para actualizar");
      const result = await query<Record<string, unknown>>(`update ${table} set ${assignments.join(", ")}${where} returning *`, values);
      await writeAudit(session.user.id, table, "editar", result.rows, { campos: Object.keys(payload).filter((k) => k !== "secreto") });
      return { data: null, count: result.rowCount ?? 0, error: null };
    }

    let rows = Array.isArray(data.values) ? data.values : [data.values as Record<string, unknown>];
    if (!rows.length || !rows[0]) throw new Error("Sin datos para insertar");
    if (table === "credenciales") rows = rows.map((row) => prepareCredentialPayload(row));
    if (table === "tareas") {
      const prepared: Record<string, unknown>[] = [];
      for (const row of rows) prepared.push(await assignTicketNumero(row));
      rows = prepared;
    }
    const cols = Object.keys(rows[0]).map(cleanIdentifier);
    const placeholders = rows.map((row) => {
      const parts = cols.map((col) => {
        values.push(row[col]);
        return `$${values.length}`;
      });
      return `(${parts.join(", ")})`;
    });
    const result = await query(`insert into ${table} (${cols.join(", ")}) values ${placeholders.join(", ")} returning *`, values);
    await writeAudit(session.user.id, table, "crear", result.rows);
    const out = sanitizeRows(table, result.rows);
    return { data: out.length === 1 ? out[0] : out, error: null };
  });

export const apiRpc = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; name: string; args?: Record<string, any> }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    if (data.name === "has_role") {
      const row = await one<{ ok: boolean }>(`select exists(select 1 from user_roles where user_id = $1 and role = $2) as ok`, [data.args?._user_id, data.args?._role]);
      return { data: !!row?.ok, error: null };
    }
    if (data.name === "directorio_usuarios") {
      const result = await query(`select p.id, p.full_name, p.email, p.username, ur.role from profiles p left join lateral (select role from user_roles where user_id = p.id order by case role when 'administrador' then 1 when 'tecnico' then 2 else 3 end limit 1) ur on true order by p.full_name`);
      return { data: result.rows, error: null };
    }
    if (data.name === "audit_actores") {
      const result = await query(`select id as actor_id, full_name as actor_nombre, email as actor_email from profiles order by full_name`);
      return { data: result.rows, error: null };
    }
    if (data.name === "revelar_credencial") {
      await assertCanWrite(session.user.id);
      const id = String(data.args?._id ?? "");
      if (!id) throw new Error("Falta el id de credencial");
      const row = await one<Record<string, unknown>>(`select * from credenciales where id = $1`, [id]);
      if (!row) throw new Error("Credencial inexistente");
      const secreto = decryptSecret(row.secreto as string | null);
      try { await query(`update credenciales set last_revealed_at = now() where id = $1`, [id]); } catch { /* optional col */ }
      await writeAudit(session.user.id, "credenciales", "revelar", [row], { via: String(data.args?._via ?? "ui") });
      return { data: { id: row.id, servicio: row.servicio, usuario: row.usuario, secreto }, error: null };
    }
    if (data.name === "registrar_vista_instructivo") {
      const id = String(data.args?._id ?? "");
      if (id) await query(`update wiki_docs set views = views + 1 where id = $1`, [id]);
      return { data: null, error: null };
    }
    if (data.name === "buscar_instructivos") {
      const term = String(data.args?._q ?? "").trim();
      if (!term) return { data: [], error: null };
      const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
      const result = await query(`select id, folder_id, title, tags, views, updated_at from wiki_docs where title ilike $1 or content ilike $1 or array_to_string(tags, ' ') ilike $1 order by updated_at desc limit 50`, [like]);
      return { data: result.rows, error: null };
    }
    if (data.name === "set_user_role") {
      await assertAdmin(session.user.id);
      if (data.args?._user_id === session.user.id && data.args?._role !== "administrador") throw new Error("No podés quitarte tu propio rol de administrador");
      if (!["administrador", "tecnico", "consulta"].includes(String(data.args?._role))) throw new Error("Rol inválido");
      await query(`delete from user_roles where user_id = $1`, [data.args?._user_id]);
      await query(`insert into user_roles (user_id, role) values ($1, $2)`, [data.args?._user_id, data.args?._role]);
      invalidateAuthCache(String(data.args?._user_id));
      await writeAudit(session.user.id, "user_roles", "asignar_rol", [{ id: data.args?._user_id, user_id: data.args?._user_id, role: data.args?._role }], { rol: data.args?._role });
      return { data: null, error: null };
    }
    if (data.name === "generar_codigos_toner") {
      await assertCanWrite(session.user.id);
      const cantidad = Math.max(1, Math.min(200, Number(data.args?._cantidad ?? 1)));
      const model = await one<{ id: string; nombre: string; prefijo: string; correlativo: number }>(`update toner_modelos set correlativo = correlativo + $2 where id = $1 returning id, nombre, prefijo, correlativo - $2 as correlativo`, [data.args?._modelo_id, cantidad]);
      if (!model) throw new Error("Modelo inexistente");
      const actor = await one<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [session.user.id]);
      const loteGeneracionId = randomUUID();
      const codes: string[] = [];
      for (let i = 1; i <= cantidad; i += 1) {
        const code = `${model.prefijo} ${String(model.correlativo + i).padStart(3, "0")}`;
        codes.push(code);
        await query(`insert into toner_unidades (modelo_id, codigo, generado_por, generado_por_nombre, lote_generacion_id) values ($1, $2, $3, $4, $5)`, [data.args?._modelo_id, code, session.user.id, actor?.full_name ?? actor?.email ?? "", loteGeneracionId]);
      }
      await writeAudit(session.user.id, "toner_unidades", "crear", codes.map((codigo) => ({ id: codigo, codigo, estado: "en_stock", modelo: model.nombre })), { modelo_id: model.id, modelo: model.nombre, cantidad, lote_generacion_id: loteGeneracionId, accion_especial: "generar_codigos" });
      return { data: codes, error: null };
    }
    if (data.name === "controlar_inventario") {
      if (!(await hasModulePermission(session.user.id, "inventario", "editar"))) throw new Error("No tenés permiso para controlar inventario");
      const inventarioId = String(data.args?._inventario_id ?? "");
      if (!inventarioId) throw new Error("Falta el registro de inventario");
      const fechaControl = String(data.args?._fecha_control ?? new Date().toISOString().slice(0, 10));
      const estado = String(data.args?._estado ?? "operativo").trim() || "operativo";
      const observacion = String(data.args?._observacion ?? "").trim();
      const actor = await one<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [session.user.id]);
      const item = await one<Record<string, unknown>>(`select * from inventario where id = $1`, [inventarioId]);
      if (!item) throw new Error("Registro de inventario inexistente");
      const control = await query<Record<string, unknown>>(`insert into inventario_controles (inventario_id, controlado_por, controlado_por_nombre, fecha_control, estado, observacion) values ($1, $2, $3, $4, $5, $6) returning *`, [inventarioId, session.user.id, actor?.full_name ?? actor?.email ?? "", fechaControl, estado, observacion]);
      await query(`update inventario set ultima_vez_controlada = $2, estado = $3, notas = case when $4::text = '' then notas else $4 end where id = $1`, [inventarioId, fechaControl, estado, observacion]);
      await writeAudit(session.user.id, "inventario_controles", "crear", control.rows, { inventario_id: inventarioId, descripcion: rowDescription("inventario", item) });
      return { data: control.rows[0], error: null };
    }
    if (data.name === "checkout_inventario") {
      // Asignar (checkout) o devolver (checkin) un activo, dejando historial.
      if (!(await hasModulePermission(session.user.id, "inventario", "editar"))) throw new Error("No tenés permiso para asignar inventario");
      const inventarioId = String(data.args?._inventario_id ?? "");
      const asignadoA = String(data.args?._asignado_a ?? "").trim();
      const sectorAsignado = String(data.args?._sector ?? "").trim() || null;
      const notas = String(data.args?._notas ?? "").trim() || null;
      const estadoDevolucion = String(data.args?._estado ?? "deposito").trim() || "deposito";
      if (!inventarioId) throw new Error("Falta el registro de inventario");
      const item = await one<Record<string, unknown>>(`select * from inventario where id = $1`, [inventarioId]);
      if (!item) throw new Error("Registro de inventario inexistente");
      const actor = await one<{ full_name: string; email: string }>(`select full_name, email from profiles where id = $1`, [session.user.id]);
      const actorNombre = actor?.full_name ?? actor?.email ?? "";
      // Cierra la asignación abierta, si la hay.
      await query(
        `update inventario_asignaciones set hasta = now(), notas_devolucion = coalesce($2, notas_devolucion) where inventario_id = $1 and hasta is null`,
        [inventarioId, asignadoA ? null : notas],
      );
      if (asignadoA) {
        await query(
          `insert into inventario_asignaciones (inventario_id, asignado_a, sector, notas, actor_id, actor_nombre) values ($1, $2, $3, $4, $5, $6)`,
          [inventarioId, asignadoA, sectorAsignado, notas, session.user.id, actorNombre],
        );
        await query(
          `update inventario set asignado_a = $2, asignado_desde = now(), checkout_at = now(), checkout_notas = $3,
                  estado = case when estado in ('reparacion', 'fuera_servicio', 'baja') then estado else 'operativo' end,
                  sector = coalesce($4, sector) where id = $1`,
          [inventarioId, asignadoA, notas, sectorAsignado],
        );
      } else {
        await query(
          `update inventario set asignado_a = null, asignado_desde = null, checkout_at = null, checkout_notas = null, estado = $2 where id = $1`,
          [inventarioId, estadoDevolucion],
        );
      }
      await writeAudit(session.user.id, "inventario", "editar", [item], {
        campos: ["asignado_a"],
        accion_especial: asignadoA ? "asignar" : "devolver",
        asignado_a: asignadoA || null,
      });
      return { data: { ok: true }, error: null };
    }
    throw new Error("Función no permitida");
  });

export const authGetSession = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null }) => data)
  .handler(async ({ data }) => ({ session: await getSession(data.token) }));

export const authSignIn = createServerFn({ method: "POST" })
  .validator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const username = (data.username ?? "").trim().toLowerCase();
    const user = await one<{ id: string; password_hash: string }>(`select u.id, u.password_hash from app_users u join profiles p on p.id = u.id where p.username = $1 or u.email = $1`, [username]);
    if (!user || !(await verifyPassword(data.password ?? "", user.password_hash))) {
      try { await query(`insert into audit_log (actor_id, actor_nombre, actor_email, modulo, accion, entidad_desc, detalle) values (null, $1, '', 'usuarios', 'login_fallido', $1, $2::jsonb)`, [username, JSON.stringify({ username })]); } catch { /* ignore */ }
      throw new Error("Usuario o contraseña incorrectos");
    }
    const token = await createSession(user.id);
    await writeAudit(user.id, "profiles", "login", [{ id: user.id }], {}, "usuarios");
    return { session: await getSession(token) };
  });

export const authSignUp = createServerFn({ method: "POST" })
  .validator((data: { fullName: string; username: string; email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const fullName = (data.fullName ?? "").trim();
    const username = (data.username ?? "").trim().toLowerCase();
    const email = (data.email ?? "").trim().toLowerCase();
    if (fullName.length < 2) throw new Error("Ingresá tu nombre y apellido");
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Usuario inválido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
    if ((data.password ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    const userCount = await one<{ count: string }>(`select count(*)::text as count from app_users`);
    if (Number(userCount?.count ?? 0) > 0 && process.env.ALLOW_PUBLIC_SIGNUP !== "true") throw new Error("El registro público está deshabilitado. Un administrador debe crear el usuario.");
    const exists = await one(`select id from app_users where email = $1 union select id from profiles where username = $2`, [email, username]);
    if (exists) throw new Error("Ese usuario o correo ya está registrado");
    const passwordHash = await hashPassword(data.password);
    const result = await query<{ id: string }>(`insert into app_users (email, password_hash) values ($1, $2) returning id`, [email, passwordHash]);
    const userId = result.rows[0].id;
    await query(`insert into profiles (id, full_name, email, username) values ($1, $2, $3, $4)`, [userId, fullName, email, username]);
    await query(`insert into user_roles (user_id, role) values ($1, $2)`, [userId, Number(userCount?.count ?? 0) === 0 ? "administrador" : "consulta"]);
    const token = await createSession(userId);
    return { session: await getSession(token) };
  });

export const authSignOut = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null }) => data)
  .handler(async ({ data }) => {
    await deleteSession(data.token);
    return { ok: true };
  });

export const authResetPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async () => {
    throw new Error("El restablecimiento por correo requiere configurar un proveedor SMTP.");
  });

export const authUpdatePassword = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; password: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    if ((data.password ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    await query(`update app_users set password_hash = $1 where id = $2`, [await hashPassword(data.password), session.user.id]);
    // Cierra las demás sesiones abiertas de este usuario.
    await query(`delete from app_sessions where user_id = $1 and token_hash <> encode(sha256(convert_to($2, 'utf8')), 'hex')`, [session.user.id, data.token ?? ""]);
    invalidateAuthCache(session.user.id);
    return { ok: true };
  });

export const storageUpload = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; bucket: string; path: string; base64: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertCanWrite(session.user.id);
    await saveFile(data.bucket, data.path, data.base64);
    return { data: { path: data.path }, error: null };
  });

export const storageSignedUrl = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; bucket: string; path: string }) => data)
  .handler(async ({ data }) => {
    await requireSession(data.token);
    return { data: { signedUrl: await readFileAsDataUrl(data.bucket, data.path) }, error: null };
  });

export const storageRemove = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; bucket: string; path: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertCanWrite(session.user.id);
    await removeFile(data.bucket, data.path);
    return { data: null, error: null };
  });
