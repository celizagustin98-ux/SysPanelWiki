import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  Copy,
  History,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  Printer,
  ShieldCheck,
  Ticket,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import { useAuth, type PermRow } from "@/lib/auth";
import { COLORES_ROL, colorRol, useRoles, type Rol } from "@/lib/roles";
import { cn } from "@/lib/utils";

export const MODULOS_PERMISO: { key: string; label: string; hint: string; icon: LucideIcon }[] = [
  { key: "tareas", label: "Tickets", hint: "Mesa de ayuda, comentarios y adjuntos", icon: Ticket },
  {
    key: "inventario",
    label: "Activos IT",
    hint: "Equipos, QR, reparaciones y asignaciones",
    icon: Boxes,
  },
  { key: "toners", label: "Tóners", hint: "Stock, movimientos, códigos y pedidos", icon: Printer },
  {
    key: "guardias",
    label: "Guardias",
    hint: "Turnos, operarios y liquidación",
    icon: CalendarClock,
  },
  {
    key: "instructivos",
    label: "Instructivos",
    hint: "Carpetas, documentos y PDFs",
    icon: BookOpen,
  },
  {
    key: "oficina",
    label: "Oficina",
    hint: "Teléfonos internos y pedido de insumos",
    icon: BriefcaseBusiness,
  },
  {
    key: "credenciales",
    label: "Credenciales",
    hint: "Ver y copiar secretos cifrados",
    icon: KeyRound,
  },
  { key: "auditoria", label: "Auditoría", hint: "Registro de cambios (solo ver)", icon: History },
  {
    key: "reportes",
    label: "Reportes",
    hint: "Reporte mensual del área (solo ver)",
    icon: BarChart3,
  },
  { key: "usuarios", label: "Usuarios", hint: "Directorio de usuarios del sistema", icon: Users },
];

const SOLO_VER = new Set(["auditoria", "reportes"]);

const ACCIONES = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Crear" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
] as const;
type AccionKey = (typeof ACCIONES)[number]["key"];

const PRESETS = {
  lectura: {
    label: "Solo lectura",
    valores: { can_view: true, can_create: false, can_edit: false, can_delete: false },
  },
  operativo: {
    label: "Operativo",
    valores: { can_view: true, can_create: true, can_edit: true, can_delete: false },
  },
  total: {
    label: "Total",
    valores: { can_view: true, can_create: true, can_edit: true, can_delete: true },
  },
  ninguno: {
    label: "Sin acceso",
    valores: { can_view: false, can_create: false, can_edit: false, can_delete: false },
  },
} as const;

export function RolChip({
  rol,
  className,
}: {
  rol?: Pick<Rol, "nombre" | "color"> | null;
  className?: string;
}) {
  const c = colorRol(rol?.color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        c.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", c.punto)} />
      {rol?.nombre ?? "Sin rol"}
    </span>
  );
}

