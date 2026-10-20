import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import {
  BatteryCharging,
  Box,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  History,
  Laptop,
  Monitor,
  Network,
  PackagePlus,
  Pencil,
  Phone,
  Printer,
  Projector,
  Router,
  ScanLine,
  Server,
  Shield,
  Smartphone,
  Tablet,
  Tag,
  UserCheck,
  UserMinus,
  Wifi,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Adjuntos } from "@/components/Adjuntos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import { cn, formatFecha } from "@/lib/utils";
import { categoriaInfo, diasHasta, estadoInfo, garantiaInfo, tipoReparacionLabel, type Tono } from "./catalogo";
import { ActivoDialog, AsignarDialog, ControlDialog, ReparacionDialog, finalizarReparacion, type Activo } from "./dialogs";

const ICONOS: Record<string, typeof Monitor> = {
  PC: Monitor,
  Notebook: Laptop,
  Servidor: Server,
  Monitor: Monitor,
  Impresora: Printer,
  Escáner: ScanLine,
  Switch: Network,
  Router: Router,
  "Access Point": Wifi,
  Firewall: Shield,
  UPS: BatteryCharging,
  "Teléfono IP": Phone,
  Tablet: Tablet,
  Celular: Smartphone,
  Proyector: Projector,
};

export function iconoCategoria(categoria?: string | null) {
  return ICONOS[categoriaInfo(categoria).value] ?? Box;
}

export function badgeVariant(tono: Tono): "ok" | "warn" | "crit" | "info" | "secondary" {
  return tono === "neutral" ? "secondary" : tono;
}

type Control = { id: string; fecha_control: string; estado: string; observacion: string | null; controlado_por_nombre: string | null; created_at: string };
type Reparacion = {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  proveedor: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  costo: number | string | null;
  resultado: string | null;
  created_by_nombre: string | null;
};
type Asignacion = { id: string; asignado_a: string; sector: string | null; desde: string; hasta: string | null; notas: string | null; notas_devolucion: string | null; actor_nombre: string | null };

