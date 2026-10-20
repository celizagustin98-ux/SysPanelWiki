import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronLeft, ChevronRight, FileDown, Loader2 } from "lucide-react";
import { StatTile } from "@/components/StatTile";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { ESTILO_DOC, encabezadoDoc, escHtml, imprimirHtml, pesos, pieDoc } from "@/lib/imprimir";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CERRADOS = ["resuelto", "cerrado"];

type Row = Record<string, unknown>;

function mediana(nums: number[]) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function horas(ms: number | null) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  return h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} días`;
}

function contar(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

async function lista(tabla: string, columnas: string, campo: string, desde: string, hasta: string) {
  const { data, error } = await api.from(tabla).select(columnas).gte(campo, desde).lte(campo, hasta);
  if (error) return [] as Row[];
  return (data ?? []) as Row[];
}

/** Reporte mensual del área: tickets, tóners, activos y compras. */
export function ReporteMensual() {
  const [mes, setMes] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const desde = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const hasta = new Date(mes.getFullYear(), mes.getMonth() + 1, 1, 0, 0, 0, -1);
  const dIso = desde.toISOString();
  const hIso = hasta.toISOString();
  const dFecha = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}-01`;
  const hFecha = `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, "0")}-${String(hasta.getDate()).padStart(2, "0")}`;

  const { data, isLoading } = useQuery({
    queryKey: ["reporte-mensual", dFecha],
    queryFn: async () => {
      const [abiertos, cerrados, movs, reps, controles, altas, pedidos, perfiles] = await Promise.all([
        lista("tareas", "id, categoria, prioridad, sector", "created_at", dIso, hIso),
        lista("tareas", "id, numero, titulo, estado, categoria, asignado_a, created_at, resuelto_en, cerrado_en", "cerrado_en", dIso, hIso),
        lista("toner_movimientos", "id, modelo_id, tipo, cantidad, sector", "created_at", dIso, hIso),
        lista("inventario_reparaciones", "id, titulo, tipo, costo, fecha_fin, proveedor", "fecha_inicio", dFecha, hFecha),
        lista("inventario_controles", "id", "fecha_control", dFecha, hFecha),
        lista("inventario", "id, rubro", "created_at", dIso, hIso),
        lista("insumos_pedidos", "id, numero, estado, total_estimado", "created_at", dIso, hIso),
        api.rpc("directorio_usuarios").then((r) => ((r as { data: { id: string; full_name: string }[] | null }).data ?? [])),
      ]);
      const nombre = (id: unknown) => perfiles.find((p) => p.id === id)?.full_name ?? "Sin asignar";
      const resueltos = cerrados.filter((t) => CERRADOS.includes(String(t.estado)));
      const tiempos = resueltos
        .map((t) => new Date(String(t.cerrado_en || t.resuelto_en)).getTime() - new Date(String(t.created_at)).getTime())
        .filter((x) => x > 0);
      const usos = movs.filter((m) => m.tipo === "uso" || m.tipo === "reposicion");
      const porModelo = new Map<string, number>();
      for (const m of usos) {
        const n = (m.toner_modelos as { nombre?: string } | null)?.nombre ?? "—";
        porModelo.set(n, (porModelo.get(n) ?? 0) + (Number(m.cantidad) || 0));
      }
      return {
        abiertos: abiertos.length,
        resueltos: resueltos.length,
        cancelados: cerrados.length - resueltos.length,
        mediana: mediana(tiempos),
        porCategoria: contar(abiertos, (t) => String(t.categoria || "Sin categoría")).slice(0, 8),
        porTecnico: contar(resueltos, (t) => nombre(t.asignado_a)).slice(0, 8),
        porSector: contar(abiertos, (t) => String(t.sector || "—")).slice(0, 8),
        toners: [...porModelo.entries()].sort((a, b) => b[1] - a[1]),
        tonersTotal: usos.reduce((s, m) => s + (Number(m.cantidad) || 0), 0),
        tonersIngresos: movs.filter((m) => m.tipo === "ingreso").reduce((s, m) => s + (Number(m.cantidad) || 0), 0),
        reparaciones: reps,
        reparacionesCosto: reps.reduce((s, r) => s + (Number(r.costo) || 0), 0),
        controles: controles.length,
        altas: altas.length,
        pedidos,
        comprasTotal: pedidos.filter((p) => p.estado !== "rechazado").reduce((s, p) => s + (Number(p.total_estimado) || 0), 0),
      };
    },
  });

  const exportar = () => {
    if (!data) return;
    const tabla = (titulo: string, filas: [string, number | string][], col = "Cantidad") =>
      filas.length
        ? `<h2>${escHtml(titulo)}</h2><table><thead><tr><th>Detalle</th><th class="r">${col}</th></tr></thead><tbody>${filas
            .map(([k, v]) => `<tr><td>${escHtml(k)}</td><td class="r">${escHtml(v)}</td></tr>`)
            .join("")}</tbody></table>`
        : "";
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte ${MESES[mes.getMonth()]} ${mes.getFullYear()}</title><style>${ESTILO_DOC}</style></head><body>
      ${encabezadoDoc(`Reporte mensual · ${MESES[mes.getMonth()]} ${mes.getFullYear()}`, "RPT-" + dFecha.slice(0, 7), new Date())}
      <div class="grid">
        <div class="box"><label>Tickets nuevos</label><div>${data.abiertos}</div></div>
        <div class="box"><label>Tickets resueltos</label><div>${data.resueltos}</div></div>
        <div class="box"><label>Tiempo típico de resolución</label><div>${horas(data.mediana)}</div></div>
        <div class="box"><label>Tóners instalados</label><div>${data.tonersTotal} (ingresaron ${data.tonersIngresos})</div></div>
        <div class="box"><label>Reparaciones · costo</label><div>${data.reparaciones.length} · ${pesos(data.reparacionesCosto)}</div></div>
        <div class="box"><label>Compras de insumos</label><div>${data.pedidos.length} pedidos · ${pesos(data.comprasTotal)}</div></div>
      </div>
      ${tabla("Tickets por categoría", data.porCategoria)}
      ${tabla("Tickets por sector", data.porSector)}
      ${tabla("Resueltos por técnico", data.porTecnico)}
      ${tabla("Tóners instalados por modelo", data.toners)}
      ${
        data.reparaciones.length
          ? `<h2>Reparaciones y mantenimientos</h2><table><thead><tr><th>Trabajo</th><th>Proveedor</th><th>Estado</th><th class="r">Costo</th></tr></thead><tbody>${data.reparaciones
              .map((r) => `<tr><td>${escHtml(r.titulo)}</td><td>${escHtml(r.proveedor ?? "—")}</td><td>${r.fecha_fin ? "Finalizada" : "En curso"}</td><td class="r">${pesos(r.costo as number)}</td></tr>`)
              .join("")}</tbody></table>`
          : ""
      }
      <h2>Activos IT</h2><table><tbody>
        <tr><td>Altas de equipos</td><td class="r">${data.altas}</td></tr>
        <tr><td>Controles realizados</td><td class="r">${data.controles}</td></tr>
      </tbody></table>
      <div class="pie">${pieDoc(`Reporte generado el ${new Date().toLocaleString("es-AR")}`)}</div>
    </body></html>`;
    imprimirHtml(html, `Reporte-${dFecha.slice(0, 7)}`);
  };

  const hoy = new Date();
  const esActual = mes.getFullYear() === hoy.getFullYear() && mes.getMonth() === hoy.getMonth();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card p-1 shadow-xs">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mes anterior"><ChevronLeft className="size-4" /></Button>
          <p className="min-w-36 text-center text-sm font-semibold">{MESES[mes.getMonth()]} {mes.getFullYear()}</p>
          <Button variant="ghost" size="icon" className="size-8" disabled={esActual} onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Mes siguiente"><ChevronRight className="size-4" /></Button>
        </div>
        <Button onClick={exportar} disabled={!data}>
          {isLoading ? <Loader2 className="animate-spin" /> : <FileDown />} Descargar PDF
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6 stagger">
        <StatTile label="Tickets nuevos" value={isLoading ? "—" : data?.abiertos ?? 0} />
        <StatTile label="Resueltos" value={isLoading ? "—" : data?.resueltos ?? 0} tone="ok" hint={data ? `${data.cancelados} cancelados` : undefined} />
        <StatTile label="Tiempo típico" value={isLoading ? "—" : horas(data?.mediana ?? null)} hint="de apertura a cierre" />
        <StatTile label="Tóners usados" value={isLoading ? "—" : data?.tonersTotal ?? 0} hint={data ? `${data.tonersIngresos} ingresaron` : undefined} />
        <StatTile label="Reparaciones" value={isLoading ? "—" : data?.reparaciones.length ?? 0} hint={data ? pesos(data.reparacionesCosto) : undefined} />
        <StatTile label="Compras" value={isLoading ? "—" : pesos(data?.comprasTotal ?? 0)} hint={data ? `${data.pedidos.length} pedidos` : undefined} />
      </div>

      {data && (
        <div className="grid gap-3 lg:grid-cols-3">
          <Ranking titulo="Tickets por categoría" filas={data.porCategoria} color="var(--info)" />
          <Ranking titulo="Resueltos por técnico" filas={data.porTecnico} color="var(--primary)" />
          <Ranking titulo="Tóners por modelo" filas={data.toners} color="var(--warn)" />
        </div>
      )}
    </div>
  );
}

function Ranking({ titulo, filas, color }: { titulo: string; filas: [string, number][]; color: string }) {
  const max = Math.max(1, ...filas.map(([, n]) => n));
  return (
    <div className="panel p-4">
      <p className="eyebrow mb-3">{titulo}</p>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos este mes.</p>
      ) : (
        <div className="space-y-2">
          {filas.slice(0, 6).map(([k, n]) => (
            <div key={k} className="grid grid-cols-[minmax(0,8rem)_1fr_2rem] items-center gap-2 text-[13px]">
              <span className="truncate">{k}</span>
              <div className="meter" style={{ ["--meter" as string]: color }}><span style={{ width: `${(n / max) * 100}%` }} /></div>
              <span className="num text-right text-xs text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
