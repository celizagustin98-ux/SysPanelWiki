import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  AtSign,
  Building2,
  CircleCheck,
  CircleOff,
  Copy,
  Globe,
  History,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { InputClave } from "@/components/InputClave";
import { SecretoOculto, rpcRevelar, useSecretos } from "@/components/SecretoOculto";
import { BotonCsv, exportarCsv } from "@/components/tabla/Tabla";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Tipo = "proveedor" | "empresa";

type Contacto = {
  id: string;
  tipo: Tipo;
  nombre: string;
  rubro: string | null;
  contacto: string | null;
  email: string | null;
  usuario: string | null;
  telefono: string | null;
  whatsapp: string | null;
  web: string | null;
  direccion: string | null;
  cuit: string | null;
  notas: string | null;
  favorito: boolean;
  activo: boolean;
  /** Casilla en uso (activo) o dada de baja (inactivo). "activo" en cambio es si sigue en la agenda. */
  vigente?: boolean;
  inactivo_desde?: string | null;
  has_secreto?: boolean;
};

type CambioContacto = {
  id: string;
  contacto_id: string;
  campo: string;
  antes: string | null;
  despues: string | null;
  cifrado: boolean;
  tiene_antes: boolean;
  tiene_despues: boolean;
  actor_nombre: string | null;
  created_at: string;
  contacto_nombre: string;
  contacto_email: string | null;
};

const ETIQUETA_CAMPO: Record<string, string> = {
  _alta: "Alta en la agenda",
  nombre: "Área",
  rubro: "Grupo",
  email: "Email",
  usuario: "Usuario",
  secreto: "Clave",
  contacto: "Responsable",
  telefono: "Teléfono",
  whatsapp: "WhatsApp",
  web: "Webmail",
  direccion: "Dirección",
  cuit: "CUIT",
  notas: "Notas",
  vigente: "Estado",
  activo: "En la agenda",
};

const fechaHora = (v: string) =>
  new Date(v).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const fecha = (v: string) => new Date(v).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

