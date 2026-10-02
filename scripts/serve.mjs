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
/** Simple in-memory rate limiter */
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
