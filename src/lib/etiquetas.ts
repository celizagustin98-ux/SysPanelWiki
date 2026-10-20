import QRCode from "qrcode";
import { getMarca } from "@/lib/brand";
import { escHtml, imprimirHtml } from "@/lib/imprimir";
import { urlQr } from "@/lib/qr";

/** Datos que van impresos en la etiqueta de un equipo. */
export type DatoEtiqueta = {
  codigo: string;
  descripcion?: string | null;
  sector?: string | null;
  planta?: string | null;
  ubicacion?: string | null;
  serie?: string | null;
  /** Etiqueta en blanco: código reservado para dar de alta un equipo al escanearla. */
  libre?: boolean;
};

/**
 * - rollo: térmica de 57 mm (o 80 mm), una etiqueta por "página" con corte entre etiquetas.
 * - mini: rollo, etiqueta baja y horizontal para notebooks, celulares o switches.
 * - a4: hoja A4 de 3 columnas (impresora común).
 */
export type FormatoEtiqueta = "rollo" | "mini" | "a4";

export const FORMATOS_ETIQUETA: { value: FormatoEtiqueta; label: string; ayuda: string }[] = [
  { value: "rollo", label: "Rollo · estándar", ayuda: "QR grande, código y ubicación. Para PCs, impresoras, monitores." },
  { value: "mini", label: "Rollo · mini", ayuda: "Baja y horizontal. Para notebooks, celulares, switches." },
  { value: "a4", label: "Hoja A4", ayuda: "3 columnas en impresora común (hojas autoadhesivas)." },
];

async function svgQr(codigo: string, base?: string | null) {
  // Corrección "Q": el QR se sigue leyendo aunque la etiqueta esté rayada o gastada (~25 %).
  return QRCode.toString(urlQr(codigo, base), { type: "svg", margin: 0, errorCorrectionLevel: "Q" });
}

function lugar(d: DatoEtiqueta) {
  return [d.sector, d.planta].filter(Boolean).join(" · ");
}

/** Arma el HTML de impresión (separado para poder previsualizarlo). */
export async function htmlEtiquetas(datos: DatoEtiqueta[], formato: FormatoEtiqueta, anchoMm = 57, base?: string | null) {
  const marca = getMarca();
  // Las térmicas de 57 mm imprimen ~48 mm útiles; las de 80 mm, ~72 mm.
  const util = anchoMm >= 80 ? 72 : 48;
  const margen = (anchoMm - util) / 2;
  const qrs = await Promise.all(datos.map((d) => svgQr(d.codigo, base)));

  if (formato === "a4") {
    const celdas = datos
      .map(
        (d, i) => `<div class="et"><div class="qr">${qrs[i]}</div><div class="tx">
          <div class="cod">${escHtml(d.codigo)}</div>
          <div class="desc">${escHtml(d.libre ? "Equipo sin registrar" : d.descripcion || "")}</div>
          <div class="ubi">${escHtml(d.libre ? "Escaneá para dar de alta" : [lugar(d), d.ubicacion].filter(Boolean).join(" · "))}</div>
          <div class="pie">${escHtml(marca.nombre)} · ¿Falla? Escaneá el QR</div></div></div>`,
      )
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      @page { size: A4; margin: 8mm; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
      .et { display: flex; gap: 2.5mm; align-items: center; border: .3mm dashed #999; border-radius: 2mm; padding: 2.5mm; height: 32mm; box-sizing: border-box; break-inside: avoid; }
      .qr { width: 26mm; height: 26mm; flex-shrink: 0; } .qr svg { width: 100%; height: 100%; }
      .tx { min-width: 0; font-size: 7.5pt; line-height: 1.25; }
      .cod { font-family: "Courier New", monospace; font-weight: bold; font-size: 11pt; }
      .desc { font-weight: bold; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
      .ubi { color: #333; } .pie { margin-top: 1mm; font-size: 6pt; color: #555; }
    </style></head><body><div class="grid">${celdas}</div></body></html>`;
  }

  if (formato === "mini") {
    const alto = 24;
    const etiquetas = datos
      .map(
        (d, i) => `<section class="et"><div class="qr">${qrs[i]}</div><div class="tx">
          <div class="cod">${escHtml(d.codigo)}</div>
          <div class="desc">${escHtml(d.libre ? "Sin registrar" : d.descripcion || "")}</div>
          <div class="pie">${escHtml(marca.nombre)}</div></div></section>`,
      )
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      @page { size: ${anchoMm}mm ${alto}mm; margin: 0; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
      .et { width: ${anchoMm}mm; height: ${alto}mm; padding: 2mm ${margen}mm; display: flex; gap: 2mm; align-items: center; overflow: hidden; break-after: page; page-break-after: always; }
      .et:last-child { break-after: auto; page-break-after: auto; }
      .qr { width: ${alto - 4}mm; height: ${alto - 4}mm; flex-shrink: 0; } .qr svg { width: 100%; height: 100%; }
      .tx { min-width: 0; line-height: 1.15; }
      .cod { font-family: "Courier New", monospace; font-weight: bold; font-size: 12pt; }
      .desc { font-size: 7pt; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pie { font-size: 6pt; }
    </style></head><body>${etiquetas}</body></html>`;
  }

  // Rollo estándar
  const alto = anchoMm >= 80 ? 70 : 60;
  const qr = anchoMm >= 80 ? 40 : 32;
  const etiquetas = datos
    .map((d, i) => {
      const ubi = d.libre ? "Escaneá para darlo de alta" : [lugar(d), d.ubicacion].filter(Boolean).join(" · ");
      return `<section class="et">
        <div class="org">${escHtml(marca.nombre)}${marca.area ? ` · ${escHtml(marca.area)}` : ""}</div>
        <div class="qr">${qrs[i]}</div>
        <div class="cod">${escHtml(d.codigo)}</div>
        <div class="desc">${escHtml(d.libre ? "EQUIPO SIN REGISTRAR" : d.descripcion || "")}</div>
        ${ubi ? `<div class="ubi">${escHtml(ubi)}</div>` : ""}
        ${d.serie && !d.libre ? `<div class="ubi">S/N ${escHtml(d.serie)}</div>` : ""}
        <div class="pie">¿Falla? Escaneá este código</div>
      </section>`;
    })
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
    @page { size: ${anchoMm}mm ${alto}mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
    .et { width: ${anchoMm}mm; height: ${alto}mm; padding: 2mm ${margen}mm 1.5mm; display: flex; flex-direction: column; align-items: center; text-align: center; overflow: hidden; break-after: page; page-break-after: always; }
    .et:last-child { break-after: auto; page-break-after: auto; }
    .org { font-size: 6.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: .3pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .qr { width: ${qr}mm; height: ${qr}mm; margin: 1.5mm 0 1mm; } .qr svg { width: 100%; height: 100%; }
    .cod { font-family: "Courier New", monospace; font-weight: bold; font-size: 15pt; line-height: 1; }
    .desc { margin-top: .8mm; font-size: 7.5pt; font-weight: bold; line-height: 1.15; max-height: 2.3em; overflow: hidden; }
    .ubi { font-size: 6.5pt; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
    .pie { margin-top: auto; padding-top: .8mm; border-top: .2mm solid #000; width: 100%; font-size: 6pt; }
  </style></head><body>${etiquetas}</body></html>`;
}

export async function imprimirEtiquetas(datos: DatoEtiqueta[], formato: FormatoEtiqueta, anchoMm = 57, base?: string | null) {
  imprimirHtml(await htmlEtiquetas(datos, formato, anchoMm, base), "Etiquetas");
}
