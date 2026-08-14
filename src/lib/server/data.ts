import { createServerFn } from "@tanstack/react-start";
import {
  assertAdmin,
  assertCanWrite,
  cleanIdentifier,
  createSession,
  deleteSession,
  getSession,
  hashPassword,
  one,
  query,
  readFileAsDataUrl,
  removeFile,
  requireSession,
  saveFile,
  verifyPassword,
} from "@/lib/server/postgres";

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
  "guardias",
  "inventario",
  "profiles",
  "role_permissions",
  "tarea_comentarios",
  "tarea_instructivos",
  "tarea_subtareas",
  "tareas",
  "toner_modelos",
  "toner_movimientos",
  "toner_unidades",
  "user_roles",
  "wiki_attachments",
  "wiki_docs",
  "wiki_folders",
]);

const WRITABLE_BY_TECH = new Set([
  "guardias",
  "inventario",
  "tarea_comentarios",
  "tarea_instructivos",
  "tarea_subtareas",
  "tareas",
  "toner_modelos",
  "toner_movimientos",
  "toner_unidades",
  "wiki_attachments",
  "wiki_docs",
  "wiki_folders",
]);

const AUDIT_META: Record<string, { modulo: string; fields: string[] }> = {
  app_settings: { modulo: "configuracion", fields: ["version_actual"] },
  credenciales: { modulo: "credenciales", fields: ["servicio", "usuario", "ip", "url"] },
  guardias: { modulo: "guardias", fields: ["operador_nombre", "desde", "hasta"] },
  inventario: { modulo: "inventario", fields: ["codigo", "nombre", "marca", "modelo", "numero_serie"] },
  profiles: { modulo: "usuarios", fields: ["full_name", "email", "username"] },
  role_permissions: { modulo: "roles", fields: ["role", "modulo"] },
  tareas: { modulo: "tareas", fields: ["titulo", "estado", "prioridad"] },
  tarea_comentarios: { modulo: "tareas", fields: ["contenido"] },
  tarea_instructivos: { modulo: "tareas", fields: ["tarea_id", "doc_id"] },
  tarea_subtareas: { modulo: "tareas", fields: ["titulo"] },
  toner_modelos: { modulo: "toners", fields: ["nombre", "marca", "prefijo"] },
  toner_movimientos: { modulo: "toners", fields: ["tipo", "cantidad", "responsable", "sector", "toner_entra"] },
  toner_unidades: { modulo: "toners", fields: ["codigo", "estado"] },
  user_roles: { modulo: "usuarios", fields: ["user_id", "role"] },
  wiki_attachments: { modulo: "instructivos", fields: ["file_name", "doc_id"] },
  wiki_docs: { modulo: "instructivos", fields: ["title"] },
  wiki_folders: { modulo: "instructivos", fields: ["name"] },
};

function tableName(table: string) {
  cleanIdentifier(table);
  if (!TABLES.has(table)) throw new Error("Tabla no permitida");
  return table;
}

function parseColumns(columns = "*") {
  if (columns.includes("(")) return "*";
  if (columns.trim() === "*") return "*";
  return columns
    .split(",")
    .map((c) => cleanIdentifier(c.trim()))
    .join(", ");
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
  return ` order by ${order
    .map((o) => `${cleanIdentifier(o.column)} ${o.ascending === false ? "desc" : "asc"}`)
    .join(", ")}`;
}

function rowDescription(table: string, row: Record<string, unknown>) {
  const meta = AUDIT_META[table];
  const parts = (meta?.fields ?? ["id"])
    .map((field) => row[field])
    .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
    .map((value) => String(value));
  return parts.slice(0, 3).join(" - ") || String(row.id ?? "");
}

