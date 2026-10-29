import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { mensajeErrorBase } from "./seguridad";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const { Pool, types } = pg;

// Columnas `date` como texto "YYYY-MM-DD": evita que se corran un día por zona horaria.
types.setTypeParser(1082, (value: string) => value);
const scrypt = promisify(scryptCb);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
});
// Una conexión inactiva que se corta (reinicio de PostgreSQL, red) no debe tirar abajo el servidor:
// el pool la descarta y abre otra en la próxima consulta.
pool.on("error", (error) => {
  console.error("[db] conexión inactiva con error:", error.message);
});

/** Clave del rol (administrador, tecnico, consulta o uno personalizado de la tabla roles). */
export type AppRole = string;

export type AuthSession = {
  token: string;
  user: { id: string; email: string };
  profile: { id: string; full_name: string; email: string; username: string | null; avatar_url: string | null; cargo: string | null };
  role: AppRole;
};

export function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Configurá la conexión PostgreSQL en el entorno.");
  }
}

export async function query<T = any>(text: string, values: unknown[] = []) {
  requireDatabaseUrl();
  try {
    return await pool.query<T>(text, values);
  } catch (error) {
    // El detalle (tablas, columnas, restricciones) queda en el log del servidor, no llega al navegador.
    const amigable = mensajeErrorBase(error);
    if (!amigable) throw error;
    console.error("[db]", (error as Error).message);
    throw new Error(amigable);
  }
}

export async function one<T = any>(text: string, values: unknown[] = []) {
  const result = await query<T>(text, values);
  return result.rows[0] ?? null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const key = (await scrypt(password, salt, 64)) as Buffer;
  const storedKey = Buffer.from(hash, "hex");
  return storedKey.length === key.length && timingSafeEqual(storedKey, key);
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await query(
    `insert into app_sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + interval '30 days')`,
    [hashToken(token), userId],
  );
  return token;
}

// Caché en memoria de sesión, rol y permisos. Cada request validaba la sesión y el rol
// contra la BD (2-4 consultas extra); con TTL corto los cambios se ven en segundos.
const CACHE_TTL_MS = 20_000;
const sessionCache = new Map<string, { value: AuthSession; expires: number }>();
const roleCache = new Map<string, { value: AppRole | null; expires: number }>();
const permCache = new Map<string, { value: boolean; expires: number }>();

