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
  pool,
  query,
  readFileAsDataUrl,
  removeFile,
  requireSession,
  saveFile,
  verifyPassword,
} from "@/backend/core/db";
import { decryptSecret, encryptSecret, maskCredentialRow } from "@/backend/core/crypto-secrets";
import { validarClave, validarNombreArchivo } from "@/backend/core/seguridad";
import { alertasArea, notificarCambios } from "@/backend/core/notificaciones";

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
  "adjuntos",
  "app_settings",
  "feriados",
  "insumos_items",
  "insumos_pedidos",
  "insumos_pedido_eventos",
  "audit_log",
  "credenciales",
  "guardia_operarios",
  "guardias",
  "inventario",
  "inventario_asignaciones",
  "inventario_controles",
  "inventario_reparaciones",
  "inventario_auditorias",
  "inventario_auditoria_items",
  "inventario_escaneos",
  "inventario_etiquetas_libres",
  "oficina_telefonos",
  "oficina_contactos",
  "profiles",
  "role_permissions",
  "roles",
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


const AUDIT_META: Record<string, { modulo: string; fields: string[] }> = {
  app_settings: { modulo: "configuracion", fields: ["version_actual"] },
  adjuntos: { modulo: "adjuntos", fields: ["file_name", "entidad"] },
  feriados: { modulo: "configuracion", fields: ["fecha", "nombre"] },
  insumos_items: { modulo: "oficina", fields: ["descripcion", "cantidad"] },
  insumos_pedidos: { modulo: "oficina", fields: ["numero", "estado", "total_estimado"] },
  credenciales: { modulo: "credenciales", fields: ["servicio", "usuario", "ip", "url"] },
  guardia_operarios: { modulo: "guardias", fields: ["nombre", "code"] },
  guardias: { modulo: "guardias", fields: ["operador_nombre", "desde", "hasta"] },
  inventario: { modulo: "inventario", fields: ["planta", "sector", "descripcion", "numero_serie"] },
  inventario_controles: { modulo: "inventario", fields: ["fecha_control", "estado", "observacion"] },
  inventario_reparaciones: { modulo: "inventario", fields: ["titulo", "proveedor", "fecha_inicio"] },
  inventario_asignaciones: { modulo: "inventario", fields: ["asignado_a", "sector"] },
  inventario_auditorias: { modulo: "inventario", fields: ["nombre", "sector", "estado"] },
  inventario_etiquetas_libres: { modulo: "inventario", fields: ["codigo"] },
  oficina_telefonos: { modulo: "oficina", fields: ["sector", "nombre", "interno"] },
  oficina_contactos: { modulo: "oficina", fields: ["tipo", "nombre", "email"] },
  profiles: { modulo: "usuarios", fields: ["full_name", "email", "username"] },
  role_permissions: { modulo: "roles", fields: ["role", "modulo"] },
  roles: { modulo: "roles", fields: ["nombre", "clave"] },
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

const claveIntentos = new Map<string, { n: number; hasta: number }>();

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

/** Columnas que identifican a quien hace la acción: siempre las completa el servidor. */
const CAMPOS_AUTOR = ["autor_id", "created_by", "actor_id", "controlado_por"] as const;
function forzarAutor(row: Record<string, unknown>, userId: string) {
  const r = { ...row };
  for (const campo of CAMPOS_AUTOR) if (campo in r) r[campo] = userId;
  return r;
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

/** Módulo de la matriz de permisos al que pertenece cada tabla. */
const MODULO_DE_TABLA: Record<string, string> = {
  wiki_folders: "instructivos",
  wiki_docs: "instructivos",
  wiki_attachments: "instructivos",
  wiki_doc_revisions: "instructivos",
  guardias: "guardias",
  guardia_operarios: "guardias",
  inventario: "inventario",
  inventario_controles: "inventario",
  inventario_reparaciones: "inventario",
  inventario_auditorias: "inventario",
  inventario_auditoria_items: "inventario",
  inventario_escaneos: "inventario",
  inventario_etiquetas_libres: "inventario",
  inventario_asignaciones: "inventario",
  toner_modelos: "toners",
  toner_unidades: "toners",
  toner_movimientos: "toners",
  toner_pedidos: "toners",
  toner_pedido_items: "toners",
  tareas: "tareas",
  tarea_subtareas: "tareas",
  tarea_comentarios: "tareas",
  tarea_instructivos: "tareas",
  credenciales: "credenciales",
  oficina_telefonos: "oficina",
  insumos_items: "oficina",
  insumos_pedidos: "oficina",
  insumos_pedido_eventos: "oficina",
  oficina_contactos: "oficina",
};

const ACCION_PERMISO = { select: "ver", insert: "crear", update: "editar", delete: "eliminar" } as const;
const NOMBRE_ACCION = { ver: "ver", crear: "crear", editar: "editar", eliminar: "eliminar" } as const;

/** Módulo de un adjunto según su entidad (activo → Activos IT, ticket → Tickets). */
async function moduloAdjunto(filters: Filter[] | undefined, values?: Record<string, unknown> | Record<string, unknown>[]) {
  const desdeValores = Array.isArray(values) ? values[0]?.entidad : values?.entidad;
  let entidad = desdeValores ?? filterValue(filters, "entidad");
  if (!entidad) {
    const id = filterValue(filters, "id");
    if (id) entidad = (await one<{ entidad: string }>(`select entidad from adjuntos where id = $1`, [id]))?.entidad;
  }
  return entidad === "ticket" ? "tareas" : "inventario";
}

/** Aplica la matriz de permisos del rol (Configuración → Roles y permisos). */
async function assertModulo(userId: string, table: string, accion: keyof typeof ACCION_PERMISO, filters?: Filter[], values?: MutateInput["values"]) {
  const modulo = table === "adjuntos" ? await moduloAdjunto(filters, values) : MODULO_DE_TABLA[table];
  if (!modulo) return false;
  const permiso = ACCION_PERMISO[accion];
  if (!(await hasModulePermission(userId, modulo, permiso))) {
    throw new Error(`Tu rol no tiene permiso para ${NOMBRE_ACCION[permiso]} en ${modulo === "tareas" ? "Tickets" : modulo === "inventario" ? "Activos IT" : modulo}`);
  }
  return true;
}

async function assertWriteAccess(userId: string, table: string, accion: "insert" | "update" | "delete" = "update", filters?: Filter[], values?: MutateInput["values"]) {
  // El registro de auditoría no se puede editar ni borrar por la API (solo depurar desde Configuración → Datos).
  if (table === "audit_log" || table === "inventario_escaneos" || table === "insumos_pedido_eventos") throw new Error("Este registro no se puede modificar");
  if (["app_settings", "role_permissions", "roles", "user_roles", "profiles", "feriados"].includes(table)) {
    await assertAdmin(userId);
    return;
  }
  if (table === "wiki_doc_revisions") {
    await assertAdmin(userId);
    return;
  }
  if (await assertModulo(userId, table, accion, filters, values)) return;
  await assertAdmin(userId);
}

function filterValue(filters: Filter[] | undefined, column: string) {
  return filters?.find((filter) => filter.op === "eq" && filter.column === column)?.value;
}

async function assertReadAccess(userId: string, table: string, filters: Filter[] | undefined) {
  if (table === "audit_log") {
    if (!(await hasModulePermission(userId, "auditoria", "ver"))) throw new Error("Tu rol no tiene permiso para ver la auditoría");
    return;
  }
  if (table === "app_settings") {
    await assertAdmin(userId);
    return;
  }
  if (await assertModulo(userId, table, "select", filters)) return;
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

/** Tablas con un campo `secreto` cifrado: nunca viaja en claro, se revela con el ojito (queda en auditoría). */
const TABLAS_CON_SECRETO = new Set(["credenciales", "oficina_contactos"]);

function sanitizeRows(table: string, rows: any[]) {
  if (!TABLAS_CON_SECRETO.has(table)) return rows;
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
    // Siempre con tope: evita volcar tablas enteras en una sola respuesta.
    const limite = Math.min(Math.max(1, Math.floor(Number(data.limit) || 5000)), 10000);
    values.push(limite);
    sql += ` limit $${values.length}`;
    const result = await query(sql, values);
    const rows = sanitizeRows(table, await withJoinedModels(table, result.rows)());
    return { data: data.maybeSingle ? (rows[0] ?? null) : rows, count: null, error: null };
  });

export const apiMutate = createServerFn({ method: "POST" })
  .validator((data: MutateInput) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    const table = tableName(data.table);
    await assertWriteAccess(session.user.id, table, data.action, data.filters, data.values);
    if ((data.action === "update" || data.action === "delete") && !data.filters?.length) {
      throw new Error("Operación bloqueada: falta indicar qué registros modificar");
    }
    if (table === "role_permissions" || table === "roles") invalidatePermissionCache();
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
      let payload = { ...(data.values as Record<string, unknown>) };
      for (const campo of CAMPOS_AUTOR) delete payload[campo];
      delete payload.id;
      if (TABLAS_CON_SECRETO.has(table)) payload = prepareCredentialPayload(payload);
      if (table === "wiki_docs") await snapshotWikiDoc(session.user.id, data.filters);
      const assignments = Object.keys(payload).map((key) => {
        values.push(payload[key]);
        return `${cleanIdentifier(key)} = $${values.length}`;
      });
      if (assignments.length === 0) throw new Error("Sin datos para actualizar");
      let antes: Record<string, unknown>[] = [];
      if (table === "tareas") {
        const prevValues: unknown[] = [];
        const prevWhere = appendFilters(data.filters, prevValues);
        antes = (await query<Record<string, unknown>>(`select id, asignado_a, estado from tareas${prevWhere}`, prevValues)).rows;
      }
      const result = await query<Record<string, unknown>>(`update ${table} set ${assignments.join(", ")}${where} returning *`, values);
      if (table === "tareas") await notificarCambios(table, "update", session.user.id, result.rows, antes);
      await writeAudit(session.user.id, table, "editar", result.rows, { campos: Object.keys(payload).filter((k) => k !== "secreto") });
      return { data: null, count: result.rowCount ?? 0, error: null };
    }

    let rows = Array.isArray(data.values) ? data.values : [data.values as Record<string, unknown>];
    if (!rows.length || !rows[0]) throw new Error("Sin datos para insertar");
    if (rows.length > 1000) throw new Error("Demasiados registros en una sola operación");
    // Quién hizo algo lo decide el servidor, no el navegador (evita suplantar a otro usuario).
    rows = rows.map((row) => forzarAutor(row, session.user.id));
    if (TABLAS_CON_SECRETO.has(table)) rows = rows.map((row) => prepareCredentialPayload(row));
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
    if (table === "tareas" || table === "tarea_comentarios") await notificarCambios(table, "insert", session.user.id, result.rows);
    const out = sanitizeRows(table, result.rows);
    return { data: out.length === 1 ? out[0] : out, error: null };
  });

