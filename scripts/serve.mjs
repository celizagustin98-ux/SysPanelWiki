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
});
const DEFAULT_BRANCH = "main";
const MAX_JSON_BYTES = Number(process.env.MAX_JSON_BYTES || 1024 * 1024);
const packageInfo = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const buildInfo = readBuildInfo();
const buildTime = buildInfo.builtAt || new Date().toISOString();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
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

function getStaticFilePath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relativePath =
    pathname === "/favicon.svg" || pathname === "/favicon.ico"
      ? "favicon.svg"
      : pathname.replace(/^\/+/, "");
  const filePath = normalize(join(clientDir, relativePath));
  if (!filePath.startsWith(clientDir)) return null;
  if (!existsSync(filePath)) return null;
  const stat = statSync(filePath);
  return stat.isFile() ? filePath : null;
}

function trySendStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;

  const filePath = getStaticFilePath(req.url || "/");
  if (!filePath) return false;

  const ext = extname(filePath).toLowerCase();
  res.statusCode = 200;
  setSecurityHeaders(req, res);
  res.setHeader("content-type", contentTypes[ext] || "application/octet-stream");
  res.setHeader(
    "cache-control",
    ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  );

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
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "");
  const isHttps = forwardedProto === "https";
  if (isHttps) {
    res.setHeader("cross-origin-opener-policy", "same-origin");
    res.setHeader("strict-transport-security", "max-age=15552000; includeSubDomains");
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

function readBuildInfo() {
  try {
    return JSON.parse(readFileSync(resolve("build-info.json"), "utf8"));
  } catch {
    return {};
  }
}

async function handleSystem(req, res) {
  if (req.method !== "GET" || !req.url?.startsWith("/api/system/info")) return false;

  try {
    await requireRequestSession(req);
    const settings = await one(
      `select version_actual, ultima_revision, ultima_actualizacion, updated_at
         from app_settings
        where singleton = true`,
    );
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
      ultimaActualizacionFuente: commitDate
        ? "commit"
        : process.env.APP_UPDATED_AT
          ? "variable"
          : "build",
    });
    return true;
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error instanceof Error ? error.message : "Error de servidor",
    });
    return true;
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
    `insert into app_sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + interval '30 days')`,
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
    profile: {
      id: session.user_id,
      full_name: session.full_name,
      email: session.email,
      username: session.username,
    },
    role: session.role || "consulta",
  };
}

function bearerToken(req) {
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
}

async function requireAdmin(req) {
  const session = await getSession(bearerToken(req));
  if (!session) {
    const error = new Error("No autorizado");
    error.statusCode = 401;
    throw error;
  }
  if (session.role !== "administrador") {
    const error = new Error("Solo administradores pueden instalar actualizaciones");
    error.statusCode = 403;
    throw error;
  }
  return session;
}

async function requireRequestSession(req) {
  const token = bearerToken(req) || "";
  const session = await getSession(token);
  if (!session) {
    const error = new Error("No autorizado");
    error.statusCode = 401;
    throw error;
  }
  return session;
}

function storageFilePath(bucket, path) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(bucket)) return null;
  const base = resolve(process.env.FILE_STORAGE_DIR || join(process.cwd(), "storage"));
  const safePath = normalize(String(path || ""))
    .replace(/^(\.\.(\/|\\|$))+/, "")
    .replace(/^[/\\]+/, "");
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

