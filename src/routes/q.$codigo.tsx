import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Loader2,
  LogIn,
  MapPin,
  Plus,
  Printer,
  ScanLine,
  Send,
  Ticket,
  UserCheck,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand/BrandMark";
import { ActivoDialog, ACTIVO_COLUMNAS_SQL, AsignarDialog, ControlDialog, ReparacionDialog, type Activo } from "@/components/activos/dialogs";
import { EscanerQR } from "@/components/activos/EscanerQR";
import { badgeVariant, iconoCategoria } from "@/components/activos/FichaActivo";
import { QrLock } from "@/components/activos/QrLock";
import { UbicacionDialog } from "@/components/activos/UbicacionDialog";
import { useQrAjustes } from "@/components/activos/useQrAjustes";
import { estadoInfo } from "@/components/activos/catalogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { etiquetaLibreUsar, etiquetasMarcar, qrRegistrarEscaneo, qrResolver } from "@/backend/api/qr.functions";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useMarca } from "@/lib/brand";
import { leerQr, qrDesbloqueado } from "@/lib/qr";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/q/$codigo")({
  ssr: false,
  head: () => ({ meta: [{ title: "Equipo · Nodara" }, { name: "robots", content: "noindex" }] }),
  component: QrPage,
});

type InfoPublica = {
  existe: boolean;
  libre: boolean;
  codigo: string;
  reportePublico: boolean;
  organizacion: string | null;
  area: string | null;
  equipo: { descripcion: string | null; rubro: string | null; sector: string | null; planta: string | null; ubicacion: string | null } | null;
};

function QrPage() {
  const { codigo } = Route.useParams();
  const { session, loading, can } = useAuth();
  const info = useQuery({
    queryKey: ["qr-publico", codigo],
    queryFn: async () => {
      const r = await fetch(`/api/qr/info/${encodeURIComponent(codigo)}`);
      if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? "No se pudo leer el código");
      return (await r.json()) as InfoPublica;
    },
    retry: 1,
  });

  return (
    <div className="min-h-dvh bg-background">
      <Cabecera />
      <main className="mx-auto w-full max-w-lg px-4 pb-10 pt-4">
        {loading || info.isLoading ? (
          <div className="space-y-3">
            <div className="skeleton h-28" />
            <div className="skeleton h-48" />
          </div>
        ) : info.isError ? (
          <Aviso titulo="No se pudo leer el código" texto={(info.error as Error).message} />
        ) : session && can("inventario", "view") ? (
          <VistaEquipoSistemas codigo={codigo} info={info.data!} />
        ) : (
          <VistaPublica codigo={codigo} info={info.data!} conSesion={!!session} />
        )}
      </main>
    </div>
  );
}