async function writeAudit(
  actorId: string,
  table: string,
  accion: "crear" | "editar" | "eliminar" | "asignar_rol",
  rows: Record<string, unknown>[],
  detalle: Record<string, unknown> = {},
) {
  const meta = AUDIT_META[table];
  if (!meta || rows.length === 0) return;

  const actor = await one<{ full_name: string; email: string }>(
    `select full_name, email from profiles where id = $1`,
    [actorId],
  );

  for (const row of rows.slice(0, 50)) {
    await query(
      `insert into audit_log
        (actor_id, actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        actorId,
        actor?.full_name ?? "",
        actor?.email ?? "",
        meta.modulo,
        accion,
        row.id ? String(row.id) : null,
        rowDescription(table, row),
        JSON.stringify({ tabla: table, ...detalle }),
      ],
    );
  }
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
  if (WRITABLE_BY_TECH.has(table)) {
    await assertCanWrite(userId);
    return;
  }
  await assertAdmin(userId);
}

function withJoinedModels(table: string, rows: any[]) {
  return async () => {
    if (!["toner_movimientos", "toner_unidades"].includes(table) || rows.length === 0) return rows;
    const ids = [...new Set(rows.map((r) => r.modelo_id).filter(Boolean))];
    if (ids.length === 0) return rows;
    const models = await query<{ id: string; nombre: string }>(
      `select id, nombre from toner_modelos where id = any($1::uuid[])`,
      [ids],
    );
    const byId = new Map(models.rows.map((m) => [m.id, { nombre: m.nombre }]));
    return rows.map((r) => ({ ...r, toner_modelos: byId.get(r.modelo_id) ?? null }));
  };
}

export const apiSelect = createServerFn({ method: "POST" })
  .inputValidator((data: SelectInput) => data)
  .handler(async ({ data }) => {
    await requireSession(data.token);
    const table = tableName(data.table);
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
    const rows = await withJoinedModels(table, result.rows)();
    return { data: data.maybeSingle ? (rows[0] ?? null) : rows, count: null, error: null };
  });

export const apiMutate = createServerFn({ method: "POST" })
  .inputValidator((data: MutateInput) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    const table = tableName(data.table);
    await assertWriteAccess(session.user.id, table);
    const values: unknown[] = [];
    const where = appendFilters(data.filters, values);

    if (data.action === "delete") {
      const before = await query<Record<string, unknown>>(`select * from ${table}${where}`, values);
      await query(`delete from ${table}${where}`, values);
      await writeAudit(session.user.id, table, "eliminar", before.rows);
      return { data: null, error: null };
    }

    if (data.action === "update") {
      const payload = data.values as Record<string, unknown>;
      const assignments = Object.keys(payload).map((key) => {
        values.push(payload[key]);
        return `${cleanIdentifier(key)} = $${values.length}`;
      });
      if (assignments.length === 0) throw new Error("Sin datos para actualizar");
      const result = await query<Record<string, unknown>>(
        `update ${table} set ${assignments.join(", ")}${where} returning *`,
        values,
      );
      await writeAudit(session.user.id, table, "editar", result.rows, {
        campos: Object.keys(payload),
      });
      return { data: null, error: null };
    }

    const rows = Array.isArray(data.values) ? data.values : [data.values as Record<string, unknown>];
    if (!rows.length || !rows[0]) throw new Error("Sin datos para insertar");
    const cols = Object.keys(rows[0]).map(cleanIdentifier);
    const placeholders = rows.map((row) => {
      const parts = cols.map((col) => {
        values.push(row[col]);
        return `$${values.length}`;
      });
      return `(${parts.join(", ")})`;
    });
    const result = await query(
      `insert into ${table} (${cols.join(", ")}) values ${placeholders.join(", ")} returning *`,
      values,
    );
    await writeAudit(session.user.id, table, "crear", result.rows);
    return { data: result.rows.length === 1 ? result.rows[0] : result.rows, error: null };
  });

export const apiRpc = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null; name: string; args?: Record<string, any> }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    if (data.name === "has_role") {
      const row = await one<{ ok: boolean }>(
        `select exists(select 1 from user_roles where user_id = $1 and role = $2) as ok`,
        [data.args?._user_id, data.args?._role],
      );
      return { data: !!row?.ok, error: null };
    }
    if (data.name === "directorio_usuarios") {
      const result = await query(`select id, full_name from profiles order by full_name`);
      return { data: result.rows, error: null };
    }
    if (data.name === "audit_actores") {
      const result = await query(
        `select id as actor_id, full_name as actor_nombre, email as actor_email
           from profiles
          order by full_name`,
      );
      return { data: result.rows, error: null };
    }
    if (data.name === "set_user_role") {
      await assertAdmin(session.user.id);
      if (data.args?._user_id === session.user.id && data.args?._role !== "administrador") {
        throw new Error("No podés quitarte tu propio rol de administrador");
      }
      await query(`delete from user_roles where user_id = $1`, [data.args?._user_id]);
      await query(`insert into user_roles (user_id, role) values ($1, $2)`, [
        data.args?._user_id,
        data.args?._role,
      ]);
      await writeAudit(
        session.user.id,
        "user_roles",
        "asignar_rol",
        [{ id: data.args?._user_id, user_id: data.args?._user_id, role: data.args?._role }],
        { rol: data.args?._role },
      );
      return { data: null, error: null };
    }
    if (data.name === "generar_codigos_toner") {
      await assertCanWrite(session.user.id);
      const cantidad = Math.max(1, Math.min(200, Number(data.args?._cantidad ?? 1)));
      const client = await query("select 1");
      void client;
      const model = await one<{ id: string; nombre: string; prefijo: string; correlativo: number }>(
        `update toner_modelos
            set correlativo = correlativo + $2
          where id = $1
          returning id, nombre, prefijo, correlativo - $2 as correlativo`,
        [data.args?._modelo_id, cantidad],
      );
      if (!model) throw new Error("Modelo inexistente");
      const actor = await one<{ full_name: string; email: string }>(
        `select full_name, email from profiles where id = $1`,
        [session.user.id],
      );
      const codes: string[] = [];
      for (let i = 1; i <= cantidad; i += 1) {
        const code = `${model.prefijo}-${String(model.correlativo + i).padStart(4, "0")}`;
        codes.push(code);
        await query(
          `insert into toner_unidades (modelo_id, codigo, generado_por, generado_por_nombre)
           values ($1, $2, $3, $4)`,
          [data.args?._modelo_id, code, session.user.id, actor?.full_name ?? actor?.email ?? ""],
        );
      }
      await writeAudit(
        session.user.id,
        "toner_unidades",
        "crear",
        codes.map((codigo) => ({
          id: codigo,
          codigo,
          estado: "en_stock",
          modelo: model.nombre,
        })),
        { modelo_id: model.id, modelo: model.nombre, cantidad, accion_especial: "generar_codigos" },
      );
      return { data: codes, error: null };
    }
    throw new Error("Función no permitida");
  });

export const authGetSession = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null }) => data)
  .handler(async ({ data }) => ({ session: await getSession(data.token) }));

export const authSignIn = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const username = (data.username ?? "").trim().toLowerCase();
    const user = await one<{ id: string; password_hash: string }>(
      `select u.id, u.password_hash
         from app_users u
         join profiles p on p.id = u.id
        where p.username = $1 or u.email = $1`,
      [username],
    );
    if (!user || !(await verifyPassword(data.password ?? "", user.password_hash))) {
      throw new Error("Usuario o contraseña incorrectos");
    }
    const token = await createSession(user.id);
    return { session: await getSession(token) };
  });

export const authSignUp = createServerFn({ method: "POST" })
  .inputValidator((data: { fullName: string; username: string; email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const fullName = (data.fullName ?? "").trim();
    const username = (data.username ?? "").trim().toLowerCase();
    const email = (data.email ?? "").trim().toLowerCase();
    if (fullName.length < 2) throw new Error("Ingresá tu nombre y apellido");
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("Usuario inválido");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
    if ((data.password ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    const exists = await one(`select id from app_users where email = $1 union select id from profiles where username = $2`, [
      email,
      username,
    ]);
    if (exists) throw new Error("Ese usuario o correo ya está registrado");
    const passwordHash = await hashPassword(data.password);
    const result = await query<{ id: string }>(
      `insert into app_users (email, password_hash) values ($1, $2) returning id`,
      [email, passwordHash],
    );
    const userId = result.rows[0].id;
    await query(`insert into profiles (id, full_name, email, username) values ($1, $2, $3, $4)`, [
      userId,
      fullName,
      email,
      username,
    ]);
    const first = await one<{ count: string }>(`select count(*)::text as count from app_users`);
    await query(`insert into user_roles (user_id, role) values ($1, $2)`, [
      userId,
      Number(first?.count ?? 0) <= 1 ? "administrador" : "consulta",
    ]);
    const token = await createSession(userId);
    return { session: await getSession(token) };
  });

export const authSignOut = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null }) => data)
  .handler(async ({ data }) => {
    await deleteSession(data.token);
    return { ok: true };
  });

export const authResetPassword = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string }) => data)
  .handler(async () => {
    throw new Error("El restablecimiento por correo requiere configurar un proveedor SMTP.");
  });

export const authUpdatePassword = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null; password: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    if ((data.password ?? "").length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    await query(`update app_users set password_hash = $1 where id = $2`, [
      await hashPassword(data.password),
      session.user.id,
    ]);
    return { ok: true };
  });

export const storageUpload = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null; bucket: string; path: string; base64: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertCanWrite(session.user.id);
    await saveFile(data.bucket, data.path, data.base64);
    return { data: { path: data.path }, error: null };
  });

export const storageSignedUrl = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null; bucket: string; path: string }) => data)
  .handler(async ({ data }) => {
    await requireSession(data.token);
    return { data: { signedUrl: await readFileAsDataUrl(data.bucket, data.path) }, error: null };
  });

export const storageRemove = createServerFn({ method: "POST" })
  .inputValidator((data: { token?: string | null; bucket: string; path: string }) => data)
  .handler(async ({ data }) => {
    const session = await requireSession(data.token);
    await assertCanWrite(session.user.id);
    await removeFile(data.bucket, data.path);
    return { data: null, error: null };
  });
