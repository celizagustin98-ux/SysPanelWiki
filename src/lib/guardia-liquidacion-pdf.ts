/** Liquidación de guardias — impresión / PDF (iframe, sin pop-up). */
import { getMarca } from "./brand";
import { imprimirHtml, estiloMarca, marcaDocHtml } from "./imprimir";

export type LiqRow = {
  code: string;
  nombre: string;
  normales: number;
  feriados: number;
  total: number;
};

export type LiqPdfInput = {
  periodoLabel: string;
  desde: string;
  hasta: string;
  generada?: Date;
  titulo?: string;
  notas?: string;
  pie?: string;
  filas: LiqRow[];
};

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "\u0026amp;")
    .replace(/</g, "\u0026lt;")
    .replace(/>/g, "\u0026gt;")
    .replace(/"/g, "\u0026quot;");
}

function buildHtml(input: LiqPdfInput) {
  const generada = (input.generada ?? new Date()).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const titulo = (input.titulo || "Liquidación de guardias").trim();
  const notas = (input.notas || "").trim();
  const pie = (input.pie || `${getMarca().pie} · Documento de liquidación interna`).trim();

  const totN = input.filas.reduce((s, r) => s + r.normales, 0);
  const totF = input.filas.reduce((s, r) => s + r.feriados, 0);
  const totT = input.filas.reduce((s, r) => s + r.total, 0);

  const rows = input.filas
    .map(
      (r) =>
        "<tr>" +
        '<td class="code">' +
        esc(r.code) +
        "</td>" +
        "<td>" +
        esc(r.nombre) +
        "</td>" +
        '<td class="num">' +
        r.normales +
        "</td>" +
        '<td class="num fer">' +
        r.feriados +
        "</td>" +
        '<td class="num tot">' +
        r.total +
        "</td>" +
        "</tr>",
    )
    .join("");

  const notasBlock = notas
    ? '<p class="note">' + esc(notas).replace(/\n/g, "<br/>") + "</p>"
    : "";

  return (
    "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\" />" +
    "<title>" +
    esc(titulo) +
    " — " +
    esc(input.periodoLabel) +
    "</title><style>" +
    "@page{size:A4;margin:16mm}" +
    "*{box-sizing:border-box}" +
    "body{font-family:Segoe UI,system-ui,sans-serif;color:#0f172a;font-size:13px;line-height:1.45;margin:0;padding:28px}" +
    ".sheet{max-width:720px;margin:0 auto}" +
    ".header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid var(--acento,#0d9488);padding-bottom:14px;margin-bottom:20px}" +
    ".brand{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--acento,#0d9488);font-weight:700}" +
    "h1{margin:6px 0 0;font-size:22px;font-weight:700}" +
    ".sub{margin:4px 0 0;color:#64748b;font-size:12px}" +
    ".meta{text-align:right;font-size:12px;color:#475569}" +
    ".meta strong{display:block;font-size:15px;color:#0f172a;margin-bottom:2px}" +
    ".box{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:18px}" +
    ".box div{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#f8fafc}" +
    ".box label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}" +
    ".box span{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}" +
    "table{width:100%;border-collapse:collapse;margin-top:4px}" +
    "th{background:var(--acento,#0f766e);color:#fff;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px}" +
    "th.num,td.num{text-align:right;font-variant-numeric:tabular-nums}" +
    "td{padding:11px 12px;border-bottom:1px solid #e2e8f0}" +
    "tr:nth-child(even) td{background:#f8fafc}" +
    "td.code{font-weight:700;color:var(--acento,#0d9488);width:48px}" +
    "td.fer{color:#be123c;font-weight:600}" +
    "td.tot{font-weight:700}" +
    "tfoot td{background:#ecfdf5;font-weight:700;border-top:2px solid var(--acento,#0d9488);padding:12px}" +
    ".note{margin-top:18px;font-size:11px;color:#64748b;line-height:1.5;white-space:pre-wrap}" +
    ".footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}" +
    "@media print{body{padding:0}}" +
    "</style>" +
    estiloMarca() +
    "</head><body><div class=\"sheet\">" +
    '<div class="header"><div>' +
    '<div class="brand">' +
    marcaDocHtml() +
    "</div>" +
    "<h1>" +
    esc(titulo) +
    "</h1>" +
    '<p class="sub">Turno nocturno 20:00 – 08:00 · Período de liquidación 21 → 20</p>' +
    "</div><div class=\"meta\"><strong>" +
    esc(input.periodoLabel) +
    "</strong>" +
    esc(input.desde) +
    " → " +
    esc(input.hasta) +
    "<br/>Generado " +
    esc(generada) +
    "</div></div>" +
    '<div class="box">' +
    "<div><label>Total normales</label><span>" +
    totN +
    "</span></div>" +
    "<div><label>Total feriados</label><span style=\"color:#be123c\">" +
    totF +
    "</span></div>" +
    "<div><label>Total noches</label><span>" +
    totT +
    "</span></div></div>" +
    "<table><thead><tr>" +
    "<th>Cód.</th><th>Operario</th>" +
    '<th class="num">Normales</th><th class="num">Feriados</th><th class="num">Total</th>' +
    "</tr></thead><tbody>" +
    rows +
    "</tbody><tfoot><tr>" +
    '<td colspan="2">TOTALES</td>' +
    '<td class="num">' +
    totN +
    "</td>" +
    '<td class="num fer">' +
    totF +
    "</td>" +
    '<td class="num tot">' +
    totT +
    "</td></tr></tfoot></table>" +
    notasBlock +
    '<div class="footer">' +
    esc(pie) +
    "</div>" +
    "</div></body></html>"
  );
}

export function abrirPdfLiquidacion(input: LiqPdfInput) {
  imprimirHtml(buildHtml(input), (input.titulo || "Liquidación") + " " + input.periodoLabel);
}