export const apiRpc = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; name: string; args?: Record<string, any> }) => data)
  .handler(async ({ data }): Promise<{ data: any; error: null }> => {
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
      if (!(await hasModulePermission(session.user.id, "auditoria", "ver"))) throw new Error("Tu rol no tiene permiso para ver la auditoría");
      const result = await query(`select id as actor_id, full_name as actor_nombre, email as actor_email from profiles order by full_name`);
      return { data: result.rows, error: null };
    }
    if (data.name === "revelar_credencial") {
      if (!(await hasModulePermission(session.user.id, "credenciales", "ver"))) throw new Error("Tu rol no tiene permiso para ver credenciales");
      const id = String(data.args?._id ?? "");
      if (!id) throw new Error("Falta el id de credencial");
      const row = await one<Record<string, unknown>>(`select * from credenciales where id = $1`, [id]);
      if (!row) throw new Error("Credencial inexistente");
      const secreto = decryptSecret(row.secreto as string | null);
      try { await query(`update credenciales set last_revealed_at = now() where id = $1`, [id]); } catch { /* optional col */ }
      await writeAudit(session.user.id, "credenciales", "revelar", [row], { via: String(data.args?._via ?? "ui") });
      return { data: { id: row.id, servicio: row.servicio, usuario: row.usuario, secreto }, error: null };
    }
    if (data.name === "revelar_contacto") {
      // Clave de un email de la empresa (Oficina → Agenda).
      if (!(await hasModulePermission(session.user.id, "oficina", "ver"))) throw new Error("Tu rol no tiene permiso en Oficina");
      const id = String(data.args?._id ?? "");
      const row = await one<Record<string, unknown>>(`select * from oficina_contactos where id = $1`, [id]);
      if (!row) throw new Error("Contacto inexistente");
      const secreto = decryptSecret(row.secreto as string | null);
      await query(`update oficina_contactos set last_revealed_at = now() where id = $1`, [id]);
      await writeAudit(session.user.id, "oficina_contactos", "revelar", [row], { via: String(data.args?._via ?? "ui") });
      return { data: { id: row.id, secreto }, error: null };
    }
    if (data.name === "editar_pedido_insumos") {
      // Corrige un pedido ya generado (mismo número): datos del pedido e ítems, todo junto.
      if (!(await hasModulePermission(session.user.id, "oficina", "editar"))) throw new Error("Tu rol no tiene permiso para editar pedidos");
      const pedidoId = String(data.args?._id ?? "");
      const lista = Array.isArray(data.args?._items) ? (data.args?._items as Record<string, unknown>[]) : [];
      if (!lista.length) throw new Error("El pedido tiene que tener al menos un ítem");
      if (lista.length > 300) throw new Error("Demasiados ítems");
      const texto = (v: unknown, max: number) => {
        const t = String(v ?? "").trim();
        return t ? t.slice(0, max) : null;
      };
      const numero = (v: unknown) => {
        const n = Number(String(v ?? "").replace(",", "."));
        return Number.isFinite(n) && n >= 0 ? n : null;
      };
      const items = lista.map((i) => {
        const descripcion = texto(i.descripcion, 300);
        if (!descripcion) throw new Error("Hay un ítem sin descripción");
        const cantidad = numero(i.cantidad);
        if (!cantidad) throw new Error(`"${descripcion}": la cantidad tiene que ser mayor a 0`);
        return {
          id: /^[0-9a-f-]{36}$/i.test(String(i.id ?? "")) ? String(i.id) : null,
          descripcion,
          cantidad,
          unidad: texto(i.unidad, 20) ?? "u.",
          link: texto(i.link, 600),
          precio: numero(i.precio_estimado),
          sector: texto(i.sector, 120),
          prioridad: i.prioridad === "urgente" ? "urgente" : "normal",
          notas: texto(i.notas, 500),
        };
      });
      const total = items.reduce((s, i) => s + (i.precio ?? 0) * i.cantidad, 0);
      const actor = await one<{ full_name: string }>(`select full_name from profiles where id = $1`, [session.user.id]);
      const client = await pool.connect();
      try {
        await client.query("begin");
        const ped = await client.query<Record<string, unknown>>(
          `update insumos_pedidos set destinatario = coalesce($2, destinatario), notas = $3, total_estimado = $4
            where id = $1 returning *`,
          [pedidoId, texto(data.args?._destinatario, 120), texto(data.args?._notas, 2000), total],
        );
        if (!ped.rowCount) throw new Error("Pedido inexistente");
        const conservar = items.map((i) => i.id).filter(Boolean) as string[];
        await client.query(`delete from insumos_items where pedido_id = $1 and not (id = any($2::uuid[]))`, [pedidoId, conservar]);
        for (const i of items) {
          const valores = [i.descripcion, i.cantidad, i.unidad, i.link, i.precio, i.sector, i.prioridad, i.notas];
          const upd = i.id
            ? await client.query(
                `update insumos_items set descripcion = $3, cantidad = $4, unidad = $5, link = $6, precio_estimado = $7, sector = $8, prioridad = $9, notas = $10,
                        cantidad_comprada = least(cantidad_comprada, $4::numeric), cantidad_recibida = least(cantidad_recibida, $4::numeric),
                        comprado = (least(cantidad_comprada, $4::numeric) >= $4::numeric)
                  where id = $1 and pedido_id = $2`,
                [i.id, pedidoId, ...valores],
              )
            : null;
          if (!upd?.rowCount) {
            await client.query(
              `insert into insumos_items (pedido_id, descripcion, cantidad, unidad, link, precio_estimado, sector, prioridad, notas, created_by_nombre)
               values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [pedidoId, ...valores, actor?.full_name ?? null],
            );
          }
        }
        await client.query("commit");
        await writeAudit(session.user.id, "insumos_pedidos", "editar", ped.rows, { items: items.length, total });
        return { data: ped.rows[0], error: null };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    if (data.name === "seguimiento_pedido") {
      // Evolución de un pedido: estado general, compra/recepción por ítem y notas, con historial.
      if (!(await hasModulePermission(session.user.id, "oficina", "editar"))) throw new Error("Tu rol no tiene permiso para actualizar pedidos");
      const pedidoId = String(data.args?._pedido_id ?? "");
      const accion = String(data.args?._accion ?? "");
      const actor = await one<{ full_name: string }>(`select full_name from profiles where id = $1`, [session.user.id]);
      const autor = actor?.full_name ?? "";
      const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
      const client = await pool.connect();
      try {
        await client.query("begin");
        const ped = await client.query<{ id: string; numero: number; estado: string; aprobado_at: string | null }>(
          `select id, numero, estado, aprobado_at from insumos_pedidos where id = $1 for update`,
          [pedidoId],
        );
        const pedido = ped.rows[0];
        if (!pedido) throw new Error("Pedido inexistente");
        const evento = (texto: string, tipo: string, itemId: string | null = null) =>
          client.query(
            `insert into insumos_pedido_eventos (pedido_id, item_id, tipo, texto, autor_id, autor_nombre) values ($1, $2, $3, $4, $5, $6)`,
            [pedidoId, itemId, tipo, texto.slice(0, 600), session.user.id, autor],
          );
        const ETIQUETA: Record<string, string> = {
          enviado: "Enviado",
          aprobado: "Aprobado",
          en_compra: "Compra parcial",
          comprado: "Comprado",
          recibido: "Recibido",
          rechazado: "Rechazado",
        };

        if (accion === "estado") {
          const estado = String(data.args?._estado ?? "");
          if (!["enviado", "aprobado", "rechazado"].includes(estado)) throw new Error("Estado inválido");
          if (estado !== pedido.estado) {
            await client.query(
              `update insumos_pedidos set estado = $2::text, actualizado_at = now(),
                      aprobado_at = case when $2::text = 'aprobado' then coalesce(aprobado_at, now()) else aprobado_at end,
                      cerrado_at = case when $2::text = 'rechazado' then now() else null end
                where id = $1`,
              [pedidoId, estado],
            );
            const motivo = String(data.args?._motivo ?? "").trim().slice(0, 300);
            await evento(`${ETIQUETA[pedido.estado] ?? pedido.estado} → ${ETIQUETA[estado]}${motivo ? `: ${motivo}` : ""}`, "estado");
          }
        } else if (accion === "nota") {
          const texto = String(data.args?._texto ?? "").trim();
          if (!texto) throw new Error("Escribí la nota");
          await evento(texto, "nota");
        } else if (accion === "items") {
          if (pedido.estado === "rechazado") throw new Error("El pedido está rechazado: volvelo a Enviado para seguir");
          const cambios = Array.isArray(data.args?._items) ? (data.args?._items as Record<string, unknown>[]) : [];
          if (!cambios.length || cambios.length > 300) throw new Error("Sin cambios");
          const actuales = await client.query<{ id: string; descripcion: string; cantidad: string; unidad: string; cantidad_comprada: string; cantidad_recibida: string; cancelado: boolean; proveedor: string | null; precio_real: string | null }>(
            `select id, descripcion, cantidad, unidad, cantidad_comprada, cantidad_recibida, cancelado, proveedor, precio_real from insumos_items where pedido_id = $1`,
            [pedidoId],
          );
          const porId = new Map(actuales.rows.map((i) => [i.id, i]));
          const num = (v: unknown) => {
            const n = Number(String(v ?? "").replace(",", "."));
            return Number.isFinite(n) ? n : NaN;
          };
          for (const c of cambios) {
            const it = porId.get(String(c.id ?? ""));
            if (!it) throw new Error("Ítem inexistente en este pedido");
            const total = Number(it.cantidad);
            const antesC = Number(it.cantidad_comprada);
            const antesR = Number(it.cantidad_recibida);
            const comprada = c.comprada === undefined ? antesC : num(c.comprada);
            let recibida = c.recibida === undefined ? antesR : num(c.recibida);
            if (!(comprada >= 0 && comprada <= total)) throw new Error(`"${it.descripcion}": lo comprado va de 0 a ${fmt(total)}`);
            if (!(recibida >= 0 && recibida <= total)) throw new Error(`"${it.descripcion}": lo recibido va de 0 a ${fmt(total)}`);
            // Lo recibido nunca supera lo comprado: si llega algo, también está comprado.
            const compradaFinal = Math.max(comprada, recibida);
            recibida = Math.min(recibida, total);
            const cancelado = c.cancelado === undefined ? it.cancelado : !!c.cancelado;
            const proveedor = c.proveedor === undefined ? it.proveedor : String(c.proveedor ?? "").trim().slice(0, 160) || null;
            const precio = c.precio_real === undefined ? (it.precio_real == null ? null : Number(it.precio_real)) : c.precio_real === null || c.precio_real === "" ? null : num(c.precio_real);
            if (precio !== null && !(precio >= 0)) throw new Error(`"${it.descripcion}": precio inválido`);
            const nota = String(c.nota ?? "").trim().slice(0, 300);
            await client.query(
              `update insumos_items set cantidad_comprada = $2::numeric, cantidad_recibida = $3::numeric, cancelado = $4::boolean,
                      proveedor = $5::text, precio_real = $6::numeric,
                      comprado = ($2::numeric >= cantidad),
                      comprado_at = case when $2::numeric > 0 then coalesce(comprado_at, now()) else null end,
                      recibido_at = case when $3::numeric > 0 then coalesce(recibido_at, now()) else null end,
                      nota_compra = coalesce($7::text, nota_compra)
                where id = $1`,
              [it.id, compradaFinal, recibida, cancelado, proveedor, precio, nota || null],
            );
            const partes: string[] = [];
            const u = it.unidad || "u.";
            if (cancelado !== it.cancelado) partes.push(cancelado ? "sin comprar (cancelado)" : "vuelve a pendiente");
            if (compradaFinal !== antesC) partes.push(`comprado ${fmt(compradaFinal)}/${fmt(total)} ${u}`);
            if (recibida !== antesR) partes.push(`recibido ${fmt(recibida)}/${fmt(total)} ${u}`);
            if (proveedor !== it.proveedor && proveedor) partes.push(`proveedor ${proveedor}`);
            if (partes.length || nota) await evento(`${it.descripcion}: ${partes.join(" · ")}${nota ? `${partes.length ? " — " : ""}${nota}` : ""}`, "item", it.id);
          }
          // Estado del pedido según cómo quedaron los ítems.
          const resumen = await client.query<{ activos: string; comprados: string; recibidos: string; con_algo: string }>(
            `select count(*) filter (where not cancelado) as activos,
                    count(*) filter (where not cancelado and cantidad_comprada >= cantidad) as comprados,
                    count(*) filter (where not cancelado and cantidad_recibida >= cantidad) as recibidos,
                    count(*) filter (where not cancelado and (cantidad_comprada > 0 or cantidad_recibida > 0)) as con_algo
               from insumos_items where pedido_id = $1`,
            [pedidoId],
          );
          const t = resumen.rows[0];
          const activos = Number(t.activos);
          let nuevo = pedido.estado;
          if (activos > 0 && Number(t.recibidos) === activos) nuevo = "recibido";
          else if (activos > 0 && Number(t.comprados) === activos) nuevo = "comprado";
          else if (Number(t.con_algo) > 0) nuevo = "en_compra";
          else if (["en_compra", "comprado", "recibido"].includes(pedido.estado)) nuevo = pedido.aprobado_at ? "aprobado" : "enviado";
          if (nuevo !== pedido.estado) {
            await client.query(
              `update insumos_pedidos set estado = $2::text, actualizado_at = now(),
                      comprado_at = case when $2::text in ('comprado', 'recibido') then coalesce(comprado_at, now()) else null end,
                      recibido_at = case when $2::text = 'recibido' then coalesce(recibido_at, now()) else null end,
                      cerrado_at = case when $2::text = 'recibido' then now() else null end
                where id = $1`,
              [pedidoId, nuevo],
            );
            await evento(`${ETIQUETA[pedido.estado] ?? pedido.estado} → ${ETIQUETA[nuevo]}`, "estado");
          } else {
            await client.query(`update insumos_pedidos set actualizado_at = now() where id = $1`, [pedidoId]);
          }
        } else {
          throw new Error("Acción inválida");
        }
        await client.query("commit");
        const fila = await one<Record<string, unknown>>(`select * from insumos_pedidos where id = $1`, [pedidoId]);
        if (fila) await writeAudit(session.user.id, "insumos_pedidos", "editar", [fila], { seguimiento: accion });
        return { data: fila, error: null };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    if (data.name === "generar_pedido_insumos") {
      // Pasa la lista actual de insumos a un pedido numerado, en una sola transacción.
      if (!(await hasModulePermission(session.user.id, "oficina", "crear"))) throw new Error("Tu rol no tiene permiso para generar pedidos");
      const ids = Array.isArray(data.args?._ids) ? (data.args?._ids as string[]).map(String) : null;
      const actor = await one<{ full_name: string }>(`select full_name from profiles where id = $1`, [session.user.id]);
      const client = await pool.connect();
      try {
        await client.query("begin");
        const items = await client.query<{ id: string; cantidad: string; precio_estimado: string | null }>(
          `select id, cantidad, precio_estimado from insumos_items where pedido_id is null ${ids?.length ? "and id = any($1::uuid[])" : ""} for update`,
          ids?.length ? [ids] : [],
        );
        if (!items.rows.length) throw new Error("La lista está vacía");
        const total = items.rows.reduce((s, r) => s + (Number(r.precio_estimado) || 0) * (Number(r.cantidad) || 0), 0);
        const pedido = await client.query<Record<string, unknown>>(
          `insert into insumos_pedidos (destinatario, solicitante_nombre, notas, total_estimado, created_by) values ($1, $2, $3, $4, $5) returning *`,
          [String(data.args?._destinatario ?? "Compras").trim() || "Compras", actor?.full_name ?? "", String(data.args?._notas ?? "").trim() || null, total, session.user.id],
        );
        await client.query(`update insumos_items set pedido_id = $1 where id = any($2::uuid[])`, [pedido.rows[0].id, items.rows.map((r) => r.id)]);
        await client.query("commit");
        await writeAudit(session.user.id, "insumos_pedidos", "crear", pedido.rows, { items: items.rows.length });
        return { data: pedido.rows[0], error: null };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
    if (data.name === "notificaciones") {
      const items = await query(
        `select id, tipo, titulo, cuerpo, link, leida, actor_nombre, created_at from notificaciones where user_id = $1 order by created_at desc limit 40`,
        [session.user.id],
      ).catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const noLeidas = items.rows.filter((n) => !n.leida).length;
      return { data: { items: items.rows, no_leidas: noLeidas, alertas: await alertasArea(session.user.id) }, error: null };
    }
    if (data.name === "marcar_notificaciones") {
      const ids = Array.isArray(data.args?._ids) ? (data.args?._ids as string[]).map(String) : null;
      if (ids?.length) await query(`update notificaciones set leida = true where user_id = $1 and id = any($2::uuid[])`, [session.user.id, ids]);
      else await query(`update notificaciones set leida = true where user_id = $1 and not leida`, [session.user.id]);
      return { data: null, error: null };
    }
    if (data.name === "verificar_clave") {
      // Confirmación con la contraseña propia (ej. al abrir un activo desde un QR).
      const key = session.user.id;
      const now = Date.now();
      const intento = claveIntentos.get(key);
      if (intento && intento.hasta > now && intento.n >= 5) throw new Error("Demasiados intentos. Esperá un minuto.");
      const row = await one<{ password_hash: string }>(`select password_hash from app_users where id = $1`, [key]);
      const ok = !!row && (await verifyPassword(String(data.args?._clave ?? ""), row.password_hash));
      if (!ok) {
        const prev = intento && intento.hasta > now ? intento : { n: 0, hasta: now + 60_000 };
        claveIntentos.set(key, { n: prev.n + 1, hasta: prev.hasta });
        throw new Error("Clave incorrecta");
      }
      claveIntentos.delete(key);
      return { data: { ok: true }, error: null };
    }
    if (data.name === "registrar_vista_instructivo") {
      if (!(await hasModulePermission(session.user.id, "instructivos", "ver"))) return { data: null, error: null };
      const id = String(data.args?._id ?? "");
      if (id) await query(`update wiki_docs set views = views + 1 where id = $1`, [id]);
      return { data: null, error: null };
    }
    if (data.name === "buscar_instructivos") {
      if (!(await hasModulePermission(session.user.id, "instructivos", "ver"))) throw new Error("Tu rol no tiene permiso en Instructivos");
      const term = String(data.args?._q ?? "").trim();
      if (!term) return { data: [], error: null };
      const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
      const result = await query(`select id, folder_id, title, tags, views, updated_at from wiki_docs where title ilike $1 or content ilike $1 or array_to_string(tags, ' ') ilike $1 order by updated_at desc limit 50`, [like]);
      return { data: result.rows, error: null };
    }
    if (data.name === "set_user_role") {
      await assertAdmin(session.user.id);
      if (data.args?._user_id === session.user.id && data.args?._role !== "administrador") throw new Error("No podés quitarte tu propio rol de administrador");
      if (!(await one(`select 1 as ok from roles where clave = $1`, [String(data.args?._role)]))) throw new Error("Rol inválido");
      await query(`delete from user_roles where user_id = $1`, [data.args?._user_id]);
      await query(`insert into user_roles (user_id, role) values ($1, $2)`, [data.args?._user_id, data.args?._role]);
      invalidateAuthCache(String(data.args?._user_id));
      await writeAudit(session.user.id, "user_roles", "asignar_rol", [{ id: data.args?._user_id, user_id: data.args?._user_id, role: data.args?._role }], { rol: data.args?._role });
      return { data: null, error: null };
    }
    if (data.name === "crear_rol") {
      await assertAdmin(session.user.id);
      const nombre = String(data.args?._nombre ?? "").trim().slice(0, 60);
      if (nombre.length < 2) throw new Error("El rol necesita un nombre");
      const base = String(data.args?._base ?? "consulta");
      const clave =
        nombre
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || "rol";
      if (await one(`select 1 as ok from roles where clave = $1 or lower(nombre) = lower($2)`, [clave, nombre])) throw new Error("Ya existe un rol con ese nombre");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(`insert into roles (clave, nombre, descripcion, color, sistema, orden) values ($1, $2, $3, $4, false, 50)`, [clave, nombre, String(data.args?._descripcion ?? "").trim() || null, String(data.args?._color ?? "violet")]);
        await client.query(
          `insert into role_permissions (role, modulo, can_view, can_create, can_edit, can_delete)
           select $1, modulo, can_view, can_create, can_edit, can_delete from role_permissions where role = $2
           on conflict (role, modulo) do nothing`,
          [clave, base],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      invalidatePermissionCache();
      await writeAudit(session.user.id, "roles", "crear", [{ id: clave, nombre, clave }], { base });
      return { data: { clave }, error: null };
    }
    if (data.name === "eliminar_rol") {
      await assertAdmin(session.user.id);
      const clave = String(data.args?._clave ?? "");
      const reasignar = String(data.args?._reasignar ?? "consulta");
      const rol = await one<{ nombre: string; sistema: boolean }>(`select nombre, sistema from roles where clave = $1`, [clave]);
      if (!rol) throw new Error("Rol inexistente");
      if (rol.sistema) throw new Error("Los roles del sistema no se pueden eliminar");
      if (reasignar === clave || !(await one(`select 1 as ok from roles where clave = $1`, [reasignar]))) throw new Error("Elegí a qué rol pasan sus usuarios");
      await query(`update user_roles set role = $2 where role = $1`, [clave, reasignar]);
      await query(`delete from roles where clave = $1`, [clave]);
      invalidateAuthCache();
      await writeAudit(session.user.id, "roles", "eliminar", [{ id: clave, nombre: rol.nombre, clave }], { reasignados_a: reasignar });
      return { data: null, error: null };
    }
    if (data.name === "estado_datos") {
      await assertAdmin(session.user.id);
      const tablas = await query<{ tabla: string; filas: string; bytes: string }>(
        `select c.relname as tabla, greatest(coalesce(st.n_live_tup, 0), c.reltuples, 0)::bigint::text as filas, pg_total_relation_size(c.oid)::text as bytes
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
           left join pg_stat_user_tables st on st.relid = c.oid
          where n.nspname = 'public' and c.relkind = 'r'
          order by pg_total_relation_size(c.oid) desc`,
      );
      const base = await one<{ bytes: string }>(`select pg_database_size(current_database())::text as bytes`);
      const depurable = await one<{ auditoria: string; notificaciones: string; revisiones: string; sesiones: string }>(
        `select
           (select count(*) from audit_log where created_at < now() - interval '12 months')::text as auditoria,
           (select count(*) from notificaciones where leida)::text as notificaciones,
           (select count(*) from wiki_doc_revisions r where r.id not in (
              select id from (select id, row_number() over (partition by doc_id order by created_at desc) n from wiki_doc_revisions) x where n <= 20))::text as revisiones,
           (select count(*) from app_sessions where expires_at < now())::text as sesiones`,
      );
      return {
        data: {
          baseBytes: Number(base?.bytes ?? 0),
          tablas: tablas.rows.map((t) => ({ tabla: t.tabla, filas: Number(t.filas), bytes: Number(t.bytes) })),
          depurable: Object.fromEntries(Object.entries(depurable ?? {}).map(([k, v]) => [k, Number(v)])),
        },
        error: null,
      };
    }
    if (data.name === "depurar_datos") {
      await assertAdmin(session.user.id);
      const tipo = String(data.args?._tipo ?? "");
      const meses = Math.max(3, Math.min(120, Number(data.args?._meses ?? 12)));
      const sql: Record<string, [string, unknown[]]> = {
        auditoria: [`delete from audit_log where created_at < now() - make_interval(months => $1)`, [meses]],
        notificaciones: [`delete from notificaciones where leida`, []],
        revisiones: [`delete from wiki_doc_revisions where id in (select id from (select id, row_number() over (partition by doc_id order by created_at desc) n from wiki_doc_revisions) x where n > 20)`, []],
        sesiones: [`delete from app_sessions where expires_at < now()`, []],
      };
      if (!sql[tipo]) throw new Error("Tipo de depuración inválido");
      const r = await query(sql[tipo][0], sql[tipo][1]);
      await writeAudit(session.user.id, "app_settings", "eliminar", [{ id: tipo, version_actual: `Depuración: ${tipo}` }], { tipo, meses, filas: r.rowCount });
      return { data: { eliminadas: r.rowCount ?? 0 }, error: null };
    }
    if (data.name === "generar_codigos_toner") {
      if (!(await hasModulePermission(session.user.id, "toners", "crear"))) throw new Error("Tu rol no tiene permiso para generar códigos");
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

export const authResetPassword = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async () => {
    throw new Error("El restablecimiento por correo requiere configurar un proveedor SMTP.");
  });

export const authUpdatePassword = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; password: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    validarClave(data.password ?? "", session.profile.username);
    await query(`update app_users set password_hash = $1 where id = $2`, [await hashPassword(data.password), session.user.id]);
    // Cierra las demás sesiones abiertas de este usuario.
    await query(`delete from app_sessions where user_id = $1 and token_hash <> encode(sha256(convert_to($2, 'utf8')), 'hex')`, [session.user.id, data.token ?? ""]);
    invalidateAuthCache(session.user.id);
    return { ok: true };
  });

/** Carpetas de archivos y el módulo que controla cada una. */
async function assertArchivo(userId: string, bucket: string, path: string, accion: "ver" | "crear" | "eliminar") {
  if (bucket === "instructivos") {
    if (!(await hasModulePermission(userId, "instructivos", accion))) throw new Error("Tu rol no tiene permiso en Instructivos");
    return;
  }
  if (bucket === "adjuntos") {
    const modulo = String(path).startsWith("ticket/") ? "tareas" : "inventario";
    // Subir o quitar un adjunto es editar el ticket o el activo.
    const permiso = accion === "ver" ? "ver" : "editar";
    if (!(await hasModulePermission(userId, modulo, permiso))) throw new Error("Tu rol no tiene permiso para esos archivos");
    return;
  }
  throw new Error("Carpeta de archivos no permitida");
}

export const storageUpload = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; bucket: string; path: string; base64: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertArchivo(session.user.id, String(data.bucket), String(data.path), "crear");
    validarNombreArchivo(data.path);
    await saveFile(data.bucket, data.path, data.base64);
    return { data: { path: data.path }, error: null };
  });

export const storageSignedUrl = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; bucket: string; path: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertArchivo(session.user.id, String(data.bucket), String(data.path), "ver");
    return { data: { signedUrl: await readFileAsDataUrl(data.bucket, data.path) }, error: null };
  });

export const storageRemove = createServerFn({ method: "POST" })
  .validator((data: { token?: string | null; bucket: string; path: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertArchivo(session.user.id, String(data.bucket), String(data.path), "eliminar");
    await removeFile(data.bucket, data.path);
    return { data: null, error: null };
  });
