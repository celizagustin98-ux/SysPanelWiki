import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  GitBranch,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Ticket as TicketIcon,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Adjuntos } from "@/components/Adjuntos";
import { confirmar } from "@/components/Confirmar";
import { StatTile } from "@/components/StatTile";
import { BotonCsv, exportarCsv } from "@/components/tabla/Tabla";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { imprimirActualizacionesMes } from "@/lib/actualizaciones-pdf";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { clicDeFila } from "@/lib/fila-clic";
import { cn } from "@/lib/utils";
import {
  CAPAS,
  ESTADOS_ACTUALIZACION,
  MODULOS_SUGERIDOS,
  TIPOS_CAMBIO,
  capa,
  estadoActualizacion,
  leerMensajeDesarrollador,
  moverMes,
  nombreMes,
  tipoCambio,
  type Actualizacion,
  type Cambio,
  type EstadoActualizacion,
  type TipoCambio,
} from "./actualizaciones-dominio";

const hoyISO = () => new Date().toLocaleDateString("sv-SE");
const mesActual = () => hoyISO().slice(0, 7);
const fechaLarga = (f: string) =>
  new Date(`${f.slice(0, 10)}T00:00:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

function useActualizaciones() {
  return useQuery({
    queryKey: ["sistema_actualizaciones"],
    queryFn: async () => {
      const { data, error } = await api.from("sistema_actualizaciones").select("*").order("fecha", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      // Las fechas con hora pueden llegar como Date: se pasan a texto para ordenar y comparar.
      const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : "");
      return ((data ?? []) as Actualizacion[]).map((a) => ({
        ...a,
        fecha: String(a.fecha).slice(0, 10),
        created_at: iso(a.created_at),
        updated_at: iso(a.updated_at),
        capas: a.capas ?? [],
        cambios: Array.isArray(a.cambios) ? a.cambios : [],
      }));
    },
  });
}

/** Oficina → registro mensual de las versiones de otros sistemas que sube el área. */
export function Actualizaciones() {
  const { puedeEscribir } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const { data: todas = [], isLoading } = useActualizaciones();
  const [mes, setMes] = useState(mesActual);
  const [todoElAnio, setTodoElAnio] = useState(false);
  const [sistema, setSistema] = useState("todos");
  const [q, setQ] = useState("");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [editando, setEditando] = useState<Actualizacion | "nueva" | null>(null);
  const [base, setBase] = useState<Actualizacion | null>(null);

  const sistemas = useMemo(() => [...new Set(todas.map((a) => a.sistema))].sort((a, b) => a.localeCompare(b, "es")), [todas]);
  const pendientes = todas.filter((a) => a.estado === "pendiente");

  const delPeriodo = todas.filter((a) => (todoElAnio ? a.fecha.startsWith(mes.slice(0, 4)) : a.fecha.startsWith(mes)));
  const texto = q.trim().toLowerCase();
  const visibles = delPeriodo.filter(
    (a) =>
      (sistema === "todos" || a.sistema === sistema) &&
      (!texto ||
        [a.sistema, a.version, a.titulo, a.desarrollador, a.incidencias, ...a.cambios.map((c) => `${c.modulo} ${c.detalle}`)].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(texto),
        )),
  );
  const cambiosTotales = visibles.reduce((s, a) => s + a.cambios.length, 0);
  const conCapa = (c: string) => visibles.filter((a) => a.capas.includes(c)).length;
  const problemas = visibles.filter((a) => a.estado === "con_problemas" || a.estado === "revertido").length;
  const periodo = todoElAnio ? `Año ${mes.slice(0, 4)}` : nombreMes(mes);

  // Agrupadas por mes (cuando se ve el año) o por día.
  const grupos = useMemo(() => {
    const m = new Map<string, Actualizacion[]>();
    for (const a of visibles) {
      const k = todoElAnio ? a.fecha.slice(0, 7) : a.fecha.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return [...m.entries()];
  }, [visibles, todoElAnio]);

  const exportar = () =>
    exportarCsv(
      `actualizaciones-${todoElAnio ? mes.slice(0, 4) : mes}`,
      [
        { titulo: "Fecha", valor: (a: Actualizacion) => a.fecha.slice(0, 10) },
        { titulo: "Hora", valor: (a) => a.hora ?? "" },
        { titulo: "Sistema", valor: (a) => a.sistema },
        { titulo: "Versión", valor: (a) => a.version ?? "" },
        { titulo: "Título", valor: (a) => a.titulo },
        { titulo: "Estado", valor: (a) => estadoActualizacion(a.estado).label },
        { titulo: "Ambiente", valor: (a) => (a.ambiente === "prueba" ? "Prueba" : "Producción") },
        { titulo: "Capas", valor: (a) => a.capas.map((c) => capa(c).label).join(", ") },
        { titulo: "Cambios", valor: (a) => a.cambios.map((c) => `[${c.modulo} · ${tipoCambio(c.tipo).label}] ${c.detalle}`).join(" | ") },
        { titulo: "Desarrollador", valor: (a) => a.desarrollador ?? "" },
        { titulo: "Subió", valor: (a) => a.subido_por_nombre ?? "" },
        { titulo: "Corte (min)", valor: (a) => (a.requiere_corte ? (a.corte_minutos ?? "sí") : "") },
        { titulo: "Respaldo previo", valor: (a) => (a.respaldo_previo ? "Sí" : "No") },
        { titulo: "Pruebas", valor: (a) => a.pruebas ?? "" },
        { titulo: "Incidencias", valor: (a) => a.incidencias ?? "" },
      ],
      visibles,
    );

  const detalle = todas.find((a) => a.id === abierta) ?? null;

  return (
    <div className="space-y-3">
      {pendientes.length > 0 && (
        <div className="panel flex flex-wrap items-center gap-2 border-info/35 bg-info/6 px-4 py-2.5 text-sm">
          <Clock className="size-4 text-info" />
          <span className="font-medium">
            {pendientes.length === 1 ? "1 versión pendiente de subir:" : `${pendientes.length} versiones pendientes de subir:`}
          </span>
          {pendientes.slice(0, 4).map((a) => (
            <button key={a.id} type="button" onClick={() => setAbierta(a.id)} className="rounded-md border border-info/30 bg-card px-2 py-0.5 text-xs font-medium hover:border-info">
              {a.sistema}
              {a.version ? ` v${a.version}` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-card shadow-xs">
          <Button size="icon" variant="ghost" className="size-8" aria-label="Anterior" onClick={() => setMes((m) => moverMes(m, todoElAnio ? -12 : -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="min-w-[9.5rem] text-center text-[13px] font-semibold">{periodo}</span>
          <Button size="icon" variant="ghost" className="size-8" aria-label="Siguiente" onClick={() => setMes((m) => moverMes(m, todoElAnio ? 12 : 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex rounded-lg border border-border bg-card p-0.5 text-xs shadow-xs">
          {[
            [false, "Mes"],
            [true, "Año"],
          ].map(([v, l]) => (
            <button
              key={String(l)}
              type="button"
              onClick={() => setTodoElAnio(v as boolean)}
              className={cn("rounded-md px-2.5 py-1 font-medium", todoElAnio === v ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
        {mes !== mesActual() && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setMes(mesActual())}>
            Hoy
          </Button>
        )}
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar versión, módulo, cambio…" className="h-8 pl-8" />
        </div>
        {sistemas.length > 1 && (
          <Select value={sistema} onValueChange={setSistema}>
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los sistemas</SelectItem>
              {sistemas.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <BotonCsv onClick={exportar} disabled={!visibles.length} />
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!visibles.length}
          onClick={() => imprimirActualizacionesMes(periodo, visibles, [sistema !== "todos" && sistema, texto && `«${q}»`].filter(Boolean).join(" · "))}
        >
          <FileText className="size-3.5" /> PDF
        </Button>
        {canWrite && (
          <Button
            size="sm"
            className="h-8"
            onClick={() => {
              setBase(null);
              setEditando("nueva");
            }}
          >
            <Plus className="size-3.5" /> Registrar actualización
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="Actualizaciones" value={String(visibles.length)} hint={periodo} />
        <StatTile label="Cambios registrados" value={String(cambiosTotales)} hint={`${visibles.filter((a) => a.cambios.some((c) => c.tipo === "correccion")).length} con correcciones`} />
        <StatTile label="Backend / Frontend" value={`${conCapa("backend")} / ${conCapa("frontend")}`} hint={`${conCapa("base_datos")} con cambios en la base`} />
        <StatTile label="Con problemas" value={String(problemas)} hint="con problemas o revertidas" tone={problemas ? "warn" : "ok"} />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="empty-state panel bg-grid">
          <GitBranch className="mb-2 size-6 text-muted-foreground" />
          <p className="text-sm font-semibold">{delPeriodo.length ? "Ninguna coincide con el filtro" : `Sin actualizaciones en ${periodo.toLowerCase()}`}</p>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">
            Cuando el desarrollador avise que dejó una versión nueva, registrala acá: pegás su mensaje y el sistema arma la lista de cambios.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(([k, filas]) => (
            <section key={k} className="space-y-1.5">
              <p className="eyebrow">
                {todoElAnio ? nombreMes(k) : fechaLarga(k)} · {filas.length}
              </p>
              <div className="panel stagger divide-y divide-border/60 overflow-hidden">
                {filas.map((a) => (
                  <FilaActualizacion key={a.id} a={a} onOpen={() => setAbierta(a.id)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {detalle && (
        <DetalleActualizacion
          a={detalle}
          canWrite={canWrite}
          onClose={() => setAbierta(null)}
          onEditar={() => setEditando(detalle)}
          onDuplicar={() => {
            setBase(detalle);
            setAbierta(null);
            setEditando("nueva");
          }}
        />
      )}
      {editando && (
        <FormActualizacion
          a={editando === "nueva" ? null : editando}
          base={editando === "nueva" ? base : null}
          sistemas={sistemas}
          todas={todas}
          onClose={() => setEditando(null)}
          onGuardada={(id, fecha) => {
            setEditando(null);
            setAbierta(id);
            setMes(fecha.slice(0, 7));
          }}
        />
      )}
    </div>
  );
}

function FilaActualizacion({ a, onOpen }: { a: Actualizacion; onOpen: () => void }) {
  const est = estadoActualizacion(a.estado);
  const modulos = [...new Set(a.cambios.map((c) => c.modulo))];
  const fecha = new Date(`${a.fecha.slice(0, 10)}T00:00:00`);
  return (
    <div onClick={(e) => clicDeFila(e, onOpen)} className="fila-clic flex items-start gap-3 px-4 py-3">
      <div className="grid w-11 shrink-0 place-items-center rounded-lg border border-border bg-muted/40 py-1 text-center leading-none">
        <span className="num text-base font-semibold">{fecha.getDate()}</span>
        <span className="text-[10px] uppercase text-muted-foreground">{fecha.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}</span>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13.5px] font-semibold">{a.sistema}</span>
          {a.version && <span className="num rounded bg-primary/12 px-1.5 py-px text-[11px] font-semibold text-primary">v{a.version}</span>}
          <Badge variant={est.variant}>{est.label}</Badge>
          {a.ambiente === "prueba" && <Badge variant="outline">Prueba</Badge>}
        </p>
        <p className="truncate text-[13px]">{a.titulo}</p>
        <p className="flex flex-wrap items-center gap-1">
          {a.capas.map((c) => (
            <span key={c} className={cn("rounded border px-1.5 py-px text-[10.5px] font-medium", capa(c).chip)}>
              {capa(c).label}
            </span>
          ))}
          {modulos.slice(0, 4).map((m) => (
            <span key={m} className="rounded bg-muted px-1.5 py-px text-[10.5px] text-muted-foreground">
              {m}
            </span>
          ))}
          {modulos.length > 4 && <span className="text-[10.5px] text-muted-foreground">+{modulos.length - 4}</span>}
        </p>
      </div>
      <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
        <p className="num font-medium text-foreground">{a.cambios.length} cambios</p>
        {a.hora && <p className="num">{a.hora} h</p>}
        {a.subido_por_nombre && <p className="max-w-[9rem] truncate">{a.subido_por_nombre}</p>}
      </div>
    </div>
  );
}

function DetalleActualizacion({
  a,
  canWrite,
  onClose,
  onEditar,
  onDuplicar,
}: {
  a: Actualizacion;
  canWrite: boolean;
  onClose: () => void;
  onEditar: () => void;
  onDuplicar: () => void;
}) {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const est = estadoActualizacion(a.estado);
  const [verMensaje, setVerMensaje] = useState(false);
  const porModulo = useMemo(() => {
    const m = new Map<string, Cambio[]>();
    for (const c of a.cambios) m.set(c.modulo, [...(m.get(c.modulo) ?? []), c]);
    return [...m.entries()];
  }, [a.cambios]);

  const cambiarEstado = async (estado: EstadoActualizacion) => {
    const extra: Record<string, unknown> = {};
    // Si la versión dio problemas, queda un ticket abierto para seguirlo (una sola vez).
    if (estado === "con_problemas" && !a.ticket_id) {
      const nombre = `${a.sistema}${a.version ? ` v${a.version}` : ""}`;
      const t = await api.from("tareas").insert({
        titulo: `Problema después de actualizar ${nombre}`,
        descripcion: [`Actualización del ${fechaLarga(a.fecha)}: ${a.titulo}`, a.incidencias && `Incidencias: ${a.incidencias}`, a.como_revertir && `Cómo volver atrás: ${a.como_revertir}`].filter(Boolean).join("\n\n"),
        tipo: "incidente",
        prioridad: "alta",
        categoria: "Sistemas",
        estado: "nuevo",
        canal: "sistema",
        solicitante_nombre: profile?.full_name ?? null,
        created_by: profile?.id ?? null,
      });
      const id = (t.data as { id?: string } | null)?.id;
      if (t.error) toast.error(`No se pudo abrir el ticket: ${t.error.message}`);
      else if (id) extra.ticket_id = id;
    }
    const { error } = await api.from("sistema_actualizaciones").update({ estado, updated_at: new Date().toISOString(), ...extra }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(extra.ticket_id ? "Marcada con problemas y se abrió un ticket" : `Marcada como «${estadoActualizacion(estado).label.toLowerCase()}»`);
    void qc.invalidateQueries({ queryKey: ["tareas"] });
    void qc.invalidateQueries({ queryKey: ["sistema_actualizaciones"] });
  };
  const eliminar = async () => {
    if (!(await confirmar(`¿Eliminar el registro de ${a.sistema}${a.version ? ` v${a.version}` : ""}?`, { detalle: "Se borra del historial. No se puede deshacer.", peligro: true }))) return;
    const { error } = await api.from("sistema_actualizaciones").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success("Registro eliminado");
    onClose();
    void qc.invalidateQueries({ queryKey: ["sistema_actualizaciones"] });
  };

  const datos: [string, string | null][] = [
    ["Fecha", `${fechaLarga(a.fecha)}${a.hora ? ` · ${a.hora} h` : ""}`],
    ["Ambiente", a.ambiente === "prueba" ? "Prueba" : "Producción"],
    ["Desarrollador", a.desarrollador],
    ["Aviso recibido", a.aviso_fecha ? fechaLarga(a.aviso_fecha) : null],
    ["Subió", a.subido_por_nombre],
    ["Corte de servicio", a.requiere_corte ? (a.corte_minutos ? `Sí, ${a.corte_minutos} min` : "Sí") : "No"],
    ["Respaldo previo", a.respaldo_previo ? "Sí" : "No"],
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            {a.sistema}
            {a.version && <span className="num rounded bg-primary/12 px-1.5 py-px text-sm font-semibold text-primary">v{a.version}</span>}
            <Badge variant={est.variant}>{est.label}</Badge>
          </DialogTitle>
          <DialogDescription>{a.titulo}</DialogDescription>
        </DialogHeader>

        {a.capas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {a.capas.map((c) => (
              <span key={c} className={cn("rounded-md border px-2 py-0.5 text-xs font-medium", capa(c).chip)}>
                {capa(c).label}
              </span>
            ))}
          </div>
        )}

        <dl className="grid gap-x-4 gap-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-[13px] sm:grid-cols-2">
          {datos
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 sm:block">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
        </dl>

        <section className="space-y-2">
          <p className="eyebrow">Cambios ({a.cambios.length})</p>
          {porModulo.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin detalle de cambios.</p>
          ) : (
            <div className="linea-tiempo space-y-2">
              {porModulo.map(([modulo, cs]) => (
                <div key={modulo} className="rounded-lg border border-border/70 p-2.5">
                  <p className="mb-1.5 text-xs font-semibold">{modulo}</p>
                  <ul className="space-y-1">
                    {cs.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px]">
                        <span className={cn("mt-px shrink-0 rounded px-1.5 py-px text-[10.5px] font-semibold", tipoCambio(c.tipo).chip)}>{tipoCambio(c.tipo).label}</span>
                        <span className="leading-snug">{c.detalle}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {(a.pruebas || a.incidencias || a.como_revertir) && (
          <section className="grid gap-2 text-[13px]">
            {a.pruebas && (
              <div className="rounded-lg bg-ok/8 px-3 py-2">
                <p className="text-xs font-semibold text-ok">Qué se probó</p>
                <p className="whitespace-pre-wrap">{a.pruebas}</p>
              </div>
            )}
            {a.incidencias && (
              <div className="rounded-lg bg-warn/10 px-3 py-2">
                <p className="flex items-center gap-1 text-xs font-semibold">
                  <AlertTriangle className="size-3.5" /> Incidencias
                </p>
                <p className="whitespace-pre-wrap">{a.incidencias}</p>
              </div>
            )}
            {a.como_revertir && (
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs font-semibold">Cómo volver atrás</p>
                <p className="whitespace-pre-wrap">{a.como_revertir}</p>
              </div>
            )}
          </section>
        )}

        {a.ticket_id && (
          <Link to="/tareas" search={{ ticket: a.ticket_id }} className="inline-flex w-fit items-center gap-1.5 rounded-md border border-warn/40 bg-warn/8 px-2.5 py-1 text-xs font-medium hover:border-warn">
            <TicketIcon className="size-3.5" /> Ver el ticket del problema →
          </Link>
        )}

        {a.mensaje_original && (
          <section>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setVerMensaje((v) => !v)}>
              {verMensaje ? "Ocultar el mensaje del desarrollador" : "Ver el mensaje original del desarrollador"}
            </button>
            {verMensaje && <pre className="mt-1.5 max-h-60 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-3 font-sans text-[12.5px]">{a.mensaje_original}</pre>}
          </section>
        )}

        <section className="space-y-1.5">
          <p className="eyebrow">Archivos</p>
          <Adjuntos entidad="actualizacion" entidadId={a.id} canEdit={canWrite} compacto />
        </section>

        {canWrite && (
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {a.estado === "pendiente" && (
                <Button size="sm" onClick={() => void cambiarEstado("subido")}>
                  Marcar como subida
                </Button>
              )}
              {a.estado === "subido" && (
                <Button size="sm" variant="outline" onClick={() => void cambiarEstado("con_problemas")}>
                  Reportar problema
                </Button>
              )}
              {(a.estado === "subido" || a.estado === "con_problemas") && (
                <Button size="sm" variant="outline" onClick={() => void cambiarEstado("revertido")}>
                  Marcar revertida
                </Button>
              )}
              {a.estado === "con_problemas" && (
                <Button size="sm" variant="outline" onClick={() => void cambiarEstado("subido")}>
                  Problema resuelto
                </Button>
              )}
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={onDuplicar} title="Nueva versión del mismo sistema con estos datos">
                <Copy className="size-3.5" /> Usar como base
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void eliminar()}>
                <Trash2 className="size-3.5" />
              </Button>
              <Button size="sm" variant="outline" onClick={onEditar}>
                <Pencil className="size-3.5" /> Editar
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Borrador = {
  sistema: string;
  version: string;
  titulo: string;
  fecha: string;
  hora: string;
  estado: EstadoActualizacion;
  ambiente: "produccion" | "prueba";
  capas: string[];
  cambios: Cambio[];
  desarrollador: string;
  aviso_fecha: string;
  mensaje_original: string;
  requiere_corte: boolean;
  corte_minutos: string;
  respaldo_previo: boolean;
  pruebas: string;
  incidencias: string;
  como_revertir: string;
  subido_por_nombre: string;
};

function FormActualizacion({
  a,
  base,
  sistemas,
  todas,
  onClose,
  onGuardada,
}: {
  a: Actualizacion | null;
  base: Actualizacion | null;
  sistemas: string[];
  todas: Actualizacion[];
  onClose: () => void;
  onGuardada: (id: string, fecha: string) => void;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const origen = a ?? base;
  const [f, setF] = useState<Borrador>(() => ({
    sistema: origen?.sistema ?? sistemas[0] ?? "",
    version: a?.version ?? "",
    titulo: a?.titulo ?? "",
    fecha: a?.fecha.slice(0, 10) ?? hoyISO(),
    hora: a?.hora ?? new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }),
    estado: a?.estado ?? "subido",
    ambiente: origen?.ambiente ?? "produccion",
    capas: a?.capas ?? [],
    cambios: a?.cambios ?? [],
    desarrollador: origen?.desarrollador ?? "",
    aviso_fecha: a?.aviso_fecha?.slice(0, 10) ?? "",
    mensaje_original: a?.mensaje_original ?? "",
    requiere_corte: a?.requiere_corte ?? false,
    corte_minutos: a?.corte_minutos != null ? String(a.corte_minutos) : "",
    respaldo_previo: a?.respaldo_previo ?? origen?.respaldo_previo ?? true,
    pruebas: a?.pruebas ?? "",
    incidencias: a?.incidencias ?? "",
    como_revertir: a?.como_revertir ?? origen?.como_revertir ?? "",
    subido_por_nombre: a?.subido_por_nombre ?? profile?.full_name ?? "",
  }));
  const [guardando, setGuardando] = useState(false);
  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setF((x) => ({ ...x, [k]: v }));

  const desarrolladores = useMemo(() => [...new Set(todas.map((x) => x.desarrollador).filter((x): x is string => !!x))], [todas]);
  const modulos = useMemo(() => [...new Set([...todas.flatMap((x) => x.cambios.map((c) => c.modulo)), ...MODULOS_SUGERIDOS])], [todas]);
  const ultima = todas.find((x) => x.sistema === f.sistema && x.id !== a?.id);
  const versionRepetida = !!f.version.trim() && todas.some((x) => x.id !== a?.id && x.sistema === f.sistema && x.version === f.version.trim());

  const completarDesdeMensaje = () => {
    if (!f.mensaje_original.trim()) return toast.error("Pegá primero el mensaje del desarrollador");
    const r = leerMensajeDesarrollador(f.mensaje_original);
    setF((x) => ({
      ...x,
      version: x.version || r.version || "",
      capas: [...new Set([...x.capas, ...r.capas])],
      cambios: [...x.cambios, ...r.cambios],
      titulo: x.titulo || (r.cambios[0]?.detalle ?? "").slice(0, 90),
    }));
    toast.success(r.cambios.length ? `Se cargaron ${r.cambios.length} cambios: revisalos abajo` : "No se encontraron cambios; cargalos a mano");
  };

  const cambiarCambio = (i: number, campo: keyof Cambio, v: string) => set("cambios", f.cambios.map((c, j) => (j === i ? { ...c, [campo]: v } : c)));

  const guardar = async () => {
    if (!f.sistema.trim()) return toast.error("Indicá el sistema");
    if (!f.fecha) return toast.error("Indicá la fecha");
    const cambios = f.cambios.filter((c) => c.detalle.trim()).map((c) => ({ modulo: c.modulo.trim() || "General", tipo: c.tipo, detalle: c.detalle.trim() }));
    const titulo = f.titulo.trim() || cambios[0]?.detalle.slice(0, 90) || `Actualización${f.version.trim() ? ` v${f.version.trim()}` : ""}`;
    const payload = {
      sistema: f.sistema.trim(),
      version: f.version.trim().replace(/^v/i, "") || null,
      titulo,
      fecha: f.fecha,
      hora: f.hora.trim() || null,
      estado: f.estado,
      ambiente: f.ambiente,
      capas: f.capas,
      cambios: JSON.stringify(cambios),
      desarrollador: f.desarrollador.trim() || null,
      aviso_fecha: f.aviso_fecha || null,
      mensaje_original: f.mensaje_original.trim() || null,
      requiere_corte: f.requiere_corte,
      corte_minutos: f.requiere_corte && f.corte_minutos ? Math.max(0, Math.round(Number(f.corte_minutos) || 0)) : null,
      respaldo_previo: f.respaldo_previo,
      pruebas: f.pruebas.trim() || null,
      incidencias: f.incidencias.trim() || null,
      como_revertir: f.como_revertir.trim() || null,
      subido_por_nombre: f.subido_por_nombre.trim() || null,
      updated_at: new Date().toISOString(),
    };
    setGuardando(true);
    const r = a
      ? await api.from("sistema_actualizaciones").update(payload).eq("id", a.id)
      : await api.from("sistema_actualizaciones").insert({ ...payload, created_by: profile?.id ?? null });
    setGuardando(false);
    if (r.error) return toast.error(r.error.message);
    await qc.invalidateQueries({ queryKey: ["sistema_actualizaciones"] });
    toast.success(a ? "Registro actualizado" : "Actualización registrada");
    // Una versión nueva pendiente de subir se avisa al resto del área.
    if (!a && f.estado === "pendiente") {
      const id = (r.data as { id?: string } | null)?.id;
      if (id) void api.rpc("avisar_actualizacion_pendiente", { _id: id });
    }
    onGuardada(a?.id ?? (r.data as { id: string }).id, payload.fecha);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{a ? "Editar actualización" : "Registrar actualización"}</DialogTitle>
          <DialogDescription>Pegá el mensaje del desarrollador y tocá «Completar»: se arma la lista de cambios para revisar.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="space-y-1.5 rounded-xl border border-primary/25 bg-primary/5 p-3">
            <Label className="flex items-center gap-1.5 text-xs">
              <Sparkles className="size-3.5 text-primary" /> Mensaje del desarrollador
            </Label>
            <Textarea
              value={f.mensaje_original}
              onChange={(e) => set("mensaje_original", e.target.value)}
              rows={4}
              placeholder={"Hola! Les dejo la versión 2.4.1…\nBackend:\n- Usuarios: bloqueo por intentos fallidos\nFrontend:\n- Nueva pantalla de turnos"}
              className="bg-card text-[13px]"
            />
            <Button type="button" size="sm" variant="secondary" onClick={completarDesdeMensaje}>
              <Wand2 className="size-3.5" /> Completar desde el mensaje
            </Button>
          </section>

          <div className="grid gap-3 sm:grid-cols-12">
            <div className="space-y-1 sm:col-span-5">
              <Label className="text-xs">Sistema *</Label>
              <Input value={f.sistema} onChange={(e) => set("sistema", e.target.value)} list="sistemas-actualizados" placeholder="Ej.: Sistema de gestión" />
              <datalist id="sistemas-actualizados">
                {sistemas.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs">Versión</Label>
              <Input value={f.version} onChange={(e) => set("version", e.target.value)} placeholder={ultima?.version ? `anterior: ${ultima.version}` : "2.4.1"} className="num" />
            </div>
            <div className="space-y-1 sm:col-span-4">
              <Label className="text-xs">Estado</Label>
              <Select value={f.estado} onValueChange={(v) => set("estado", v as EstadoActualizacion)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_ACTUALIZACION.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {versionRepetida && (
              <p className="flex items-center gap-1.5 text-xs text-warn sm:col-span-12">
                <AlertTriangle className="size-3.5" /> Ya hay un registro de {f.sistema} v{f.version.trim()}.
              </p>
            )}
            <div className="space-y-1 sm:col-span-12">
              <Label className="text-xs">Título / resumen</Label>
              <Input value={f.titulo} onChange={(e) => set("titulo", e.target.value)} placeholder="Si lo dejás vacío se usa el primer cambio" />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs">Fecha en que se subió *</Label>
              <Input type="date" value={f.fecha} onChange={(e) => set("fecha", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Hora</Label>
              <Input type="time" value={f.hora} onChange={(e) => set("hora", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs">Ambiente</Label>
              <Select value={f.ambiente} onValueChange={(v) => set("ambiente", v as "produccion" | "prueba")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="produccion">Producción</SelectItem>
                  <SelectItem value="prueba">Prueba</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-4">
              <Label className="text-xs">Subió</Label>
              <Input value={f.subido_por_nombre} onChange={(e) => set("subido_por_nombre", e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-5">
              <Label className="text-xs">Desarrollador que la envió</Label>
              <Input value={f.desarrollador} onChange={(e) => set("desarrollador", e.target.value)} list="desarrolladores-actualizaciones" />
              <datalist id="desarrolladores-actualizaciones">
                {desarrolladores.map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1 sm:col-span-3">
              <Label className="text-xs">Fecha del aviso</Label>
              <Input type="date" value={f.aviso_fecha} onChange={(e) => set("aviso_fecha", e.target.value)} className="[color-scheme:light] dark:[color-scheme:dark]" />
            </div>
          </div>

          <section className="space-y-1.5">
            <Label className="text-xs">Qué se tocó</Label>
            <div className="flex flex-wrap gap-1.5">
              {CAPAS.map((c) => {
                const on = f.capas.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("capas", on ? f.capas.filter((x) => x !== c.value) : [...f.capas, c.value])}
                    className={cn("rounded-md border px-2.5 py-1 text-xs font-medium transition-colors", on ? c.chip : "border-border text-muted-foreground hover:text-foreground")}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Cambios ({f.cambios.length})</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set("cambios", [...f.cambios, { modulo: "", tipo: "mejora", detalle: "" }])}>
                <Plus className="size-3.5" /> Agregar cambio
              </Button>
            </div>
            <datalist id="modulos-actualizaciones">
              {modulos.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {f.cambios.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                Sin cambios cargados. Completalos desde el mensaje o agregalos a mano (por ejemplo: Usuarios · Nuevo · bloqueo por intentos).
              </p>
            ) : (
              <ul className="space-y-1.5">
                {f.cambios.map((c, i) => (
                  <li key={i} className="grid grid-cols-[1fr_auto] gap-1.5 rounded-lg border border-border/70 p-1.5 sm:grid-cols-[150px_130px_1fr_auto]">
                    <Input value={c.modulo} onChange={(e) => cambiarCambio(i, "modulo", e.target.value)} list="modulos-actualizaciones" placeholder="Módulo" className="h-8 text-[13px]" />
                    <Select value={c.tipo} onValueChange={(v) => cambiarCambio(i, "tipo", v as TipoCambio)}>
                      <SelectTrigger className="h-8 text-[13px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS_CAMBIO.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input value={c.detalle} onChange={(e) => cambiarCambio(i, "detalle", e.target.value)} placeholder="Qué cambió" className="col-span-2 h-8 text-[13px] sm:col-span-1" />
                    <Button type="button" size="icon" variant="ghost" className="size-8 sm:row-start-1 sm:col-start-4" aria-label="Quitar cambio" onClick={() => set("cambios", f.cambios.filter((_, j) => j !== i))}>
                      <X className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border/70 p-3">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.respaldo_previo} onCheckedChange={(v) => set("respaldo_previo", v === true)} /> Se hizo respaldo antes de subir
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={f.requiere_corte} onCheckedChange={(v) => set("requiere_corte", v === true)} /> Hubo corte de servicio
              </label>
              {f.requiere_corte && (
                <div className="flex items-center gap-2 pl-6 text-sm">
                  <Input value={f.corte_minutos} onChange={(e) => set("corte_minutos", e.target.value)} inputMode="numeric" className="num h-8 w-20" placeholder="0" /> minutos
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Qué se probó después de subir</Label>
              <Textarea value={f.pruebas} onChange={(e) => set("pruebas", e.target.value)} rows={3} placeholder="Ingreso, alta de usuario de prueba, impresión…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Incidencias / observaciones</Label>
              <Textarea value={f.incidencias} onChange={(e) => set("incidencias", e.target.value)} rows={3} placeholder="Errores encontrados, quejas de usuarios…" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cómo volver atrás</Label>
              <Textarea value={f.como_revertir} onChange={(e) => set("como_revertir", e.target.value)} rows={3} placeholder="Restaurar la versión anterior desde…" />
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? <Loader2 className="animate-spin" /> : <Plus />} {a ? "Guardar cambios" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
