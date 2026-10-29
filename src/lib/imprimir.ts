import { getMarca } from "./brand";

/** Estilos que se agregan a todo documento impreso: colores de fondo fieles y links visibles. */
const ESTILO_IMPRESION = `<style>
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  a.link { color: #1f6fb2; word-break: break-all; }
</style>`;

/** Espera a que el documento termine de cargar fuentes e imágenes antes de imprimir. */
async function documentoListo(doc: Document) {
  const imagenes = Array.from(doc.images ?? []);
  await Promise.race([
    Promise.all([
      doc.fonts?.ready.catch(() => undefined),
      ...imagenes.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
    ]),
    new Promise((r) => setTimeout(r, 4000)),
  ]);
  // Dos cuadros de animación: el navegador terminó de maquetar.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/**
 * El navegador imprime su propio encabezado y pie (fecha, título y la dirección del servidor con su IP)
 * dentro del margen de la hoja. Se deja la hoja sin margen arriba y abajo, así no tiene dónde ponerlos,
 * y el margen se recrea con una tabla cuyo encabezado y pie vacíos se repiten en cada página.
 */
function sinEncabezadoDelNavegador(doc: Document, html: string) {
  const m = /@page\s*\{[^}]*margin\s*:\s*([\d.]+)mm/i.exec(html);
  const margen = m ? Number(m[1]) : /@page/i.test(html) ? 0 : 12;
  if (!margen || !doc.body) return;
  const estilo = doc.createElement("style");
  estilo.textContent =
    `@page{margin:0 ${margen}mm !important}` +
    `table.__hoja{width:100%;border-collapse:collapse;border:0;margin:0}` +
    `table.__hoja>*>tr>td{padding:0!important;border:0!important;background:none!important}` +
    `table.__hoja>thead>tr>td>div,table.__hoja>tfoot>tr>td>div{height:${margen}mm}`;
  doc.head.appendChild(estilo);
  const tabla = doc.createElement("table");
  tabla.className = "__hoja";
  tabla.innerHTML = "<thead><tr><td><div></div></td></tr></thead><tbody><tr><td></td></tr></tbody><tfoot><tr><td><div></div></td></tr></tfoot>";
  const celda = tabla.querySelector("tbody td")!;
  while (doc.body.firstChild) celda.appendChild(doc.body.firstChild);
  doc.body.appendChild(tabla);
}

/**
 * Abre el diálogo de impresión con un documento HTML (desde ahí: "Guardar como PDF").
 * El marco tiene tamaño A4 real fuera de pantalla (con tamaño 0 algunos navegadores imprimen en blanco)
 * y se quita recién cuando termina la impresión, no a los pocos segundos.
 */
export function imprimirHtml(html: string, titulo = "Documento") {
  document.querySelectorAll("iframe[data-impresion]").forEach((f) => f.remove());
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", titulo);
  iframe.setAttribute("data-impresion", "1");
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, { position: "fixed", left: "-10000px", top: "0", width: "210mm", height: "297mm", maxWidth: "none", border: "0", pointerEvents: "none" });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!doc || !win) {
    iframe.remove();
    abrirEnPestana(html, titulo);
    return;
  }
  const conEstilo = html.includes("</head>") ? html.replace("</head>", `${ESTILO_IMPRESION}</head>`) : ESTILO_IMPRESION + html;
  doc.open();
  doc.write(conEstilo);
  doc.close();
  sinEncabezadoDelNavegador(doc, html);

  let limpio = false;
  const quitar = () => {
    if (limpio) return;
    limpio = true;
    iframe.remove();
  };
  win.addEventListener("afterprint", () => setTimeout(quitar, 500));
  setTimeout(quitar, 10 * 60_000);

  void documentoListo(doc).then(() => {
    try {
      win.focus();
      win.print();
    } catch {
      quitar();
      abrirEnPestana(html, titulo);
    }
  });
}