/** Roles personalizables + matriz de permisos por módulo. */
export function RolesPermisos({ conteo }: { conteo: Record<string, number> }) {
  const { perms, refreshPerms } = useAuth();
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const [activo, setActivo] = useState("tecnico");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [borrar, setBorrar] = useState<Rol | null>(null);

  const rol = roles.find((r) => r.clave === activo) ?? roles[0];
  const esAdmin = rol?.clave === "administrador";

  const filas = useMemo(
    () =>
      MODULOS_PERMISO.map(
        (m) =>
          perms.find((p) => p.role === rol?.clave && p.modulo === m.key) ?? {
            id: "",
            role: rol?.clave ?? "",
            modulo: m.key,
            can_view: false,
            can_create: false,
            can_edit: false,
            can_delete: false,
          },
      ),
    [perms, rol?.clave],
  );

  const guardar = async (
    fila: PermRow,
    patch: Partial<Record<AccionKey, boolean>>,
    clave: string,
  ) => {
    if (esAdmin) return toast.info("El administrador siempre conserva todos los permisos.");
    // Ver es requisito de todo lo demás; sin Ver no tiene sentido Crear/Editar/Eliminar.
    const next = { ...patch };
    if (next.can_view === false)
      Object.assign(next, { can_create: false, can_edit: false, can_delete: false });
    if (next.can_create || next.can_edit || next.can_delete) next.can_view = true;
    if (SOLO_VER.has(fila.modulo))
      Object.assign(next, { can_create: false, can_edit: false, can_delete: false });
    setGuardando(clave);
    const { error } = fila.id
      ? await api.from("role_permissions").update(next).eq("id", fila.id)
      : await api
          .from("role_permissions")
          .insert({ role: fila.role, modulo: fila.modulo, ...PRESETS.ninguno.valores, ...next });
    setGuardando(null);
    if (error) return toast.error(error.message);
    await refreshPerms();
  };

  const aplicarPreset = async (preset: keyof typeof PRESETS) => {
    if (!rol || esAdmin) return;
    setGuardando("preset");
    for (const fila of filas) {
      const valores = SOLO_VER.has(fila.modulo)
        ? { ...PRESETS.ninguno.valores, can_view: PRESETS[preset].valores.can_view }
        : PRESETS[preset].valores;
      const { error } = fila.id
        ? await api.from("role_permissions").update(valores).eq("id", fila.id)
        : await api
            .from("role_permissions")
            .insert({ role: fila.role, modulo: fila.modulo, ...valores });
      if (error) {
        toast.error(error.message);
        break;
      }
    }
    setGuardando(null);
    await refreshPerms();
    toast.success(`${rol.nombre}: ${PRESETS[preset].label.toLowerCase()}`);
  };

  const accesos = (clave: string) => perms.filter((p) => p.role === clave && p.can_view).length;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Roles · {roles.length}
          </p>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setNuevo(true)}>
            <Plus className="size-3.5" /> Nuevo rol
          </Button>
        </div>
        {roles.map((r) => {
          const c = colorRol(r.color);
          return (
            <button
              key={r.clave}
              type="button"
              onClick={() => setActivo(r.clave)}
              className={cn(
                "group w-full rounded-xl border px-3.5 py-3 text-left transition-all",
                r.clave === rol?.clave
                  ? "border-primary/60 bg-primary/6 shadow-sm"
                  : "border-border bg-card hover:border-primary/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("size-2.5 rounded-full", c.punto)} />
                <span className="flex-1 truncate font-medium">{r.nombre}</span>
                {r.sistema && (
                  <Lock className="size-3 text-muted-foreground" aria-label="Rol del sistema" />
                )}
                <span className="num rounded-md bg-muted px-1.5 text-[11px] text-muted-foreground">
                  {conteo[r.clave] ?? 0}
                </span>
              </div>
              {r.descripcion && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.descripcion}</p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {r.clave === "administrador"
                  ? "Acceso total"
                  : `${accesos(r.clave)} de ${MODULOS_PERMISO.length} módulos visibles`}
              </p>
            </button>
          );
        })}
      </aside>

      {rol && (
        <section className="panel overflow-hidden rounded-xl border border-border bg-card">
          <header className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <RolChip rol={rol} />
                {rol.sistema && (
                  <span className="text-[11px] text-muted-foreground">Rol del sistema</span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {esAdmin
                  ? "El administrador tiene acceso total y gestiona usuarios, roles y configuración."
                  : "Tildá qué puede hacer este rol en cada módulo. Se aplica en el servidor al instante."}
              </p>
            </div>
            {!esAdmin && (
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((k) => (
                  <Button
                    key={k}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={guardando === "preset"}
                    onClick={() => void aplicarPreset(k)}
                  >
                    {PRESETS[k].label}
                  </Button>
                ))}
                {!rol.sistema && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={() => setBorrar(rol)}
                  >
                    <Trash2 className="size-3.5" /> Eliminar rol
                  </Button>
                )}
              </div>
            )}
          </header>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Módulo</th>
                  {ACCIONES.map((a) => (
                    <th key={a.key} className="w-20 px-2 py-2.5 text-center font-medium">
                      {a.label}
                    </th>
                  ))}
                  <th className="w-20 px-2 py-2.5 text-center font-medium">Todo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => {
                  const m = MODULOS_PERMISO.find((x) => x.key === fila.modulo)!;
                  const Icono = m.icon;
                  const todo =
                    esAdmin ||
                    ACCIONES.every((a) =>
                      SOLO_VER.has(fila.modulo) ? fila.can_view : fila[a.key],
                    );
                  return (
                    <tr
                      key={fila.modulo}
                      className={cn(
                        "border-b border-border/60 transition-colors hover:bg-muted/20",
                        !fila.can_view && !esAdmin && "text-muted-foreground",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              "grid size-8 shrink-0 place-items-center rounded-lg",
                              fila.can_view || esAdmin
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            <Icono className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{m.label}</p>
                            <p className="truncate text-[11px] text-muted-foreground">{m.hint}</p>
                          </div>
                        </div>
                      </td>
                      {ACCIONES.map((a) => {
                        const deshabilitada = SOLO_VER.has(fila.modulo) && a.key !== "can_view";
                        return (
                          <td key={a.key} className="px-2 py-2.5 text-center">
                            {deshabilitada ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : guardando === `${fila.modulo}-${a.key}` ? (
                              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
                            ) : (
                              <Checkbox
                                className="mx-auto"
                                checked={esAdmin || !!fila[a.key]}
                                disabled={esAdmin || guardando === "preset"}
                                onCheckedChange={(v) =>
                                  void guardar(
                                    fila as PermRow,
                                    { [a.key]: !!v },
                                    `${fila.modulo}-${a.key}`,
                                  )
                                }
                                aria-label={`${a.label} en ${m.label}`}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-center">
                        <Checkbox
                          className="mx-auto"
                          checked={todo}
                          disabled={esAdmin || guardando === "preset"}
                          onCheckedChange={(v) =>
                            void guardar(
                              fila as PermRow,
                              v ? PRESETS.total.valores : PRESETS.ninguno.valores,
                              `${fila.modulo}-todo`,
                            )
                          }
                          aria-label={`Todo en ${m.label}`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-start gap-2 bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
            Sin "Ver" el módulo desaparece del menú y el servidor no entrega sus datos. Marcar
            Crear/Editar/Eliminar activa "Ver" automáticamente.
          </footer>
        </section>
      )}

      <NuevoRolDialog
        open={nuevo}
        onOpenChange={setNuevo}
        roles={roles}
        onCreado={async (clave) => {
          await qc.invalidateQueries({ queryKey: ["roles"] });
          await refreshPerms();
          setActivo(clave);
        }}
      />
      <EliminarRolDialog
        rol={borrar}
        roles={roles}
        usuarios={borrar ? (conteo[borrar.clave] ?? 0) : 0}
        onClose={() => setBorrar(null)}
        onEliminado={async () => {
          await qc.invalidateQueries({ queryKey: ["roles"] });
          await refreshPerms();
          setActivo("tecnico");
        }}
      />
    </div>
  );
}

function NuevoRolDialog({
  open,
  onOpenChange,
  roles,
  onCreado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: Rol[];
  onCreado: (clave: string) => Promise<void>;
}) {
  const [color, setColor] = useState("violet");
  const [base, setBase] = useState("consulta");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { data, error } = await api.rpc("crear_rol", {
      _nombre: String(fd.get("nombre") ?? ""),
      _descripcion: String(fd.get("descripcion") ?? ""),
      _color: color,
      _base: base,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Rol creado");
    onOpenChange(false);
    await onCreado((data as { clave?: string } | null)?.clave ?? "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo rol</DialogTitle>
          <DialogDescription>
            Por ejemplo "Soporte N1", "Jefe de Sistemas" o "Mesa de entradas".
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={enviar}>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input name="nombre" required minLength={2} maxLength={60} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input name="descripcion" maxLength={160} placeholder="Qué hace este rol" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(COLORES_ROL).map(([k, c]) => (
                <button
                  key={k}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(k)}
                  className={cn(
                    "size-7 rounded-full ring-offset-2 ring-offset-background transition",
                    c.punto,
                    color === k ? "ring-2 ring-primary" : "opacity-70 hover:opacity-100",
                  )}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Copy className="size-3.5" /> Copiar permisos de
            </Label>
            <Select value={base} onValueChange={setBase}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.clave} value={r.clave}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{" "}
              Crear rol
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EliminarRolDialog({
  rol,
  roles,
  usuarios,
  onClose,
  onEliminado,
}: {
  rol: Rol | null;
  roles: Rol[];
  usuarios: number;
  onClose: () => void;
  onEliminado: () => Promise<void>;
}) {
  const [destino, setDestino] = useState("consulta");
  const [busy, setBusy] = useState(false);
  if (!rol) return null;

  const eliminar = async () => {
    setBusy(true);
    const { error } = await api.rpc("eliminar_rol", { _clave: rol.clave, _reasignar: destino });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Rol "${rol.nombre}" eliminado`);
    onClose();
    await onEliminado();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Eliminar rol "{rol.nombre}"</DialogTitle>
          <DialogDescription>
            {usuarios
              ? `${usuarios} usuario${usuarios === 1 ? "" : "s"} tiene${usuarios === 1 ? "" : "n"} este rol. Elegí a qué rol pasan.`
              : "Ningún usuario tiene este rol."}
          </DialogDescription>
        </DialogHeader>
        <Select value={destino} onValueChange={setDestino}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles
              .filter((r) => r.clave !== rol.clave)
              .map((r) => (
                <SelectItem key={r.clave} value={r.clave}>
                  {r.nombre}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={busy} onClick={() => void eliminar()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{" "}
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
