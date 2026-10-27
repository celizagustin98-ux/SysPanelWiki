import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CameraOff,
  CheckCircle2,
  ClipboardList,
  FileDown,
  HelpCircle,
  Loader2,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  ScanLine,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { StatTile } from "@/components/StatTile";
import { pitido, VisorQr } from "@/components/activos/EscanerQR";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  auditoriaCerrar,
  auditoriaCrear,
  auditoriaDetalle,
  auditoriaEscanear,
  auditoriaReubicar,
  type AuditoriaItem,
} from "@/backend/api/qr.functions";
import { api } from "@/lib/api/client";
import { imprimirAuditoria } from "@/lib/auditoria-pdf";
import { useAuth } from "@/lib/auth";
import { leerQr } from "@/lib/qr";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inventario-auditoria")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { id?: string } => (typeof s.id === "string" ? { id: s.id } : {}),
  head: () => ({ meta: [{ title: "Auditoría física · Nodara" }] }),
  component: AuditoriaPage,
});

type AuditoriaFila = {
  id: string;
  numero: number;
  nombre: string;
  planta: string | null;
  sector: string | null;
  estado: string;
  esperados: number;
  creada_por_nombre: string | null;
  created_at: string;
  cerrada_at: string | null;
};

function AuditoriaPage() {
  const { id } = Route.useSearch();
  const { can } = useAuth();
  if (!can("inventario", "view")) {
    return <PageHeader title="Auditoría física" description="Tu rol no tiene acceso a Activos IT." />;
  }
  return id ? <DetalleAuditoria id={id} /> : <ListaAuditorias />;
}

/* ─────────────────────────── Lista y alta ─────────────────────────── */

