import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { dirname, join, normalize, resolve } from "node:path";
import { promisify } from "node:util";
import pg from "pg";

const { Pool } = pg;
const scrypt = promisify(scryptCb);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
});

export type AppRole = "administrador" | "tecnico" | "consulta";

export type AuthSession = {
  token: string;
  user: { id: string; email: string };
  profile: { id: string; full_name: string; email: string; username: string | null };
  role: AppRole;
};

export function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("Falta DATABASE_URL. Configurá la conexión PostgreSQL en el entorno.");
  }
}

export async function query<T = any>(text: string, values: unknown[] = []) {
  requireDatabaseUrl();
  return pool.query<T>(text, values);
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

export async function deleteSession(token: string | null | undefined) {
  if (!token) return;
  await query(`delete from app_sessions where token_hash = $1`, [hashToken(token)]);
}

export async function getSession(token: string | null | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  const session = await one<{
    user_id: string;
    email: string;
    full_name: string;
    username: string | null;
    role: AppRole | null;
  }>(
    `select s.user_id, u.email, p.full_name, p.username, ur.role
       from app_sessions s
       join app_users u on u.id = s.user_id
       join profiles p on p.id = u.id
       left join lateral (
         select role from user_roles where user_id = u.id
         order by case role when 'administrador' then 1 when 'tecnico' then 2 else 3 end
         limit 1
       ) ur on true
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  if (!session) return null;
  return {
    token,
    user: { id: session.user_id, email: session.email },
    profile: {
      id: session.user_id,
      full_name: session.full_name,
      email: session.email,
      username: session.username,
    },
    role: session.role ?? "consulta",
  };
}

export async function requireSession(token: string | null | undefined) {
  const session = await getSession(token);
  if (!session) throw new Error("Sesión inválida o vencida");
  return session;
}

export async function isAdmin(userId: string) {
  const row = await one<{ ok: boolean }>(
    `select exists(select 1 from user_roles where user_id = $1 and role = 'administrador') as ok`,
    [userId],
  );
  return !!row?.ok;
}

export async function canWrite(userId: string) {
  const row = await one<{ ok: boolean }>(
    `select exists(select 1 from user_roles where user_id = $1 and role in ('administrador','tecnico')) as ok`,
    [userId],
  );
  return !!row?.ok;
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
  if (await isAdmin(userId)) return true;
  const roleRow = await one<{ role: AppRole }>(
    `select role from user_roles where user_id = $1
     order by case role when 'administrador' then 1 when 'tecnico' then 2 else 3 end
     limit 1`,
    [userId],
  );
  if (!roleRow?.role) return false;
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
    [roleRow.role, modulo],
  );
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
  if (!file.startsWith(`${bucketDir}/`) && file !== bucketDir) {
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
