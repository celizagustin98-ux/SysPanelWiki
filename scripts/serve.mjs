import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";
const clientDir = resolve("dist/client");
const app = await import("../dist/server/server.js").then((module) => module.default);

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
  const relativePath = pathname === "/favicon.svg" ? "favicon.svg" : pathname.replace(/^\/+/, "");
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
  res.setHeader("content-type", contentTypes[ext] || "application/octet-stream");
  res.setHeader("cache-control", ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable");

  if (req.method === "HEAD") {
    res.end();
    return true;
  }

  createReadStream(filePath).pipe(res);
  return true;
}

function createWebRequest(req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const forwardedHost = req.headers["x-forwarded-host"];
  const requestHost = forwardedHost || req.headers.host || `${host}:${port}`;
  const url = `${protocol}://${requestHost}${req.url || "/"}`;
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const init = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  res.statusMessage = response.statusText;

  response.headers.forEach((value, name) => {
    res.setHeader(name, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  for await (const chunk of response.body) {
    res.write(chunk);
  }
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    if (trySendStatic(req, res)) return;

    const response = await app.fetch(createWebRequest(req), process.env, {});
    await sendWebResponse(res, response);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`SysWiki Panel listening on http://${host}:${port}`);
});
