import { createServer } from "node:http";
import { execFile, spawn } from "node:child_process";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
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
// X-Forwarded-For lo puede inventar cualquiera: solo se usa si la conexión viene de un proxy
// de confianza (por defecto, el mismo servidor: Caddy/Nginx en 127.0.0.1). TRUST_PROXY=true lo fuerza.
const PROXIES_CONFIABLES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1", ...String(process.env.TRUSTED_PROXIES || "").split(",").map((x) => x.trim()).filter(Boolean)]);
function desdeProxy(req) {
  return process.env.TRUST_PROXY === "true" || PROXIES_CONFIABLES.has(req.socket?.remoteAddress || "");
}
function clientIp(req) {
  const directa = req.socket?.remoteAddress || "unknown";
  if (!desdeProxy(req)) return directa;
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || directa;
}
function esHttps(req) {
  return desdeProxy(req) && String(req?.headers?.["x-forwarded-proto"] || "") === "https";
}
// Periodic cleanup of expired sessions + rate buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of rateBuckets) {
    if (b.resetAt <= now) rateBuckets.delete(k);
  }
  pool.query(`delete from app_sessions where expires_at < now()`).catch(() => {});
}, 15 * 60 * 1000).unref();
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
  // La cámara se permite solo para este sitio (escáner QR); el resto queda bloqueado.
  res.setHeader("permissions-policy", "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  res.setHeader("x-robots-tag", "noindex, nofollow");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("x-permitted-cross-domain-policies", "none");
  res.setHeader(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' blob: data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join("; "),
  );
  if (req && esHttps(req)) {
    res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
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
    `select s.user_id, u.email, p.full_name, p.username, p.avatar_url, p.cargo, ur.role
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
      avatar_url: session.avatar_url ?? null,
      cargo: session.cargo ?? null,
    },
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
  if (!filePath.startsWith(`${bucketDir}${sep}`) && filePath !== bucketDir) return null;
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
  const message = process.env.MAINTENANCE_MESSAGE || "Estamos actualizando Nodara. El servicio vuelve en breve.";
  const safe = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  if (kind === "maintenance") {
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Mantenimiento · Nodara</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:15px/1.5 system-ui,sans-serif;background:#0b1220;color:#e8eef7;padding:1.5rem}.c{max-width:28rem;text-align:center;padding:2rem;border:1px solid rgba(148,163,184,.2);border-radius:1rem;background:#121a2b}h1{font-size:1.25rem;margin:0 0 .5rem}p{color:#94a3b8;margin:0 0 1rem}button{background:#14b8a6;color:#042f2e;border:0;border-radius:.6rem;padding:.55rem 1rem;font-weight:600;cursor:pointer}</style></head>
<body><div class="c"><h1>Mantenimiento en curso</h1><p>${safe}</p><button onclick="location.reload()">Reintentar</button></div></body></html>`;
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><title>Error · Nodara</title></head>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;background:#0b1220;color:#e8eef7;margin:0">
<div style="text-align:center;max-width:24rem;padding:1.5rem"><h1 style="font-size:1.25rem">El panel no cargó</h1>
<p style="color:#94a3b8">Ocurrió un error en el servidor.</p>
<button onclick="location.reload()" style="background:#14b8a6;color:#042f2e;border:0;border-radius:.6rem;padding:.55rem 1rem;font-weight:600;cursor:pointer">Reintentar</button></div></body></html>`;
}

async function mapDbError(error) {
  // Los mensajes propios (con statusCode) se muestran; los de la base o del sistema, no.
  if (error?.statusCode && error.statusCode < 500) return error.message;
  const msg = String(error?.message || error || "");
  if (/password authentication failed|econnrefused|connection refused|getaddrinfo/i.test(msg)) {
    return "El servidor no puede conectarse a la base de datos. Avisá al administrador.";
  }
  return "Error del servidor. Intentá de nuevo en unos minutos.";
}

/** Permiso del rol del usuario en un módulo (misma matriz que Configuración → Roles y permisos). */
async function puedeEnModulo(session, modulo, columna = "can_view") {
  if (session.role === "administrador") return true;
  if (!["can_view", "can_create", "can_edit", "can_delete"].includes(columna)) return false;
  const row = await one(`select ${columna} as ok from role_permissions where role = $1 and modulo = $2`, [session.role, modulo]);
  return !!row?.ok;
}

function prohibido(mensaje = "Tu rol no tiene permiso para ver este archivo") {
  const error = new Error(mensaje);
  error.statusCode = 403;
  return error;
}

// ── Bloqueo por cuenta: 5 contraseñas incorrectas seguidas bloquean ese usuario 15 minutos ──
const fallosLogin = new Map();
const BLOQUEO_MS = 15 * 60_000;
function cuentaBloqueada(usuario) {
  const f = fallosLogin.get(usuario);
  return !!f && f.hasta > Date.now() && f.n >= 5;
}
function registrarFallo(usuario) {
  const ahora = Date.now();
  const f = fallosLogin.get(usuario);
  const prev = f && f.hasta > ahora ? f : { n: 0, hasta: ahora + BLOQUEO_MS };
  fallosLogin.set(usuario, { n: prev.n + 1, hasta: ahora + BLOQUEO_MS });
}
// Hash de una contraseña que no existe: hace que "usuario inexistente" tarde lo mismo que "clave mala".
const HASH_SEÑUELO = `scrypt:${randomBytes(16).toString("hex")}:${randomBytes(64).toString("hex")}`;

function validarClave(clave, usuario) {
  const c = String(clave || "");
  if (c.length < 10) return "La contraseña debe tener al menos 10 caracteres";
  if (c.length > 128) return "La contraseña es demasiado larga";
  if (!/[a-zA-Z]/.test(c) || !/\d/.test(c)) return "La contraseña debe combinar letras y números";
  const u = String(usuario || "").toLowerCase();
  if (u.length >= 3 && c.toLowerCase().includes(u)) return "La contraseña no puede contener el nombre de usuario";
  return null;
}

async function auditarAcceso(actorId, nombre, accion, detalle) {
  try {
    await pool.query(
      `insert into audit_log (actor_id, actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle) values ($1, $2, '', 'usuarios', $3, $1, $2, $4::jsonb)`,
      [actorId, nombre, accion, JSON.stringify(detalle)],
    );
  } catch {
    /* la auditoría nunca bloquea el ingreso */
  }
}

async function handleAuth(req, res) {
  if (!req.url?.startsWith("/api/auth/")) return false;
  const action = new URL(req.url, "http://localhost").pathname.replace("/api/auth/", "");
  try {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Método no permitido" });
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
      const ip = clientIp(req);
      rateLimit(`signin:${ip}`, 10, 60_000);
      rateLimit(`signin-hora:${ip}`, 60, 60 * 60_000);
      const username = String(body.username || "").trim().toLowerCase().slice(0, 120);
      const password = String(body.password || "").slice(0, 200);
      if (!username || !password) {
        sendJson(res, 400, { error: "Usuario y contraseña requeridos" });
        return true;
      }
      if (cuentaBloqueada(username)) {
        sendJson(res, 429, { error: "Demasiados intentos fallidos para este usuario. Esperá 15 minutos o pedí a un administrador que restablezca la contraseña." });
        return true;
      }
      const row = await one(
        `select u.id, u.email, u.password_hash, p.full_name, p.username
           from profiles p join app_users u on u.id = p.id
          where lower(p.username) = $1 or lower(u.email) = $1 limit 1`,
        [username],
      );
      // Se verifica siempre (aunque el usuario no exista) para no revelar qué usuarios existen.
      const valida = await verifyPassword(password, row?.password_hash || HASH_SEÑUELO);
      if (!row || !valida) {
        registrarFallo(username);
        await auditarAcceso(row?.id ?? null, row?.full_name || username, "login_fallido", { usuario: username, ip });
        sendJson(res, 401, { error: "Usuario o contraseña incorrectos" });
        return true;
      }
      fallosLogin.delete(username);
      await auditarAcceso(row.id, row.full_name, "login", { ip });
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
      if (fullName.length < 2 || fullName.length > 120) {
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
      const errorClave = validarClave(password, username);
      if (errorClave) {
        sendJson(res, 400, { error: errorClave });
        return true;
      }
      const passwordHash = await hashPassword(password);
      // Todo en una transacción con bloqueo: dos altas simultáneas no pueden ser ambas "primer administrador".
      const client = await pool.connect();
      let userId;
      try {
        await client.query("begin");
        await client.query("select pg_advisory_xact_lock(724100)");
        const count = Number((await client.query(`select count(*)::int as n from app_users`)).rows[0]?.n || 0);
        if (count > 0 && process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
          await client.query("rollback");
          sendJson(res, 403, { error: "El registro público está deshabilitado. Un administrador debe crear el usuario." });
          return true;
        }
        const exists = (await client.query(`select 1 from app_users where email = $1 union select 1 from profiles where username = $2`, [email, username])).rowCount;
        if (exists) {
          await client.query("rollback");
          sendJson(res, 409, { error: "Ese usuario o correo ya está registrado" });
          return true;
        }
        userId = (await client.query(`insert into app_users (email, password_hash) values ($1, $2) returning id`, [email, passwordHash])).rows[0].id;
        await client.query(`insert into profiles (id, full_name, email, username) values ($1, $2, $3, $4)`, [userId, fullName, email, username]);
        await client.query(`insert into user_roles (user_id, role) values ($1, $2)`, [userId, count === 0 ? "administrador" : "consulta"]);
        await client.query("commit");
        authFlagsCache = { value: null, expires: 0 };
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      await auditarAcceso(userId, fullName, "crear", { alta: "registro", ip: clientIp(req) });
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

async function gitShortSha() {
  try {
    return (await runCommand("git", ["rev-parse", "--short", "HEAD"], { timeout: 10_000 })).trim();
  } catch {
    return process.env.APP_COMMIT || buildInfo.commit || null;
  }
}

async function gitCommitDate() {
  try {
    return (await runCommand("git", ["log", "-1", "--format=%cI"], { timeout: 10_000 })).trim();
  } catch {
    return process.env.APP_UPDATED_AT || buildInfo.commitDate || buildInfo.builtAt || null;
  }
}

function formatDisplayVersion(version) {
  const raw = String(version || "").trim();
  const match = raw.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-beta(?:\.(\d+))?)?$/i);
  if (!match) return raw || "V 1.0.0 oficial";
  const [, major, minor, patch, beta] = match;
  const base = `${major}.${minor}.${patch ?? "0"}`;
  return raw.includes("beta") ? `V ${base} beta${beta && beta !== "0" ? ` ${beta}` : ""}` : `V ${base} oficial`;
}

// Qué ofrece la pantalla de acceso: registro público, o alta del primer administrador si no hay usuarios.
let authFlagsCache = { value: null, expires: 0 };
async function publicAuthFlags() {
  if (authFlagsCache.value && authFlagsCache.expires > Date.now()) return authFlagsCache.value;
  let setupRequired = false;
  let database = true;
  try {
    const row = await one(`select exists(select 1 from app_users) as has_users`);
    setupRequired = !row?.has_users;
  } catch {
    database = false;
  }
  const value = { database, setupRequired, signupEnabled: setupRequired || process.env.ALLOW_PUBLIC_SIGNUP === "true" };
  authFlagsCache = { value, expires: Date.now() + (database ? 30_000 : 5_000) };
  return value;
}

async function handleSystem(req, res) {
  if (req.method === "GET" && req.url?.startsWith("/api/system/health")) {
    sendJson(res, 200, {
      ok: true,
      maintenance: maintenanceEnabled(),
      version: formatDisplayVersion(packageInfo.version || buildInfo.version || "1.0.0"),
      ...(await publicAuthFlags()),
    });
    return true;
  }
  if (req.method !== "GET" || !req.url?.startsWith("/api/system/info")) return false;
  try {
    await requireRequestSession(req);
    const settings = await one(`select version_actual, ultima_revision, ultima_actualizacion, updated_at from app_settings where singleton = true`);
    const commitDate = await gitCommitDate();
    sendJson(res, 200, {
      appVersion: packageInfo.version || buildInfo.version || "1.0.0",
      displayVersion: formatDisplayVersion(packageInfo.version || buildInfo.version || settings?.version_actual || "1.0.0"),
      commit: await gitShortSha(),
      commitDate,
      buildTime,
      environment: process.env.NODE_ENV || "production",
      httpsEnabled: esHttps(req),
      ultimaRevision: settings?.ultima_revision ?? null,
      ultimaActualizacion: commitDate ?? process.env.APP_UPDATED_AT ?? buildTime,
      ultimaActualizacionFuente: commitDate ? "commit" : process.env.APP_UPDATED_AT ? "variable" : "build",
    });
    return true;
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: await mapDbError(error) });
    return true;
  }
}

function gitEnvWithToken() {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? { ...process.env, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: bearer ${token}` }
    : process.env;
}

