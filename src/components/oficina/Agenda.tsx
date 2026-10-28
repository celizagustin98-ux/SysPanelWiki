import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  Copy,
  Globe,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  Star,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { BotonCsv, exportarCsv } from "@/components/tabla/Tabla";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  telefono: string | null;
  whatsapp: string | null;
  web: string | null;
  direccion: string | null;
  cuit: string | null;
  notas: string | null;
  favorito: boolean;
  activo: boolean;
};

const TIPOS: Record<Tipo, { label: string; plural: string; icono: typeof Truck; tono: string }> = {
  proveedor: {
    label: "Proveedor",
    plural: "Proveedores",
    icono: Truck,
    tono: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  },
  empresa: {
    label: "Email de la empresa",
    plural: "Emails de la empresa",
    icono: Building2,
    tono: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
};

const VACIO = {
  tipo: "proveedor" as Tipo,
  nombre: "",
  rubro: "",
  contacto: "",
  email: "",
  telefono: "",
  whatsapp: "",
  web: "",
  direccion: "",
  cuit: "",
  notas: "",
};

const soloDigitos = (v: string) => v.replace(/\D/g, "");
const urlWeb = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v}`);

async function copiar(texto: string, que: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(`${que} copiado`);
  } catch {
    toast.error("No se pudo copiar");
  }
}

/** Agenda de la oficina: proveedores (con quién se compra) y los correos de cada área de la empresa. */
export function Agenda() {
  const { profile, puedeEscribir, can } = useAuth();
  const canWrite = puedeEscribir("oficina");
  const canDelete = can("oficina", "delete");
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<Tipo | "todos">("todos");
  const [q, setQ] = useState("");
  const [rubro, setRubro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Contacto | "nuevo" | null>(null);

  const { data: contactos = [], isLoading } = useQuery({
    queryKey: ["oficina_contactos"],
    queryFn: async () => {
      const { data, error } = await api
        .from("oficina_contactos")
        .select("*")
        .eq("activo", true)
        .order("nombre");
      if (error) throw error;
      return (data ?? []) as Contacto[];
    },
  });

  const delTipo = contactos.filter((c) => tipo === "todos" || c.tipo === tipo);
  const rubros = useMemo(
    () =>
      [...new Set(delTipo.map((c) => c.rubro?.trim()).filter(Boolean) as string[])].sort((a, b) =>
        a.localeCompare(b),
      ),
    [delTipo],
  );
  const visibles = useMemo(() => {
    const term = q.trim().toLowerCase();
    return delTipo
      .filter((c) => !rubro || c.rubro?.trim() === rubro)
      .filter(
        (c) =>
          !term ||
          [
            c.nombre,
            c.rubro,
            c.contacto,
            c.email,
            c.telefono,
            c.whatsapp,
            c.web,
            c.direccion,
            c.cuit,
            c.notas,
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term)),
      )
      .sort((a, b) => Number(b.favorito) - Number(a.favorito) || a.nombre.localeCompare(b.nombre));
  }, [delTipo, q, rubro]);

  const refrescar = () => void qc.invalidateQueries({ queryKey: ["oficina_contactos"] });

  const favorito = async (c: Contacto) => {
    const { error } = await api
      .from("oficina_contactos")
      .update({ favorito: !c.favorito })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    refrescar();
  };

  const borrar = async (c: Contacto) => {
    if (!window.confirm(`¿Quitar a «${c.nombre}» de la agenda?`)) return;
    const { error } = await api.from("oficina_contactos").update({ activo: false }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Contacto quitado");
    refrescar();
  };

  const conteo = (t: Tipo | "todos") =>
    contactos.filter((c) => t === "todos" || c.tipo === t).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex flex-wrap rounded-lg border border-border bg-card p-1 shadow-xs">
          {(["todos", "proveedor", "empresa"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTipo(t);
                setRubro(null);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition",
                tipo === t
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "todos" ? "Todos" : TIPOS[t].plural}
              <span
                className={cn(
                  "num rounded px-1.5 text-[11px] font-semibold",
                  tipo === t ? "bg-primary text-primary-foreground" : "bg-muted",
                )}
              >
                {conteo(t)}
              </span>
            </button>
          ))}
        </div>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder="Buscar nombre, rubro, email, teléfono…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="ml-auto flex gap-2">
          <BotonCsv
            disabled={!visibles.length}
            onClick={() =>
              exportarCsv(
                "agenda-oficina",
                [
                  { titulo: "Tipo", valor: (c: Contacto) => TIPOS[c.tipo]?.label ?? c.tipo },
                  { titulo: "Nombre", valor: (c: Contacto) => c.nombre },
                  { titulo: "Rubro / área", valor: (c: Contacto) => c.rubro },
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
          />
          {canWrite && (
            <Button size="sm" onClick={() => setEditando("nuevo")}>
              <Plus className="size-4" /> Nuevo contacto
            </Button>
          )}
        </div>
      </div>

      {rubros.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[null, ...rubros].map((r) => (
            <button
              key={r ?? "todos"}
              type="button"
              onClick={() => setRubro(r)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                rubro === r
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50",
              )}
            >
              {r ?? "Todos los rubros"}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-36 rounded-xl" />
          ))}
        </div>
      ) : visibles.length === 0 ? (
        <div className="empty-state panel bg-grid">
          <p className="text-sm font-semibold">
            {contactos.length ? "No hay contactos con ese filtro" : "La agenda está vacía"}
          </p>
          <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
            Guardá acá los proveedores con los que compran y los correos de cada área (compras@,
            rrhh@, facturación@…).
          </p>
          {canWrite && (
            <Button size="sm" className="mt-4" onClick={() => setEditando("nuevo")}>
              <Plus className="size-4" /> Agregar el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {visibles.map((c) => {
            const T = TIPOS[c.tipo] ?? TIPOS.proveedor;
            return (
              <article key={c.id} className="panel flex flex-col gap-2.5 p-4">
                <header className="flex items-start gap-3">
                  <span
                    className={cn("grid size-9 shrink-0 place-items-center rounded-lg", T.tono)}
                  >
                    <T.icono className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold tracking-tight">{c.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {T.label}
                      {c.rubro ? ` · ${c.rubro}` : ""}
                      {c.contacto ? ` · ${c.contacto}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => canWrite && void favorito(c)}
                    disabled={!canWrite}
                    className={cn(
                      "grid size-7 place-items-center rounded-md transition-colors",
                      c.favorito
                        ? "text-amber-500"
                        : "text-muted-foreground/40 hover:text-amber-500",
                    )}
                    aria-label={c.favorito ? "Quitar de favoritos" : "Marcar favorito"}
                    title={c.favorito ? "Favorito" : "Marcar favorito"}
                  >
                    <Star className={cn("size-4", c.favorito && "fill-current")} />
                  </button>
                </header>

                <ul className="space-y-1 text-[13px]">
                  {c.email && (
                    <Linea
                      icono={Mail}
                      texto={c.email}
                      href={`mailto:${c.email}`}
                      onCopiar={() => void copiar(c.email!, "Email")}
                    />
                  )}
                  {c.telefono && (
                    <Linea
                      icono={Phone}
                      texto={c.telefono}
                      href={`tel:${c.telefono.replace(/[^\d+]/g, "")}`}
                      onCopiar={() => void copiar(c.telefono!, "Teléfono")}
                    />
                  )}
                  {c.whatsapp && (
                    <Linea
                      icono={MessageCircle}
                      texto={c.whatsapp}
                      href={`https://wa.me/${soloDigitos(c.whatsapp)}`}
                      externo
                      onCopiar={() => void copiar(c.whatsapp!, "WhatsApp")}
                    />
                  )}
                  {c.web && (
                    <Linea
                      icono={Globe}
                      texto={c.web.replace(/^https?:\/\//i, "")}
                      href={urlWeb(c.web)}
                      externo
                    />
                  )}
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
                  <footer className="mt-auto flex justify-end gap-1 border-t border-border/60 pt-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => setEditando(c)}
                    >
                      <Pencil className="size-3.5" /> Editar
                    </Button>
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => void borrar(c)}
                      >
                        <Trash2 className="size-3.5" /> Quitar
                      </Button>
                    )}
                  </footer>
                )}
              </article>
            );
          })}
        </div>
      )}

      {editando && (
        <ContactoForm
          contacto={editando === "nuevo" ? null : editando}
          tipoInicial={tipo === "todos" ? "proveedor" : tipo}
          rubros={[...new Set(contactos.map((c) => c.rubro?.trim()).filter(Boolean) as string[])]}
          autor={profile?.full_name ?? null}
          onClose={() => setEditando(null)}
          onGuardado={refrescar}
        />
      )}
    </div>
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
        <a
          href={href}
          {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className="min-w-0 truncate text-primary hover:underline"
        >
          {texto}
        </a>
      ) : (
        <span className="min-w-0 truncate">{texto}</span>
      )}
      {onCopiar && (
        <button
          type="button"
          onClick={onCopiar}
          className="ml-auto grid size-6 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          aria-label="Copiar"
          title="Copiar"
        >
          <Copy className="size-3.5" />
        </button>
      )}
    </li>
  );
}

