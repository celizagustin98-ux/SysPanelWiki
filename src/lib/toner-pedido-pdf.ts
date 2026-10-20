/** Solicitud de pedido imprimible / PDF (sin pop-ups). */

export type PdfPedidoLinea = {
  nombre: string;
  marca?: string | null;
  stock: number | null;
  minimo?: number | null;
  cantidad: number;
};

export type PdfPedidoInput = {
  numero: number | string;
  proveedor?: string | null;
  notas?: string | null;
  solicitante?: string | null;
  fecha?: Date;
  lineas: PdfPedidoLinea[];
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function buildHtml(input: PdfPedidoInput) {
  const fecha = input.fecha ?? new Date();
  const fechaStr = fecha.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const totalU = input.lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);
  const notas = (input.notas || "").trim();

  const rows = input.lineas
    .map(
      (l, i) =>
        "<tr>" +
        '<td class="num">' +
        (i + 1) +
        "</td>" +
        "<td>" +
        '<div class="modelo">' +
        esc(l.nombre) +
        "</div>" +
        (l.marca ? '<div class="meta">' + esc(l.marca) + "</div>" : "") +
        "</td>" +
        '<td class="num qty">' +
        l.cantidad +
        "</td>" +
        "</tr>",
    )
    .join("");

  const proveedorBlock = input.proveedor
    ? '<div class="proveedor"><label>Proveedor</label><div>' +
      esc(input.proveedor) +
      "</div></div>"
    : "";

  const notasBlock = notas
    ? '<div class="notes"><label>Notas</label><div>' + esc(notas) + "</div></div>"
    : "";

  return (
    "<!DOCTYPE html>" +
    '<html lang="es"><head><meta charset="utf-8" />' +
    "<title>Pedido PED-" +
    esc(input.numero) +
    "</title>" +
    "<style>" +
    "@page{size:A4;margin:16mm}" +
    "*{box-sizing:border-box}" +
    "body{font-family:Segoe UI,system-ui,sans-serif;color:#111;font-size:13px;line-height:1.4;margin:0;padding:24px}" +
    ".sheet{max-width:720px;margin:0 auto}" +
    ".header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0d9488;padding-bottom:12px;margin-bottom:16px}" +
    ".brand{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#0d9488;font-weight:700}" +
    "h1{margin:4px 0 0;font-size:20px}" +
    ".doc-meta{text-align:right;font-size:12px}" +
    ".doc-meta strong{display:block;font-size:16px;color:#0d9488}" +
    ".proveedor{margin-bottom:16px;font-size:13px}" +
    ".proveedor label{display:block;font-size:10px;text-transform:uppercase;color:#666;letter-spacing:.04em}" +
    ".proveedor div{font-weight:600;margin-top:2px}" +
    "table{width:100%;border-collapse:collapse}" +
    "th{background:#f1f5f9;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid #cbd5e1}" +
    "td{padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top}" +
    "td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}" +
    "td.qty{font-weight:700;font-size:14px}" +
    ".modelo{font-weight:600}" +
    ".meta{color:#64748b;font-size:11px;margin-top:2px}" +
    ".totals{margin-top:14px;text-align:right;font-size:14px}" +
    ".totals strong{font-size:16px}" +
    ".notes{margin-top:18px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px}" +
    ".notes label{font-size:10px;text-transform:uppercase;color:#666}" +
    ".footer{margin-top:28px;font-size:10px;color:#94a3b8;text-align:center}" +
    "@media print{body{padding:0}}" +
    "</style></head><body><div class=\"sheet\">" +
    '<div class="header"><div>' +
    '<div class="brand">Nodara · Área Sistemas</div>' +
    "<h1>Pedido de tóners</h1></div>" +
    '<div class="doc-meta"><strong>PED-' +
    esc(input.numero) +
    "</strong>" +
    esc(fechaStr) +
    "</div></div>" +
    proveedorBlock +
    "<table><thead><tr>" +
    '<th style="width:40px">#</th><th>Modelo</th>' +
    '<th class="num" style="width:100px">Cantidad</th>' +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table>" +
    '<div class="totals">Total a pedir: <strong>' +
    totalU +
    "</strong> unidad(es)</div>" +
    notasBlock +
    '<div class="footer">Nodara · Pedido PED-' +
    esc(input.numero) +
    "</div></div></body></html>"
  );
}

export function abrirPdfPedido(input: PdfPedidoInput) {
  const html = buildHtml(input);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "PED-" + String(input.numero));
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    descargarHtmlPedido(input);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    try {
      document.body.removeChild(iframe);
    } catch {
      /* ignore */
    }
  };

  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      descargarHtmlPedido(input);
    }
    setTimeout(cleanup, 1500);
  };

  if (iframe.contentWindow?.document.readyState === "complete") {
    setTimeout(doPrint, 100);
  } else {
    iframe.onload = () => setTimeout(doPrint, 100);
    setTimeout(doPrint, 400);
  }
}

export function descargarHtmlPedido(input: PdfPedidoInput) {
  const html = buildHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pedido-PED-" + String(input.numero) + ".html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
