import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  History,
  KeyRound,
  Loader2,
  LogOut,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { InputClave } from "@/components/InputClave";
import { StatTile } from "@/components/StatTile";
import { UserAvatar } from "@/components/UserAvatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { MODULOS_PERMISO, RolChip } from "@/components/configuracion/RolesPermisos";
import {
  actualizarUsuario,
  crearUsuario,
  eliminarUsuario,
  usuarioActividad,
  usuarioCerrarSesiones,
  usuarioEstado,
  usuariosListar,
  type ActividadUsuario,
  type UsuarioAdmin,
} from "@/backend/api/usuarios.functions";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useRoles, type Rol } from "@/lib/roles";
import { cn } from "@/lib/utils";

const DIAS_INACTIVO = 30;

/** Usuarios del sistema (solo administradores). Lo comparten Usuarios y Roles. */
export function useUsuariosAdmin() {
  const listar = useServerFn(usuariosListar);
  return useQuery({ queryKey: ["usuarios-admin"], queryFn: () => listar(), staleTime: 30_000 });
}

export function haceCuanto(iso?: string | null) {
  if (!iso) return "Nunca";
  const seg = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seg < 60) return "Recién";
  const min = Math.round(seg / 60);
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `Hace ${d} día${d === 1 ? "" : "s"}`;
  const m = Math.round(d / 30);
  if (m < 12) return `Hace ${m} mes${m === 1 ? "" : "es"}`;
  return `Hace ${Math.round(m / 12)} año(s)`;
}

function fechaHora(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function inactivo(u: UsuarioAdmin) {
  return (
    !u.ultimo_acceso ||
    Date.now() - new Date(u.ultimo_acceso).getTime() > DIAS_INACTIVO * 86_400_000
  );
}

/** Contraseña temporal: 14 caracteres con letras y números, sin caracteres que se confundan. */
function generarClave() {
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const numeros = "23456789";
  const todos = letras + numeros;
  const r = crypto.getRandomValues(new Uint32Array(14));
  const c = Array.from(r, (n) => todos[n % todos.length]);
  c[3] = numeros[r[3] % numeros.length];
  c[9] = letras[r[9] % letras.length];
  return c.join("");
}

function EstadoUsuario({ u }: { u: Pick<UsuarioAdmin, "activo"> }) {
  return u.activo ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-500/25 dark:text-emerald-300">
      <span className="size-1.5 rounded-full bg-emerald-500" /> Activo
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-medium text-rose-700 ring-1 ring-inset ring-rose-500/25 dark:text-rose-300">
      <Ban className="size-3" /> Suspendido
    </span>
  );
}

type Orden = { col: "nombre" | "rol" | "acceso"; asc: boolean };
type Estado = "todos" | "activos" | "suspendidos" | "inactivos";