const soloDigitos = (v: string) => v.replace(/\D/g, "");
const urlWeb = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);
const limpio = (v: string, max: number) => v.trim().slice(0, max) || null;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function copiar(texto: string, que: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${que} copiado`);
  } catch {
    toast.error("No se pudo copiar");
  }
}

function useContactos() {
  return useQuery({
    queryKey: ["oficina_contactos"],
    queryFn: async () => {
      const { data, error } = await api.from("oficina_contactos").select("*").eq("activo", true).order("nombre");
      if (error) throw error;
      return (data ?? []) as Contacto[];
    },
  });
}

/** Agenda de la oficina: proveedores (con quién se compra) y las casillas de email de cada área. */
export function Agenda() {
  const [seccion, setSeccion] = useState<Tipo>("proveedor");
  const { data: contactos = [], isLoading } = useContactos();
  const proveedores = contactos.filter((c) => c.tipo === "proveedor");
  const emails = contactos.filter((c) => c.tipo === "empresa");

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SeccionBoton
          activo={seccion === "proveedor"}
          onClick={() => setSeccion("proveedor")}
          icono={Truck}
          titulo="Proveedores"
          detalle="Con quién compramos: contacto, teléfono, WhatsApp, web y CUIT"
          n={proveedores.length}
          tono="amber"
        />
        <SeccionBoton
          activo={seccion === "empresa"}
          onClick={() => setSeccion("empresa")}
          icono={AtSign}
          titulo="Emails de la empresa"
          detalle="Casillas de cada área con su usuario y clave protegida"
          n={emails.filter((c) => c.vigente !== false).length}
          tono="sky"
        />
      </div>
      {seccion === "proveedor" ? (
        <Proveedores lista={proveedores} cargando={isLoading} />
      ) : (
        <EmailsEmpresa lista={emails} cargando={isLoading} />
      )}
    </div>
  );
}

function SeccionBoton({
  activo,
  onClick,
  icono: Icono,
  titulo,
  detalle,
  n,
  tono,
}: {
  activo: boolean;
  onClick: () => void;
  icono: typeof Truck;
  titulo: string;
  detalle: string;
  n: number;
  tono: "amber" | "sky";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left transition",
        activo ? "border-primary bg-primary/8 ring-1 ring-primary/30" : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          tono === "amber" ? "bg-amber-500/12 text-amber-600 dark:text-amber-300" : "bg-sky-500/12 text-sky-600 dark:text-sky-300",
        )}
      >
        <Icono className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 font-semibold">
          {titulo}
          <span className="num rounded bg-muted px-1.5 text-[11px] font-semibold text-muted-foreground">{n}</span>
        </span>
        <span className="block truncate text-xs text-muted-foreground">{detalle}</span>
      </span>
    </button>
  );
}

/* ───────────── Proveedores ───────────── */

function Proveedores({ lista, cargando }: { lista: Contacto[]; cargando: boolean }) {
  const { profile, puedeEscribir, can } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const canDelete = can("oficina", "delete");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Contacto | "nuevo" | null>(null);

  const rubros = useMemo(
    () => [...new Set(lista.map((c) => c.rubro?.trim()).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)),
    [lista],
  );
  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return lista
      .filter((c) => !rubro || c.rubro?.trim() === rubro)
      .filter(
        (c) =>
          !term ||
          [c.nombre, c.rubro, c.contacto, c.email, c.telefono, c.whatsapp, c.web, c.direccion, c.cuit, c.notas]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term)),
      )
      .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre));
  }, [lista, q, rubro]);
  const refrescar = () => void qc.invalidateQueries({ queryKey: ["oficina_contactos"] });

  return (
    <div className="space-y-3">
      <Barra
        q={q}
        setQ={setQ}
        placeholder="Buscar proveedor, rubro, contacto, teléfono…"
        csv={() =>
          exportarCsv(
            "proveedores",
            [
              { titulo: "Proveedor", valor: (c: Contacto) => c.nombre },
              { titulo: "Rubro", valor: (c: Contacto) => c.rubro },
              { titulo: "Contacto", valor: (c: Contacto) => c.contacto },
              { titulo: "Email", valor: (c: Contacto) => c.email },
              { titulo: "Teléfono", valor: (c: Contacto) => c.telefono },
              { titulo: "WhatsApp", valor: (c: Contacto) => c.whatsapp },
              { titulo: "Web", valor: (c: Contacto) => c.web },
              { titulo: "Dirección", valor: (c: Contacto) => c.direccion },
              { titulo: "CUIT", valor: (c: Contacto) => c.cuit },
              { titulo: "Notas", valor: (c: Contacto) => c.notas },
            ],
            visibles,
          )
        }
        hayDatos={!!visibles.length}
        boton={canWrite ? { texto: "Nuevo proveedor", onClick: () => setEditando("nuevo") } : null}
      />

      {rubros.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...rubros].map((r) => (
            <button
              key={r ?? "todos"}
              type="button"
              onClick={() => setRubro(r)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                rubro === r ? "border-primary/40 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {r ?? "Todos los rubros"}
            </button>
          ))}
        </div>
      )}

      {cargando ? (
        <Esqueleto />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo={lista.length ? "No hay proveedores con ese filtro" : "Todavía no hay proveedores"}
          detalle="Guardá con quién compran: así aparecen al registrar una compra en los pedidos."
          accion={canWrite && !lista.length ? { texto: "Agregar el primero", onClick: () => setEditando("nuevo") } : null}
        />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => (
            <article key={c.id} className="panel flex flex-col gap-2.5 p-4">
              <header className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-300">
                  <Truck className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold tracking-tight">{c.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.rubro || "Sin rubro"}
                    {c.contacto ? ` · ${c.contacto}` : ""}
                  </p>
                </div>
                <Favorito c={c} canWrite={canWrite} onCambio={refrescar} />
              </header>
              <ul className="space-y-1 text-[13px]">
                {c.email && <Linea icono={Mail} texto={c.email} href={`mailto:${c.email}`} onCopiar={() => void copiar(c.email!, "Email")} />}
                {c.telefono && (
                  <Linea icono={Phone} texto={c.telefono} href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`} onCopiar={() => void copiar(c.telefono!, "Teléfono")} />
                )}
                {c.whatsapp && (
                  <Linea icono={MessageCircle} texto={c.whatsapp} href={`https://wa.me/${soloDigitos(c.whatsapp)}`} externo onCopiar={() => void copiar(c.whatsapp!, "WhatsApp")} />
                )}
                {c.web && <Linea icono={Globe} texto={c.web.replace(/^https?:\/\//i, "")} href={urlWeb(c.web)} externo />}
                {c.direccion && <Linea icono={MapPin} texto={c.direccion} />}
              </ul>
              {(c.cuit || c.notas) && (
                <p className="line-clamp-2 text-xs text-muted-foreground">
                  {c.cuit ? `CUIT ${c.cuit}` : ""}
                  {c.cuit && c.notas ? " · " : ""}
                  {c.notas}
                </p>
              )}
              {canWrite && (
                <Acciones onEditar={() => setEditando(c)} onQuitar={canDelete ? () => void quitar(c, refrescar) : undefined} />
              )}
            </article>
          ))}
        </div>
      )}

      {editando && (
        <ProveedorForm
          contacto={editando === "nuevo" ? null : editando}
          rubros={rubros}
          autor={profile?.full_name ?? null}
          onClose={() => setEditando(null)}
          onGuardado={refrescar}
        />
      )}
    </div>
  );
}

