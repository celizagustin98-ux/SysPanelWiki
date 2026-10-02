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
  const expected = Buffer.from(hash, "hex");
  if (key.length !== expected.length) return false;
  return timingSafeEqual(key, expected);
}

export async function createSession(userId: string, days = 14) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  await query(
    `insert into app_sessions (token_hash, user_id, expires_at) values ($1, $2, $3)`,
    [tokenHash, userId, expires.toISOString()],
  );
  return token;
}

export async function deleteSession(token: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await query(`delete from app_sessions where token_hash = $1`, [tokenHash]);
}

export async function getSession(token: string | null | undefined): Promise<AuthSession | null> {
  if (!token) return null;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await one<
    {
      user_id: string;
      email: string;
      full_name: string;
      username: string | null;
      role: AppRole;
    }
  >(
    `select s.user_id, u.email, p.full_name, p.username, coalesce(rp.role, 'consulta') as role
     from app_sessions s
     join auth_users u on u.id = s.user_id
     left join profiles p on p.id = u.id
     left join role_permissions rp on rp.user_id = u.id
     where s.token_hash = $1 and s.expires_at > now()`,
    [tokenHash],
  );
  if (!row) return null;
  return {
    token,
    user: { id: row.user_id, email: row.email },
    profile: {
      id: row.user_id,
      full_name: row.full_name || row.email,
      email: row.email,
      username: row.username,
    },
    role: row.role,
  };
}

export async function ensureStorageDir(sub?: string) {
  const base = resolve(process.env.FILE_STORAGE_DIR || "./storage");
  const dir = sub ? join(base, sub) : base;
  await mkdir(dir, { recursive: true });
  return dir;
}

export function safePath(base: string, ...parts: string[]) {
  const full = normalize(join(base, ...parts));
  if (!full.startsWith(normalize(base))) {
    throw new Error("Path traversal blocked");
  }
  return full;
}

export async function readSecret(key: string) {
  const row = await one<{ value_enc: string }>(`select value_enc from app_secrets where key = $1`, [key]);
  if (!row) return null;
  // decryption handled in serve.mjs / secrets layer
  return row.value_enc;
}

export { pool };