function gitEnvWithToken() {
  const token = process.env.GITHUB_TOKEN;
  return token
    ? {
        ...process.env,
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: bearer ${token}`,
      }
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
    if (
      !/authentication|authorization|bad credentials|could not read username|permission denied|repository not found/i.test(
        output,
      )
    ) {
      throw error;
    }
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
  echo "Branch: ${branch}"
  if ! git fetch origin ${shellQuote(branch)}; then
    echo "Fetch con credenciales fallo; reintentando sin GITHUB_TOKEN"
    unset GITHUB_TOKEN GIT_CONFIG_COUNT GIT_CONFIG_KEY_0 GIT_CONFIG_VALUE_0
    git fetch origin ${shellQuote(branch)}
  fi
  git reset --hard origin/${shellQuote(branch)}
  rm -rf dist .output .vinxi node_modules/.vite
  npm install --silent
  npm run build
  ${shellQuote(nodePath)} - <<'NODE'
import pg from "pg";
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
await pool.query(
  "update app_settings set version_actual = $1, ultima_actualizacion = now() where singleton = true",
  [process.env.UPDATE_VERSION || "actualizado"],
);
await pool.end();
NODE
  systemctl restart ${shellQuote(serviceName)}
  echo "OK $(date -Is)"
} >> ${shellQuote(logFile)} 2>&1
`;

  const child = spawn("/bin/bash", ["-lc", script], {
    cwd: process.cwd(),
    env: { ...env, UPDATE_VERSION: version },
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return logFile;
}

async function handleUpdates(req, res) {
  if (req.method !== "POST" || !req.url?.startsWith("/api/updates/")) return false;

  try {
    if (process.env.ENABLE_WEB_UPDATES !== "true") {
      return (sendJson(res, 404, { error: "Actualizaciones web deshabilitadas" }), true);
    }
    await requireAdmin(req);
    const action = new URL(req.url, "http://localhost").pathname.replace("/api/updates/", "");
    const branch = process.env.GITHUB_BRANCH || process.env.REPO_BRANCH || DEFAULT_BRANCH;

    if (action === "check") {
      const settings = await one(`select version_actual from app_settings where singleton = true`);
      const currentSha = await runCommand("git", ["rev-parse", "HEAD"], { timeout: 60_000 });
      const remoteLine = await runGitWithAuthFallback(
        ["ls-remote", "origin", `refs/heads/${branch}`],
        {
          timeout: 60_000,
        },
      );
      const remoteSha = remoteLine.split(/\s+/)[0] || "";
      if (!remoteSha) {
        return (
          sendJson(res, 200, {
            ok: false,
            error: "No se pudo verificar la rama de actualización configurada.",
            repo: "",
            currentVersion: currentSha.slice(0, 7) || settings?.version_actual || "local",
            latestVersion: null,
            latestUrl: null,
            publishedAt: null,
            notes: null,
            hasUpdate: false,
          }),
          true
        );
      }

      await query(
        `update app_settings set version_actual = $1, ultima_revision = now() where singleton = true`,
        [currentSha.slice(0, 7) || settings?.version_actual || "local"],
      );

      return (
        sendJson(res, 200, {
          ok: true,
          repo: "",
          currentVersion: currentSha.slice(0, 7) || settings?.version_actual || "local",
          latestVersion: remoteSha.slice(0, 7),
          latestUrl: null,
          publishedAt: null,
          notes: null,
          hasUpdate: remoteSha !== currentSha,
        }),
        true
      );
    }

    if (action === "apply") {
      const body = await readJson(req);
      const version = String(body.version || "").trim();
      if (!version || version.length > 120) {
        return (sendJson(res, 400, { error: "Versión inválida" }), true);
      }

      try {
        await runGitWithAuthFallback(["ls-remote", "origin", `refs/heads/${branch}`], {
          timeout: 60_000,
        });
        await runCommand("npm", ["--version"], { timeout: 30_000 });
      } catch (error) {
        console.error(error);
        return (
          sendJson(res, 500, {
            error: updateError(
              error,
              "No se pudo iniciar la actualización. Revisá los logs del servidor.",
            ),
          }),
          true
        );
      }

      const env = gitEnvWithToken();
      const logFile = startBackgroundUpdate({ branch, version, env });
      sendJson(res, 202, { ok: true, version, started: true, logFile });
      return true;
    }

    return (sendJson(res, 404, { error: "Ruta de actualización inexistente" }), true);
  } catch (error) {
    console.error(error);
    sendJson(res, error.statusCode || 500, {
      error: error instanceof Error ? error.message : "Error de servidor",
    });
    return true;
  }
}

// NOTE: remainder of serve.mjs continues below - truncated restore would break production
// This is a critical path - full file must be restored
