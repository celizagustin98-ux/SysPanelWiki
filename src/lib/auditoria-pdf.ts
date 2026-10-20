import type { AuditoriaItem, Faltante } from "@/backend/api/qr.functions";
import { getMarca } from "@/lib/brand";
import { ESTILO_DOC, encabezadoDoc, escHtml, imprimirHtml } from "@/lib/imprimir";

type Aud = {
  numero: number;
  nombre: string;
  planta: string | null;
  sector: string | null;
  estado: string;
  esperados: number;
  notas: string | null;
  creada_por_nombre: string | null;
  created_at: string;
  cerrada_at: string | null;
  cerrada_por_nombre: string | null;
};

function tabla(titulo: string, filas: string[][], cols: string[]) {
  if (!filas.length) return `<h3>${escHtml(titulo)} (0)</h3><p class="small">Sin registros.</p>`;
  return `<h3>${escHtml(titulo)} (${filas.length})</h3>
    <table><thead><tr>${cols.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

/** Informe de la auditoría física: encontrados, en otro lugar, desconocidos y faltantes. */
export function imprimirAuditoria(aud: Aud, items: AuditoriaItem[], faltantes: Faltante[]) {
  const marca = getMarca();
  const enc = items.filter((i) => i.resultado === "encontrado");
  const otro = items.filter((i) => i.resultado === "otro_lugar");
  const desc = items.filter((i) => i.resultado === "desconocido");
  const pct = aud.esperados ? Math.round((enc.length / aud.esperados) * 100) : 100;
  const fecha = (s: string) => new Date(s).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23" });
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Auditoría ${aud.numero}</title><style>${ESTILO_DOC}
    h3 { margin: 16px 0 6px; font-size: 12px; }
    .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; margin: 10px 0; }
    .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 6px 8px; } .kpi b { display: block; font-size: 16px; }
  </style></head><body>
    ${encabezadoDoc("Auditoría física de activos", `AUD-${String(aud.numero).padStart(4, "0")}`, new Date(aud.cerrada_at ?? aud.created_at))}
    <div class="grid">
      <div class="box"><label>Auditoría</label><div>${escHtml(aud.nombre)}</div></div>
      <div class="box"><label>Lugar</label><div>${escHtml([aud.sector, aud.planta].filter(Boolean).join(" · ") || "Todos los sectores")}</div></div>
      <div class="box"><label>Responsable</label><div>${escHtml(aud.creada_por_nombre ?? "—")}</div></div>
    </div>
    <div class="kpis">
      <div class="kpi">Esperados<b>${aud.esperados}</b></div>
      <div class="kpi">Encontrados<b>${enc.length}</b></div>
      <div class="kpi">Faltantes<b>${faltantes.length}</b></div>
      <div class="kpi">En otro lugar<b>${otro.length}</b></div>
      <div class="kpi">Cobertura<b>${pct}%</b></div>
    </div>
    ${tabla("Faltantes (no se encontraron)", faltantes.map((f) => [f.codigo, f.descripcion ?? "", f.ubicacion_detalle ?? "", f.asignado_a ?? ""]), ["Código", "Equipo", "Ubicación registrada", "Asignado a"])}
    ${tabla("Encontrados en otro lugar", otro.map((i) => [i.codigo, i.descripcion ?? "", i.sector_registrado ?? "", fecha(i.escaneado_at)]), ["Código", "Equipo", "Figuraba en", "Escaneado"])}
    ${tabla("Códigos sin equipo registrado", desc.map((i) => [i.codigo, fecha(i.escaneado_at), i.escaneado_por_nombre ?? ""]), ["Código", "Escaneado", "Por"])}
    ${tabla("Encontrados", enc.map((i) => [i.codigo, i.descripcion ?? "", i.ubicacion_detalle ?? "", fecha(i.escaneado_at)]), ["Código", "Equipo", "Ubicación", "Escaneado"])}
    ${aud.notas ? `<div class="notas"><strong>Observaciones:</strong> ${escHtml(aud.notas)}</div>` : ""}
    <div class="firmas"><div>Realizó</div><div>Responsable de Sistemas</div><div>Responsable del sector</div></div>
    <div class="pie">${escHtml(marca.pie)} · Inicio ${fecha(aud.created_at)}${aud.cerrada_at ? ` · Cierre ${fecha(aud.cerrada_at)} por ${escHtml(aud.cerrada_por_nombre ?? "")}` : " · En curso"}</div>
  </body></html>`;
  imprimirHtml(html, `Auditoria-${aud.numero}`);
}