export function UsuariosAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: roles = [] } = useRoles();
  const { data: usuarios = [], isLoading } = useUsuariosAdmin();
  const estadoFn = useServerFn(usuarioEstado);
  const borrarFn = useServerFn(eliminarUsuario);
  const sesionesFn = useServerFn(usuarioCerrarSesiones);

  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [estado, setEstado] = useState<Estado>("todos");
  const [orden, setOrden] = useState<Orden>({ col: "nombre", asc: true });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [nuevo, setNuevo] = useState(false);
  const [detalle, setDetalle] = useState<{ id: string; tab: string } | null>(null);
  const [suspender, setSuspender] = useState<UsuarioAdmin[] | null>(null);
  const [eliminar, setEliminar] = useState<UsuarioAdmin | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const recargar = () => qc.invalidateQueries({ queryKey: ["usuarios-admin"] });
  const rolDe = (clave: string) => roles.find((r) => r.clave === clave);

  const stats = useMemo(
    () => ({
      total: usuarios.length,
      activos: usuarios.filter((u) => u.activo).length,
      suspendidos: usuarios.filter((u) => !u.activo).length,
      admins: usuarios.filter((u) => u.role === "administrador" && u.activo).length,
      inactivos: usuarios.filter((u) => u.activo && inactivo(u)).length,
    }),
    [usuarios],
  );

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = usuarios.filter(
      (u) =>
        (filtroRol === "todos" || u.role === filtroRol) &&
        (estado === "todos" ||
          (estado === "activos" && u.activo) ||
          (estado === "suspendidos" && !u.activo) ||
          (estado === "inactivos" && u.activo && inactivo(u))) &&
        (!q ||
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q) ||
          (u.cargo ?? "").toLowerCase().includes(q)),
    );
    const f = orden.asc ? 1 : -1;
    const nombreRol = (u: UsuarioAdmin) => rolDe(u.role)?.nombre ?? u.role;
    return [...lista].sort((a, b) => {
      if (orden.col === "rol")
        return (
          f * nombreRol(a).localeCompare(nombreRol(b), "es") ||
          a.full_name.localeCompare(b.full_name, "es")
        );
      if (orden.col === "acceso")
        return (
          f *
          ((a.ultimo_acceso ? Date.parse(a.ultimo_acceso) : 0) -
            (b.ultimo_acceso ? Date.parse(b.ultimo_acceso) : 0))
        );
      return f * a.full_name.localeCompare(b.full_name, "es", { sensitivity: "base" });
    });
  }, [usuarios, busqueda, filtroRol, estado, orden, roles]); // eslint-disable-line react-hooks/exhaustive-deps

  // La selección solo conserva usuarios visibles.
  useEffect(() => {
    setSel((s) => {
      const visibles = new Set(filtrados.map((u) => u.id));
      const next = new Set([...s].filter((id) => visibles.has(id)));
      return next.size === s.size ? s : next;
    });
  }, [filtrados]);

  const seleccionados = usuarios.filter((u) => sel.has(u.id));
  const todosMarcados = filtrados.length > 0 && filtrados.every((u) => sel.has(u.id));
  const filtrosActivos = !!busqueda || filtroRol !== "todos" || estado !== "todos";

  const cambiarRol = async (lista: UsuarioAdmin[], rol: string) => {
    const destino = lista.filter((u) => u.role !== rol);
    if (!destino.length) return;
    if (destino.some((u) => u.id === user?.id) && rol !== "administrador")
      return toast.error("No podés quitarte el rol de administrador a vos mismo.");
    const adminsQueQuedan = usuarios.filter(
      (u) => u.role === "administrador" && u.activo && !destino.some((d) => d.id === u.id),
    ).length;
    if (rol !== "administrador" && !adminsQueQuedan)
      return toast.error("Debe quedar al menos un administrador activo.");
    setTrabajando(true);
    for (const u of destino) {
      const { error } = await api.rpc("set_user_role", { _user_id: u.id, _role: rol });
      if (error) {
        toast.error(`${u.full_name}: ${error.message}`);
        break;
      }
    }
    setTrabajando(false);
    toast.success(
      destino.length === 1
        ? `Rol de ${destino[0].full_name}: ${rolDe(rol)?.nombre ?? rol}`
        : `${destino.length} usuarios pasaron a ${rolDe(rol)?.nombre ?? rol}`,
    );
    await recargar();
  };

  const reactivar = async (lista: UsuarioAdmin[]) => {
    setTrabajando(true);
    try {
      for (const u of lista.filter((x) => !x.activo))
        await estadoFn({ data: { userId: u.id, activo: true } });
      toast.success(lista.length === 1 ? "Cuenta reactivada" : "Cuentas reactivadas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reactivar");
    } finally {
      setTrabajando(false);
      await recargar();
    }
  };

  const cerrarSesiones = async (u: UsuarioAdmin) => {
    try {
      const r = await sesionesFn({ data: { userId: u.id } });
      toast.success(
        r.cerradas
          ? `Se cerraron ${r.cerradas} sesión(es) de ${u.full_name}`
          : "No tenía sesiones abiertas",
      );
      await recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudieron cerrar las sesiones");
    }
  };

  const exportar = () => {
    const filas = [
      ["Nombre", "Usuario", "Email", "Cargo", "Rol", "Estado", "Último acceso", "Alta"],
      ...filtrados.map((u) => [
        u.full_name,
        u.username ?? "",
        u.email,
        u.cargo ?? "",
        rolDe(u.role)?.nombre ?? u.role,
        u.activo ? "Activo" : "Suspendido",
        fechaHora(u.ultimo_acceso),
        fechaHora(u.created_at),
      ]),
    ];
    const csv =
      "﻿" +
      filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `usuarios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const encabezado = (col: Orden["col"], texto: string, className?: string) => (
    <th className={cn("px-3 py-2.5 font-medium", className)}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
        onClick={() => setOrden((o) => ({ col, asc: o.col === col ? !o.asc : col !== "acceso" }))}
      >
        {texto}
        {orden.col === col &&
          (orden.asc ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  const usuarioDetalle = usuarios.find((u) => u.id === detalle?.id) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <BotonStat activo={estado === "todos"} onClick={() => setEstado("todos")}>
          <StatTile label="Usuarios" value={stats.total} icon={<Users />} />
        </BotonStat>
        <BotonStat activo={estado === "activos"} onClick={() => setEstado("activos")}>
          <StatTile label="Activos" value={stats.activos} tone="ok" />
        </BotonStat>
        <BotonStat activo={estado === "suspendidos"} onClick={() => setEstado("suspendidos")}>
          <StatTile
            label="Suspendidos"
            value={stats.suspendidos}
            tone={stats.suspendidos ? "crit" : "neutral"}
          />
        </BotonStat>
        <BotonStat activo={estado === "inactivos"} onClick={() => setEstado("inactivos")}>
          <StatTile
            label={`Sin ingresar +${DIAS_INACTIVO} días`}
            value={stats.inactivos}
            tone={stats.inactivos ? "warn" : "neutral"}
          />
        </BotonStat>
        <BotonStat
          activo={filtroRol === "administrador"}
          onClick={() => setFiltroRol((r) => (r === "administrador" ? "todos" : "administrador"))}
        >
          <StatTile
            label="Administradores"
            value={stats.admins}
            icon={<ShieldCheck />}
            hint="activos"
          />
        </BotonStat>
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, usuario, email o cargo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filtroRol} onValueChange={setFiltroRol}>
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los roles</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.clave} value={r.clave}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={(v) => setEstado(v as Estado)}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="activos">Activos</SelectItem>
              <SelectItem value="suspendidos">Suspendidos</SelectItem>
              <SelectItem value="inactivos">Sin ingresar +{DIAS_INACTIVO} días</SelectItem>
            </SelectContent>
          </Select>
          {filtrosActivos && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setBusqueda("");
                setFiltroRol("todos");
                setEstado("todos");
              }}
            >
              <X className="size-4" /> Limpiar
            </Button>
          )}
        </div>
        <div className="flex gap-2 lg:ml-auto">
          <Button variant="outline" onClick={exportar} disabled={!filtrados.length}>
            <Download className="size-4" /> Exportar
          </Button>
          <Button onClick={() => setNuevo(true)}>
            <UserPlus className="size-4" /> Nuevo usuario
          </Button>
        </div>
      </div>

      {sel.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/6 px-3 py-2 text-sm rise-in">
          <span className="font-medium">
            {sel.size} seleccionado{sel.size === 1 ? "" : "s"}
          </span>
          <span className="mx-1 h-4 w-px bg-border" />
          <Select
            value=""
            onValueChange={(v) => void cambiarRol(seleccionados, v)}
            disabled={trabajando}
          >
            <SelectTrigger className="h-8 w-[170px] bg-card">
              <SelectValue placeholder="Cambiar rol a…" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.clave} value={r.clave}>
                  {r.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {seleccionados.some((u) => u.activo) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 bg-card"
              disabled={trabajando}
              onClick={() => setSuspender(seleccionados.filter((u) => u.activo))}
            >
              <Ban className="size-3.5" /> Suspender
            </Button>
          )}
          {seleccionados.some((u) => !u.activo) && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 bg-card"
              disabled={trabajando}
              onClick={() => void reactivar(seleccionados)}
            >
              <UserCheck className="size-3.5" /> Reactivar
            </Button>
          )}
          {trabajando && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-8"
            onClick={() => setSel(new Set())}
          >
            Quitar selección
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando usuarios…
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-14 text-center">
            <Users className="mx-auto size-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              {filtrosActivos
                ? "Ningún usuario coincide con los filtros"
                : "Todavía no hay usuarios"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 pl-4 pr-1">
                    <Checkbox
                      checked={todosMarcados ? true : sel.size ? "indeterminate" : false}
                      onCheckedChange={(v) =>
                        setSel(v ? new Set(filtrados.map((u) => u.id)) : new Set())
                      }
                      aria-label="Seleccionar todos"
                    />
                  </th>
                  {encabezado("nombre", "Persona")}
                  <th className="hidden px-3 py-2.5 font-medium lg:table-cell">Usuario</th>
                  {encabezado("rol", "Rol")}
                  <th className="px-3 py-2.5 font-medium">Estado</th>
                  {encabezado("acceso", "Último acceso", "hidden md:table-cell")}
                  <th className="w-12 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((u) => {
                  const yo = u.id === user?.id;
                  return (
                    <tr
                      key={u.id}
                      className={cn(
                        "cursor-pointer border-b border-border/60 transition-colors last:border-0 hover:bg-muted/25",
                        sel.has(u.id) && "bg-primary/5",
                        !u.activo && "text-muted-foreground",
                      )}
                      onClick={() => setDetalle({ id: u.id, tab: "perfil" })}
                    >
                      <td className="pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={sel.has(u.id)}
                          onCheckedChange={(v) =>
                            setSel((s) => {
                              const n = new Set(s);
                              if (v) n.add(u.id);
                              else n.delete(u.id);
                              return n;
                            })
                          }
                          aria-label={`Seleccionar a ${u.full_name}`}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            nombre={u.full_name || u.email}
                            foto={u.avatar_url}
                            className={cn(!u.activo && "opacity-50 grayscale")}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-foreground">
                              {u.full_name || "Sin nombre"}
                              {yo && (
                                <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
                                  Vos
                                </span>
                              )}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {u.cargo ? `${u.cargo} · ` : ""}
                              {u.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 font-mono text-xs text-muted-foreground lg:table-cell">
                        {u.username ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <RolChip rol={rolDe(u.role) ?? { nombre: u.role, color: "slate" }} />
                      </td>
                      <td className="px-3 py-2.5">
                        <EstadoUsuario u={u} />
                      </td>
                      <td
                        className="hidden px-3 py-2.5 md:table-cell"
                        title={fechaHora(u.ultimo_acceso)}
                      >
                        <span
                          className={cn(
                            "text-xs",
                            u.activo && inactivo(u)
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {haceCuanto(u.ultimo_acceso)}
                        </span>
                        {u.sesiones > 0 && (
                          <span
                            className="ml-1.5 inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400"
                            title={`${u.sesiones} sesión(es) abierta(s)`}
                          >
                            <span className="size-1.5 rounded-full bg-emerald-500" /> {u.sesiones}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label="Acciones"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                              {u.full_name}
                            </DropdownMenuLabel>
                            <DropdownMenuItem
                              onClick={() => setDetalle({ id: u.id, tab: "perfil" })}
                            >
                              <UserCog /> Editar datos
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDetalle({ id: u.id, tab: "acceso" })}
                            >
                              <KeyRound /> Rol y contraseña
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDetalle({ id: u.id, tab: "actividad" })}
                            >
                              <History /> Ver actividad
                            </DropdownMenuItem>
                            {!yo && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  disabled={!u.sesiones}
                                  onClick={() => void cerrarSesiones(u)}
                                >
                                  <LogOut /> Cerrar sesiones{u.sesiones ? ` (${u.sesiones})` : ""}
                                </DropdownMenuItem>
                                {u.activo ? (
                                  <DropdownMenuItem onClick={() => setSuspender([u])}>
                                    <Ban /> Suspender cuenta
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem onClick={() => void reactivar([u])}>
                                    <UserCheck /> Reactivar cuenta
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive"
                                  onClick={() => setEliminar(u)}
                                >
                                  <Trash2 /> Eliminar
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!isLoading && filtrados.length > 0 && (
          <div className="border-t border-border/60 bg-muted/15 px-4 py-2 text-xs text-muted-foreground">
            {filtrados.length === usuarios.length
              ? `${usuarios.length} usuarios`
              : `${filtrados.length} de ${usuarios.length} usuarios`}{" "}
            · Tocá una fila para ver el detalle
          </div>
        )}
      </div>

      <NuevoUsuarioDialog open={nuevo} onOpenChange={setNuevo} roles={roles} onCreado={recargar} />

      <UsuarioDetalle
        usuario={usuarioDetalle}
        tab={detalle?.tab ?? "perfil"}
        onTab={(tab) => setDetalle((d) => (d ? { ...d, tab } : d))}
        onClose={() => setDetalle(null)}
        roles={roles}
        esYo={usuarioDetalle?.id === user?.id}
        onCambio={recargar}
        onCambiarRol={(rol) => usuarioDetalle && cambiarRol([usuarioDetalle], rol)}
        onSuspender={() => usuarioDetalle && setSuspender([usuarioDetalle])}
        onReactivar={() => usuarioDetalle && reactivar([usuarioDetalle])}
        onCerrarSesiones={() => usuarioDetalle && cerrarSesiones(usuarioDetalle)}
      />

      <SuspenderDialog
        usuarios={suspender}
        onClose={() => setSuspender(null)}
        onConfirmar={async (motivo) => {
          const lista = suspender ?? [];
          try {
            for (const u of lista)
              await estadoFn({ data: { userId: u.id, activo: false, motivo } });
            toast.success(
              lista.length === 1
                ? `${lista[0].full_name} quedó suspendido`
                : `${lista.length} cuentas suspendidas`,
            );
            setSuspender(null);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "No se pudo suspender");
          } finally {
            await recargar();
          }
        }}
      />

      <AlertDialog open={!!eliminar} onOpenChange={(o) => !o && setEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar a {eliminar?.full_name || eliminar?.email}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              La cuenta se borra definitivamente y no se puede deshacer. Lo que cargó queda en el
              sistema sin autor. Si solo querés impedir que entre, conviene{" "}
              <strong>suspenderla</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {eliminar?.activo && (
              <Button
                variant="outline"
                onClick={() => {
                  const u = eliminar;
                  setEliminar(null);
                  setSuspender([u]);
                }}
              >
                <Ban className="size-4" /> Suspender
              </Button>
            )}
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!eliminar) return;
                try {
                  await borrarFn({ data: { userId: eliminar.id } });
                  toast.success("Usuario eliminado");
                  await recargar();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "No se pudo eliminar");
                }
              }}
            >
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BotonStat({
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
      className={cn("rounded-xl text-left transition-shadow", activo && "ring-2 ring-primary/50")}
    >
      {children}
    </button>
  );
}

/** Lo que puede hacer un rol, en una línea por módulo (para elegir rol con información). */
function ResumenPermisos({ rol }: { rol: string }) {
  const { perms } = useAuth();
  if (rol === "administrador")
    return (
      <p className="text-xs text-muted-foreground">
        Acceso total: todos los módulos, usuarios, roles y configuración.
      </p>
    );
  const filas = MODULOS_PERMISO.map((m) => ({
    m,
    p: perms.find((x) => x.role === rol && x.modulo === m.key),
  }));
  const nivel = (p?: (typeof perms)[number]) =>
    !p?.can_view ? null : p.can_delete ? "Total" : p.can_create || p.can_edit ? "Edita" : "Ve";
  const visibles = filas.filter((f) => nivel(f.p));
  if (!visibles.length)
    return <p className="text-xs text-muted-foreground">Este rol no ve ningún módulo.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {visibles.map(({ m, p }) => {
        const Icono = m.icon;
        const n = nivel(p);
        return (
          <span
            key={m.key}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
          >
            <Icono className="size-3 text-muted-foreground" />
            {m.label}
            <span
              className={cn(
                "font-medium",
                n === "Total"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : n === "Edita"
                    ? "text-sky-600 dark:text-sky-400"
                    : "text-muted-foreground",
              )}
            >
              · {n}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function CampoClave({
  value,
  onChange,
  usuario,
}: {
  value: string;
  onChange: (v: string) => void;
  usuario?: string;
}) {
  const largo = value.length >= 10;
  const mezcla = /[a-zA-Z]/.test(value) && /\d/.test(value);
  const sinUsuario =
    !usuario || usuario.length < 3 || !value.toLowerCase().includes(usuario.toLowerCase());
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <InputClave
            value={value}
            onChange={(e) => onChange(e.target.value)}
            autoComplete="new-password"
            placeholder="Mínimo 10, con letras y números"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Generar una contraseña segura"
          onClick={() => onChange(generarClave())}
        >
          <Wand2 className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          title="Copiar"
          disabled={!value}
          onClick={() =>
            navigator.clipboard.writeText(value).then(
              () => toast.success("Contraseña copiada"),
              () => toast.error("No se pudo copiar"),
            )
          }
        >
          <Copy className="size-4" />
        </Button>
      </div>
      {value && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          <Requisito ok={largo}>10 caracteres o más</Requisito>
          <Requisito ok={mezcla}>Letras y números</Requisito>
          <Requisito ok={sinUsuario}>Sin el nombre de usuario</Requisito>
        </div>
      )}
    </div>
  );
}

function Requisito({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      {ok ? (
        <CheckCircle2 className="size-3" />
      ) : (
        <span className="size-3 rounded-full border border-current" />
      )}{" "}
      {children}
    </span>
  );
}

function NuevoUsuarioDialog({
  open,
  onOpenChange,
  roles,
  onCreado,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: Rol[];
  onCreado: () => Promise<void>;
}) {
  const crear = useServerFn(crearUsuario);
  const [f, setF] = useState({
    fullName: "",
    email: "",
    username: "",
    password: "",
    role: "consulta",
  });
  const [usuarioTocado, setUsuarioTocado] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setF({ fullName: "", email: "", username: "", password: "", role: "consulta" });
      setUsuarioTocado(false);
    }
  }, [open]);

  // Sugiere el usuario a partir del email (lo de antes del @).
  const sugerido =
    f.email
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 32) ?? "";
  const username = usuarioTocado ? f.username : sugerido;
  const rol = roles.find((r) => r.clave === f.role);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await crear({ data: { ...f, username } });
      toast.success(`Usuario ${username} creado`, {
        description: "Pasale la contraseña por un medio seguro; puede cambiarla desde Mi perfil.",
      });
      onOpenChange(false);
      await onCreado();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el usuario");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-primary" /> Nuevo usuario
          </DialogTitle>
          <DialogDescription>
            Creá la cuenta, elegí qué puede hacer y pasale la contraseña inicial.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={enviar}>
          <Seccion titulo="Datos de la persona">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nombre y apellido</Label>
                <Input
                  value={f.fullName}
                  onChange={(e) => setF({ ...f, fullName: e.target.value })}
                  required
                  minLength={2}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={f.email}
                  onChange={(e) => setF({ ...f, email: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Usuario para ingresar</Label>
                <Input
                  value={username}
                  onChange={(e) => {
                    setUsuarioTocado(true);
                    setF({ ...f, username: e.target.value.toLowerCase() });
                  }}
                  required
                  pattern="[a-z0-9._\-]{3,32}"
                  title="3 a 32 caracteres: letras, números, punto, guion"
                  className="font-mono"
                />
              </div>
            </div>
          </Seccion>
          <Seccion titulo="Acceso">
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={f.role} onValueChange={(v) => setF({ ...f, role: v })}>
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
              {rol?.descripcion && (
                <p className="text-xs text-muted-foreground">{rol.descripcion}</p>
              )}
              <ResumenPermisos rol={f.role} />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña inicial</Label>
              <CampoClave
                value={f.password}
                onChange={(password) => setF({ ...f, password })}
                usuario={username}
              />
            </div>
          </Seccion>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !f.password}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}{" "}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="eyebrow">{titulo}</p>
      {children}
    </div>
  );
}

function UsuarioDetalle({
  usuario: u,
  tab,
  onTab,
  onClose,
  roles,
  esYo,
  onCambio,
  onCambiarRol,
  onSuspender,
  onReactivar,
  onCerrarSesiones,
}: {
  usuario: UsuarioAdmin | null;
  tab: string;
  onTab: (t: string) => void;
  onClose: () => void;
  roles: Rol[];
  esYo: boolean;
  onCambio: () => Promise<void>;
  onCambiarRol: (rol: string) => void;
  onSuspender: () => void;
  onReactivar: () => void;
  onCerrarSesiones: () => void;
}) {
  const actualizar = useServerFn(actualizarUsuario);
  const actividadFn = useServerFn(usuarioActividad);
  const [f, setF] = useState({ fullName: "", email: "", username: "", cargo: "" });
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState<"perfil" | "clave" | null>(null);

  useEffect(() => {
    if (u)
      setF({
        fullName: u.full_name,
        email: u.email,
        username: u.username ?? "",
        cargo: u.cargo ?? "",
      });
    setClave("");
  }, [u?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: actividad = [], isLoading: cargandoActividad } = useQuery({
    queryKey: ["usuario-actividad", u?.id],
    queryFn: () => actividadFn({ data: { userId: u!.id } }),
    enabled: !!u && tab === "actividad",
  });

  if (!u) return <Sheet open={false} />;
  const rol = roles.find((r) => r.clave === u.role);
  const cambiosPerfil =
    f.fullName.trim() !== u.full_name ||
    f.email.trim().toLowerCase() !== u.email ||
    f.username.trim().toLowerCase() !== (u.username ?? "") ||
    f.cargo.trim() !== (u.cargo ?? "");

  const guardarPerfil = async (e: FormEvent) => {
    e.preventDefault();
    setGuardando("perfil");
    try {
      await actualizar({
        data: {
          userId: u.id,
          ...(f.fullName.trim() !== u.full_name ? { fullName: f.fullName } : {}),
          ...(f.email.trim().toLowerCase() !== u.email ? { email: f.email } : {}),
          ...(f.username.trim().toLowerCase() !== (u.username ?? "")
            ? { username: f.username }
            : {}),
          ...(f.cargo.trim() !== (u.cargo ?? "") ? { cargo: f.cargo } : {}),
        },
      });
      toast.success("Datos guardados");
      await onCambio();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(null);
    }
  };

  const restablecer = async () => {
    setGuardando("clave");
    try {
      await actualizar({ data: { userId: u.id, password: clave } });
      toast.success("Contraseña restablecida", {
        description: esYo ? undefined : "Se cerraron sus sesiones abiertas.",
      });
      setClave("");
      await onCambio();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo cambiar la contraseña");
    } finally {
      setGuardando(null);
    }
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3.5 pr-6">
            <UserAvatar
              nombre={u.full_name || u.email}
              foto={u.avatar_url}
              className="size-14 text-lg"
            />
            <div className="min-w-0">
              <SheetTitle className="truncate text-lg">{u.full_name}</SheetTitle>
              <SheetDescription className="truncate">
                {u.cargo ? `${u.cargo} · ` : ""}
                {u.email}
              </SheetDescription>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <RolChip rol={rol ?? { nombre: u.role, color: "slate" }} />
                <EstadoUsuario u={u} />
                {esYo && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    Vos
                  </span>
                )}
              </div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Dato
              titulo="Último acceso"
              valor={haceCuanto(u.ultimo_acceso)}
              detalle={fechaHora(u.ultimo_acceso)}
            />
            <Dato titulo="Sesiones abiertas" valor={String(u.sesiones)} />
            <Dato titulo="Alta" valor={new Date(u.created_at).toLocaleDateString("es-AR")} />
          </dl>
          {!u.activo && (
            <div className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/8 px-3 py-2 text-xs">
              <p className="font-medium text-rose-700 dark:text-rose-300">
                Cuenta suspendida el {fechaHora(u.suspendido_at)}
              </p>
              {u.suspendido_motivo && (
                <p className="mt-0.5 text-muted-foreground">Motivo: {u.suspendido_motivo}</p>
              )}
            </div>
          )}
        </SheetHeader>

        <Tabs value={tab} onValueChange={onTab} className="px-5 py-4">
          <TabsList className="w-full">
            <TabsTrigger value="perfil" className="flex-1">
              Datos
            </TabsTrigger>
            <TabsTrigger value="acceso" className="flex-1">
              Acceso
            </TabsTrigger>
            <TabsTrigger value="actividad" className="flex-1">
              Actividad
            </TabsTrigger>
          </TabsList>

          <TabsContent value="perfil" className="mt-4">
            <form className="space-y-3" onSubmit={guardarPerfil}>
              <div className="space-y-1.5">
                <Label>Nombre y apellido</Label>
                <Input
                  value={f.fullName}
                  onChange={(e) => setF({ ...f, fullName: e.target.value })}
                  required
                  minLength={2}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={f.email}
                    onChange={(e) => setF({ ...f, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Usuario</Label>
                  <Input
                    className="font-mono"
                    value={f.username}
                    onChange={(e) => setF({ ...f, username: e.target.value.toLowerCase() })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Cargo o puesto</Label>
                <Input
                  value={f.cargo}
                  onChange={(e) => setF({ ...f, cargo: e.target.value })}
                  placeholder="Ej.: Soporte técnico"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                {cambiosPerfil && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      setF({
                        fullName: u.full_name,
                        email: u.email,
                        username: u.username ?? "",
                        cargo: u.cargo ?? "",
                      })
                    }
                  >
                    Descartar
                  </Button>
                )}
                <Button type="submit" disabled={!cambiosPerfil || guardando === "perfil"}>
                  {guardando === "perfil" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}{" "}
                  Guardar cambios
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="acceso" className="mt-4 space-y-4">
            <Bloque
              icono={ShieldCheck}
              titulo="Rol"
              detalle="Define qué módulos ve y qué puede hacer en cada uno."
            >
              <Select value={u.role} onValueChange={onCambiarRol} disabled={esYo}>
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
              {esYo && (
                <p className="text-xs text-muted-foreground">No podés cambiar tu propio rol.</p>
              )}
              <ResumenPermisos rol={u.role} />
            </Bloque>

            <Bloque
              icono={KeyRound}
              titulo="Restablecer contraseña"
              detalle={
                esYo
                  ? "Para tu propia cuenta usá Mi perfil."
                  : "Al cambiarla se cierran sus sesiones abiertas."
              }
            >
              <CampoClave value={clave} onChange={setClave} usuario={u.username ?? undefined} />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!clave || guardando === "clave"}
                  onClick={() => void restablecer()}
                >
                  {guardando === "clave" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}{" "}
                  Restablecer
                </Button>
              </div>
            </Bloque>

            {!esYo && (
              <Bloque
                icono={Clock}
                titulo="Sesiones y estado"
                detalle={`${u.sesiones} sesión(es) abierta(s) en este momento.`}
              >
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!u.sesiones}
                    onClick={onCerrarSesiones}
                  >
                    <LogOut className="size-4" /> Cerrar sesiones
                  </Button>
                  {u.activo ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={onSuspender}
                    >
                      <Ban className="size-4" /> Suspender cuenta
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={onReactivar}>
                      <UserCheck className="size-4" /> Reactivar cuenta
                    </Button>
                  )}
                </div>
              </Bloque>
            )}
          </TabsContent>

          <TabsContent value="actividad" className="mt-4">
            {cargandoActividad ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Cargando…
              </div>
            ) : actividad.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Sin movimientos registrados.
              </p>
            ) : (
              <ol className="relative space-y-3 border-l border-border pl-4">
                {actividad.map((a) => (
                  <FilaActividad key={a.id} a={a} />
                ))}
              </ol>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

const ACCION_TEXTO: Record<string, string> = {
  login: "Ingresó al sistema",
  login_fallido: "Intento de ingreso fallido",
  logout: "Cerró sesión",
  crear: "Creó",
  editar: "Editó",
  eliminar: "Eliminó",
  asignar_rol: "Cambio de rol",
  suspender: "Cuenta suspendida",
  reactivar: "Cuenta reactivada",
  cerrar_sesiones: "Sesiones cerradas",
  revelar: "Vio una clave",
};

function FilaActividad({ a }: { a: ActividadUsuario }) {
  const sobreCuenta = !a.propia;
  const malo = a.accion === "login_fallido" || a.accion === "suspender" || a.accion === "eliminar";
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[21px] top-1.5 size-2.5 rounded-full ring-4 ring-background",
          malo ? "bg-rose-500" : a.accion === "login" ? "bg-emerald-500" : "bg-primary",
        )}
      />
      <p className="text-sm">
        <span className="font-medium">{ACCION_TEXTO[a.accion] ?? a.accion}</span>
        {a.entidad_desc && !["login", "login_fallido", "logout"].includes(a.accion) && (
          <span className="text-muted-foreground"> · {a.entidad_desc}</span>
        )}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {fechaHora(a.created_at)} · {a.modulo}
        {sobreCuenta && a.actor_nombre ? ` · por ${a.actor_nombre}` : ""}
      </p>
    </li>
  );
}

function Dato({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-1.5" title={detalle}>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5 truncate font-medium">{valor}</dd>
    </div>
  );
}

function Bloque({
  icono: Icono,
  titulo,
  detalle,
  children,
}: {
  icono: typeof ShieldCheck;
  titulo: string;
  detalle: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icono className="size-3.5" />
        </span>
        <div>
          <p className="text-sm font-medium">{titulo}</p>
          <p className="text-xs text-muted-foreground">{detalle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SuspenderDialog({
  usuarios,
  onClose,
  onConfirmar,
}: {
  usuarios: UsuarioAdmin[] | null;
  onClose: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (usuarios) setMotivo("");
  }, [usuarios]);
  const n = usuarios?.length ?? 0;
  return (
    <Dialog open={!!usuarios} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="size-5 text-destructive" />{" "}
            {n === 1 ? `Suspender a ${usuarios?.[0].full_name}` : `Suspender ${n} cuentas`}
          </DialogTitle>
          <DialogDescription>
            No va a poder ingresar y se cierran sus sesiones abiertas. No se borra nada: se puede
            reactivar cuando quieras.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Motivo (opcional)</Label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="Ej.: licencia, dejó de trabajar en el área…"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirmar(motivo);
              setBusy(false);
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}{" "}
            Suspender
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
