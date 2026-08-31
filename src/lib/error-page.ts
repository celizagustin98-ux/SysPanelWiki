export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>This page didn't load</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light dark;
        --bg: oklch(0.98 0.004 260);
        --surface: oklch(1 0 0);
        --fg: oklch(0.22 0.02 260);
        --muted: oklch(0.52 0.02 260);
        --border: oklch(0.9 0.008 260);
        --accent: oklch(0.48 0.11 258);
        --shadow: 0 18px 40px -24px oklch(0.3 0.05 260 / 0.45);
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: oklch(0.17 0.015 260);
          --surface: oklch(0.22 0.017 260);
          --fg: oklch(0.96 0.004 260);
          --muted: oklch(0.72 0.015 260);
          --border: oklch(0.32 0.018 260);
          --accent: oklch(0.68 0.12 258);
          --shadow: 0 18px 40px -24px oklch(0 0 0 / 0.7);
        }
      }
      * { box-sizing: border-box; }
      body {
        font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        background: var(--bg); color: var(--fg);
        display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem;
        -webkit-font-smoothing: antialiased;
      }
      .card {
        max-width: 30rem; width: 100%; text-align: center; padding: 2.25rem 2rem;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 16px; box-shadow: var(--shadow);
      }
      h1 { font-size: 1.25rem; letter-spacing: -0.015em; margin: 0 0 0.5rem; }
      p { color: var(--muted); margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button {
        padding: 0.5rem 1.05rem; border-radius: 8px; font: inherit; font-weight: 500;
        cursor: pointer; text-decoration: none; border: 1px solid transparent;
        transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      }
      a:focus-visible, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .primary { background: var(--accent); color: oklch(0.99 0 0); }
      .primary:hover { filter: brightness(1.08); }
      .secondary { background: transparent; color: var(--fg); border-color: var(--border); }
      .secondary:hover { border-color: var(--accent); color: var(--accent); }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>This page didn't load</h1>
      <p>Something went wrong on our end. You can try refreshing or head back home.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="secondary" href="/">Go home</a>
      </div>
    </div>
  </body>
</html>`;
}
