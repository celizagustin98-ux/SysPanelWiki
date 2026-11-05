import { capa, estadoActualizacion, tipoCambio, type Actualizacion } from "@/components/oficina/actualizaciones-dominio";
import { ESTILO_DOC, encabezadoDoc, escHtml, imprimirHtml, pieDoc } from "./imprimir";

const fechaCorta = (f: string) => new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Registro (mensual o anual) de actualizaciones de sistemas, listo para imprimir o guardar como PDF. */
export function imprimirActualizacionesMes(periodo: string, filas: Actualizacion[], filtro?: string) {
  const ordenadas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  const cambios = ordenadas.reduce((s, a) => s + a.cambios.length, 0);
  const sistemas = [...new Set(ordenadas.map((a) => a.sistema))];
  const bloques = ordenadas
    .map((a) => {
      const est = estadoActualizacion(a.estado);
      const lista = a.cambios.length
        ? `<table><thead><tr><th style="width:110px">Módulo</th><th style="width:80px">Tipo</th><th>Detalle</th></tr></thead><tbody>${a.cambios
            .map((c) => `<tr><td>${escHtml(c.modulo)}</td><td>${escHtml(tipoCambio(c.tipo).label)}</td><td>${escHtml(c.detalle)}</td></tr>`)
            .join("")}</tbody></table>`
        : `<p class="small">Sin detalle de cambios.</p>`;
      const extra = [
        a.desarrollador && `Desarrollador: ${escHtml(a.desarrollador)}`,
        a.subido_por_nombre && `Subió: ${escHtml(a.subido_por_nombre)}`,
        a.requiere_corte && `Corte de servicio${a.corte_minutos ? ` ${a.corte_minutos} min` : ""}`,
        a.respaldo_previo && "Con respaldo previo",
        a.ambiente === "prueba" && "Ambiente de prueba",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<div style="break-inside:avoid;margin-bottom:16px">
        <h2 style="margin-bottom:4px">${fechaCorta(a.fecha)}${a.hora ? ` ${escHtml(a.hora)}` : ""} · ${escHtml(a.sistema)}${a.version ? ` v${escHtml(a.version)}` : ""}</h2>
        <div><strong>${escHtml(a.titulo)}</strong> — ${escHtml(est.label)}${a.capas.length ? ` · ${a.capas.map((c) => escHtml(capa(c).label)).join(", ")}` : ""}</div>
        ${extra ? `<div class="small" style="margin:2px 0 6px">${extra}</div>` : ""}
        ${lista}
        ${a.pruebas ? `<div class="notas"><strong>Pruebas:</strong> ${escHtml(a.pruebas)}</div>` : ""}
        ${a.incidencias ? `<div class="notas"><strong>Incidencias:</strong> ${escHtml(a.incidencias)}</div>` : ""}
      </div>`;
    })
    .join("");
  const titulo = `Actualizaciones de sistemas · ${periodo}`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escHtml(titulo)}</title><style>${ESTILO_DOC}</style></head><body>
    ${encabezadoDoc("Registro de actualizaciones de sistemas", periodo)}
    <div class="grid">
      <div class="box"><label>Actualizaciones</label><div>${ordenadas.length}</div></div>
      <div class="box"><label>Cambios registrados</label><div>${cambios}</div></div>
      <div class="box"><label>Sistemas</label><div>${escHtml(sistemas.join(", ") || "—")}</div></div>
    </div>
    ${filtro ? `<p class="small">Filtro: ${escHtml(filtro)}</p>` : ""}
    ${bloques || "<p>No hay actualizaciones registradas en el período.</p>"}
    <div class="firmas"><div>Responsable de Sistemas</div><div>Desarrollo</div><div>Dirección</div></div>
    <div class="pie">${pieDoc(titulo)}</div>
  </body></html>`;
  imprimirHtml(html, titulo);
}
