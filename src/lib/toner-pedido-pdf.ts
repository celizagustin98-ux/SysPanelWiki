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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(input: PdfPedidoInput) {
  const fecha = input.fecha ?? new Date();
  const fechaStr = fecha.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaStr = fecha.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const totalU = input.lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  const rows = input.lineas
    .map(
      (l, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>
          <div class="modelo">${esc(l.nombre)}</div>
          ${l.marca ? `<div class="meta">${esc(l.marca)}</div>` : ""}
        </td>
        <td class="num">${l.stock ?? "—"}</td>
        <td class="num">${l.minimo ?? "—"}</td>
        <td class="num qty">${l.cantidad}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Solicitud PED-${esc(input.numero)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: #111;
    font-size: 12px;
    line-height: 1.4;
    margin: 0;
    padding: 24px;
  }
  .sheet { max-width: 800px; margin: 0 auto; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #0d9488;
    padding-bottom: 12px;
    margin-bottom: 18px;
  }
  .brand { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #0d9488; font-weight: 700; }
  h1 { margin: 4px 0 0; font-size: 20px; }
  .doc-meta { text-align: right; font-size: 12px; }
  .doc-meta strong { display: block; font-size: 16px; color: #0d9488; }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
    margin-bottom: 18px;
  }
  .field label { display: block; font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: 0.04em; }
  .field div { font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th {
    background: #f1f5f9;
    text-align: left;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 8px 10px;
    border-bottom: 1px solid #cbd5e1;
  }
  td { padding: 9px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  td.qty { font-weight: 700; font-size: 13px; }
  .modelo { font-weight: 600; }
  .meta { color: #64748b; font-size: 11px; margin-top: 2px; }
  .totals {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 24px;
    font-size: 13px;
  }
  .totals strong { font-size: 15px; }
  .notes {
    margin-top: 20px;
    padding: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    min-height: 48px;
  }
  .notes label { font-size: 10px; text-transform: uppercase; color: #666; }
  .sign {
    margin-top: 36px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .sign .line {
    border-top: 1px solid #94a3b8;
    padding-top: 8px;
    font-size: 11px;
    color: #64748b;
  }
  .footer {
    margin-top: 28px;
    font-size: 10px;
    color: #94a3b8;
    text-align: center;
  }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="brand">SysIntranet · Área Sistemas</div>
        <h1>Solicitud de pedido de tóners</h1>
      </div>
      <div class="doc-meta">
        <strong>PED-${esc(input.numero)}</strong>
        ${esc(fechaStr)} ${esc(horaStr)}
      </div>
    </div>

    <div class="grid">
      <div class="field">
        <label>Proveedor</label>
        <div>${esc(input.proveedor || "A completar")}</div>
      </div>
      <div class="field">
        <label>Solicitante</label>
        <div>${esc(input.solicitante || "Área Sistemas")}</div>
      </div>
      <div class="field">
        <label>Destino / entrega</label>
        <div>Depósito de tóners · Sistemas</div>
      </div>
      <div class="field">
        <label>Estado del documento</label>
        <div>Solicitud formal de compra</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:36px">#</th>
          <th>Modelo</th>
          <th class="num" style="width:70px">Stock</th>
          <th class="num" style="width:70px">Mínimo</th>
          <th class="num" style="width:80px">Cant. pedida</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="totals">
      <span>Ítems: <strong>${input.lineas.length}</strong></span>
      <span>Unidades totales: <strong>${totalU}</strong></span>
    </div>

    <div class="notes">
      <label>Observaciones</label>
      <div>${esc(input.notas || "Sin observaciones.")}</div>
    </div>

    <div class="sign">
      <div class="line">Firma / conformidad solicitante</div>
      <div class="line">Recepción proveedor / sello</div>
    </div>

    <div class="footer">Documento generado automáticamente por SysPanelWiki · Tóners</div>
  </div>
</body>
</html>`;
}

/**
 * Abre el diálogo de impresión del navegador (Guardar como PDF)
 * usando un iframe oculto — no depende de pop-ups.
 */
export function abrirPdfPedido(input: PdfPedidoInput) {
  const html = buildHtml(input);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", `PED-${input.numero}`);
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
    // Fallback: descargar HTML
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
      /* already removed */
    }
  };

  const doPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      descargarHtmlPedido(input);
    }
    // dejar un poco de tiempo por si el diálogo de impresión tarda
    setTimeout(cleanup, 1500);
  };

  // Esperar a que el documento cargue estilos
  if (iframe.contentWindow?.document.readyState === "complete") {
    setTimeout(doPrint, 100);
  } else {
    iframe.onload = () => setTimeout(doPrint, 100);
    setTimeout(doPrint, 400);
  }
}

/** Descarga el HTML de la solicitud (alternativa si print falla). */
export function descargarHtmlPedido(input: PdfPedidoInput) {
  const html = buildHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `solicitud-PED-${input.numero}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
