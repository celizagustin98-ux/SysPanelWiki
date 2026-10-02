import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import pg from "pg";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const clientDir = resolve("dist/client");
const app = await import("../dist/server/server.js").then((module) => module.default);
const { Pool } = pg;
const scrypt = promisify(scryptCb);
const execFileAsync = promisify(execFile);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
});
const DEFAULT_BRANCH = "main";
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 1024 * 1024);
/** Simple in-memory rate limiter: key -> { count, resetAt } */
const rateBuckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = rateBuckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    rateBuckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    const err = new Error("Demasiados intentos. Esperá unos minutos y volvé a intentar.");
    err.statusCode = 429;
    throw err;
  }
}
function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket?.remoteAddress || "unknown";
}
// Periodic cleanup of expired sessions + rate buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) {
    if (b.resetAt <= now) rateBuckets.delete(k);
  }
  pool.query(`delete from app_sessions where expires_at < now()`).catch(() => {});
}, 15 * 60 * 1000);

const packageInfo = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const buildInfo = readBuildInfo();
const buildTime = buildInfo.builtAt || new Date().toISOString();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function readBuildInfo() {
  try {
    return JSON.parse(readFileSync(resolve("build-info.json"), "utf8"));
  } catch {
    return {};
  }
}

function getStaticFilePath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relativePath =
    pathname === "/favicon.svg" || pathname === "/favicon.ico"
      ? "favicon.svg"
      : pathname.replace(/^\/+/, "");
  const candidates = [
    normalize(join(clientDir, relativePath)),
    normalize(join(resolve("public"), relativePath)),
  ];
  for (const filePath of candidates) {
    const root = filePath.startsWith(clientDir) ? clientDir : resolve("public");
    if (!filePath.startsWith(root)) continue;
    if (!existsSync(filePath)) continue;
    const stat = statSync(filePath);
    if (stat.isFile()) return filePath;
  }
  return null;
}

function trySendStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const filePath = getStaticFilePath(req.url || "/");
  if (!filePath) return false;
  const ext = extname(filePath).toLowerCase();
  res.statusCode = 200;
  setSecurityHeaders(req, res);
  res.setHeader("content-type", contentTypes[ext] || "application/octet-stream");
  res.setHeader("cache-control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(filePath).pipe(res);
  return true;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  setSecurityHeaders(null, res);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.statusCode = status;
  setSecurityHeaders(null, res);
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  if (status === 503) res.setHeader("retry-after", "300");
  res.end(html);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      const error = new Error("La solicitud supera el tamaño máximo permitido");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const error = new Error("JSON inválido");
    error.statusCode = 400;
    throw error;
  }
}

function setSecurityHeaders(req, res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "same-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  );
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "");
  if (forwardedProto === "https") {
    res.setHeader("cross-origin-opener-policy", "same-origin");
    res.setHeader("strict-transport-security", "max-age=15552000; includeSubDomains");
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${key.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const key = await scrypt(password, salt, 64);
  const storedKey = Buffer.from(hash, "hex");
  return storedKey.length === key.length && timingSafeEqual(storedKey, key);
}

async function one(text, values = []) {
  const result = await pool.query(text, values);
  return result.rows[0] || null;
}

async function query(text, values = []) {
  return pool.query(text, values);
}

async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    `insert into app_sessions (token_hash, user_id, expires_at) values ($1, $2, now() + interval '30 days')`,
    [hashToken(token), userId],
  );
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const session = await one(
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
    profile: { id: session.user_id, full_name: session.full_name, email: session.email, username: session.username },
    role: session.role || "consulta",
  };
}

function bearerToken(req) {
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

async function requireRequestSession(req) {
  const session = await getSession(bearerToken(req) || "");
  if (!session) {
    const error = new Error("No autorizado");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

async function requireAdmin(req) {
  const session = await requireRequestSession(req);
  if (session.role !== "administrador") {
    const error = new Error("Solo administradores pueden instalar actualizaciones");
    error.statusCode = 403;
    throw error;
  }
  return session;
}

function storageFilePath(bucket, path) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bucket)) return null;
  const base = resolve(process.env.FILE_STORAGE_DIR || join(process.cwd(), "storage"));
  const safePath = normalize(String(path || "")).replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
  const filePath = resolve(base, bucket, safePath);
  const bucketDir = resolve(base, bucket);
  if (!filePath.startsWith(`${bucketDir}/`) && filePath !== bucketDir) return null;
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  return stat.isFile() ? { filePath, stat } : null;
}

function safeDownloadName(name) {
  return String(name || "instructivo.pdf").replace(/[^\w .()-]/g, "_");
}

