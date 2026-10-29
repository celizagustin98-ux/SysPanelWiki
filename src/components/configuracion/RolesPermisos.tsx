import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  Copy,
  Grid3x3,
  History,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Printer,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRound,
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
import { UserAvatar } from "@/components/UserAvatar";
import { useUsuariosAdmin } from "@/components/configuracion/UsuariosAdmin";
import type { UsuarioAdmin } from "@/backend/api/usuarios.functions";
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

type Nivel = { texto: string; clase: string };

/** Resume los 4 permisos de un módulo en un nivel fácil de leer. */
function nivelDe(
  p: Pick<PermRow, "can_view" | "can_create" | "can_edit" | "can_delete"> | undefined,
  soloVer: boolean,
): Nivel {
  if (!p?.can_view) return { texto: "Sin acceso", clase: "bg-muted text-muted-foreground" };
  if (soloVer) return { texto: "Ve", clase: "bg-sky-500/12 text-sky-700 dark:text-sky-300" };
  if (p.can_create && p.can_edit && p.can_delete)
    return { texto: "Total", clase: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" };
  if (p.can_create && p.can_edit)
    return { texto: "Operativo", clase: "bg-violet-500/12 text-violet-700 dark:text-violet-300" };
  if (!p.can_create && !p.can_edit && !p.can_delete)
    return { texto: "Solo lectura", clase: "bg-sky-500/12 text-sky-700 dark:text-sky-300" };
  const extra = [p.can_create && "crea", p.can_edit && "edita", p.can_delete && "elimina"]
    .filter(Boolean)
    .join(", ");
  return { texto: `Ve, ${extra}`, clase: "bg-amber-500/12 text-amber-700 dark:text-amber-300" };
}

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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
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
export function RolesPermisos() {
  const { perms, refreshPerms } = useAuth();
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: usuarios = [] } = useUsuariosAdmin();
  const [activo, setActivo] = useState("tecnico");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState<{ base: string } | null>(null);
  const [editar, setEditar] = useState<Rol | null>(null);
  const [borrar, setBorrar] = useState<Rol | null>(null);
  const [vista, setVista] = useState<"rol" | "comparar">("rol");
  const [panel, setPanel] = useState<"permisos" | "miembros">("permisos");

  const conteo = useMemo(() => {
    const c: Record<string, number> = {};
    usuarios.forEach((u) => (c[u.role] = (c[u.role] ?? 0) + 1));
    return c;
  }, [usuarios]);

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

  const miembros = usuarios.filter((u) => u.role === rol?.clave);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5">
          <BotonVista activo={vista === "rol"} onClick={() => setVista("rol")}>
            <ShieldCheck className="size-3.5" /> Por rol
          </BotonVista>
          <BotonVista activo={vista === "comparar"} onClick={() => setVista("comparar")}>
            <Grid3x3 className="size-3.5" /> Comparar roles
          </BotonVista>
        </div>
        <p className="hidden text-xs text-muted-foreground md:block">
          {vista === "rol"
            ? "Elegí un rol para ver y ajustar sus permisos y sus miembros."
            : "Qué puede hacer cada rol en cada módulo, de un vistazo. Tocá una celda para editarla."}
        </p>
        <Button size="sm" className="ml-auto" onClick={() => setNuevo({ base: "consulta" })}>
          <Plus className="size-4" /> Nuevo rol
        </Button>
      </div>

      {vista === "comparar" ? (
        <MatrizRoles
          roles={roles}
          perms={perms}
          conteo={conteo}
          onAbrir={(clave) => {
            setActivo(clave);
            setPanel("permisos");
            setVista("rol");
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Roles · {roles.length}
            </p>
            {roles.map((r) => {
              const c = colorRol(r.color);
              return (
                <button
                  key={r.clave}
                  type="button"
                  onClick={() => {
                    setActivo(r.clave);
                    setPanel("permisos");
                  }}
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
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {r.descripcion}
                    </p>
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
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setEditar(rol)}
                  >
                    <Pencil className="size-3.5" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setNuevo({ base: rol.clave })}
                  >
                    <Copy className="size-3.5" /> Duplicar
                  </Button>
                  {!rol.sistema && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive"
                      onClick={() => setBorrar(rol)}
                    >
                      <Trash2 className="size-3.5" /> Eliminar
                    </Button>
                  )}
                </div>
              </header>

              <div className="flex items-center gap-1 border-b border-border/70 px-3">
                <BotonPanel activo={panel === "permisos"} onClick={() => setPanel("permisos")}>
                  Permisos
                </BotonPanel>
                <BotonPanel activo={panel === "miembros"} onClick={() => setPanel("miembros")}>
                  Miembros{" "}
                  <span className="num ml-1 rounded bg-muted px-1.5 text-[10px]">
                    {miembros.length}
                  </span>
                </BotonPanel>
                {panel === "permisos" && !esAdmin && (
                  <div className="ml-auto flex flex-wrap items-center gap-1 py-1.5">
                    <span className="mr-1 hidden text-[11px] text-muted-foreground sm:inline">
                      Aplicar a todo:
                    </span>
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
                  </div>
                )}
              </div>

              {panel === "miembros" ? (
                <Miembros usuarios={miembros} />
              ) : (
                <>
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
                          <th className="hidden w-32 px-3 py-2.5 font-medium xl:table-cell">
                            Nivel
                          </th>
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
                                    <p className="truncate text-[11px] text-muted-foreground">
                                      {m.hint}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              {ACCIONES.map((a) => {
                                const deshabilitada =
                                  SOLO_VER.has(fila.modulo) && a.key !== "can_view";
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
                              <td className="hidden px-3 py-2.5 xl:table-cell">
                                {(() => {
                                  const n = esAdmin
                                    ? {
                                        texto: "Total",
                                        clase:
                                          "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
                                      }
                                    : nivelDe(fila, SOLO_VER.has(fila.modulo));
                                  return (
                                    <span
                                      className={cn(
                                        "rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                        n.clase,
                                      )}
                                    >
                                      {n.texto}
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <footer className="flex items-start gap-2 bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0 text-info" />
                    Sin "Ver" el módulo desaparece del menú y el servidor no entrega sus datos.
                    Marcar Crear/Editar/Eliminar activa "Ver" automáticamente.
                  </footer>
                </>
              )}
            </section>
          )}
        </div>
      )}

      <NuevoRolDialog
        open={!!nuevo}
        base={nuevo?.base ?? "consulta"}
        onOpenChange={(o) => !o && setNuevo(null)}
        roles={roles}
        onCreado={async (clave) => {
          await qc.invalidateQueries({ queryKey: ["roles"] });
          await refreshPerms();
          setActivo(clave);
        }}
      />
      <EditarRolDialog
        rol={editar}
        roles={roles}
        onClose={() => setEditar(null)}
        onGuardado={async () => {
          await qc.invalidateQueries({ queryKey: ["roles"] });
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
  base: baseInicial,
  onOpenChange,
  roles,
  onCreado,
}: {
  open: boolean;
  base: string;
  onOpenChange: (o: boolean) => void;
  roles: Rol[];
  onCreado: (clave: string) => Promise<void>;
}) {
  const [color, setColor] = useState("violet");
  const [base, setBase] = useState(baseInicial);
  const [busy, setBusy] = useState(false);
  const duplicando = baseInicial !== "consulta";
  const original = roles.find((r) => r.clave === baseInicial);

  useEffect(() => {
    if (open) setBase(baseInicial);
  }, [open, baseInicial]);

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
          <DialogTitle>
            {duplicando ? `Duplicar "${original?.nombre ?? baseInicial}"` : "Nuevo rol"}
          </DialogTitle>
          <DialogDescription>
            {duplicando
              ? "Se crea un rol nuevo con los mismos permisos; después los ajustás."
              : 'Por ejemplo "Soporte N1", "Jefe de Sistemas" o "Mesa de entradas".'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={enviar}>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              name="nombre"
              required
              minLength={2}
              maxLength={60}
              autoFocus
              defaultValue={duplicando && original ? `${original.nombre} (copia)` : ""}
              key={`${open}-${baseInicial}`}
            />
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

function BotonVista({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors",
        activo
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function BotonPanel({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px inline-flex items-center border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
        activo
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Miembros({ usuarios }: { usuarios: UsuarioAdmin[] }) {
  if (!usuarios.length)
    return (
      <div className="py-12 text-center">
        <UserRound className="mx-auto size-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">Nadie tiene este rol</p>
        <p className="text-xs text-muted-foreground">
          Se asigna desde Usuarios (de a uno o seleccionando varios).
        </p>
      </div>
    );
  return (
    <ul className="divide-y divide-border/60">
      {usuarios.map((u) => (
        <li
          key={u.id}
          className={cn("flex items-center gap-3 px-4 py-2.5", !u.activo && "opacity-60")}
        >
          <UserAvatar nombre={u.full_name || u.email} foto={u.avatar_url} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{u.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {u.cargo ? `${u.cargo} · ` : ""}
              {u.email}
            </p>
          </div>
          {!u.activo && (
            <span className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
              Suspendido
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Módulos × roles: el nivel de acceso de cada rol en cada módulo. */
function MatrizRoles({
  roles,
  perms,
  conteo,
  onAbrir,
}: {
  roles: Rol[];
  perms: PermRow[];
  conteo: Record<string, number>;
  onAbrir: (clave: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Módulo
              </th>
              {roles.map((r) => (
                <th key={r.clave} className="min-w-[130px] px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onAbrir(r.clave)}
                    className="text-left hover:opacity-80"
                  >
                    <RolChip rol={r} />
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                      {conteo[r.clave] ?? 0} usuario{(conteo[r.clave] ?? 0) === 1 ? "" : "s"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULOS_PERMISO.map((m) => {
              const Icono = m.icon;
              return (
                <tr
                  key={m.key}
                  className="border-b border-border/60 last:border-0 hover:bg-muted/15"
                >
                  <td className="sticky left-0 z-10 bg-card px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Icono className="size-4 text-muted-foreground" />
                      <span className="font-medium">{m.label}</span>
                    </div>
                  </td>
                  {roles.map((r) => {
                    const n =
                      r.clave === "administrador"
                        ? {
                            texto: "Total",
                            clase: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
                          }
                        : nivelDe(
                            perms.find((p) => p.role === r.clave && p.modulo === m.key),
                            SOLO_VER.has(m.key),
                          );
                    return (
                      <td key={r.clave} className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => onAbrir(r.clave)}
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-75",
                            n.clase,
                          )}
                        >
                          {n.texto}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 bg-muted/15 px-4 py-2 text-[11px] text-muted-foreground">
        <span>
          <b className="text-emerald-600 dark:text-emerald-400">Total</b>: ve, crea, edita y elimina
        </span>
        <span>
          <b className="text-violet-600 dark:text-violet-400">Operativo</b>: ve, crea y edita
        </span>
        <span>
          <b className="text-sky-600 dark:text-sky-400">Solo lectura</b>: solo ve
        </span>
        <span>
          <b className="text-amber-600 dark:text-amber-400">Ámbar</b>: combinación a medida
        </span>
      </div>
    </div>
  );
}

function EditarRolDialog({
  rol,
  roles,
  onClose,
  onGuardado,
}: {
  rol: Rol | null;
  roles: Rol[];
  onClose: () => void;
  onGuardado: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState("violet");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (rol) {
      setNombre(rol.nombre);
      setDescripcion(rol.descripcion ?? "");
      setColor(rol.color);
    }
  }, [rol]);

  if (!rol) return null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = nombre.trim();
    if (n.length < 2) return toast.error("El rol necesita un nombre");
    if (roles.some((r) => r.clave !== rol.clave && r.nombre.toLowerCase() === n.toLowerCase()))
      return toast.error("Ya existe un rol con ese nombre");
    setBusy(true);
    const { error } = await api
      .from("roles")
      .update({ nombre: n, descripcion: descripcion.trim() || null, color })
      .eq("clave", rol.clave);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Rol actualizado");
    onClose();
    await onGuardado();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar rol</DialogTitle>
          <DialogDescription>
            {rol.sistema
              ? "Rol del sistema: se puede renombrar, pero no eliminar."
              : "Nombre, descripción y color con que se identifica."}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-3" onSubmit={guardar}>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              minLength={2}
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={160}
              placeholder="Qué hace este rol"
            />
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}{" "}
              Guardar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