function cacheGet<T>(map: Map<string, { value: T; expires: number }>, key: string) {
  const hit = map.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    map.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheSet<T>(map: Map<string, { value: T; expires: number }>, key: string, value: T) {
  if (map.size > 5000) map.clear();
  map.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/** Invalida la caché de un usuario (cambio de rol, contraseña o baja). Sin argumento, limpia todo. */
export function invalidateAuthCache(userId?: string) {
  permCache.clear();
  if (!userId) {
    sessionCache.clear();
    roleCache.clear();
    return;
  }
  roleCache.delete(userId);
  for (const [key, entry] of sessionCache) {
    if (entry.value.user.id === userId) sessionCache.delete(key);
  }
}

/** Invalida solo los permisos por módulo (al editar role_permissions). */
export function invalidatePermissionCache() {
  permCache.clear();
}

export async function deleteSession(token: string | null | undefined) {
  if (!token) return;
  sessionCache.delete(hashToken(token));
  await query(`delete from app_sessions where token_hash = $1`, [hashToken(token)]);
}

export async function getSession(token: string | null | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const cached = cacheGet(sessionCache, tokenHash);
  if (cached) return cached;
  const session = await one<{
    user_id: string;
    email: string;
    full_name: string;
    username: string | null;
    avatar_url: string | null;
    cargo: string | null;
    role: AppRole | null;
  }>(
    `select s.user_id, u.email, p.full_name, p.username, p.avatar_url, p.cargo, ur.role
       from app_sessions s
       join app_users u on u.id = s.user_id
       join profiles p on p.id = u.id
       left join lateral (
         select role from user_roles where user_id = u.id
         order by case role when 'administrador' then 1 when 'tecnico' then 2 else 3 end
         limit 1
       ) ur on true
      where s.token_hash = $1 and s.expires_at > now() and u.activo`,
    [tokenHash],
  );
  if (!session) return null;
  const result: AuthSession = {
    token,
    user: { id: session.user_id, email: session.email },
    profile: {
      id: session.user_id,
      full_name: session.full_name,
      email: session.email,
      username: session.username,
      avatar_url: session.avatar_url ?? null,
      cargo: session.cargo ?? null,
    },
    role: session.role ?? "consulta",
  };
  cacheSet(sessionCache, tokenHash, result);
  cacheSet(roleCache, result.user.id, result.role);
  return result;
}

export async function requireSession(token: string | null | undefined) {
  const session = await getSession(token);
  if (!session) throw new Error("Sesión inválida o vencida");
  return session;
}

export async function getUserRole(userId: string): Promise<AppRole | null> {
  const cached = cacheGet(roleCache, userId);
  if (cached !== undefined) return cached;
  const row = await one<{ role: AppRole }>(
    `select role from user_roles where user_id = $1
     order by case role when 'administrador' then 1 when 'tecnico' then 2 else 3 end
     limit 1`,
    [userId],
  );
  const role = row?.role ?? null;
  cacheSet(roleCache, userId, role);
  return role;
}

export async function isAdmin(userId: string) {
  return (await getUserRole(userId)) === "administrador";
}

export async function canWrite(userId: string) {
  const role = await getUserRole(userId);
  return role === "administrador" || role === "tecnico";
}

export async function assertCanWrite(userId: string) {
  if (!(await canWrite(userId))) throw new Error("No autorizado");
}

export async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) throw new Error("Solo un administrador puede realizar esta acción");
}

export async function hasModulePermission(
  userId: string,
  modulo: string,
  accion: "ver" | "crear" | "editar" | "eliminar",
) {
  const role = await getUserRole(userId);
  if (role === "administrador") return true;
  if (!role) return false;
  const cacheKey = `${role}:${modulo}:${accion}`;
  const cached = cacheGet(permCache, cacheKey);
  if (cached !== undefined) return cached;
  const col =
    accion === "ver"
      ? "can_view"
      : accion === "crear"
        ? "can_create"
        : accion === "editar"
          ? "can_edit"
          : "can_delete";
  const row = await one<{ ok: boolean }>(
    `select exists(
        select 1 from role_permissions
         where role = $1 and modulo = $2 and ${col} = true
      ) as ok`,
    [role, modulo],
  );
  cacheSet(permCache, cacheKey, !!row?.ok);
  return !!row?.ok;
}

export function cleanIdentifier(value: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error("Identificador inválido");
  return value;
}

export function storagePath(bucket: string, path: string) {
  cleanIdentifier(bucket);
  const base = resolve(process.env.FILE_STORAGE_DIR || join(process.cwd(), "storage"));
  const bucketDir = resolve(base, bucket);
  const safe = normalize(String(path || "")).replace(/^[/\\]+/, "");
  const file = resolve(bucketDir, safe);
  if (!file.startsWith(`${bucketDir}${sep}`) && file !== bucketDir) {
    throw new Error("Ruta de archivo inválida");
  }
  return file;
}

export async function saveFile(bucket: string, path: string, base64: string) {
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024);
  const approximateBytes = Math.floor((base64.length * 3) / 4);
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new Error("MAX_UPLOAD_BYTES inválido");
  if (approximateBytes > maxBytes) throw new Error("El archivo supera el tamaño máximo permitido");
  const file = storagePath(bucket, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(base64, "base64"));
}

export async function removeFile(bucket: string, path: string) {
  const file = storagePath(bucket, path);
  await unlink(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function readFileAsDataUrl(bucket: string, path: string, mime = "application/pdf") {
  const file = storagePath(bucket, path);
  const bytes = await readFile(file);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