function Cabecera() {
  const marca = useMarca();
  const { session } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center gap-3 px-4">
        <BrandMark className="size-8" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-semibold">{marca.nombre}</p>
          <p className="truncate text-[11px] text-muted-foreground">{marca.area}</p>
        </div>
        {session && (
          <Button asChild size="sm" variant="ghost">
            <Link to="/dashboard">
              <ArrowLeft /> Sistema
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}

function Aviso({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="panel p-6 text-center rise-in">
      <ScanLine className="mx-auto size-9 text-muted-foreground" />
      <h1 className="mt-3 text-lg font-semibold">{titulo}</h1>
      {texto && <p className="mt-1.5 text-sm text-muted-foreground">{texto}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function TarjetaEquipo({ codigo, descripcion, rubro, lugar, ubicacion, extra }: { codigo: string; descripcion?: string | null; rubro?: string | null; lugar?: string | null; ubicacion?: string | null; extra?: ReactNode }) {
  const Icono = iconoCategoria(rubro);
  return (
    <section className="panel p-4 rise-in">
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icono className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="num text-xs font-semibold text-primary">{codigo}</p>
          <h1 className="text-lg font-semibold leading-snug">{descripcion || "Equipo"}</h1>
          {lugar && <p className="mt-0.5 text-sm text-muted-foreground">{lugar}</p>}
          {ubicacion && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3.5" /> {ubicacion}
            </p>
          )}
        </div>
      </div>
      {extra}
    </section>
  );
}

/* ───────────── Sin cuenta: ver el equipo y reportar una falla ───────────── */

function VistaPublica({ codigo, info, conSesion }: { codigo: string; info: InfoPublica; conSesion: boolean }) {
  const [enviado, setEnviado] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const ingresar = (
    <Button asChild variant="outline" className="w-full">
      <Link to="/auth" search={{ redirect: `/q/${codigo}` }}>
        <LogIn /> Soy de Sistemas · ingresar
      </Link>
    </Button>
  );

  if (!info.existe) {
    return (
      <Aviso titulo="Etiqueta sin equipo asignado" texto={`El código ${info.codigo} todavía no está vinculado a ningún equipo. Avisá al área de Sistemas.`}>
        {!conSesion && ingresar}
      </Aviso>
    );
  }

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const r = await fetch(`/api/qr/reporte/${encodeURIComponent(codigo)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(fd.entries())),
      });
      const p = await r.json().catch(() => null);
      if (!r.ok) throw new Error(p?.error ?? "No se pudo enviar el reporte");
      setEnviado(p?.numero ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo enviar el reporte");
    } finally {
      setBusy(false);
    }
  };

  const eq = info.equipo!;
  return (
    <div className="space-y-4">
      <TarjetaEquipo codigo={info.codigo} descripcion={eq.descripcion} rubro={eq.rubro} lugar={[eq.sector, eq.planta].filter(Boolean).join(" · ")} ubicacion={eq.ubicacion} />

      {enviado !== undefined ? (
        <div className="panel p-6 text-center rise-in">
          <CheckCircle2 className="mx-auto size-12 text-ok" />
          <h2 className="mt-3 text-lg font-semibold">¡Reporte enviado!</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {enviado ? (
              <>
                Se creó el ticket <span className="num font-semibold text-foreground">#{enviado}</span>.{" "}
              </>
            ) : null}
            El área de Sistemas ya fue avisada y se va a comunicar con vos.
          </p>
        </div>
      ) : info.reportePublico ? (
        <form onSubmit={enviar} className="panel space-y-3 p-4 rise-in">
          <div>
            <h2 className="font-semibold">¿Este equipo tiene una falla?</h2>
            <p className="text-xs text-muted-foreground">Contanos qué pasa y Sistemas recibe el aviso al instante.</p>
          </div>
          {/* Campo trampa para bots: las personas no lo ven. */}
          <input type="text" name="sitio" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
          <div className="space-y-1.5">
            <Label htmlFor="detalle">¿Qué le pasa?</Label>
            <Textarea id="detalle" name="detalle" required minLength={5} rows={4} placeholder="Ej.: no imprime y muestra una luz roja" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nombre">Tu nombre</Label>
              <Input id="nombre" name="nombre" required minLength={2} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contacto">Interno o teléfono</Label>
              <Input id="contacto" name="contacto" inputMode="tel" placeholder="Opcional" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sector">Sector</Label>
            <Input id="sector" name="sector" defaultValue={eq.sector ?? ""} />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />} Enviar reporte
          </Button>
        </form>
      ) : (
        <Aviso titulo="Reportes por QR deshabilitados" texto="Comunicate con el área de Sistemas para informar la falla." />
      )}

      {!conSesion && ingresar}
    </div>
  );
}

/* ───────────── Con sesión: acciones rápidas sobre el equipo ───────────── */

function VistaEquipoSistemas({ codigo, info }: { codigo: string; info: InfoPublica }) {
  const { ajustes, isLoading: cargandoAjustes } = useQrAjustes();
  const [desbloqueado, setDesbloqueado] = useState(false);
  const libre = cargandoAjustes ? null : desbloqueado || qrDesbloqueado(ajustes.pedirClave);

  if (libre === null) return <div className="skeleton h-40" />;
  if (!libre) return <QrLock codigo={info.codigo} onOk={() => setDesbloqueado(true)} />;
  return info.existe ? <AccionesRapidas codigo={codigo} /> : <AltaConCodigo codigo={info.codigo} libre={info.libre} />;
}

function useListasActivos() {
  return useQuery({
    queryKey: ["activos-listas"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await api.from("inventario").select("codigo, planta, sector");
      const filas = (data ?? []) as { codigo: string; planta: string | null; sector: string | null }[];
      const unicos = (k: "planta" | "sector") => [...new Set(filas.map((f) => f[k]).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "es"));
      return { codigos: filas.map((f) => f.codigo), plantas: unicos("planta"), sectores: unicos("sector") };
    },
  });
}

function AccionesRapidas({ codigo }: { codigo: string }) {
  const { can, puedeEscribir } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [escanear, setEscanear] = useState(false);
  const [ticket, setTicket] = useState(false);
  const registrado = useRef<string | null>(null);
  const listas = useListasActivos();
  const editar = puedeEscribir("inventario");

  const activo = useQuery({
    queryKey: ["qr-activo", codigo],
    queryFn: async () => {
      const r = await qrResolver({ data: { codigo } });
      if (!r.id) return null;
      const { data, error } = await api.from("inventario").select(ACTIVO_COLUMNAS_SQL).eq("id", r.id).maybeSingle();
      if (error) throw error;
      return data as Activo | null;
    },
  });
  const item = activo.data;

  const extras = useQuery({
    queryKey: ["qr-extras", item?.id],
    enabled: !!item?.id,
    queryFn: async () => {
      const [tickets, escaneos] = await Promise.all([
        can("tareas", "view")
          ? api.from("tareas").select("id, numero, titulo, estado, created_at").eq("activo_id", item!.id).order("created_at", { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),
        api.from("inventario_escaneos").select("id, usuario_nombre, accion, detalle, publico, created_at").eq("inventario_id", item!.id).order("created_at", { ascending: false }).limit(5),
      ]);
      return {
        tickets: ((tickets.data ?? []) as { id: string; numero: number; titulo: string; estado: string }[]).filter((t) => !["cerrado", "cancelado", "resuelto"].includes(t.estado)),
        escaneos: (escaneos.data ?? []) as { id: string; usuario_nombre: string | null; accion: string; detalle: string | null; publico: boolean; created_at: string }[],
      };
    },
  });

  useEffect(() => {
    if (item?.id && registrado.current !== item.id) {
      registrado.current = item.id;
      void qrRegistrarEscaneo({ data: { inventarioId: item.id, accion: "ver" } }).catch(() => {});
    }
  }, [item?.id]);

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["qr-activo", codigo] });
    void qc.invalidateQueries({ queryKey: ["qr-extras"] });
    void qc.invalidateQueries({ queryKey: ["inventario"] });
  };
  const registrar = (accion: string) => item && void qrRegistrarEscaneo({ data: { inventarioId: item.id, accion } }).catch(() => {});

  if (activo.isLoading) return <div className="skeleton h-64" />;
  if (!item) return <Aviso titulo="No se encontró el equipo" texto={`El código ${codigo} no está en Activos IT.`} />;

  const est = estadoInfo(item.estado);
  const lugar = [item.sector, item.planta].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <TarjetaEquipo
        codigo={item.codigo}
        descripcion={item.descripcion || item.nombre}
        rubro={item.rubro || item.categoria}
        lugar={lugar}
        ubicacion={item.ubicacion_detalle}
        extra={
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-xs">
            <Badge variant={badgeVariant(est.tono)}>{est.label}</Badge>
            {item.asignado_a && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <UserCheck className="size-3.5" /> {item.asignado_a}
              </span>
            )}
            {item.ultima_vez_controlada && (
              <span className="text-muted-foreground">Control: {new Date(`${item.ultima_vez_controlada}T00:00`).toLocaleDateString("es-AR")}</span>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2.5">
        <Accion icon={FileText} titulo="Planilla técnica" onClick={() => navigate({ to: "/inventario", search: { item: item.id } })} />
        {can("tareas", "create") && <Accion icon={Ticket} titulo="Abrir ticket" onClick={() => setTicket(true)} />}
        {editar && (
          <ControlDialog item={item} onDone={() => { registrar("control"); refrescar(); }} trigger={<Accion icon={ClipboardCheck} titulo="Registrar control" />} />
        )}
        {editar && (
          <UbicacionDialog
            item={item}
            plantas={listas.data?.plantas}
            sectores={listas.data?.sectores}
            onDone={() => { registrar("ubicacion"); refrescar(); }}
            trigger={<Accion icon={MapPin} titulo="Cambiar ubicación" />}
          />
        )}
        {editar && (
          <AsignarDialog item={item} onDone={() => { registrar("asignacion"); refrescar(); }} trigger={<Accion icon={UserCheck} titulo={item.asignado_a ? "Devolver / reasignar" : "Asignar"} />} />
        )}
        {editar && (
          <ReparacionDialog item={item} onDone={() => { registrar("reparacion"); refrescar(); }} trigger={<Accion icon={Wrench} titulo="Reparación" />} />
        )}
        {editar && (
          <Accion
            icon={Printer}
            titulo="Reimprimir etiqueta"
            onClick={async () => {
              await etiquetasMarcar({ data: { ids: [item.id], impresas: false } });
              toast.success("Quedó en la lista de etiquetas para reimprimir");
            }}
          />
        )}
        <Accion icon={ScanLine} titulo="Escanear otro" destacado onClick={() => setEscanear(true)} />
      </div>

      {!!extras.data?.tickets.length && (
        <section className="panel p-4">
          <p className="eyebrow mb-2">Tickets abiertos</p>
          <ul className="space-y-1.5">
            {extras.data.tickets.map((t) => (
              <li key={t.id}>
                <Link to="/tareas" search={{ ticket: t.id }} className="flex items-center gap-2 text-sm hover:text-primary">
                  <span className="num text-xs text-muted-foreground">#{t.numero}</span>
                  <span className="truncate">{t.titulo}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!!extras.data?.escaneos.length && (
        <section className="panel p-4">
          <p className="eyebrow mb-2">Últimos escaneos</p>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {extras.data.escaneos.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {e.usuario_nombre ?? "—"}
                  {e.publico ? " (sin cuenta)" : ""} · {NOMBRE_ACCION[e.accion] ?? e.accion}
                </span>
                <time className="shrink-0">{new Date(e.created_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}</time>
              </li>
            ))}
          </ul>
        </section>
      )}

      <TicketRapido abierto={ticket} onClose={() => setTicket(false)} item={item} onCreado={() => { registrar("ticket"); refrescar(); }} />
      <EscanerQR
        open={escanear}
        onOpenChange={setEscanear}
        onResult={(texto) => {
          setEscanear(false);
          const leido = leerQr(texto);
          if (leido?.codigo) void navigate({ to: "/q/$codigo", params: { codigo: leido.codigo } });
          else if (leido?.id) void navigate({ to: "/inventario", search: { item: leido.id } });
          else toast.error("Ese QR no es una etiqueta del sistema");
        }}
      />
    </div>
  );
}

const NOMBRE_ACCION: Record<string, string> = {
  ver: "lo consultó",
  control: "registró un control",
  ubicacion: "cambió la ubicación",
  asignacion: "cambió la asignación",
  reparacion: "registró una reparación",
  ticket: "abrió un ticket",
  reporte: "reportó una falla",
  auditoria: "auditoría física",
};

function Accion({ icon: Icono, titulo, onClick, destacado }: { icon: typeof FileText; titulo: string; onClick?: () => void; destacado?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-[84px] flex-col items-start justify-between gap-2 rounded-xl border p-3.5 text-left text-sm font-medium transition-all active:scale-[0.98]",
        destacado ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary/40 hover:bg-primary/5",
      )}
    >
      <Icono className={cn("size-5", !destacado && "text-primary")} />
      {titulo}
    </button>
  );
}

function TicketRapido({ abierto, onClose, item, onCreado }: { abierto: boolean; onClose: () => void; item: Activo; onCreado: () => void }) {
  const { user, profile } = useAuth();
  const [prioridad, setPrioridad] = useState("media");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await api.from("tareas").insert({
      titulo: `${item.codigo} · ${String(fd.get("titulo") ?? "").trim()}`,
      descripcion: String(fd.get("descripcion") ?? ""),
      prioridad,
      tipo: "incidente",
      sector: item.sector,
      activo_id: item.id,
      canal: "qr",
      estado: "nuevo",
      solicitante_id: user?.id ?? null,
      solicitante_nombre: profile?.full_name ?? null,
      created_by: user?.id ?? null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ticket creado y vinculado al equipo");
    onClose();
    onCreado();
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ticket para {item.codigo}</DialogTitle>
          <DialogDescription>Queda vinculado al equipo y aparece en su planilla.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={enviar}>
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Problema</Label>
            <Input id="titulo" name="titulo" required minLength={3} autoFocus placeholder="No enciende, sin red, atasco de papel…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descripcion">Detalle</Label>
            <Textarea id="descripcion" name="descripcion" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Prioridad</Label>
            <Select value={prioridad} onValueChange={setPrioridad}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critica">Crítica</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Media</SelectItem>
                <SelectItem value="baja">Baja</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Plus />} Crear ticket
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Código sin equipo: alta desde la etiqueta preimpresa ───────────── */

function AltaConCodigo({ codigo, libre }: { codigo: string; libre: boolean }) {
  const { puedeEscribir } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listas = useListasActivos();
  const [alta, setAlta] = useState(false);
  const puede = puedeEscribir("inventario");

  return (
    <Aviso
      titulo={libre ? "Etiqueta lista para usar" : "Código sin equipo"}
      texto={
        libre
          ? `${codigo} es una etiqueta en blanco. Pegala en el equipo nuevo y cargá sus datos.`
          : `${codigo} no está registrado en Activos IT.`
      }
    >
      {puede ? (
        <>
          <Button className="h-11 w-full" onClick={() => setAlta(true)} disabled={listas.isLoading}>
            <Plus /> Dar de alta con el código {codigo}
          </Button>
          <ActivoDialog
            abierto={alta}
            onAbiertoChange={setAlta}
            codigoInicial={codigo}
            codigos={listas.data?.codigos ?? []}
            plantas={listas.data?.plantas ?? []}
            sectores={listas.data?.sectores ?? []}
            onDone={() => void qc.invalidateQueries({ queryKey: ["inventario"] })}
            onCreado={async (id, cod) => {
              await etiquetaLibreUsar({ data: { codigo: cod, inventarioId: id } }).catch(() => {});
              await qc.invalidateQueries({ queryKey: ["qr-publico", codigo] });
              void navigate({ to: "/q/$codigo", params: { codigo: cod }, replace: true });
            }}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Tu rol no puede dar de alta equipos.</p>
      )}
    </Aviso>
  );
}
