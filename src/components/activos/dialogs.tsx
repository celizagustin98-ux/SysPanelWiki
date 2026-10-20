import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ClipboardCheck, Loader2, UserCheck, UserMinus, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn, fechaLocal } from "@/lib/utils";
import { CATEGORIAS, ESTADOS_ACTIVO, TIPOS_REPARACION, categoriaInfo, siguienteCodigo } from "./catalogo";

export type Activo = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: string;
  planta: string | null;
  sector: string | null;
  rubro: string | null;
  tipo: string | null;
  descripcion: string | null;
  cantidad: number | null;
  marca: string | null;
  modelo: string | null;
  numero_serie: string | null;
  propiedad: string | null;
  estado: string;
  ultima_vez_controlada: string | null;
  asignado_a: string | null;
  asignado_desde?: string | null;
  notas: string | null;
  hostname?: string | null;
  ip?: string | null;
  mac?: string | null;
  sistema_operativo?: string | null;
  specs?: Record<string, string> | null;
  proveedor?: string | null;
  nro_factura?: string | null;
  fecha_compra?: string | null;
  costo?: number | string | null;
  garantia_hasta?: string | null;
  created_at?: string;
  updated_at?: string;
};

export const ACTIVO_COLUMNAS_SQL =
  "id,codigo,nombre,categoria,planta,sector,rubro,tipo,descripcion,cantidad,marca,modelo,numero_serie,propiedad,estado,ultima_vez_controlada,asignado_a,asignado_desde,notas,hostname,ip,mac,sistema_operativo,specs,proveedor,nro_factura,fecha_compra,costo,garantia_hasta,created_at,updated_at";

function t(v: FormDataEntryValue | null) {
  return String(v ?? "").trim();
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-border p-4">
      <legend className="px-1.5">
        <span className="eyebrow">{titulo}</span>
      </legend>
      {descripcion && <p className="-mt-1 mb-3 text-xs text-muted-foreground">{descripcion}</p>}
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Campo({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required,
  list,
  mono,
  wide,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  type?: string;
  required?: boolean;
  list?: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", wide && "sm:col-span-2")}>
      <Label htmlFor={name}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        list={list}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue ?? ""}
        className={cn(mono && "font-mono")}
      />
    </div>
  );
}