function maintenanceEnabled() {
  const value = String(process.env.MAINTENANCE_MODE || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function loadStatusHtml(kind) {
  for (const file of [resolve(`public/${kind}.html`), resolve(`dist/client/${kind}.html`)]) {
    if (existsSync(file)) {
      try {
        return readFileSync(file, "utf8");
      } catch {
        /* continue */
      }
    }
  }
  const message = process.env.MAINTENANCE_MESSAGE || "Estamos actualizando SysIntranet. El servicio vuelve en breve.";
  const safe = String(message).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  if (kind === "maintenance") {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Mantenimiento · SysIntranet</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#0b1220;color:#e8eef7;padding:1.5rem}.c{max-width:28rem;text-align:center;padding:2rem;border:1px solid rgba(148,163,184,.2);border-radius:1rem;background:#121a2b}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#94a3b8;margin:0 0 1rem}button{background:#14b8a6;color:#042f2e;border:0;border-radius:.6rem;padding:.55rem 1rem;font-weight:600;cursor:pointer}</style></head>
<body><div class="c"><h1>Mantenimiento en curso</h1><p>${safe}</p><button onclick="location.reload()">Reintentar</button></div></body></html>`;
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Error · SysIntranet</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;background:#0b1220;color:#e8eef7;margin:0">
<div style="text-align:center;max-width:24rem;padding:1.5rem"><h1 style="font-size:1.25rem">El panel no cargó</h1>
<p style="color:#94a3b8">Ocurrió un error en el servidor.</p>
<button onclick="location.reload()" style="background:#14b8a6;color:#042f2e;border:0;border-radius:.6rem;padding:.55rem 1rem;font-weight:600;cursor:pointer">Reintentar</button></div></body></html>`;
}

async function mapDbError(error) {
  const msg = String(error?.message || error || "");
  if (/password authentication failed/i.test(msg)) {
    return "La aplicación no puede conectar a PostgreSQL (usuario syswiki). Revisá DATABASE_URL.";
  }
  if (/econnrefused|connection refused/i.test(msg)) {
    return "No hay conexión con PostgreSQL. Verificá que el servicio esté activo.";
  }
  return error instanceof Error ? error.message : "Error de servidor";
}

async function handleAuth(req, res) {
  if (!req.url?.startsWith("/api/auth/")) return false;
  const action = new URL(req.url, "http://localhost").pathname.replace("/api/auth/", "");
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Método no permitido");
      return true;
    }
    const body = await readJson(req);
    if (action === "session") {
      sendJson(res, 200, { session: await getSession(body.token || "") });
      return true;
    }
    if (action === "signout") {
      if (body.token) {
        await pool.query(`delete from app_sessions where token_hash = $1`, [hashToken(body.token)]);
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (action === "signin") {
      rateLimit(`signin:${clientIp(req)}`, 10, 60_000);
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!username || !password) {
        sendJson(res, 400, { error: "Usuario y contraseña requeridos" });
        return true;
      }
      const row = await one(
        `select u.id, u.email, u.password_hash, p.full_name, p.username
           from profiles p join app_users u on u.id = p.id
          where lower(p.username) = $1 or lower(u.email) = $1 limit 1`,
        [username],
      );
      if (!row || !(await verifyPassword(password, row.password_hash))) {
        sendJson(res, 401, { error: "Usuario o contraseña incorrectos" });
        return true;
      }
      const token = await createSession(row.id);
      sendJson(res, 200, { session: await getSession(token) });
      return true;
    }
    if (action === "signup") {
      rateLimit(`signup:${clientIp(req)}`, 5, 60 * 60_000);
      const fullName = String(body.fullName || "").trim();
      const username = String(body.username || "").trim().toLowerCase();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (fullName.length < 2) {
        sendJson(res, 400, { error: "Ingresá tu nombre y apellido" });
        return true;
      }
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        sendJson(res, 400, { error: "Usuario inválido" });
        return true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { error: "Correo inválido" });
        return true;
      }
      if (password.length < 8) {
        sendJson(res, 400, { error: "La contraseña debe tener al menos 8 caracteres" });
        return true;
      }
      const userCount = await one(`select count(*)::text as count from app_users`);
      const count = Number(userCount?.count || 0);
      if (count > 0 && process.env.ALLOW_PUBLIC_SIGNUP === "false") {
        sendJson(res, 403, { error: "El registro público está deshabilitado. Un administrador debe crear el usuario." });
        return true;
      }
      const exists = await one(
        `select id from app_users where email = $1 union select id from profiles where username = $2`,
        [email, username],
      );
      if (exists) {
        sendJson(res, 409, { error: "Ese usuario o correo ya está registrado" });
        return true;
      }
      const passwordHash = await hashPassword(password);
      const created = await query(`insert into app_users (email, password_hash) values ($1, $2) returning id`, [email, passwordHash]);
      const userId = created.rows[0].id;
      await query(`insert into profiles (id, full_name, email, username) values ($1, $2, $3, $4)`, [userId, fullName, email, username]);
      await query(`insert into user_roles (user_id, role) values ($1, $2)`, [userId, count === 0 ? "administrador" : "consulta"]);
      const token = await createSession(userId);
      sendJson(res, 200, { session: await getSession(token) });
      return true;
    }
    sendJson(res, 404, { error: "Ruta de autenticación inexistente" });
    return true;
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: await mapDbError(error) });
    return true;
  }
}
