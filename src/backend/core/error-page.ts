/** Paginas de estado estaticas (error SSR / caida). Sin dependencias de React. */

export type StatusKind = "error" | "maintenance" | "offline";

function esc(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function illustration(kind: StatusKind): string {
  if (kind === "maintenance") {
    return `<svg class="art" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="40" y="48" width="200" height="110" rx="16" fill="url(#g1)" stroke="currentColor" stroke-opacity="0.15"/>
  <rect x="58" y="66" width="100" height="10" rx="5" fill="currentColor" fill-opacity="0.2"/>
  <rect x="58" y="86" width="70" height="8" rx="4" fill="currentColor" fill-opacity="0.12"/>
  <rect x="58" y="104" width="120" height="8" rx="4" fill="currentColor" fill-opacity="0.1"/>
  <circle cx="200" cy="100" r="28" fill="#14b8a6" fill-opacity="0.25" stroke="#14b8a6" stroke-width="2"/>
  <path d="M190 100h20M200 90v20" stroke="#14b8a6" stroke-width="3" stroke-linecap="round"/>
  <defs><linearGradient id="g1" x1="40" y1="48" x2="240" y2="158"><stop stop-color="#14b8a6" stop-opacity="0.12"/><stop offset="1" stop-color="#0f172a" stop-opacity="0.05"/></linearGradient></defs>
</svg>`;
  }
  if (kind === "offline") {
    return `<svg class="art" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="140" cy="88" r="46" fill="#14b8a6" fill-opacity="0.12" stroke="#14b8a6" stroke-width="2"/>
  <path d="M118 88c0-12 10-22 22-22s22 10 22 22" stroke="#14b8a6" stroke-width="3" stroke-linecap="round"/>
  <path d="M128 88c0-7 5-12 12-12s12 5 12 12" stroke="#14b8a6" stroke-width="3" stroke-linecap="round"/>
  <circle cx="140" cy="100" r="4" fill="#14b8a6"/>
  <path d="M100 130l80-80" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
</svg>`;
  }
  return `<svg class="art" viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="70" y="40" width="140" height="100" rx="14" fill="url(#g2)" stroke="currentColor" stroke-opacity="0.15"/>
  <circle cx="140" cy="78" r="22" fill="#f87171" fill-opacity="0.2" stroke="#f87171" stroke-width="2"/>
  <path d="M140 68v14" stroke="#f87171" stroke-width="3" stroke-linecap="round"/>
  <circle cx="140" cy="92" r="2.5" fill="#f87171"/>
  <rect x="96" y="118" width="88" height="8" rx="4" fill="currentColor" fill-opacity="0.12"/>
  <defs><linearGradient id="g2" x1="70" y1="40" x2="210" y2="140"><stop stop-color="#14b8a6" stop-opacity="0.1"/><stop offset="1" stop-color="#0f172a" stop-opacity="0.04"/></linearGradient></defs>
</svg>`;
}

const COPY: Record<StatusKind, { title: string; body: string; primary: string; secondary?: string }> = {
  error: {
    title: "El panel no cargo",
    body: "Ocurrio un error en el servidor. Podes reintentar o volver al inicio en unos segundos.",
    primary: "Reintentar",
    secondary: "Ir al inicio",
  },
  maintenance: {
    title: "Mantenimiento en curso",
    body: "Estamos actualizando SysIntranet. El servicio vuelve en breve.",
    primary: "Reintentar",
  },
  offline: {
    title: "Sin conexion",
    body: "No hay red disponible. Revisa tu conexion e intenta de nuevo.",
    primary: "Reintentar",
  },
};

export function renderStatusPage(options?: {
  kind?: StatusKind;
  title?: string;
  message?: string;
  statusCode?: number;
}): string {
  const kind = options?.kind ?? "error";
  const copy = COPY[kind];
  const title = options?.title ?? copy.title;
  const body = options?.message ?? copy.body;
  const code = options?.statusCode ?? (kind === "maintenance" ? 503 : 500);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>${esc(title)} · SysIntranet</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>
      :root {
        color-scheme: dark light;
        --bg: #0b1220; --fg: #e8eef7; --muted: #94a3b8; --card: #121a2b;
        --border: rgba(148,163,184,.16); --primary: #14b8a6; --primary-fg: #042f2e; --btn: #1e293b;
      }
      @media (prefers-color-scheme: light) {
        :root {
          --bg: #f4f7fb; --fg: #0f172a; --muted: #64748b; --card: #ffffff;
          --border: rgba(15,23,42,.1); --btn: #f1f5f9;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 1.5rem;
        font: 15px/1.55 Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        background:
          radial-gradient(900px circle at 12% -10%, rgba(20,184,166,.14), transparent 50%),
          radial-gradient(700px circle at 100% 0%, rgba(20,184,166,.08), transparent 45%),
          var(--bg);
        color: var(--fg);
      }
      .card {
        width: 100%; max-width: 28rem; text-align: center; padding: 2rem 1.5rem 1.75rem;
        border-radius: 1.1rem; border: 1px solid var(--border);
        background: color-mix(in srgb, var(--card) 92%, transparent);
        box-shadow: 0 12px 40px rgba(0,0,0,.22); backdrop-filter: blur(12px);
      }
      .brand {
        display: inline-flex; align-items: center; gap: .55rem; margin-bottom: .75rem;
        color: var(--muted); font-size: .8rem; font-weight: 600; letter-spacing: .02em; text-transform: uppercase;
      }
      .brand-mark {
        width: 1.6rem; height: 1.6rem; border-radius: .45rem; background: var(--primary); color: var(--primary-fg);
        display: grid; place-items: center; font-size: .75rem; font-weight: 800;
      }
      .art { width: min(100%, 220px); height: auto; margin: .25rem auto 1rem; color: var(--muted); }
      h1 { margin: 0 0 .5rem; font-size: 1.35rem; letter-spacing: -.02em; font-weight: 650; }
      p { margin: 0 0 1.35rem; color: var(--muted); font-size: .95rem; }
      .actions { display: flex; flex-wrap: wrap; gap: .55rem; justify-content: center; }
      a, button {
        appearance: none; border: 1px solid transparent; border-radius: .65rem;
        padding: .6rem 1.05rem; font: inherit; font-weight: 600; cursor: pointer; text-decoration: none;
      }
      .primary { background: var(--primary); color: var(--primary-fg); }
      .primary:hover { filter: brightness(1.05); }
      .secondary { background: var(--btn); color: var(--fg); border-color: var(--border); }
      .code { margin-top: 1.25rem; font-size: .72rem; color: var(--muted); opacity: .7; letter-spacing: .04em; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="brand"><span class="brand-mark">SI</span> SysIntranet</div>
      ${illustration(kind)}
      <h1>${esc(title)}</h1>
      <p>${esc(body)}</p>
      <div class="actions">
        <button class="primary" type="button" onclick="location.reload()">${esc(copy.primary)}</button>
        ${copy.secondary ? `<a class="secondary" href="/">${esc(copy.secondary)}</a>` : ""}
      </div>
      <div class="code">HTTP ${code}</div>
    </div>
  </body>
</html>`;
}

export function renderErrorPage(): string {
  return renderStatusPage({ kind: "error", statusCode: 500 });
}

export function renderMaintenancePage(message?: string): string {
  return renderStatusPage({
    kind: "maintenance",
    message:
      message ||
      (typeof process !== "undefined" && process.env?.MAINTENANCE_MESSAGE) ||
      "Estamos actualizando SysIntranet. El servicio vuelve en breve.",
    statusCode: 503,
  });
}