/** Alta y edición de un activo, por secciones y con campos técnicos según la categoría. */
export function ActivoDialog({
  item,
  trigger,
  codigos,
  plantas,
  sectores,
  onDone,
}: {
  item?: Activo;
  trigger: ReactNode;
  codigos: (string | null)[];
  plantas: string[];
  sectores: string[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [categoria, setCategoria] = useState(item?.rubro || item?.categoria || "PC");
  const [estado, setEstado] = useState(item?.estado || "operativo");
  const cat = categoriaInfo(categoria);
  const codigoSugerido = useMemo(() => (item ? item.codigo : siguienteCodigo(codigos)), [item, codigos, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    const fd = new FormData(e.currentTarget);
    const descripcion = t(fd.get("descripcion"));
    if (!descripcion) return toast.error("Indicá una descripción del equipo");
    const specs: Record<string, string> = { ...(item?.specs ?? {}) };
    for (const c of cat.campos) {
      const v = t(fd.get(`spec_${c.key}`));
      if (v) specs[c.key] = v;
      else delete specs[c.key];
    }
    const costo = t(fd.get("costo")).replace(/\./g, "").replace(",", ".");
    const payload = {
      codigo: t(fd.get("codigo")) || codigoSugerido,
      nombre: descripcion,
      descripcion,
      categoria,
      rubro: categoria,
      marca: t(fd.get("marca")) || null,
      modelo: t(fd.get("modelo")) || null,
      tipo: t(fd.get("modelo")) || null,
      numero_serie: t(fd.get("numero_serie")) || null,
      estado,
      planta: t(fd.get("planta")) || null,
      sector: t(fd.get("sector")) || null,
      propiedad: t(fd.get("propiedad")) || null,
      cantidad: Math.max(1, Number(t(fd.get("cantidad")) || 1)),
      hostname: cat.red ? t(fd.get("hostname")) || null : null,
      ip: cat.red ? t(fd.get("ip")) || null : null,
      mac: cat.red ? t(fd.get("mac")).toUpperCase() || null : null,
      sistema_operativo: t(fd.get("sistema_operativo")) || null,
      specs,
      proveedor: t(fd.get("proveedor")) || null,
      nro_factura: t(fd.get("nro_factura")) || null,
      fecha_compra: t(fd.get("fecha_compra")) || null,
      costo: costo ? Number(costo) : null,
      garantia_hasta: t(fd.get("garantia_hasta")) || null,
      notas: t(fd.get("notas")) || null,
    };
    if (payload.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(payload.ip)) return toast.error("La IP no tiene un formato válido (ej. 10.0.0.25)");
    const duplicado = codigos.some((c) => c === payload.codigo) && payload.codigo !== item?.codigo;
    if (duplicado) return toast.error(`Ya existe un activo con el código ${payload.codigo}`);
    setSaving(true);
    const { error } = item
      ? await api.from("inventario").update(payload).eq("id", item.id)
      : await api.from("inventario").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(item ? "Activo actualizado" : `Activo ${payload.codigo} dado de alta`);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setCategoria(item?.rubro || item?.categoria || "PC");
          setEstado(item?.estado || "operativo");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? `Editar ${item.codigo}` : "Alta de activo"}</DialogTitle>
          <DialogDescription>Los campos técnicos cambian según la categoría del equipo.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <datalist id="activos-plantas">
            {plantas.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <datalist id="activos-sectores">
            {sectores.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>

          <Seccion titulo="Identificación">
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.value}
                    </SelectItem>
                  ))}
                  {!CATEGORIAS.some((c) => c.value === categoria) && <SelectItem value={categoria}>{categoria}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <Campo label="Código de activo" name="codigo" defaultValue={codigoSugerido} mono placeholder={codigoSugerido} />
            <Campo label="Descripción" name="descripcion" required wide defaultValue={item?.descripcion ?? item?.nombre} placeholder="Ej. PC administrativa Facturación" />
            <Campo label="Marca" name="marca" defaultValue={item?.marca} placeholder="Dell, HP, Cisco…" />
            <Campo label="Modelo" name="modelo" defaultValue={item?.modelo ?? item?.tipo} placeholder="OptiPlex 7090" />
            <Campo label="N° de serie" name="numero_serie" defaultValue={item?.numero_serie} mono />
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS_ACTIVO.map((e) => (
                    <SelectItem key={e.value} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Seccion>

          <Seccion titulo="Ubicación">
            <Campo label="Planta" name="planta" defaultValue={item?.planta} list="activos-plantas" />
            <Campo label="Sector" name="sector" defaultValue={item?.sector} list="activos-sectores" />
            <Campo label="Propiedad" name="propiedad" defaultValue={item?.propiedad} placeholder="Propio / Comodato / Alquiler" />
            <Campo label="Cantidad" name="cantidad" type="number" defaultValue={item?.cantidad ?? 1} />
          </Seccion>

          {cat.red && (
            <Seccion titulo="Red" descripcion="Para ubicar el equipo en la red y en el soporte remoto.">
              <Campo label="Hostname" name="hostname" defaultValue={item?.hostname} mono placeholder="PC-FACT-01" />
              <Campo label="Dirección IP" name="ip" defaultValue={item?.ip} mono placeholder="10.0.0.25" />
              <Campo label="MAC" name="mac" defaultValue={item?.mac} mono placeholder="AA:BB:CC:DD:EE:FF" />
              {["PC", "Notebook", "Servidor"].includes(cat.value) && (
                <Campo label="Sistema operativo" name="sistema_operativo" defaultValue={item?.sistema_operativo} placeholder="Windows 11 Pro" />
              )}
            </Seccion>
          )}

          {cat.campos.length > 0 && (
            <Seccion titulo={`Especificaciones · ${cat.value}`}>
              {cat.campos.map((c) => (
                <Campo key={c.key} label={c.label} name={`spec_${c.key}`} defaultValue={item?.specs?.[c.key]} placeholder={c.placeholder} />
              ))}
            </Seccion>
          )}

          <Seccion titulo="Compra y garantía">
            <Campo label="Proveedor" name="proveedor" defaultValue={item?.proveedor} />
            <Campo label="N° de factura / orden" name="nro_factura" defaultValue={item?.nro_factura} />
            <Campo label="Fecha de compra" name="fecha_compra" type="date" defaultValue={item?.fecha_compra} />
            <Campo label="Garantía hasta" name="garantia_hasta" type="date" defaultValue={item?.garantia_hasta} />
            <Campo label="Costo" name="costo" defaultValue={item?.costo != null ? String(item.costo) : ""} placeholder="0,00" />
          </Seccion>

          <div className="space-y-1.5">
            <Label htmlFor="notas">Notas</Label>
            <Textarea id="notas" name="notas" rows={3} defaultValue={item?.notas ?? ""} placeholder="Observaciones, accesorios, ubicación exacta…" />
          </div>

          <DialogFooter className="sticky bottom-0 -mx-6 -mb-6 border-t border-border bg-background px-6 py-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              {item ? "Guardar cambios" : "Dar de alta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Control periódico del activo (queda en el historial). */
export function ControlDialog({ item, trigger, onDone }: { item: Activo; trigger: ReactNode; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [estado, setEstado] = useState(item.estado || "operativo");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSaving(true);
    const { error } = (await api.rpc("controlar_inventario", {
      _inventario_id: item.id,
      _fecha_control: t(fd.get("fecha_control")) || fechaLocal(),
      _estado: estado,
      _observacion: t(fd.get("observacion")),
    })) as { error: Error | null };
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Control registrado");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setEstado(item.estado || "operativo"); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar control</DialogTitle>
          <DialogDescription>{item.codigo} · {item.descripcion || item.nombre}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input name="fecha_control" type="date" defaultValue={fechaLocal()} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado verificado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_ACTIVO.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Observación</Label>
            <Textarea name="observacion" rows={3} placeholder="Verificado en el lugar, limpieza, falla detectada…" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} Guardar control
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Reparación o mantenimiento (como "Maintenances" de Snipe-IT). */
export function ReparacionDialog({ item, trigger, onDone }: { item: Activo; trigger: ReactNode; onDone: () => void }) {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState("reparacion");
  const [saving, setSaving] = useState(false);
  const [finalizada, setFinalizada] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const titulo = t(fd.get("titulo"));
    if (!titulo) return toast.error("Indicá qué se hizo o qué falla tiene");
    const costo = t(fd.get("costo")).replace(/\./g, "").replace(",", ".");
    setSaving(true);
    const { error } = await api.from("inventario_reparaciones").insert({
      inventario_id: item.id,
      tipo,
      titulo,
      detalle: t(fd.get("detalle")) || null,
      proveedor: t(fd.get("proveedor")) || null,
      fecha_inicio: t(fd.get("fecha_inicio")) || fechaLocal(),
      fecha_fin: finalizada ? t(fd.get("fecha_fin")) || fechaLocal() : null,
      costo: costo ? Number(costo) : null,
      resultado: finalizada ? t(fd.get("resultado")) || null : null,
      created_by_nombre: profile?.full_name ?? null,
    });
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }
    // El estado del equipo acompaña a la reparación.
    const nuevoEstado = finalizada ? "operativo" : tipo === "mantenimiento" || tipo === "actualizacion" ? null : "reparacion";
    if (nuevoEstado && nuevoEstado !== item.estado) await api.from("inventario").update({ estado: nuevoEstado }).eq("id", item.id);
    setSaving(false);
    toast.success(finalizada ? "Reparación registrada" : "Equipo marcado en reparación");
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setTipo("reparacion"); setFinalizada(false); } }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Registrar reparación / mantenimiento</DialogTitle>
          <DialogDescription>{item.codigo} · {item.descripcion || item.nombre}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_REPARACION.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de inicio</Label>
              <Input name="fecha_inicio" type="date" defaultValue={fechaLocal()} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Falla / trabajo realizado <span className="text-destructive">*</span></Label>
            <Input name="titulo" placeholder="Ej. No enciende — reemplazo de fuente" required />
          </div>
          <div className="space-y-1.5">
            <Label>Detalle</Label>
            <Textarea name="detalle" rows={2} placeholder="Diagnóstico, repuestos, pruebas…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Proveedor / servicio técnico</Label>
              <Input name="proveedor" placeholder="Interno o empresa" />
            </div>
            <div className="space-y-1.5">
              <Label>Costo</Label>
              <Input name="costo" placeholder="0,00" />
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={finalizada} onChange={(e) => setFinalizada(e.target.checked)} />
            Ya está terminada (el equipo vuelve a estar en uso)
          </label>
          {finalizada && (
            <div className="grid gap-3 sm:grid-cols-2 rise-in">
              <div className="space-y-1.5">
                <Label>Fecha de finalización</Label>
                <Input name="fecha_fin" type="date" defaultValue={fechaLocal()} />
              </div>
              <div className="space-y-1.5">
                <Label>Resultado</Label>
                <Input name="resultado" placeholder="Reparado / sin solución…" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Wrench />} Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Finaliza una reparación abierta. */
export async function finalizarReparacion(reparacionId: string, item: Activo, resultado: string) {
  const { error } = await api
    .from("inventario_reparaciones")
    .update({ fecha_fin: fechaLocal(), resultado: resultado || "Reparado" })
    .eq("id", reparacionId);
  if (error) return toast.error(error.message);
  if (item.estado === "reparacion") await api.from("inventario").update({ estado: "operativo" }).eq("id", item.id);
  toast.success("Reparación finalizada: el equipo vuelve a estar en uso");
}

/** Asignar (checkout) o devolver (checkin) el activo. */
export function AsignarDialog({ item, trigger, onDone }: { item: Activo; trigger: ReactNode; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [estadoDev, setEstadoDev] = useState("deposito");
  const devolver = !!item.asignado_a;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const asignadoA = devolver ? "" : t(fd.get("asignado_a"));
    if (!devolver && !asignadoA) return toast.error("Indicá a quién se asigna");
    setSaving(true);
    const { error } = (await api.rpc("checkout_inventario", {
      _inventario_id: item.id,
      _asignado_a: asignadoA,
      _sector: devolver ? "" : t(fd.get("sector")),
      _notas: t(fd.get("notas")),
      _estado: estadoDev,
    })) as { error: Error | null };
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(devolver ? "Equipo devuelto" : `Asignado a ${asignadoA}`);
    setOpen(false);
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setEstadoDev("deposito"); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{devolver ? "Registrar devolución" : "Asignar equipo"}</DialogTitle>
          <DialogDescription>
            {devolver ? `Hoy está asignado a ${item.asignado_a}.` : "Queda registrado quién lo tiene y desde cuándo."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          {devolver ? (
            <div className="space-y-1.5">
              <Label>¿Cómo queda el equipo?</Label>
              <Select value={estadoDev} onValueChange={setEstadoDev}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS_ACTIVO.filter((e) => e.value !== "baja").map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Asignado a <span className="text-destructive">*</span></Label>
                <Input name="asignado_a" placeholder="Persona o puesto (ej. Recepción Guardia)" required autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label>Sector</Label>
                <Input name="sector" defaultValue={item.sector ?? ""} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Input name="notas" placeholder={devolver ? "Estado en que se recibió, accesorios…" : "Accesorios entregados, motivo…"} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : devolver ? <UserMinus /> : <UserCheck />}
              {devolver ? "Registrar devolución" : "Asignar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
