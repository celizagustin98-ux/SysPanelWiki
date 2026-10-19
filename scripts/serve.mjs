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
      "frame-src 'self' blob: data:",
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
  const message = process.env.MAINTENANCE_MESSAGE || "Estamos actualizando SysIntranet. El servicio vuelve en breve.";
  const safe = String(message).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      if (count > 0 && process.env.ALLOW_PUBLIC_SIGNUP !== "true") {
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
      httpsEnabled: req.headers["x-forwarded-proto"] === "https",
      ultimaRevision: settings?.ultima_revision ?? null,
      ultimaActualizacion: commitDate ?? process.env.APP_UPDATED_AT ?? buildTime,
      ultimaActualizacionFuente: commitDate ? "commit" : process.env.APP_UPDATED_AT ? "variable" : "build",
    });
    return true;
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error instanceof Error ? error.message : "Error de servidor" });
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
  echo "== SysIntranet update $(date -Is) =="
  if ! git fetch origin ${shellQuote(branch)}; then
    unset GITHUB_TOKEN GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
    git fetch origin ${shellQuote(branch)}
  fi
  git reset --hard origin/${shellQuote(branch)}
  rm -rf dist .output .vinxi node_modules/.vite
  npm install --silent
  npm run build
  ${shellQuote(nodePath)} - <<'NODE'
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
await pool.query("update app_settings set version_actual = $1, ultima_actualizacion = now() where singleton = true", [process.env.UPDATE_VERSION || "actualizado"]);
await pool.end();
NODE
  systemctl restart ${shellQuote(serviceName)}
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
    sendJson(res, error.statusCode || 500, { error: error instanceof Error ? error.message : "Error de servidor" });
    return true;
  }
}

async function handleInstructivoPdf(req, res) {
  if (req.method !== "GET" || !req.url?.startsWith("/api/instructivos/pdf/")) return false;
  try {
    await requireRequestSession(req);
    const id = decodeURIComponent(req.url.replace("/api/instructivos/pdf/", "").split("?")[0]);
    if (!id) {
      sendJson(res, 400, { error: "Falta el id del adjunto" });
      return true;
    }
    const row = await one(`select id, file_name, storage_path, mime_type from wiki_attachments where id = $1`, [id]);
    if (!row) {
      sendJson(res, 404, { error: "Adjunto inexistente" });
      return true;
    }
    const file = storageFilePath("instructivos", row.storage_path || row.file_name);
    if (!file) {
      sendJson(res, 404, { error: "Archivo no encontrado en almacenamiento" });
      return true;
    }
    res.statusCode = 200;
    setSecurityHeaders(req, res);
    res.setHeader("content-type", row.mime_type || "application/pdf");
    res.setHeader("content-disposition", `inline; filename="${safeDownloadName(row.file_name || "instructivo.pdf")}"`);
    res.setHeader("cache-control", "private, no-store");
    createReadStream(file.filePath).pipe(res);
    return true;
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, { error: error instanceof Error ? error.message : "Error de servidor" });
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

server.listen(port, host, () => {
  console.log(`SysIntranet listening on http://${host}:${port}`);
  if (maintenanceEnabled()) {
    console.warn("MAINTENANCE_MODE activo — sirviendo página de mantenimiento");
  }
});