function ContactoForm({
  contacto,
  tipoInicial,
  rubros,
  autor,
  onClose,
  onGuardado,
}: {
  contacto: Contacto | null;
  tipoInicial: Tipo;
  rubros: string[];
  autor: string | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState(() =>
    contacto
      ? {
          tipo: contacto.tipo,
          nombre: contacto.nombre,
          rubro: contacto.rubro ?? "",
          contacto: contacto.contacto ?? "",
          email: contacto.email ?? "",
          telefono: contacto.telefono ?? "",
          whatsapp: contacto.whatsapp ?? "",
          web: contacto.web ?? "",
          direccion: contacto.direccion ?? "",
          cuit: contacto.cuit ?? "",
          notas: contacto.notas ?? "",
        }
      : { ...VACIO, tipo: tipoInicial },
  );
  const [guardando, setGuardando] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const esProveedor = f.tipo === "proveedor";

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const nombre = f.nombre.trim();
    if (!nombre)
      return toast.error(
        esProveedor ? "Ingresá el nombre del proveedor" : "Ingresá el área o sector",
      );
    const email = f.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return toast.error("El email no es válido");
    if (!esProveedor && !email) return toast.error("Ingresá el email");
    const limpio = (v: string, max: number) => v.trim().slice(0, max) || null;
    const payload = {
      tipo: f.tipo,
      nombre: nombre.slice(0, 160),
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
    const { error } = contacto
      ? await api
          .from("oficina_contactos")
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq("id", contacto.id)
      : await api.from("oficina_contactos").insert({ ...payload, created_by_nombre: autor });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(contacto ? "Contacto actualizado" : "Contacto agregado");
    onGuardado();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{contacto ? "Editar contacto" : "Nuevo contacto"}</DialogTitle>
          <DialogDescription>
            Proveedores con los que compran o correos de un área de la empresa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TIPOS) as Tipo[]).map((t) => {
              const T = TIPOS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setF((x) => ({ ...x, tipo: t }))}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    f.tipo === t
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <T.icono className="size-4" /> {T.label}
                </button>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label={esProveedor ? "Proveedor / empresa *" : "Área o sector *"}>
              <Input
                value={f.nombre}
                onChange={set("nombre")}
                placeholder={esProveedor ? "Compugarden S.A." : "Compras"}
                maxLength={160}
                autoFocus
              />
            </Campo>
            <Campo label={esProveedor ? "Rubro" : "Grupo"}>
              <Input
                value={f.rubro}
                onChange={set("rubro")}
                list="agenda-rubros"
                placeholder={esProveedor ? "Insumos informáticos" : "Administración"}
                maxLength={120}
              />
              <datalist id="agenda-rubros">
                {rubros.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Campo>
            <Campo label={esProveedor ? "Email" : "Email *"}>
              <Input
                type="email"
                value={f.email}
                onChange={set("email")}
                placeholder={esProveedor ? "ventas@proveedor.com" : "compras@empresa.com"}
                maxLength={200}
              />
            </Campo>
            <Campo label="Persona de contacto">
              <Input
                value={f.contacto}
                onChange={set("contacto")}
                placeholder="Juan Pérez"
                maxLength={160}
              />
            </Campo>
            <Campo label="Teléfono">
              <Input
                value={f.telefono}
                onChange={set("telefono")}
                inputMode="tel"
                placeholder="351 555-1234"
                maxLength={60}
              />
            </Campo>
            {esProveedor && (
              <>
                <Campo label="WhatsApp">
                  <Input
                    value={f.whatsapp}
                    onChange={set("whatsapp")}
                    inputMode="tel"
                    placeholder="+54 9 351 555-1234"
                    maxLength={60}
                  />
                </Campo>
                <Campo label="Sitio web">
                  <Input
                    value={f.web}
                    onChange={set("web")}
                    placeholder="www.proveedor.com"
                    maxLength={300}
                  />
                </Campo>
                <Campo label="CUIT">
                  <Input
                    value={f.cuit}
                    onChange={set("cuit")}
                    placeholder="30-12345678-9"
                    maxLength={20}
                  />
                </Campo>
                <div className="sm:col-span-2">
                  <Campo label="Dirección">
                    <Input
                      value={f.direccion}
                      onChange={set("direccion")}
                      placeholder="Av. Colón 1234, Córdoba"
                      maxLength={300}
                    />
                  </Campo>
                </div>
              </>
            )}
          </div>
          <Campo label="Notas">
            <Textarea
              rows={2}
              value={f.notas}
              onChange={set("notas")}
              placeholder={
                esProveedor
                  ? "Condiciones de pago, horarios, qué les compramos…"
                  : "Para qué usar este correo"
              }
              maxLength={1000}
            />
          </Campo>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="size-4 animate-spin" />} Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