function fechaHora(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

function moneda(v?: number | string | null) {
  if (v == null || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : String(v);
}

export function FichaActivo({
  item,
  canEdit,
  codigos,
  plantas,
  sectores,
  onPrintEtiqueta,
  onChanged,
}: {
  item: Activo;
  canEdit: boolean;
  codigos: (string | null)[];
  plantas: string[];
  sectores: string[];
  onPrintEtiqueta: (item: Activo) => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [qr, setQr] = useState("");
  const cat = categoriaInfo(item.rubro || item.categoria);
  const Icono = iconoCategoria(item.rubro || item.categoria);
  const est = estadoInfo(item.estado);
  const gar = garantiaInfo(item.garantia_hasta);
  const diasControl = item.ultima_vez_controlada ? -(diasHasta(item.ultima_vez_controlada) ?? 0) : null;
  const tonoControl: Tono = diasControl == null ? "warn" : diasControl > 180 ? "crit" : diasControl > 90 ? "warn" : "ok";

  useEffect(() => {
    let alive = true;
    QRCode.toString(`${window.location.origin}/inventario?item=${encodeURIComponent(item.id)}`, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(
      (svg) => alive && setQr(svg),
    );
    return () => {
      alive = false;
    };
  }, [item.id]);

  const controles = useQuery({
    queryKey: ["inventario-controles", item.id],
    queryFn: async () => {
      const { data, error } = await api.from("inventario_controles").select("*").eq("inventario_id", item.id).order("fecha_control", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Control[];
    },
  });
  const reparaciones = useQuery({
    queryKey: ["inventario-reparaciones", item.id],
    queryFn: async () => {
      const { data, error } = await api.from("inventario_reparaciones").select("*").eq("inventario_id", item.id).order("fecha_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reparacion[];
    },
  });
  const asignaciones = useQuery({
    queryKey: ["inventario-asignaciones", item.id],
    queryFn: async () => {
      const { data, error } = await api.from("inventario_asignaciones").select("*").eq("inventario_id", item.id).order("desde", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Asignacion[];
    },
  });

  const tickets = useQuery({
    queryKey: ["activo-tickets", item.id],
    queryFn: async () => {
      const { data, error } = await api.from("tareas").select("id, numero, titulo, estado, prioridad, created_at").eq("activo_id", item.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; numero: number; titulo: string; estado: string; prioridad: string; created_at: string }[];
    },
  });

  const refrescar = () => {
    onChanged();
    void qc.invalidateQueries({ queryKey: ["inventario-controles", item.id] });
    void qc.invalidateQueries({ queryKey: ["inventario-reparaciones", item.id] });
    void qc.invalidateQueries({ queryKey: ["inventario-asignaciones", item.id] });
  };

  const abiertas = (reparaciones.data ?? []).filter((r) => !r.fecha_fin);
  const costoTotal = (reparaciones.data ?? []).reduce((s, r) => s + (Number(r.costo) || 0), 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Encabezado */}
      <div className="border-b border-border bg-grid p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary shadow-xs">
            <Icono className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="num text-xs font-semibold text-primary">{item.codigo}</p>
            <h2 className="truncate text-lg font-semibold leading-snug">{item.descripcion || item.nombre}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {[cat.value, item.marca, item.modelo ?? item.tipo].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge variant={badgeVariant(est.tono)}>{est.label}</Badge>
          {abiertas.length > 0 && <Badge variant="warn">Reparación abierta</Badge>}
          <Badge variant={badgeVariant(tonoControl)}>
            {diasControl == null ? "Nunca controlado" : `Control hace ${diasControl} d`}
          </Badge>
          {item.garantia_hasta && <Badge variant={badgeVariant(gar.tono)}>Garantía: {gar.texto.toLowerCase()}</Badge>}
        </div>
      </div>

      {/* Acciones */}
      {canEdit && (
        <div className="grid grid-cols-2 gap-2 border-b border-border p-4 sm:grid-cols-3">
          <ControlDialog
            item={item}
            onDone={refrescar}
            trigger={
              <Button className="col-span-2 h-11 sm:col-span-3">
                <ClipboardCheck /> Registrar control
              </Button>
            }
          />
          <AsignarDialog
            item={item}
            onDone={refrescar}
            trigger={
              <Button variant="outline">
                {item.asignado_a ? <UserMinus /> : <UserCheck />} {item.asignado_a ? "Devolver" : "Asignar"}
              </Button>
            }
          />
          <ReparacionDialog
            item={item}
            onDone={refrescar}
            trigger={
              <Button variant="outline">
                <Wrench /> Reparación
              </Button>
            }
          />
          <ActivoDialog
            item={item}
            codigos={codigos}
            plantas={plantas}
            sectores={sectores}
            onDone={refrescar}
            trigger={
              <Button variant="outline">
                <Pencil /> Editar
              </Button>
            }
          />
          <Button variant="outline" onClick={() => onPrintEtiqueta(item)}>
            <Tag /> Etiqueta QR
          </Button>
        </div>
      )}

      <Tabs defaultValue="resumen" className="flex-1 p-4">
        <TabsList className="grid w-full grid-cols-6 [&>button]:px-1 [&>button]:text-[12px]">
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
          <TabsTrigger value="tickets">
            Tickets{(tickets.data?.length ?? 0) > 0 && <span className="num ml-1 text-[10px] opacity-70">{tickets.data?.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="reparaciones">
            Reparac.{(reparaciones.data?.length ?? 0) > 0 && <span className="num ml-1 text-[10px] opacity-70">{reparaciones.data?.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="asignaciones">Asignac.</TabsTrigger>
          <TabsTrigger value="archivos">Archivos</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen" className="space-y-4 pt-2">
          <Bloque titulo="Identificación">
            <Dato label="Código" value={item.codigo} mono copy />
            <Dato label="Categoría" value={cat.value} />
            <Dato label="Marca" value={item.marca} />
            <Dato label="Modelo" value={item.modelo ?? item.tipo} />
            <Dato label="N° de serie" value={item.numero_serie} mono copy />
            <Dato label="Propiedad" value={item.propiedad} />
          </Bloque>
          <Bloque titulo="Ubicación y asignación">
            <Dato label="Planta" value={item.planta} />
            <Dato label="Sector" value={item.sector} />
            <Dato label="Asignado a" value={item.asignado_a} />
            <Dato label="Desde" value={item.asignado_a ? fechaHora(item.asignado_desde) : null} />
          </Bloque>
          {cat.red && (item.hostname || item.ip || item.mac || item.sistema_operativo) && (
            <Bloque titulo="Red">
              <Dato label="Hostname" value={item.hostname} mono copy />
              <Dato label="IP" value={item.ip} mono copy />
              <Dato label="MAC" value={item.mac} mono copy />
              <Dato label="Sistema operativo" value={item.sistema_operativo} />
            </Bloque>
          )}
          {(cat.campos.length > 0 || Object.keys(item.specs ?? {}).length > 0) && (
            <Bloque titulo={`Especificaciones · ${cat.value}`}>
              {cat.campos.map((c) => (
                <Dato key={c.key} label={c.label} value={item.specs?.[c.key]} />
              ))}
              {Object.entries(item.specs ?? {})
                .filter(([k]) => !cat.campos.some((c) => c.key === k))
                .map(([k, v]) => (
                  <Dato key={k} label={k} value={v} />
                ))}
            </Bloque>
          )}
          <Bloque titulo="Compra y garantía">
            <Dato label="Proveedor" value={item.proveedor} />
            <Dato label="Factura / orden" value={item.nro_factura} />
            <Dato label="Fecha de compra" value={item.fecha_compra ? formatFecha(item.fecha_compra) : null} />
            <Dato label="Costo" value={item.costo != null && item.costo !== "" ? moneda(item.costo) : null} />
            <Dato label="Garantía hasta" value={item.garantia_hasta ? `${formatFecha(item.garantia_hasta)} · ${gar.texto}` : null} wide />
          </Bloque>
          {item.notas && (
            <Bloque titulo="Notas">
              <p className="col-span-2 whitespace-pre-line text-[13px] text-muted-foreground">{item.notas}</p>
            </Bloque>
          )}
          <div className="flex items-center gap-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="size-24 shrink-0 rounded-lg bg-white p-1.5" dangerouslySetInnerHTML={{ __html: qr }} />
            <p className="text-xs text-muted-foreground">
              <span className="block font-medium text-foreground">QR del activo</span>
              Pegá la etiqueta en el equipo: al escanearla con el celular se abre esta planilla.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="historial" className="pt-2">
          <Timeline item={item} controles={controles.data ?? []} reparaciones={reparaciones.data ?? []} asignaciones={asignaciones.data ?? []} />
        </TabsContent>

        <TabsContent value="reparaciones" className="space-y-3 pt-2">
          {(reparaciones.data?.length ?? 0) > 0 && (
            <p className="text-xs text-muted-foreground">
              {reparaciones.data?.length} registro(s) · costo acumulado <span className="num font-medium text-foreground">{moneda(costoTotal)}</span>
            </p>
          )}
          {(reparaciones.data ?? []).length === 0 && <Vacio texto="Sin reparaciones ni mantenimientos registrados." />}
          {(reparaciones.data ?? []).map((r) => (
            <ReparacionCard key={r.id} r={r} item={item} canEdit={canEdit} onDone={refrescar} />
          ))}
        </TabsContent>

        <TabsContent value="tickets" className="space-y-2 pt-2">
          {(tickets.data ?? []).length === 0 ? (
            <Vacio texto="Sin tickets vinculados a este equipo. Al crear un ticket elegí el equipo o escaneá su QR." />
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {tickets.data?.length} ticket(s) · {(tickets.data ?? []).filter((t) => !["resuelto", "cerrado", "cancelado"].includes(t.estado)).length} abiertos
              </p>
              {(tickets.data ?? []).map((t) => (
                <Link
                  key={t.id}
                  to="/tareas"
                  search={{ ticket: t.id }}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-accent/40"
                >
                  <span className="led" data-tone={["resuelto", "cerrado"].includes(t.estado) ? "ok" : t.estado === "cancelado" ? undefined : "warn"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{t.titulo}</span>
                    <span className="num block text-[11px] text-muted-foreground">
                      TK-{t.numero} · {new Date(t.created_at).toLocaleDateString("es-AR")} · {t.estado.replace("_", " ")}
                    </span>
                  </span>
                </Link>
              ))}
            </>
          )}
        </TabsContent>

        <TabsContent value="archivos" className="pt-2">
          <Adjuntos entidad="activo" entidadId={item.id} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="asignaciones" className="space-y-2 pt-2">
          {(asignaciones.data ?? []).length === 0 && <Vacio texto="Nunca fue asignado con registro de historial." />}
          {(asignaciones.data ?? []).map((a) => (
            <div key={a.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{a.asignado_a}</p>
                <Badge variant={a.hasta ? "secondary" : "ok"}>{a.hasta ? "Devuelto" : "Actual"}</Badge>
              </div>
              <p className="num mt-1 text-xs text-muted-foreground">
                {fechaHora(a.desde)} → {a.hasta ? fechaHora(a.hasta) : "hoy"}
                {a.sector ? ` · ${a.sector}` : ""}
              </p>
              {(a.notas || a.notas_devolucion) && (
                <p className="mt-1 text-xs text-muted-foreground">{[a.notas, a.notas_devolucion && `Devolución: ${a.notas_devolucion}`].filter(Boolean).join(" · ")}</p>
              )}
              {a.actor_nombre && <p className="mt-1 text-[11px] text-muted-foreground/80">Registrado por {a.actor_nombre}</p>}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border p-4">
      <p className="eyebrow mb-3">{titulo}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">{children}</dl>
    </section>
  );
}

function Dato({ label, value, mono, copy, wide }: { label: string; value?: string | number | null; mono?: boolean; copy?: boolean; wide?: boolean }) {
  const vacio = value === null || value === undefined || value === "";
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 flex items-center gap-1 font-medium", mono && "num", vacio && "font-normal text-muted-foreground/60")}>
        <span className="truncate">{vacio ? "—" : value}</span>
        {copy && !vacio && (
          <button
            type="button"
            aria-label={`Copiar ${label}`}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              void navigator.clipboard?.writeText(String(value));
              toast.success(`${label} copiado`);
            }}
          >
            <Copy className="size-3" />
          </button>
        )}
      </dd>
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed border-border py-8 text-center text-[13px] text-muted-foreground">{texto}</p>;
}

function ReparacionCard({ r, item, canEdit, onDone }: { r: Reparacion; item: Activo; canEdit: boolean; onDone: () => void }) {
  const [cerrando, setCerrando] = useState(false);
  const [resultado, setResultado] = useState("");
  return (
    <div className={cn("rounded-xl border p-3", r.fecha_fin ? "border-border" : "border-warn/50 bg-warn/5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{r.titulo}</p>
          <p className="text-xs text-muted-foreground">
            {tipoReparacionLabel(r.tipo)}
            {r.proveedor ? ` · ${r.proveedor}` : ""}
          </p>
        </div>
        <Badge variant={r.fecha_fin ? "ok" : "warn"}>{r.fecha_fin ? "Finalizada" : "En curso"}</Badge>
      </div>
      <p className="num mt-1.5 text-xs text-muted-foreground">
        {formatFecha(r.fecha_inicio)} → {r.fecha_fin ? formatFecha(r.fecha_fin) : "en curso"}
        {r.costo != null && r.costo !== "" ? ` · ${moneda(r.costo)}` : ""}
      </p>
      {r.detalle && <p className="mt-1.5 text-[13px] text-muted-foreground">{r.detalle}</p>}
      {r.resultado && <p className="mt-1 text-[13px]"><span className="text-muted-foreground">Resultado:</span> {r.resultado}</p>}
      {!r.fecha_fin && canEdit && (
        cerrando ? (
          <div className="mt-2 flex gap-2">
            <Input value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Resultado (ej. Reparado)" className="h-8" autoFocus />
            <Button
              size="sm"
              className="h-8"
              onClick={async () => {
                await finalizarReparacion(r.id, item, resultado);
                onDone();
              }}
            >
              Finalizar
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" className="mt-2 h-8" onClick={() => setCerrando(true)}>
            <CheckCircle2 /> Marcar como finalizada
          </Button>
        )
      )}
    </div>
  );
}

type Evento = { fecha: string; icono: typeof History; tono: Tono; titulo: string; detalle?: string | null; quien?: string | null };

function Timeline({ item, controles, reparaciones, asignaciones }: { item: Activo; controles: Control[]; reparaciones: Reparacion[]; asignaciones: Asignacion[] }) {
  const eventos = useMemo(() => {
    const ev: Evento[] = [];
    if (item.created_at) ev.push({ fecha: item.created_at, icono: PackagePlus, tono: "info", titulo: "Alta en el inventario" });
    for (const c of controles)
      ev.push({ fecha: c.created_at || c.fecha_control, icono: ClipboardCheck, tono: "ok", titulo: `Control · ${estadoInfo(c.estado).label}`, detalle: c.observacion, quien: c.controlado_por_nombre });
    for (const r of reparaciones) {
      ev.push({ fecha: `${r.fecha_inicio}T09:00:00`, icono: Wrench, tono: "warn", titulo: `${tipoReparacionLabel(r.tipo)}: ${r.titulo}`, detalle: r.proveedor ? `Proveedor: ${r.proveedor}` : r.detalle, quien: r.created_by_nombre });
      if (r.fecha_fin) ev.push({ fecha: `${r.fecha_fin}T18:00:00`, icono: CheckCircle2, tono: "ok", titulo: `Reparación finalizada: ${r.titulo}`, detalle: r.resultado });
    }
    for (const a of asignaciones) {
      ev.push({ fecha: a.desde, icono: UserCheck, tono: "info", titulo: `Asignado a ${a.asignado_a}`, detalle: [a.sector, a.notas].filter(Boolean).join(" · "), quien: a.actor_nombre });
      if (a.hasta) ev.push({ fecha: a.hasta, icono: UserMinus, tono: "neutral", titulo: `Devuelto por ${a.asignado_a}`, detalle: a.notas_devolucion });
    }
    return ev.sort((x, y) => new Date(y.fecha).getTime() - new Date(x.fecha).getTime());
  }, [item.created_at, controles, reparaciones, asignaciones]);

  if (!eventos.length) return <Vacio texto="Todavía no hay movimientos registrados." />;
  const color: Record<Tono, string> = {
    ok: "bg-ok/14 text-ok",
    warn: "bg-warn/16 text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]",
    crit: "bg-crit/14 text-crit",
    info: "bg-info/14 text-info",
    neutral: "bg-muted text-muted-foreground",
  };
  return (
    <ol className="relative space-y-4 border-l border-border pl-6">
      {eventos.map((e, i) => (
        <li key={i} className="relative">
          <span className={cn("absolute -left-[37px] grid size-7 place-items-center rounded-full ring-4 ring-background", color[e.tono])}>
            <e.icono className="size-3.5" />
          </span>
          <p className="text-[13px] font-medium">{e.titulo}</p>
          {e.detalle && <p className="text-xs text-muted-foreground">{e.detalle}</p>}
          <p className="num mt-0.5 text-[11px] text-muted-foreground/80">
            {fechaHora(e.fecha)}
            {e.quien ? ` · ${e.quien}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}
