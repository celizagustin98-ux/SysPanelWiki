// Service worker mínimo para poder instalar Nodara como app.
// No guarda datos en caché: todo se pide siempre al servidor (la información tiene que estar al día).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  // Sin conexión con el servidor: aviso simple en lugar de la página de error del navegador.
  e.respondWith(
    fetch(e.request).catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#1b1f25;color:#e5e7eb;display:grid;place-items:center;height:100vh;margin:0;text-align:center"><div><h1 style="font-size:20px">Sin conexión con Nodara</h1><p style="opacity:.7">Revisá la red y volvé a intentar.</p><button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;border-radius:8px;border:0;background:#5fd6e6;color:#0b1d2a;font-weight:600">Reintentar</button></div>',
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
