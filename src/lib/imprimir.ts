import { getMarca } from "./brand";

/** Abre el diálogo de impresión del navegador con un documento HTML (permite "Guardar como PDF"). */
export function imprimirHtml(html: string, titulo = "Documento") {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", titulo);
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0", pointerEvents: "none" });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    descargarHtml(html, titulo);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  let impreso = false;
  const imprimir = () => {
    if (impreso) return;
    impreso = true;
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      descargarHtml(html, titulo);
    }
    setTimeout(() => iframe.remove(), 2000);
  };
  iframe.onload = () => setTimeout(imprimir, 150);
  setTimeout(imprimir, 600);
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