function gitEnvWithoutToken() {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  delete env.GIT_CONFIG_COUNT;
  delete env.GIT_CONFIG_KEY_0;
  delete env.GIT_CONFIG_VALUE_0;
  return env;
}

async function runCommand(command, args, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd: process.cwd(),
    env: options.env || process.env,
    timeout: options.timeout || 180_000,
    maxBuffer: 1024 * 1024 * 8,
  });
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function runGitWithAuthFallback(args, options = {}) {
  const withToken = options.env || gitEnvWithToken();
  try {
    return await runCommand("git", args, { ...options, env: withToken });
  } catch (error) {
    if (!process.env.GITHUB_TOKEN) throw error;
    const output = `${error?.stdout || ""}\n${error?.stderr || ""}\n${error?.message || ""}`;
    if (!/authentication|authorization|bad credentials|could not read username|permission denied|repository not found/i.test(output)) throw error;
    return runCommand("git", args, { ...options, env: gitEnvWithoutToken() });
  }
}

function updateError(error, fallback) {
  const output = `${error?.stdout || ""}\n${error?.stderr || ""}\n${error?.message || ""}`.trim();
  if (/authentication|could not read username|permission denied|not found/i.test(output)) {
    return "No se pudo acceder al repositorio. Revisá que GITHUB_TOKEN esté configurado en el servidor.";
  }
  if (/local changes|untracked working tree|would be overwritten/i.test(output)) {
    return "No se pudo instalar porque hay archivos locales sin guardar en el servidor.";
  }
  return fallback;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function startBackgroundUpdate({ branch, version, env }) {
  const serviceName = process.env.SERVICE_NAME || process.env.SYSTEMD_SERVICE || "syswiki";
  const logFile = process.env.UPDATE_LOG_FILE || "/tmp/syswiki-update.log";
  const nodePath = process.execPath;
  const script = `
set -euo pipefail
cd ${shellQuote(process.cwd())}
{
  echo "== Nodara update $(date -Is) =="
  if ! git fetch origin ${shellQuote(branch)}; then
    unset GITHUB_TOKEN GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
    git fetch origin ${shellQuote(branch)}
  fi
  git reset --hard origin/${shellQuote(branch)}
  rm -rf dist .output .vinxi node_modules/.vite
  npm ci --no-audit --no-fund
  npm run build
  node scripts/init-db.mjs
  ${shellQuote(nodePath)} - <<'NODE'
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
await pool.query("update app_settings set version_actual = $1, ultima_actualizacion = now() where singleton = true", [process.env.UPDATE_VERSION || "actualizado"]);
await pool.end();
NODE
  if [ "$(id -u)" -eq 0 ]; then systemctl restart ${shellQuote(serviceName)}; else sudo -n systemctl restart ${shellQuote(serviceName)}; fi
  echo "OK $(date -Is)"
} >> ${shellQuote(logFile)} 2>&1
`;
  const child = spawn("/bin/bash", ["-lc", script], { cwd: process.cwd(), env: { ...env, UPDATE_VERSION: version }, detached: true, stdio: "ignore" });
  child.unref();
  return logFile;
}

async function handleUpdates(req, res) {
  if (req.method !== "POST" || !req.url?.startsWith("/api/updates/")) return false;
  try {
    if (process.env.ENABLE_WEB_UPDATES !== "true") {
      sendJson(res, 404, { error: "Actualizaciones web deshabilitadas" });
      return true;
    }
    await requireAdmin(req);
    const action = new URL(req.url, "http://localhost").pathname.replace("/api/updates/", "");
    const branch = process.env.GITHUB_BRANCH || process.env.REPO_BRANCH || DEFAULT_BRANCH;
    if (action === "check") {
      const settings = await one(`select version_actual from app_settings where singleton = true`);
      const currentSha = await runCommand("git", ["rev-parse", "HEAD"], { timeout: 60_000 });
      const remoteLine = await runGitWithAuthFallback(["ls-remote", "origin", `refs/heads/${branch}`], { timeout: 60_000 });
      const remoteSha = remoteLine.split(/\s+/)[0] || "";
      if (!remoteSha) {
        sendJson(res, 200, { ok: false, error: "No se pudo verificar la rama de actualización configurada.", currentVersion: currentSha.slice(0, 7) || settings?.version_actual || "local", latestVersion: null, hasUpdate: false });
        return true;
      }
      await query(`update app_settings set version_actual = $1, ultima_revision = now() where singleton = true`, [currentSha.slice(0, 7) || settings?.version_actual || "local"]);
      sendJson(res, 200, { ok: true, currentVersion: currentSha.slice(0, 7) || settings?.version_actual || "local", latestVersion: remoteSha.slice(0, 7), hasUpdate: remoteSha !== currentSha });
      return true;
    }
    if (action === "apply") {
      const body = await readJson(req);
      const version = String(body.version || "").trim();
      if (!version || version.length > 120) {
        sendJson(res, 400, { error: "Versión inválida" });
        return true;
      }
      try {
        await runGitWithAuthFallback(["ls-remote", "origin", `refs/heads/${branch}`], { timeout: 60_000 });
        await runCommand("npm", ["--version"], { timeout: 30_000 });
      } catch (error) {
        console.error(error);
        sendJson(res, 500, { error: updateError(error, "No se pudo iniciar la actualización. Revisá los logs del servidor.") });
        return true;
      }
      const logFile = startBackgroundUpdate({ branch, version, env: gitEnvWithToken() });
      sendJson(res, 202, { ok: true, version, started: true, logFile });
      return true;
    }
    sendJson(res, 404, { error: "Ruta de actualización inexistente" });
    return true;
  } catch (error) {
    console.error(error);
    if (!error.statusCode) console.error(error);
    sendJson(res, error.statusCode || 500, { error: await mapDbError(error) });
    return true;
  }
}

async function handleInstructivoPdf(req, res) {
  if (req.method !== "GET" || !req.url?.startsWith("/api/instructivos/pdf/")) return false;
  try {
    const session = await requireRequestSession(req);
    if (!(await puedeEnModulo(session, "instructivos"))) throw prohibido();
    const id = decodeURIComponent(req.url.replace("/api/instructivos/pdf/", "").split("?")[0]);
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      sendJson(res, 400, { error: "Adjunto inválido" });
      return true;
    }
    if (!id) {
      sendJson(res, 400, { error: "Falta el id del adjunto" });
      return true;
    }
    const row = await one(`select id, file_name, file_path from wiki_attachments where id = $1`, [id]);
    if (!row) {
      sendJson(res, 404, { error: "Adjunto inexistente" });
      return true;
    }
    const file = storageFilePath("instructivos", row.file_path || row.file_name);
    if (!file) {
      sendJson(res, 404, { error: "Archivo no encontrado en almacenamiento" });
      return true;
    }
    res.statusCode = 200;
    setSecurityHeaders(req, res);
    res.setHeader("content-type", "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${safeDownloadName(row.file_name || "instructivo.pdf")}"`);
    res.setHeader("cache-control", "private, no-store");
    // El archivo se muestra aislado: aunque traiga código, no puede tocar la sesión del sistema.
    res.setHeader("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'self'");
    createReadStream(file.filePath).pipe(res);
    return true;
  } catch (error) {
    if (!error.statusCode) console.error(error);
    sendJson(res, error.statusCode || 500, { error: await mapDbError(error) });
    return true;
  }
}

// Adjuntos de activos y tickets (facturas, fotos, garantías…). Solo usuarios con sesión.
async function handleAdjunto(req, res) {
  if (req.method !== "GET" || !req.url?.startsWith("/api/adjuntos/")) return false;
  try {
    const session = await requireRequestSession(req);
    const url = new URL(req.url, "http://localhost");
    const id = decodeURIComponent(url.pathname.replace("/api/adjuntos/", ""));
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      sendJson(res, 400, { error: "Adjunto inválido" });
      return true;
    }
    const row = await one(`select id, entidad, file_name, file_path, mime from adjuntos where id = $1`, [id]);
    if (row && !(await puedeEnModulo(session, row.entidad === "ticket" ? "tareas" : "inventario"))) throw prohibido();
    if (!row) {
      sendJson(res, 404, { error: "Adjunto inexistente" });
      return true;
    }
    const file = storageFilePath("adjuntos", row.file_path);
    if (!file) {
      sendJson(res, 404, { error: "Archivo no encontrado en almacenamiento" });
      return true;
    }
    // Solo se muestran en el navegador tipos que no ejecutan código; todo lo demás se descarga como binario.
    const declarado = String(row.mime || "").toLowerCase();
    const seguro = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/plain)$/.test(declarado);
    const mime = seguro ? declarado : "application/octet-stream";
    const inline = seguro && url.searchParams.get("descargar") !== "1";
    res.statusCode = 200;
    setSecurityHeaders(req, res);
    res.setHeader("content-security-policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'self'");
    res.setHeader("content-type", mime);
    res.setHeader("content-length", String(file.stat.size));
    res.setHeader("content-disposition", `${inline ? "inline" : "attachment"}; filename="${safeDownloadName(row.file_name)}"`);
    res.setHeader("cache-control", "private, no-store");
    res.setHeader("x-content-type-options", "nosniff");
    createReadStream(file.filePath).pipe(res);
    return true;
  } catch (error) {
    if (!error.statusCode) console.error(error);
    sendJson(res, error.statusCode || 500, { error: await mapDbError(error) });
    return true;
  }
}

// ── QR público: quien escanea una etiqueta sin cuenta ve el equipo y puede reportar una falla ──
async function qrAjustesPublicos() {
  try {
    return (await one(`select qr_reporte_publico, org_nombre, org_area from app_settings where singleton = true`)) || {};
  } catch {
    return {};
  }
}

async function handleQrPublico(req, res) {
  const url = new URL(req.url || "/", "http://localhost");
  const m = /^\/api\/qr\/(info|reporte)\/([^/]+)$/.exec(url.pathname);
  if (!m) return false;
  const [, accion, codigoRaw] = m;
  const codigo = decodeURIComponent(codigoRaw).trim().slice(0, 80);
  try {
    const ip = clientIp(req);
    const ajustes = await qrAjustesPublicos();
    const reportePublico = ajustes.qr_reporte_publico !== false;
    const activo = await one(
      `select id, codigo, coalesce(descripcion, nombre) as descripcion, coalesce(rubro, categoria) as rubro, sector, planta, ubicacion_detalle, estado
         from inventario where upper(codigo) = upper($1) order by created_at limit 1`,
      [codigo],
    ).catch(() => null);

    if (accion === "info" && req.method === "GET") {
      rateLimit(`qrinfo:${ip}`, 120, 60_000);
      let libre = false;
      if (!activo) libre = !!(await one(`select 1 as ok from inventario_etiquetas_libres where upper(codigo) = upper($1)`, [codigo]).catch(() => null));
      sendJson(res, 200, {
        existe: !!activo,
        libre,
        codigo: activo?.codigo ?? codigo,
        reportePublico,
        organizacion: ajustes.org_nombre || null,
        area: ajustes.org_area || null,
        // Solo datos visibles en la etiqueta: nada de IP, usuarios ni credenciales.
        equipo: activo
          ? { descripcion: activo.descripcion, rubro: activo.rubro, sector: activo.sector, planta: activo.planta, ubicacion: activo.ubicacion_detalle }
          : null,
      });
      return true;
    }

    if (accion === "reporte" && req.method === "POST") {
      rateLimit(`qrreporte:${ip}`, 6, 60 * 60_000);
      if (!reportePublico) {
        sendJson(res, 403, { error: "Los reportes por QR están deshabilitados. Avisá a Sistemas." });
        return true;
      }
      if (!activo) {
        sendJson(res, 404, { error: "Este código no corresponde a un equipo registrado." });
        return true;
      }
      const body = await readJson(req);
      if (body.sitio) {
        // Campo trampa para bots: se responde OK sin crear nada.
        sendJson(res, 200, { ok: true });
        return true;
      }
      const nombre = String(body.nombre || "").trim().slice(0, 80);
      const detalle = String(body.detalle || "").trim().slice(0, 1500);
      const contacto = String(body.contacto || "").trim().slice(0, 80);
      const sector = String(body.sector || activo.sector || "").trim().slice(0, 80);
      if (nombre.length < 2 || detalle.length < 5) {
        sendJson(res, 400, { error: "Completá tu nombre y qué le pasa al equipo." });
        return true;
      }
      let numero = null;
      try {
        numero = (await one(`select nextval('ticket_numero_seq')::int as n`))?.n ?? null;
      } catch {
        numero = (await one(`select coalesce(max(numero), 1000)::int + 1 as n from tareas`))?.n ?? null;
      }
      const rubro = String(activo.rubro || "").toLowerCase();
      const categoria = /impres|multifun/.test(rubro)
        ? "Impresora"
        : /switch|router|access|red|firewall|ups/.test(rubro)
          ? "Red"
          : /servidor|server/.test(rubro)
            ? "Servidor"
            : /pc|notebook|monitor|tablet|celular|all in one/.test(rubro)
              ? "PC"
              : "Otro";
      const titulo = `${activo.codigo} · ${detalle.split(/\r?\n/)[0].slice(0, 90)}`;
      const descripcion = `${detalle}\n\n— Reportado escaneando el QR del equipo${contacto ? `\nContacto: ${contacto}` : ""}`;
      const ticket = await one(
        `insert into tareas (numero, titulo, descripcion, estado, prioridad, tipo, categoria, sector, solicitante_nombre, canal, activo_id)
         values ($1, $2, $3, 'nuevo', 'media', 'incidente', $4, $5, $6, 'qr', $7) returning id, numero`,
        [numero, titulo, descripcion, categoria, sector || null, nombre, activo.id],
      );
      await query(`insert into inventario_escaneos (inventario_id, codigo, usuario_nombre, accion, detalle, publico) values ($1, $2, $3, 'reporte', $4, true)`, [
        activo.id,
        activo.codigo,
        nombre,
        `Ticket #${ticket?.numero ?? ""}`,
      ]).catch(() => {});
      await query(
        `insert into audit_log (actor_nombre, actor_email, modulo, accion, entidad_id, entidad_desc, detalle)
         values ($1, '', 'tareas', 'crear', $2, $3, $4::jsonb)`,
        [`${nombre} (QR)`, ticket?.id ?? null, titulo, JSON.stringify({ canal: "qr", ip })],
      ).catch(() => {});
      // Aviso a quienes atienden tickets.
      await query(
        `insert into notificaciones (user_id, tipo, titulo, cuerpo, link, actor_nombre)
         select distinct ur.user_id, 'ticket', $1, $2, $3, $4
           from user_roles ur
           left join role_permissions rp on rp.role = ur.role and rp.modulo = 'tareas'
          where ur.role = 'administrador' or rp.can_edit`,
        [`Falla reportada por QR · ${activo.codigo}`, titulo, `/tareas?ticket=${ticket?.id ?? ""}`, nombre],
      ).catch(() => {});
      sendJson(res, 201, { ok: true, numero: ticket?.numero ?? null });
      return true;
    }

    sendJson(res, 405, { error: "Método no permitido" });
    return true;
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.statusCode ? error.message : "No se pudo procesar el pedido" });
    return true;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (maintenanceEnabled() && !String(req.url || "").startsWith("/api/system/health")) {
      sendHtml(res, 503, loadStatusHtml("maintenance"));
      return;
    }
    if (await handleAuth(req, res)) return;
    if (await handleAdjunto(req, res)) return;
    if (await handleQrPublico(req, res)) return;
    if (await handleSystem(req, res)) return;
    if (await handleUpdates(req, res)) return;
    if (await handleInstructivoPdf(req, res)) return;
    if (trySendStatic(req, res)) return;

    const request = new Request(`http://${req.headers.host || "localhost"}${req.url || "/"}`, {
      method: req.method,
      headers: req.headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req),
      duplex: "half",
    });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    setSecurityHeaders(req, res);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "transfer-encoding") return;
      res.setHeader(key, value);
    });
    if (response.body) {
      Readable.fromWeb(response.body).pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    console.error(error);
    sendHtml(res, 500, loadStatusHtml("error"));
  }
});

{
  const avisos = [];
  const clave = String(process.env.SECRETS_ENCRYPTION_KEY || "").trim();
  if (clave.length < 32) avisos.push("SECRETS_ENCRYPTION_KEY falta o es corta (mínimo 32 caracteres): openssl rand -base64 48");
  if (process.env.ALLOW_PUBLIC_SIGNUP === "true") avisos.push("ALLOW_PUBLIC_SIGNUP=true: cualquiera con acceso a la red puede crearse una cuenta");
  if (process.env.TRUST_PROXY === "true") avisos.push("TRUST_PROXY=true: se confía en X-Forwarded-For de cualquier origen; usalo solo detrás de un proxy");
  for (const a of avisos) console.warn(`[seguridad] ${a}`);
}

server.listen(port, host, () => {
  console.log(`Nodara listening on http://${host}:${port}`);
  if (maintenanceEnabled()) {
    console.warn("MAINTENANCE_MODE activo — sirviendo página de mantenimiento");
  }
});
