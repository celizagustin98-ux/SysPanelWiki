import { getMarca } from "./brand";
import { ESTILO_DOC, encabezadoDoc, escHtml, imprimirHtml, linkDoc, pesos, pieDoc } from "./imprimir";

export type InsumoPdf = {
  descripcion: string;
  cantidad: number | string;
  unidad: string;
  link: string | null;
  precio_estimado: number | string | null;
  sector: string | null;
  prioridad: string;
  notas: string | null;
};

export type PedidoInsumosPdf = {
  numero: number;
  fecha: string | Date;
  destinatario: string;
  solicitante: string | null;
  notas: string | null;
  items: InsumoPdf[];
};

export function numeroPedidoInsumos(n: number) {
  return `SOL-${String(n).padStart(4, "0")}`;
}

/** Solicitud formal de compra de insumos, lista para imprimir o guardar como PDF. */
export function imprimirPedidoInsumos(p: PedidoInsumosPdf) {
  const total = p.items.reduce((s, i) => s + (Number(i.precio_estimado) || 0) * (Number(i.cantidad) || 0), 0);
  const filas = p.items
    .map((i, idx) => {
      const sub = (Number(i.precio_estimado) || 0) * (Number(i.cantidad) || 0);
      return `<tr>
        <td class="r">${idx + 1}</td>
        <td><strong>${escHtml(i.descripcion)}</strong>${i.prioridad === "urgente" ? ' <span style="color:#b91c1c;font-size:9px;font-weight:700">URGENTE</span>' : ""}
          ${i.notas ? `<div class="small">${escHtml(i.notas)}</div>` : ""}
          ${i.link ? `<div class="small">Comprar en: ${linkDoc(i.link)}</div>` : ""}</td>
        <td>${escHtml(i.sector ?? "—")}</td>
        <td class="r">${Number(i.cantidad).toLocaleString("es-AR")} ${escHtml(i.unidad)}</td>
        <td class="r">${i.precio_estimado ? pesos(i.precio_estimado) : "—"}</td>
        <td class="r">${sub ? pesos(sub) : "—"}</td>
      </tr>`;
    })
    .join("");
  const fecha = typeof p.fecha === "string" ? new Date(p.fecha) : p.fecha;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${numeroPedidoInsumos(p.numero)}</title><style>${ESTILO_DOC}</style></head><body>
    ${encabezadoDoc("Solicitud de pedido de insumos", numeroPedidoInsumos(p.numero), fecha)}
    <div class="grid">
      <div class="box"><label>Para</label><div>${escHtml(p.destinatario)}</div></div>
      <div class="box"><label>Solicita</label><div>${escHtml(p.solicitante || getMarca().area)}</div></div>
      <div class="box"><label>Ítems</label><div>${p.items.length}</div></div>
    </div>
    <table>
      <thead><tr><th class="r" style="width:28px">#</th><th>Descripción / dónde comprar</th><th style="width:90px">Destino</th><th class="r" style="width:80px">Cantidad</th><th class="r" style="width:90px">Precio est.</th><th class="r" style="width:95px">Subtotal</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="total">Total estimado: <strong>${pesos(total)}</strong></div>
    ${p.notas ? `<div class="notas"><strong>Observaciones:</strong> ${escHtml(p.notas)}</div>` : ""}
    <div class="firmas"><div>Solicitante</div><div>Responsable de Sistemas</div><div>Compras</div></div>
    <div class="pie">${pieDoc(`${numeroPedidoInsumos(p.numero)} · Los precios son estimados. Los links se pueden abrir con un clic desde el PDF.`)}</div>
  </body></html>`;
  imprimirHtml(html, numeroPedidoInsumos(p.numero));
}