/** Alternativa si el navegador no deja imprimir desde el marco: el documento en una pestaña nueva. */
function abrirEnPestana(html: string, titulo: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const w = window.open(url, "_blank", "noopener");
  if (!w) descargarHtml(html, titulo);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Link seguro para documentos: solo http(s), con el texto visible acortado. */
export function linkDoc(url: string | null | undefined, max = 60) {
  let u = String(url ?? "").trim();
  // "www.tienda.com/..." sin protocolo también se convierte en link.
  if (!/^https?:\/\//i.test(u) && /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(u)) u = `https://${u}`;
  if (!/^https?:\/\//i.test(u)) return escHtml(u);
  const visible = u.replace(/^https?:\/\/(www\.)?/i, "");
  return `<a class="link" href="${escHtml(u)}" target="_blank" rel="noopener noreferrer">${escHtml(visible.length > max ? visible.slice(0, max - 1) + "…" : visible)}</a>`;
}

export function descargarHtml(html: string, titulo: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${titulo.replace(/[^\w.-]+/g, "_")}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function escHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function pesos(v: number | string | null | undefined) {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS" });
}

/** Estilos comunes de los documentos imprimibles (A4). El color de acento sale de la marca configurada. */
export const ESTILO_DOC = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #111827; font-size: 12px; line-height: 1.45; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid var(--acento, #1f7a9c); padding-bottom: 10px; margin-bottom: 14px; }
  .marca { display: flex; align-items: center; gap: 8px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--acento, #1f7a9c); font-weight: 700; }
  .logo { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg,#5fd6e6,#2f7fb8); color: #0b1d2a; display: grid; place-items: center; font: 700 11px monospace; }
  h1 { margin: 6px 0 0; font-size: 19px; }
  .meta { text-align: right; font-size: 11px; color: #4b5563; }
  .meta strong { display: block; font-size: 17px; color: var(--acento, #1f7a9c); font-family: monospace; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
  .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 8px 10px; }
  .box label { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
  .box div { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .05em; padding: 7px 8px; border-bottom: 1px solid #d1d5db; }
  td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .small { color: #6b7280; font-size: 10px; word-break: break-all; }
  .total { margin-top: 10px; text-align: right; font-size: 13px; }
  .total strong { font-size: 16px; }
  .notas { margin-top: 14px; padding: 9px 11px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; }
  .firmas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 46px; }
  .firmas div { border-top: 1px solid #9ca3af; padding-top: 5px; text-align: center; font-size: 10px; color: #4b5563; }
  h2 { font-size: 13px; margin: 18px 0 8px; color: var(--acento, #1f7a9c); text-transform: uppercase; letter-spacing: .06em; }
  .pie { margin-top: 24px; font-size: 9px; color: #9ca3af; text-align: center; }
`;

/** Logo + "Nombre · Área" de la organización. Sin logo subido, `isotipo` agrega el ">_" de los estilos comunes. */
export function marcaDocHtml(isotipo = false, marca = getMarca()) {
  const logo = marca.logo
    ? `<img src="${escHtml(marca.logo)}" alt="" style="width:22px;height:22px;border-radius:6px;object-fit:contain;vertical-align:middle;margin-right:6px">`
    : isotipo
      ? `<span class="logo">&gt;_</span>`
      : "";
  return `${logo}${escHtml(marca.nombre)} · ${escHtml(marca.area)}`;
}

/** Color elegido en Configuración; sin elegir, cada documento conserva su color original (var(--acento, …)). */
export function estiloMarca(marca = getMarca()) {
  return marca.colorPropio && /^#[0-9a-f]{6}$/i.test(marca.color) ? `<style>:root{--acento:${marca.color}}</style>` : "";
}

/** Pie de documento configurado, con un detalle opcional al final. */
export function pieDoc(detalle?: string, marca = getMarca()) {
  return escHtml(detalle ? `${marca.pie} · ${detalle}` : marca.pie);
}

export function encabezadoDoc(titulo: string, numero: string, fecha = new Date()) {
  return `${estiloMarca()}<div class="head"><div><div class="marca">${marcaDocHtml(true)}</div><h1>${escHtml(titulo)}</h1></div>
    <div class="meta"><strong>${escHtml(numero)}</strong>${fecha.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}</div></div>`;
}