function ProveedorForm({
  contacto,
  rubros,
  autor,
  onClose,
  onGuardado,
}: {
  contacto: Contacto | null;
  rubros: string[];
  autor: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState(() => ({
    nombre: contacto?.nombre ?? "",
    rubro: contacto?.rubro ?? "",
    contacto: contacto?.contacto ?? "",
    email: contacto?.email ?? "",
    telefono: contacto?.telefono ?? "",
    whatsapp: contacto?.whatsapp ?? "",
    web: contacto?.web ?? "",
    direccion: contacto?.direccion ?? "",
    cuit: contacto?.cuit ?? "",
    notas: contacto?.notas ?? "",
  }));
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.nombre.trim()) return toast.error("Ingresá el nombre del proveedor");
    const email = f.email.trim();
    if (email && !EMAIL_RE.test(email)) return toast.error("El email no es válido");
    const payload = {
      tipo: "proveedor",
      nombre: f.nombre.trim().slice(0, 160),
      rubro: limpio(f.rubro, 120),
      contacto: limpio(f.contacto, 160),
      email: email ? email.toLowerCase() : null,
      telefono: limpio(f.telefono, 60),
      whatsapp: limpio(f.whatsapp, 60),
      web: limpio(f.web, 300),
      direccion: limpio(f.direccion, 300),
      cuit: limpio(f.cuit, 20),
      notas: limpio(f.notas, 1000),
    };
    setGuardando(true);
    const ok = await guardarContacto(contacto, payload, autor);
    setGuardando(false);
    if (!ok) return;
    toast.success(contacto ? "Proveedor actualizado" : "Proveedor agregado");
    onGuardado();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5 text-amber-500" /> {contacto ? "Editar proveedor" : "Nuevo proveedor"}
          </DialogTitle>
          <DialogDescription>Datos para contactarlo y comprarle.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <Grupo titulo="Empresa">
            <Campo label="Proveedor *">
              <Input value={f.nombre} onChange={set("nombre")} placeholder="Compugarden S.A." maxLength={160} autoFocus />
            </Campo>
            <Campo label="Rubro">
              <Input value={f.rubro} onChange={set("rubro")} list="agenda-rubros" placeholder="Insumos informáticos" maxLength={120} />
              <datalist id="agenda-rubros">{rubros.map((r) => <option key={r} value={r} />)}</datalist>
            </Campo>
            <Campo label="CUIT">
              <Input value={f.cuit} onChange={set("cuit")} placeholder="30-12345678-9" maxLength={20} />
            </Campo>
            <Campo label="Sitio web">
              <Input value={f.web} onChange={set("web")} placeholder="www.proveedor.com" maxLength={300} />
            </Campo>
          </Grupo>
          <Grupo titulo="Contacto">
            <Campo label="Persona de contacto">
              <Input value={f.contacto} onChange={set("contacto")} placeholder="Juan Pérez" maxLength={160} />
            </Campo>
            <Campo label="Email">
              <Input type="email" value={f.email} onChange={set("email")} placeholder="ventas@proveedor.com" maxLength={200} />
            </Campo>
            <Campo label="Teléfono">
              <Input value={f.telefono} onChange={set("telefono")} inputMode="tel" placeholder="351 555-1234" maxLength={60} />
            </Campo>
            <Campo label="WhatsApp">
              <Input value={f.whatsapp} onChange={set("whatsapp")} inputMode="tel" placeholder="+54 9 351 555-1234" maxLength={60} />
            </Campo>
            <div className="sm:col-span-2">
              <Campo label="Dirección">
                <Input value={f.direccion} onChange={set("direccion")} placeholder="Av. Colón 1234, Córdoba" maxLength={300} />
              </Campo>
            </div>
          </Grupo>
          <Campo label="Notas">
            <Textarea rows={2} value={f.notas} onChange={set("notas")} placeholder="Condiciones de pago, horarios, qué les compramos…" maxLength={1000} />
          </Campo>
          <Pie guardando={guardando} onClose={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Emails de la empresa ───────────── */

type VistaEmails = "activos" | "inactivos" | "historial";

function EmailsEmpresa({ lista, cargando }: { lista: Contacto[]; cargando: boolean }) {
  const { profile, puedeEscribir, can } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const canDelete = can("oficina", "delete");
  const qc = useQueryClient();
  const claves = useSecretos();
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<VistaEmails>("activos");
  const [historialDe, setHistorialDe] = useState<string | null>(null);
  const [editando, setEditando] = useState<Contacto | "nuevo" | null>(null);

  const activos = lista.filter((c) => c.vigente !== false);
  const inactivos = lista.filter((c) => c.vigente === false);
  const enVista = vista === "inactivos" ? inactivos : activos;

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return enVista
      .filter((c) => !term || [c.nombre, c.rubro, c.contacto, c.email, c.usuario, c.notas].filter(Boolean).some((v) => String(v).toLowerCase().includes(term)))
      .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre));
  }, [enVista, q]);
  const grupos = useMemo(() => [...new Set(lista.map((c) => c.rubro?.trim()).filter(Boolean) as string[])], [lista]);
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["oficina_contactos"] });
    void qc.invalidateQueries({ queryKey: ["oficina_contactos_historial"] });
  };

  const cambiarEstado = async (c: Contacto) => {
    const vigente = c.vigente === false;
    const { error } = await api
      .from("oficina_contactos")
      .update({ vigente, inactivo_desde: vigente ? null : new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(vigente ? `«${c.email ?? c.nombre}» volvió a Activos` : `«${c.email ?? c.nombre}» pasó a Correos inactivos`);
    refrescar();
  };
  const verHistorial = (c: Contacto) => {
    setHistorialDe(c.id);
    setVista("historial");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1 sm:w-fit">
        <BotonVista activo={vista === "activos"} onClick={() => setVista("activos")} icono={CircleCheck} n={activos.length}>
          Activos
        </BotonVista>
        <BotonVista activo={vista === "inactivos"} onClick={() => setVista("inactivos")} icono={CircleOff} n={inactivos.length}>
          Correos inactivos
        </BotonVista>
        <BotonVista
          activo={vista === "historial"}
          onClick={() => {
            setHistorialDe(null);
            setVista("historial");
          }}
          icono={History}
        >
          Historial de cambios
        </BotonVista>
      </div>

      {vista === "historial" ? (
        <HistorialCambios contactos={lista} contactoId={historialDe} onContacto={setHistorialDe} canWrite={canWrite} onRestaurado={refrescar} />
      ) : (
        <>
          <Barra
            q={q}
            setQ={setQ}
            placeholder="Buscar área, email, usuario o responsable…"
            csv={() =>
              // Sin claves: el Excel nunca incluye secretos.
              exportarCsv(
                "emails-empresa",
                [
                  { titulo: "Área", valor: (c: Contacto) => c.nombre },
                  { titulo: "Grupo", valor: (c: Contacto) => c.rubro },
                  { titulo: "Email", valor: (c: Contacto) => c.email },
                  { titulo: "Usuario", valor: (c: Contacto) => c.usuario },
                  { titulo: "Responsable", valor: (c: Contacto) => c.contacto },
                  { titulo: "Notas", valor: (c: Contacto) => c.notas },
                ],
                visibles,
              )
            }
            hayDatos={!!visibles.length}
            boton={canWrite && vista === "activos" ? { texto: "Nuevo email", onClick: () => setEditando("nuevo") } : null}
          />

          {cargando ? (
            <Esqueleto />
          ) : visibles.length === 0 ? (
            vista === "inactivos" ? (
              <Vacio
                titulo={inactivos.length ? "No hay correos inactivos con esa búsqueda" : "No hay correos inactivos"}
                detalle="Cuando una casilla deja de usarse, pasala a Inactivo con el control de Estado: sale de la lista principal pero conserva sus datos y su historial."
                accion={null}
              />
            ) : (
              <Vacio
                titulo={activos.length ? "No hay emails con esa búsqueda" : "Todavía no hay emails activos"}
                detalle="Guardá las casillas de cada área (compras@, rrhh@, facturación@…) con su usuario y clave. La clave queda cifrada y se ve con el ojito."
                accion={canWrite && !lista.length ? { texto: "Agregar el primero", onClick: () => setEditando("nuevo") } : null}
              />
            )
          ) : (
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-8 px-3 py-2.5" />
                    <th className="px-3 py-2.5 font-medium">Área</th>
                    <th className="px-3 py-2.5 font-medium">Email</th>
                    <th className="px-3 py-2.5 font-medium">Usuario</th>
                    <th className="px-3 py-2.5 font-medium">Clave</th>
                    <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Responsable / notas</th>
                    <th className="px-3 py-2.5 font-medium">Estado</th>
                    <th className="w-28 px-3 py-2.5 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => (
                    <tr key={c.id} className={cn("border-b border-border/60 last:border-0 hover:bg-muted/20", c.vigente === false && "text-muted-foreground")}>
                      <td className="px-3 py-2">
                        <Favorito c={c} canWrite={canWrite} onCambio={refrescar} />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium">{c.nombre}</p>
                        {c.rubro && <p className="text-xs text-muted-foreground">{c.rubro}</p>}
                      </td>
                      <td className="px-3 py-2">
                        {c.email ? (
                          <span className="group inline-flex items-center gap-1">
                            <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                              {c.email}
                            </a>
                            <BotonCopiar onClick={() => void copiar(c.email!, "Email")} />
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {c.usuario ? (
                          <span className="group inline-flex items-center gap-1">
                            {c.usuario}
                            <BotonCopiar onClick={() => void copiar(c.usuario!, "Usuario")} />
                          </span>
                        ) : (
                          <span className="text-muted-foreground">igual al email</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <SecretoOculto
                          id={c.id}
                          tiene={!!c.has_secreto}
                          ctl={claves}
                          compacto
                          fetcher={rpcRevelar("revelar_contacto", { _id: c.id, _via: "ver" })}
                        />
                      </td>
                      <td className="hidden max-w-[260px] px-3 py-2 text-xs text-muted-foreground lg:table-cell">
                        <p className="truncate">{c.contacto || "—"}</p>
                        {c.notas && <p className="truncate">{c.notas}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <InterruptorEstado c={c} canWrite={canWrite} onCambiar={() => void cambiarEstado(c)} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <Button size="icon" variant="ghost" className="size-8" aria-label="Historial de cambios" title="Historial de cambios" onClick={() => verHistorial(c)}>
                          <History className="size-4" />
                        </Button>
                        {canWrite && (
                          <Button size="icon" variant="ghost" className="size-8" aria-label="Editar" title="Editar" onClick={() => setEditando(c)}>
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        {canWrite && canDelete && (
                          <Button size="icon" variant="ghost" className="size-8" aria-label="Quitar" title="Quitar de la agenda" onClick={() => void quitar(c, refrescar)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editando && (
        <EmailForm
          contacto={editando === "nuevo" ? null : editando}
          grupos={grupos}
          autor={profile?.full_name ?? null}
          onClose={() => setEditando(null)}
          onGuardado={refrescar}
        />
      )}
    </div>
  );
}

function EmailForm({
  contacto,
  grupos,
  autor,
  onClose,
  onGuardado,
}: {
  contacto: Contacto | null;
  grupos: string[];
  autor: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState(() => ({
    nombre: contacto?.nombre ?? "",
    rubro: contacto?.rubro ?? "",
    email: contacto?.email ?? "",
    usuario: contacto?.usuario ?? "",
    clave: "",
    contacto: contacto?.contacto ?? "",
    web: contacto?.web ?? "",
    notas: contacto?.notas ?? "",
  }));
  const [quitarClave, setQuitarClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.nombre.trim()) return toast.error("Ingresá el área o sector");
    const email = f.email.trim();
    if (!email || !EMAIL_RE.test(email)) return toast.error("Ingresá un email válido");
    const payload: Record<string, unknown> = {
      tipo: "empresa",
      nombre: f.nombre.trim().slice(0, 160),
      rubro: limpio(f.rubro, 120),
      email: email.toLowerCase(),
      usuario: limpio(f.usuario, 200),
      contacto: limpio(f.contacto, 160),
      web: limpio(f.web, 300),
      notas: limpio(f.notas, 1000),
    };
    // La clave solo se manda si se escribió una nueva (o si se pidió quitarla).
    if (f.clave) payload.secreto = f.clave.slice(0, 500);
    else if (quitarClave) payload.secreto = null;
    setGuardando(true);
    const ok = await guardarContacto(contacto, payload, autor);
    setGuardando(false);
    if (!ok) return;
    toast.success(contacto ? "Email actualizado" : "Email agregado");
    onGuardado();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AtSign className="size-5 text-sky-500" /> {contacto ? "Editar email de la empresa" : "Nuevo email de la empresa"}
          </DialogTitle>
          <DialogDescription>Casilla de un área. La clave se guarda cifrada y se ve con el ojito.</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4" autoComplete="off">
          <Grupo titulo="Casilla">
            <Campo label="Área o sector *">
              <Input value={f.nombre} onChange={set("nombre")} placeholder="Compras" maxLength={160} autoFocus />
            </Campo>
            <Campo label="Grupo">
              <Input value={f.rubro} onChange={set("rubro")} list="agenda-grupos" placeholder="Administración" maxLength={120} />
              <datalist id="agenda-grupos">{grupos.map((r) => <option key={r} value={r} />)}</datalist>
            </Campo>
            <div className="sm:col-span-2">
              <Campo label="Email *">
                <Input type="email" value={f.email} onChange={set("email")} placeholder="compras@empresa.com" maxLength={200} />
              </Campo>
            </div>
          </Grupo>
          <Grupo titulo="Acceso">
            <Campo label="Usuario (si no es el email)">
              <Input value={f.usuario} onChange={set("usuario")} placeholder="compras" maxLength={200} autoComplete="off" />
            </Campo>
            <Campo label={contacto?.has_secreto ? "Nueva clave (vacío = no cambia)" : "Clave"}>
              <InputClave value={f.clave} onChange={set("clave")} autoComplete="new-password" placeholder={contacto?.has_secreto ? "••••••••" : ""} />
            </Campo>
            <div className="sm:col-span-2">
              <Campo label="Webmail / dónde se entra">
                <Input value={f.web} onChange={set("web")} placeholder="mail.empresa.com" maxLength={300} />
              </Campo>
            </div>
            {contacto?.has_secreto && !f.clave && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                <input type="checkbox" className="size-4" checked={quitarClave} onChange={(e) => setQuitarClave(e.target.checked)} />
                Borrar la clave guardada
              </label>
            )}
          </Grupo>
          <Grupo titulo="Otros">
            <Campo label="Responsable">
              <Input value={f.contacto} onChange={set("contacto")} placeholder="Quién usa la casilla" maxLength={160} />
            </Campo>
            <Campo label="Notas">
              <Input value={f.notas} onChange={set("notas")} placeholder="Para qué se usa" maxLength={1000} />
            </Campo>
          </Grupo>
          <Pie guardando={guardando} onClose={onClose} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BotonVista({
  activo,
  onClick,
  icono: Icono,
  n,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  icono: typeof Mail;
  n?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
        activo ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icono className="size-3.5" />
      {children}
      {n !== undefined && <span className="num rounded bg-muted px-1.5 text-[10.5px] text-muted-foreground">{n}</span>}
    </button>
  );
}

/** Control Activo / Inactivo de una casilla. */
function InterruptorEstado({ c, canWrite, onCambiar }: { c: Contacto; canWrite: boolean; onCambiar: () => void }) {
  const activo = c.vigente !== false;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        disabled={!canWrite}
        onClick={onCambiar}
        title={canWrite ? (activo ? "Pasar a Correos inactivos" : "Volver a Activos") : undefined}
        className={cn(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-full py-0.5 pl-0.5 pr-2.5 text-[11px] font-medium transition-colors disabled:cursor-default",
          activo ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
        )}
      >
        <span className={cn("relative h-4 w-7 rounded-full transition-colors", activo ? "bg-emerald-500" : "bg-muted-foreground/40")}>
          <span className={cn("absolute top-0.5 size-3 rounded-full bg-white shadow-sm transition-all", activo ? "left-3.5" : "left-0.5")} />
        </span>
        {activo ? "Activo" : "Inactivo"}
      </button>
      {!activo && c.inactivo_desde && <span className="pl-1 text-[10.5px] text-muted-foreground">desde {fecha(c.inactivo_desde)}</span>}
    </div>
  );
}

function useHistorialContactos(contactoId: string | null) {
  return useQuery({
    queryKey: ["oficina_contactos_historial", contactoId],
    queryFn: async () => {
      const { data, error } = await api.rpc("historial_contactos", { _tipo: "empresa", _contacto_id: contactoId });
      if (error) throw new Error(error.message);
      return (data ?? []) as CambioContacto[];
    },
  });
}

function valorLegible(campo: string, v: string | null) {
  if (v === null) return null;
  if (campo === "vigente") return v === "false" ? "Inactivo" : "Activo";
  if (campo === "activo") return v === "false" ? "Quitado" : "En la agenda";
  return v;
}

/** Registro de qué tenía cada casilla antes y qué tiene ahora, con la opción de volver al valor anterior. */
function HistorialCambios({
  contactos,
  contactoId,
  onContacto,
  canWrite,
  onRestaurado,
}: {
  contactos: Contacto[];
  contactoId: string | null;
  onContacto: (id: string | null) => void;
  canWrite: boolean;
  onRestaurado: () => void;
}) {
  const { data: cambios = [], isLoading, error } = useHistorialContactos(contactoId);
  const claves = useSecretos();
  const [q, setQ] = useState("");
  const [campo, setCampo] = useState("todos");
  const [restaurando, setRestaurando] = useState<string | null>(null);

  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return cambios
      .filter((h) => campo === "todos" || h.campo === campo)
      .filter(
        (h) =>
          !term ||
          [h.contacto_nombre, h.contacto_email, h.actor_nombre, h.cifrado ? "" : h.antes, h.cifrado ? "" : h.despues]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term)),
      );
  }, [cambios, q, campo]);

  const restaurar = async (h: CambioContacto) => {
    const que = ETIQUETA_CAMPO[h.campo] ?? h.campo;
    const valor = h.cifrado ? "la clave anterior" : `«${valorLegible(h.campo, h.antes) ?? "vacío"}»`;
    if (!window.confirm(`¿Volver ${que.toLowerCase()} de «${h.contacto_nombre}» a ${valor}?`)) return;
    setRestaurando(h.id);
    const { error } = await api.rpc("restaurar_historial_contacto", { _id: h.id });
    setRestaurando(null);
    if (error) return toast.error(error.message);
    toast.success(`${que} restaurado`);
    onRestaurado();
  };

  const ordenados = [...contactos].sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Buscar valor, casilla o quién lo cambió…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select value={contactoId ?? "todas"} onValueChange={(v) => onContacto(v === "todas" ? null : v)}>
          <SelectTrigger className="h-9 w-full sm:w-60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las casillas</SelectItem>
            {ordenados.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.email ?? c.nombre}
                {c.vigente === false ? " (inactivo)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campo} onValueChange={setCampo}>
          <SelectTrigger className="h-9 w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los cambios</SelectItem>
            {["email", "secreto", "usuario", "vigente", "nombre", "rubro", "contacto", "web", "notas", "activo", "_alta"].map((k) => (
              <SelectItem key={k} value={k}>
                {ETIQUETA_CAMPO[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <BotonCsv
          disabled={!visibles.length}
          onClick={() =>
            // Sin claves: el Excel nunca incluye secretos.
            exportarCsv(
              "historial-emails",
              [
                { titulo: "Fecha", valor: (h: CambioContacto) => fechaHora(h.created_at) },
                { titulo: "Casilla", valor: (h: CambioContacto) => h.contacto_email ?? h.contacto_nombre },
                { titulo: "Campo", valor: (h: CambioContacto) => ETIQUETA_CAMPO[h.campo] ?? h.campo },
                { titulo: "Antes", valor: (h: CambioContacto) => (h.cifrado ? (h.tiene_antes ? "(clave oculta)" : "") : valorLegible(h.campo, h.antes)) },
                { titulo: "Después", valor: (h: CambioContacto) => (h.cifrado ? (h.tiene_despues ? "(clave oculta)" : "") : valorLegible(h.campo, h.despues)) },
                { titulo: "Quién", valor: (h: CambioContacto) => h.actor_nombre },
              ],
              visibles,
            )
          }
        />
      </div>

      {isLoading ? (
        <Esqueleto />
      ) : error ? (
        <Vacio titulo="No se pudo cargar el historial" detalle={error instanceof Error ? error.message : "Probá de nuevo en un momento."} accion={null} />
      ) : visibles.length === 0 ? (
        <Vacio
          titulo={cambios.length ? "No hay cambios con ese filtro" : "Todavía no hay cambios registrados"}
          detalle="Desde ahora, cada vez que alguien cambie un email, usuario, clave o estado queda acá qué tenía antes y qué tiene ahora."
          accion={null}
        />
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5 font-medium">Fecha</th>
                <th className="px-3 py-2.5 font-medium">Casilla</th>
                <th className="px-3 py-2.5 font-medium">Cambio</th>
                <th className="px-3 py-2.5 font-medium">Antes → Después</th>
                <th className="px-3 py-2.5 font-medium">Quién</th>
                {canWrite && <th className="w-24 px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {visibles.map((h) => {
                const Icono = h.campo === "secreto" ? KeyRound : h.campo === "vigente" ? CircleOff : h.campo === "_alta" ? Plus : Pencil;
                const restaurable = canWrite && h.campo !== "_alta";
                return (
                  <tr key={h.id} className="border-b border-border/60 align-top last:border-0 hover:bg-muted/20">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs text-muted-foreground">{fechaHora(h.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{h.contacto_nombre}</p>
                      {h.contacto_email && <p className="text-xs text-muted-foreground">{h.contacto_email}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium">
                        <Icono className="size-3.5 text-muted-foreground" /> {ETIQUETA_CAMPO[h.campo] ?? h.campo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {h.campo === "_alta" ? (
                        <span className="text-xs text-muted-foreground">Se cargó la casilla {h.despues ? `«${h.despues}»` : ""}</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <ValorCambio h={h} lado="antes" claves={claves} />
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <ValorCambio h={h} lado="despues" claves={claves} />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{h.actor_nombre ?? "—"}</td>
                    {canWrite && (
                      <td className="px-3 py-2 text-right">
                        {restaurable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={restaurando === h.id}
                            onClick={() => void restaurar(h)}
                            title="Volver al valor que tenía antes de este cambio"
                          >
                            {restaurando === h.id ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Restaurar
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Las claves anteriores quedan cifradas; verlas con el ojito queda registrado en Auditoría. Restaurar también queda en este historial.
      </p>
    </div>
  );
}

function ValorCambio({ h, lado, claves }: { h: CambioContacto; lado: "antes" | "despues"; claves: ReturnType<typeof useSecretos> }) {
  const estilo = lado === "antes" ? "bg-rose-500/10 text-rose-700 line-through decoration-rose-500/40 dark:text-rose-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (h.cifrado) {
    const tiene = lado === "antes" ? h.tiene_antes : h.tiene_despues;
    if (!tiene) return <span className="text-xs italic text-muted-foreground">sin clave</span>;
    return (
      <SecretoOculto
        id={`${h.id}:${lado}`}
        tiene
        ctl={claves}
        compacto
        fetcher={rpcRevelar("revelar_historial_contacto", { _id: h.id, _lado: lado })}
      />
    );
  }
  const v = valorLegible(h.campo, lado === "antes" ? h.antes : h.despues);
  if (v === null) return <span className="text-xs italic text-muted-foreground">vacío</span>;
  return <span className={cn("max-w-[280px] break-all rounded px-1.5 py-0.5 text-xs", estilo)}>{v}</span>;
}

/* ───────────── Piezas comunes ───────────── */

async function guardarContacto(contacto: Contacto | null, payload: Record<string, unknown>, autor: string | null) {
  const { error } = contacto
    ? await api.from("oficina_contactos").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", contacto.id)
    : await api.from("oficina_contactos").insert({ ...payload, created_by_nombre: autor });
  if (error) toast.error(error.message);
  return !error;
}

async function quitar(c: Contacto, onCambio: () => void) {
  if (!window.confirm(`¿Quitar «${c.nombre}» de la agenda?`)) return;
  const { error } = await api.from("oficina_contactos").update({ activo: false }).eq("id", c.id);
  if (error) return toast.error(error.message);
  toast.success("Quitado de la agenda");
  onCambio();
}

function Barra({
  q,
  setQ,
  placeholder,
  csv,
  hayDatos,
  boton,
}: {
  q: string;
  setQ: (v: string) => void;
  placeholder: string;
  csv: () => void;
  hayDatos: boolean;
  boton: { texto: string; onClick: () => void } | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="h-9 pl-8" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="ml-auto flex gap-2">
        <BotonCsv disabled={!hayDatos} onClick={csv} />
        {boton && (
          <Button size="sm" onClick={boton.onClick}>
            <Plus className="size-4" /> {boton.texto}
          </Button>
        )}
      </div>
    </div>
  );
}

function Favorito({ c, canWrite, onCambio }: { c: Contacto; canWrite: boolean; onCambio: () => void }) {
  const alternar = async () => {
    const { error } = await api.from("oficina_contactos").update({ favorito: !c.favorito }).eq("id", c.id);
    if (error) return toast.error(error.message);
    onCambio();
  };
  return (
    <button
      type="button"
      onClick={() => canWrite && void alternar()}
      disabled={!canWrite}
      className={cn("grid size-7 place-items-center rounded-md transition-colors", c.favorito ? "text-amber-500" : "text-muted-foreground/40 hover:text-amber-500")}
      aria-label={c.favorito ? "Quitar de favoritos" : "Marcar favorito"}
      title={c.favorito ? "Favorito (queda arriba)" : "Marcar favorito"}
    >
      <Star className={cn("size-4", c.favorito && "fill-current")} />
    </button>
  );
}

function Acciones({ onEditar, onQuitar }: { onEditar: () => void; onQuitar?: () => void }) {
  return (
    <footer className="mt-auto flex justify-end gap-1 border-t border-border/60 pt-2">
      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onEditar}>
        <Pencil className="size-3.5" /> Editar
      </Button>
      {onQuitar && (
        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={onQuitar}>
          <Trash2 className="size-3.5" /> Quitar
        </Button>
      )}
    </footer>
  );
}

function BotonCopiar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      aria-label="Copiar"
      title="Copiar"
    >
      <Copy className="size-3.5" />
    </button>
  );
}

function Linea({
  icono: Icono,
  texto,
  href,
  externo,
  onCopiar,
}: {
  icono: typeof Mail;
  texto: string;
  href?: string;
  externo?: boolean;
  onCopiar?: () => void;
}) {
  return (
    <li className="group flex items-center gap-2">
      <Icono className="size-3.5 shrink-0 text-muted-foreground" />
      {href ? (
        <a href={href} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="min-w-0 truncate text-primary hover:underline">
          {texto}
        </a>
      ) : (
        <span className="min-w-0 truncate">{texto}</span>
      )}
      {onCopiar && (
        <span className="ml-auto">
          <BotonCopiar onClick={onCopiar} />
        </span>
      )}
    </li>
  );
}

function Esqueleto() {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton h-36 rounded-xl" />
      ))}
    </div>
  );
}

function Vacio({ titulo, detalle, accion }: { titulo: string; detalle: string; accion: { texto: string; onClick: () => void } | null }) {
  return (
    <div className="empty-state panel bg-grid">
      <Building2 className="mb-2 size-6 text-muted-foreground" />
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="mt-1 max-w-md text-[13px] text-muted-foreground">{detalle}</p>
      {accion && (
        <Button size="sm" className="mt-4" onClick={accion.onClick}>
          <Plus className="size-4" /> {accion.texto}
        </Button>
      )}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border/70 p-3">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Pie({ guardando, onClose }: { guardando: boolean; onClose: () => void }) {
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      <Button type="submit" disabled={guardando}>
        {guardando && <Loader2 className="size-4 animate-spin" />} Guardar
      </Button>
    </DialogFooter>
  );
}