function ListaAuditorias() {
  const { puedeEscribir } = useAuth();
  const [nueva, setNueva] = useState(false);
  const { data = [], isLoading } = useQuery({
    queryKey: ["auditorias"],
    queryFn: async () => {
      const { data, error } = await api
        .from("inventario_auditorias")
        .select("id, numero, nombre, planta, sector, estado, esperados, creada_por_nombre, created_at, cerrada_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as AuditoriaFila[];
    },
  });
  const conteos = useQuery({
    queryKey: ["auditorias-conteo"],
    enabled: data.length > 0,
    queryFn: async () => {
      const { data: filas } = await api.from("inventario_auditoria_items").select("auditoria_id, resultado");
      const m = new Map<string, number>();
      for (const f of (filas ?? []) as { auditoria_id: string; resultado: string }[]) {
        if (f.resultado === "encontrado") m.set(f.auditoria_id, (m.get(f.auditoria_id) ?? 0) + 1);
      }
      return m;
    },
  });
  const abiertas = data.filter((a) => a.estado === "abierta");

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Activos IT"
        title="Auditoría física"
        description="Recorré un sector escaneando las etiquetas: el sistema te dice qué falta, qué sobra y qué está en otro lugar."
        action={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventario" search={{ item: undefined }}>
                <ArrowLeft /> Activos IT
              </Link>
            </Button>
            {puedeEscribir("inventario") && (
              <Button onClick={() => setNueva(true)}>
                <Plus /> Nueva auditoría
              </Button>
            )}
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-16" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <ClipboardList className="size-10 text-muted-foreground/60" />
          <p className="font-medium">Todavía no hay auditorías</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Elegí un sector, recorrelo con el celular escaneando cada etiqueta y al final descargá el informe en PDF.
          </p>
        </div>
      ) : (
        <div className="grid gap-2.5">
          {abiertas.length > 0 && <p className="eyebrow">En curso</p>}
          {data.map((a, i) => {
            const enc = conteos.data?.get(a.id) ?? 0;
            const pct = a.esperados ? Math.min(100, Math.round((enc / a.esperados) * 100)) : 0;
            return (
              <div key={a.id}>
                {i === abiertas.length && abiertas.length > 0 && <p className="eyebrow mb-2.5 mt-2">Cerradas</p>}
                <Link
                  to="/inventario-auditoria"
                  search={{ id: a.id }}
                  className="panel flex items-center gap-4 px-4 py-3 transition-colors hover:border-primary/40"
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", a.estado === "abierta" ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground")}>
                    {a.estado === "abierta" ? <ScanLine className="size-5" /> : <Lock className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      <span className="num mr-2 text-xs text-muted-foreground">AUD-{String(a.numero).padStart(4, "0")}</span>
                      {a.nombre}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[a.sector, a.planta].filter(Boolean).join(" · ") || "Todos los sectores"} · {a.creada_por_nombre ?? "—"} ·{" "}
                      {new Date(a.created_at).toLocaleDateString("es-AR")}
                    </p>
                  </div>
                  <div className="hidden w-40 sm:block">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        {enc} / {a.esperados}
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <NuevaAuditoria open={nueva} onOpenChange={setNueva} />
    </div>
  );
}

function NuevaAuditoria({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [planta, setPlanta] = useState("todas");
  const [sector, setSector] = useState("");
  const [busy, setBusy] = useState(false);
  const lugares = useQuery({
    queryKey: ["auditoria-lugares"],
    enabled: open,
    queryFn: async () => {
      const { data } = await api.from("inventario").select("planta, sector, estado");
      return (data ?? []) as { planta: string | null; sector: string | null; estado: string }[];
    },
  });
  const plantas = useMemo(() => [...new Set((lugares.data ?? []).map((l) => l.planta).filter(Boolean) as string[])].sort(), [lugares.data]);
  const sectores = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lugares.data ?? []) {
      if (!l.sector || l.estado === "baja" || (planta !== "todas" && l.planta !== planta)) continue;
      m.set(l.sector, (m.get(l.sector) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "es"));
  }, [lugares.data, planta]);

  const crear = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const { id } = await auditoriaCrear({
        data: { nombre: String(fd.get("nombre") ?? ""), planta: planta === "todas" ? null : planta, sector: sector || null },
      });
      void qc.invalidateQueries({ queryKey: ["auditorias"] });
      onOpenChange(false);
      void navigate({ to: "/inventario-auditoria", search: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear");
    } finally {
      setBusy(false);
    }
  };

  const hoy = new Date().toLocaleDateString("es-AR");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva auditoría física</DialogTitle>
          <DialogDescription>Se comparan los equipos escaneados con los que figuran en el lugar elegido.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={crear}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Planta</Label>
              <Select value={planta} onValueChange={(v) => { setPlanta(v); setSector(""); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas</SelectItem>
                  {plantas.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sector</Label>
              <Select value={sector || "todos"} onValueChange={(v) => setSector(v === "todos" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {sectores.map(([s, n]) => (
                    <SelectItem key={s} value={s}>
                      {s} ({n})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" name="nombre" key={sector + planta} required defaultValue={`Relevamiento ${sector || (planta !== "todas" ? planta : "general")} ${hoy}`} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <ScanLine />} Empezar a escanear
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Escaneo y resultado ─────────────────────────── */

type UltimoEscaneo = { codigo: string; resultado: string; descripcion: string | null; lugar: string | null; repetido: boolean };

const RESULTADO = {
  encontrado: { label: "Encontrado", icon: CheckCircle2, clase: "border-ok/40 bg-ok/10 text-ok" },
  otro_lugar: { label: "Figura en otro lugar", icon: AlertTriangle, clase: "border-warn/40 bg-warn/12 text-[color-mix(in_oklab,var(--warn),var(--foreground)_30%)]" },
  desconocido: { label: "Código sin equipo", icon: HelpCircle, clase: "border-crit/40 bg-crit/10 text-crit" },
} as const;

function DetalleAuditoria({ id }: { id: string }) {
  const { puedeEscribir } = useAuth();
  const qc = useQueryClient();
  const [camara, setCamara] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [codigo, setCodigo] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [control, setControl] = useState(true);
  const [ultimo, setUltimo] = useState<UltimoEscaneo | null>(null);
  const [cerrar, setCerrar] = useState(false);
  const enviando = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const detalle = useQuery({
    queryKey: ["auditoria", id],
    queryFn: () => auditoriaDetalle({ data: { id } }),
  });
  const aud = detalle.data?.auditoria;
  const items = useMemo(() => detalle.data?.items ?? [], [detalle.data]);
  const faltantes = useMemo(() => detalle.data?.faltantes ?? [], [detalle.data]);
  const grupos = useMemo(
    () => ({
      encontrado: items.filter((i) => i.resultado === "encontrado"),
      otro_lugar: items.filter((i) => i.resultado === "otro_lugar"),
      desconocido: items.filter((i) => i.resultado === "desconocido"),
    }),
    [items],
  );
  const abierta = aud?.estado === "abierta" && puedeEscribir("inventario");

  const escanear = async (texto: string) => {
    const leido = leerQr(texto);
    if (!leido || enviando.current) return;
    enviando.current = true;
    try {
      const r = await auditoriaEscanear({
        data: { auditoriaId: id, codigo: leido.codigo, id: leido.id, ubicacion: ubicacion || null, marcarControl: control },
      });
      setUltimo(r);
      pitido(r.resultado === "encontrado" && !r.repetido);
      void qc.invalidateQueries({ queryKey: ["auditoria", id] });
    } catch (err) {
      pitido(false);
      toast.error(err instanceof Error ? err.message : "No se pudo registrar");
    } finally {
      enviando.current = false;
    }
  };

  const enviarCodigo = (e: FormEvent) => {
    e.preventDefault();
    const t = codigo.trim();
    if (!t) return;
    setCodigo("");
    void escanear(t);
    input.current?.focus();
  };

  if (detalle.isLoading) return <div className="skeleton h-80" />;
  if (!aud) return <PageHeader title="Auditoría física" description="No se encontró la auditoría." />;

  const enc = grupos.encontrado.length;
  const pct = aud.esperados ? Math.min(100, Math.round((enc / aud.esperados) * 100)) : 0;
  const R = ultimo ? RESULTADO[ultimo.resultado as keyof typeof RESULTADO] : null;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`AUD-${String(aud.numero).padStart(4, "0")} · ${[aud.sector, aud.planta].filter(Boolean).join(" · ") || "Todos los sectores"}`}
        title={aud.nombre}
        description={aud.estado === "abierta" ? "Escaneá cada etiqueta del lugar. Los resultados se actualizan al instante." : `Cerrada el ${new Date(aud.cerrada_at!).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short", hourCycle: "h23" })} por ${aud.cerrada_por_nombre ?? "—"}.`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/inventario-auditoria">
                <ArrowLeft /> Auditorías
              </Link>
            </Button>
            <Button variant="outline" onClick={() => imprimirAuditoria(aud, items, faltantes)}>
              <FileDown /> Informe PDF
            </Button>
            {abierta && (
              <Button onClick={() => setCerrar(true)}>
                <Lock /> Cerrar auditoría
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <StatTile label="Esperados" value={aud.esperados} />
        <StatTile label="Encontrados" value={enc} tone="ok" hint={`${pct}% del total`} />
        <StatTile label="Faltan" value={faltantes.length} tone={faltantes.length ? "warn" : "ok"} />
        <StatTile label="En otro lugar" value={grupos.otro_lugar.length} tone={grupos.otro_lugar.length ? "warn" : "neutral"} />
        <StatTile label="Sin registrar" value={grupos.desconocido.length} tone={grupos.desconocido.length ? "crit" : "neutral"} />
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-ok transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className={cn("grid gap-4", abierta && "lg:grid-cols-[380px_minmax(0,1fr)]")}>
        {abierta && (
          <section className="panel space-y-3 p-4 lg:sticky lg:top-20 lg:self-start">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Escanear</p>
              <Button size="sm" variant="ghost" onClick={() => setCamara((c) => !c)}>
                {camara ? <CameraOff /> : <Camera />} {camara ? "Apagar cámara" : "Usar cámara"}
              </Button>
            </div>
            {camara && <VisorQr activo={camara} continuo onResult={(t) => void escanear(t)} className="rounded-xl" />}

            {ultimo && R && (
              <div key={`${ultimo.codigo}-${items.length}`} className={cn("flex items-start gap-3 rounded-xl border p-3 rise-in", R.clase)}>
                <R.icon className="mt-0.5 size-5 shrink-0" />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    <span className="num">{ultimo.codigo}</span> · {ultimo.repetido ? "ya estaba escaneado" : R.label}
                  </p>
                  <p className="truncate text-foreground/80">{ultimo.descripcion ?? "No está en Activos IT"}</p>
                  {ultimo.resultado === "otro_lugar" && <p className="text-xs text-foreground/70">Figura en {ultimo.lugar || "otro sector"}</p>}
                </div>
              </div>
            )}

            <form onSubmit={enviarCodigo} className="flex gap-2">
              <Input
                ref={input}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Código o lector USB + Enter"
                className="num"
                autoFocus={!camara}
              />
              <Button type="submit" variant="outline" disabled={!codigo.trim()}>
                Agregar
              </Button>
            </form>
            <div className="space-y-1.5">
              <Label htmlFor="ubi" className="flex items-center gap-1.5 text-xs">
                <MapPin className="size-3.5" /> Ubicación actual (opcional)
              </Label>
              <Input id="ubi" value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Ej.: Box 3, Rack 1, oficina de jefatura" />
              <p className="text-[11px] text-muted-foreground">Se guarda en cada equipo que escanees mientras esté escrita.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={control} onCheckedChange={(v) => setControl(!!v)} />
              Contar como control de los encontrados
            </label>
          </section>
        )}

        <section className="panel overflow-hidden">
          <Tabs defaultValue="faltantes">
            <TabsList className="m-3 h-auto flex-wrap">
              <TabsTrigger value="faltantes">Faltan · {faltantes.length}</TabsTrigger>
              <TabsTrigger value="encontrado">Encontrados · {enc}</TabsTrigger>
              <TabsTrigger value="otro_lugar">Otro lugar · {grupos.otro_lugar.length}</TabsTrigger>
              <TabsTrigger value="desconocido">Sin registrar · {grupos.desconocido.length}</TabsTrigger>
            </TabsList>
            <TabsContent value="faltantes" className="mt-0">
              <Lista
                vacio="¡Se encontraron todos los equipos esperados!"
                filas={faltantes.map((f) => ({ key: f.id, codigo: f.codigo, titulo: f.descripcion, sub: [f.ubicacion_detalle, f.asignado_a].filter(Boolean).join(" · ") }))}
              />
            </TabsContent>
            <TabsContent value="encontrado" className="mt-0">
              <Lista vacio="Todavía no se escaneó nada." filas={grupos.encontrado.map(filaItem)} />
            </TabsContent>
            <TabsContent value="otro_lugar" className="mt-0">
              <Lista
                vacio="Ningún equipo apareció fuera de lugar."
                filas={grupos.otro_lugar.map((i) => ({
                  ...filaItem(i),
                  sub: `Figura en ${i.sector_registrado ?? "otro sector"}`,
                  accion: abierta ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await auditoriaReubicar({ data: { auditoriaId: id, itemId: i.id } });
                        toast.success(`${i.codigo} pasó a ${aud.sector ?? "este lugar"}`);
                        void qc.invalidateQueries({ queryKey: ["auditoria", id] });
                      }}
                    >
                      <RotateCcw /> Mover acá
                    </Button>
                  ) : undefined,
                }))}
              />
            </TabsContent>
            <TabsContent value="desconocido" className="mt-0">
              <Lista
                vacio="Todos los códigos escaneados existen en Activos IT."
                filas={grupos.desconocido.map((i) => ({
                  ...filaItem(i),
                  titulo: "Código sin equipo registrado",
                  accion: (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/q/$codigo" params={{ codigo: i.codigo }}>
                        <Plus /> Dar de alta
                      </Link>
                    </Button>
                  ),
                }))}
              />
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <CerrarAuditoria
        open={cerrar}
        onOpenChange={setCerrar}
        faltan={faltantes.length}
        onCerrar={async (notas) => {
          await auditoriaCerrar({ data: { id, notas } });
          await qc.invalidateQueries({ queryKey: ["auditoria", id] });
          void qc.invalidateQueries({ queryKey: ["auditorias"] });
          const d = await auditoriaDetalle({ data: { id } });
          imprimirAuditoria(d.auditoria, d.items, d.faltantes);
        }}
      />
    </div>
  );
}

function filaItem(i: AuditoriaItem) {
  return {
    key: i.id,
    codigo: i.codigo,
    titulo: i.descripcion,
    sub: [i.ubicacion_detalle, `${i.escaneado_por_nombre ?? ""} ${new Date(i.escaneado_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`.trim()]
      .filter(Boolean)
      .join(" · "),
  };
}

function Lista({ filas, vacio }: { filas: { key: string; codigo: string; titulo: string | null; sub?: string; accion?: React.ReactNode }[]; vacio: string }) {
  if (!filas.length) return <p className="px-4 pb-8 pt-4 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="max-h-[calc(var(--av)*0.60)] divide-y divide-border/70 overflow-y-auto border-t border-border/70">
      {filas.map((f) => (
        <li key={f.key} className="flex items-center gap-3 px-4 py-2.5">
          <span className="num w-24 shrink-0 text-xs font-semibold text-primary">{f.codigo}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{f.titulo ?? "—"}</p>
            {f.sub && <p className="truncate text-[11px] text-muted-foreground">{f.sub}</p>}
          </div>
          {f.accion}
        </li>
      ))}
    </ul>
  );
}

function CerrarAuditoria({ open, onOpenChange, faltan, onCerrar }: { open: boolean; onOpenChange: (o: boolean) => void; faltan: number; onCerrar: (notas: string | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [notas, setNotas] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cerrar auditoría</DialogTitle>
          <DialogDescription>
            {faltan ? (
              <>
                Quedan <Badge variant="warn">{faltan} sin encontrar</Badge>. Van a figurar como faltantes en el informe.
              </>
            ) : (
              "Se encontraron todos los equipos esperados."
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="notas">Observaciones</Label>
          <Textarea id="notas" rows={3} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional: hallazgos, equipos a dar de baja…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Seguir escaneando
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onCerrar(notas.trim() || null);
                onOpenChange(false);
                toast.success("Auditoría cerrada · se generó el informe");
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "No se pudo cerrar");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <XCircle />} Cerrar y generar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
