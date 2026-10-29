import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Pencil, Search, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputClave } from "@/components/InputClave";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/brand/BrandMark";
import { FeriadosConfig } from "@/components/configuracion/FeriadosConfig";
import { ReporteMensual } from "@/components/configuracion/ReporteMensual";
import { useMarca } from "@/lib/brand";
import { UserAvatar } from "@/components/UserAvatar";
import { ClaveVerConfig } from "@/components/configuracion/ClaveVerConfig";
import { QrConfig } from "@/components/configuracion/QrConfig";
import { GuiaSistema } from "@/components/configuracion/GuiaSistema";
import { api } from "@/lib/api/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { useRoles } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { RolChip, RolesPermisos } from "@/components/configuracion/RolesPermisos";
import { MantenimientoDatos } from "@/components/configuracion/MantenimientoDatos";
import { actualizarUsuario, crearUsuario, eliminarUsuario } from "@/backend/api/usuarios.functions";

export const Route = createFileRoute("/_app/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración · Nodara" },
      {
        name: "description",
        content: "Usuarios, roles, permisos, estado del sistema y auditoría.",
      },
    ],
  }),
  component: ConfiguracionPage,
});

type UsuarioRow = {
  id: string;
  full_name: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  cargo: string | null;
  role: AppRole;
};

type SystemInfo = {
  appVersion: string;
  displayVersion: string;
  commit: string | null;
  commitDate: string | null;
  buildTime: string | null;
  environment: string;
  httpsEnabled: boolean;
  ultimaRevision: string | null;
  ultimaActualizacion: string | null;
  ultimaActualizacionFuente: "commit" | "variable" | "build" | null;
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatVersion(value?: string | null) {
  const version = (value ?? "").trim();
  if (!version || /^[a-f0-9]{7,40}$/i.test(version)) return "V 1.4.0";
  if (/^v\s/i.test(version)) return version.replace(/^v/i, "V");
  if (/^\d/.test(version)) return `V ${version}`;
  return version;
}

function ConfiguracionPage() {
  const { isAdmin, user } = useAuth();
  const { data: roles = [] } = useRoles();
  const marca = useMarca();

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState<string>("todos");
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editando, setEditando] = useState<UsuarioRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [cambiandoRol, setCambiandoRol] = useState<string | null>(null);

  const crear = useServerFn(crearUsuario);
  const borrar = useServerFn(eliminarUsuario);
  const actualizar = useServerFn(actualizarUsuario);

  const loadSystemInfo = useCallback(async () => {
    try {
      setSystemInfo(await api.system.info<SystemInfo>());
    } catch {
      setSystemInfo(null);
    }
  }, []);

  const cargarUsuarios = useCallback(async () => {
    setCargandoUsuarios(true);
    const [{ data: profiles }, { data: userRoles }] = await Promise.all([
      api.from("profiles").select("id, full_name, email, username, avatar_url, cargo").order("full_name"),
      api.from("user_roles").select("user_id, role"),
    ]);
    const mapa = new Map<string, AppRole>();
    (userRoles ?? []).forEach((r: { user_id: string; role: string }) =>
      mapa.set(r.user_id, r.role as AppRole),
    );
    setUsuarios(
      (profiles ?? []).map(
        (p: { id: string; full_name: string; email: string; username: string | null; avatar_url?: string | null; cargo?: string | null }) => ({
          id: p.id,
          full_name: p.full_name,
          email: p.email,
          username: p.username ?? null,
          avatar_url: p.avatar_url ?? null,
          cargo: p.cargo ?? null,
          role: mapa.get(p.id) ?? "consulta",
        }),
      ),
    );
    setCargandoUsuarios(false);
  }, []);

  useEffect(() => {
    void loadSystemInfo();
  }, [loadSystemInfo]);

  useEffect(() => {
    if (isAdmin) void cargarUsuarios();
  }, [isAdmin, cargarUsuarios]);

  const cambiarRol = async (usuarioId: string, nuevo: AppRole) => {
    if (usuarioId === user?.id && nuevo !== "administrador") {
      toast.error("No podés quitarte el rol de administrador a vos mismo.");
      return;
    }
    const admins = usuarios.filter((u) => u.role === "administrador");
    const target = usuarios.find((u) => u.id === usuarioId);
    if (target?.role === "administrador" && nuevo !== "administrador" && admins.length <= 1) {
      toast.error("Debe quedar al menos un administrador.");
      return;
    }
    setCambiandoRol(usuarioId);
    const { error } = await api.rpc("set_user_role", {
      _user_id: usuarioId,
      _role: nuevo,
    });
    setCambiandoRol(null);
    if (error) return toast.error(error.message);
    setUsuarios((prev) => prev.map((u) => (u.id === usuarioId ? { ...u, role: nuevo } : u)));
    toast.success("Rol actualizado");
  };

  const onCrear = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await crear({
        data: {
          email: String(fd.get("email") ?? ""),
          username: String(fd.get("username") ?? ""),
          password: String(fd.get("password") ?? ""),
          fullName: String(fd.get("fullName") ?? ""),
          role: String(fd.get("role") ?? "consulta") as AppRole,
        },
      });
      toast.success("Usuario creado");
      setNuevoOpen(false);
      await cargarUsuarios();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el usuario");
    } finally {
      setBusy(false);
    }
  };

  const onEditar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editando) return;
    const fd = new FormData(e.currentTarget);
    const fullName = String(fd.get("fullName") ?? "").trim();
    const password = String(fd.get("password") ?? "").trim();
    setBusy(true);
    try {
      await actualizar({
        data: {
          userId: editando.id,
          ...(fullName && fullName !== editando.full_name ? { fullName } : {}),
          ...(password ? { password } : {}),
        },
      });
      toast.success("Usuario actualizado");
      setEditando(null);
      await cargarUsuarios();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  const onEliminar = async (row: UsuarioRow) => {
    if (row.id === user?.id) {
      toast.error("No podés eliminar tu propia cuenta.");
      return;
    }
    if (row.role === "administrador") {
      const admins = usuarios.filter((u) => u.role === "administrador");
      if (admins.length <= 1) {
        toast.error("Debe quedar al menos un administrador.");
        return;
      }
    }
    if (!window.confirm(`¿Eliminar definitivamente a ${row.full_name || row.email}?`)) return;
    try {
      await borrar({ data: { userId: row.id } });
      toast.success("Usuario eliminado");
      setUsuarios((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter(
      (u) =>
        (filtroRol === "todos" || u.role === filtroRol) &&
        (!q ||
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q)),
    );
  }, [usuarios, busqueda, filtroRol]);

  const conteoPorRol = useMemo(() => {
    const c: Record<string, number> = {};
    usuarios.forEach((u) => (c[u.role] = (c[u.role] ?? 0) + 1));
    return c;
  }, [usuarios]);

  const rolDe = (clave: string) => roles.find((r) => r.clave === clave);

  const installedVersion = systemInfo?.appVersion ?? "1.4.0";

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Configuración" description="Sección exclusiva de administradores." />
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldCheck className="size-5" />
            No tenés permisos para ver la configuración.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Usuarios, permisos, feriados, reportes y estado del sistema."
      />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios · {usuarios.length}</TabsTrigger>
          <TabsTrigger value="roles">Roles y permisos</TabsTrigger>
          <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
          <TabsTrigger value="feriados">Feriados</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
          <TabsTrigger value="guia">Guía del sistema</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card className="panel">
            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <BrandMark className="size-12" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {marca.nombre} · {marca.personalizada ? marca.area : marca.tagline}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                    {systemInfo?.displayVersion ?? formatVersion(installedVersion)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {systemInfo?.commit ? `Commit ${systemInfo.commit}` : "Sin commit"}
                    {" · "}
                    Entorno {systemInfo?.environment ?? "production"}
                    {systemInfo?.httpsEnabled ? " · HTTPS" : " · sin HTTPS"}
                  </p>
                </div>
              </div>
              <div className="text-sm sm:text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Última actualización
                </p>
                <p className="mt-1 font-medium">{formatDate(systemInfo?.ultimaActualizacion)}</p>
                {systemInfo?.buildTime && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Build {formatDate(systemInfo.buildTime)}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <QrConfig esAdmin={isAdmin} />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {roles.map((r) => (
              <div key={r.clave} className="rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <RolChip rol={r} />
                  <span className="num text-lg font-semibold">{conteoPorRol[r.clave] ?? 0}</span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{r.descripcion}</p>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="seguridad" className="space-y-4">
          <ClaveVerConfig esAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar nombre, usuario o email…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[{ clave: "todos", nombre: "Todos" }, ...roles].map((r) => (
                <button
                  key={r.clave}
                  type="button"
                  onClick={() => setFiltroRol(r.clave)}
                  className={cn(
                    "h-8 rounded-full border px-3 text-xs font-medium transition-colors",
                    filtroRol === r.clave
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.nombre}{" "}
                  <span className="num ml-1 opacity-70">
                    {r.clave === "todos" ? usuarios.length : (conteoPorRol[r.clave] ?? 0)}
                  </span>
                </button>
              ))}
            </div>
            <Button className="lg:ml-auto" onClick={() => setNuevoOpen(true)}>
              <UserPlus className="size-4" /> Nuevo usuario
            </Button>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {cargandoUsuarios ? (
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Cargando usuarios…
              </div>
            ) : filtrados.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No hay usuarios para mostrar.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Persona</th>
                      <th className="hidden px-3 py-2.5 font-medium md:table-cell">Usuario</th>
                      <th className="px-3 py-2.5 font-medium">Rol</th>
                      <th className="w-24 px-3 py-2.5 text-right font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-border/60 last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <UserAvatar nombre={u.full_name || u.email} foto={u.avatar_url} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {u.full_name || "Sin nombre"}
                                {u.id === user?.id && (
                                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                                    (vos)
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
                        <td className="hidden px-3 py-2.5 font-mono text-xs text-muted-foreground md:table-cell">
                          {u.username ?? "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <Select
                            value={u.role}
                            disabled={cambiandoRol === u.id}
                            onValueChange={(v) => cambiarRol(u.id, v)}
                          >
                            <SelectTrigger className="h-8 w-[170px] border-transparent bg-transparent px-1.5 hover:border-border">
                              <RolChip rol={rolDe(u.role) ?? { nombre: u.role, color: "slate" }} />
                            </SelectTrigger>
                            <SelectContent>
                              {roles.map((r) => (
                                <SelectItem key={r.clave} value={r.clave}>
                                  {r.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label="Editar"
                            onClick={() => setEditando(u)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-destructive"
                            aria-label="Eliminar"
                            disabled={u.id === user?.id}
                            onClick={() => onEliminar(u)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="roles">
          <RolesPermisos conteo={conteoPorRol} />
        </TabsContent>

        <TabsContent value="feriados">
          <FeriadosConfig canEdit={isAdmin} />
        </TabsContent>

        <TabsContent value="reportes">
          <ReporteMensual />
        </TabsContent>

        <TabsContent value="datos">
          <MantenimientoDatos />
        </TabsContent>

        <TabsContent value="guia">
          <GuiaSistema />
        </TabsContent>
      </Tabs>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>Alta de cuenta con rol inicial.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={onCrear}>
            <div className="space-y-1.5">
              <Label>Nombre completo</Label>
              <Input name="fullName" required />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input name="email" type="email" required />
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input name="username" required />
            </div>
            <div className="space-y-1.5">
              <Label>Contraseña</Label>
              <InputClave name="password" required minLength={10} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select name="role" defaultValue="consulta">
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
              <Button type="button" variant="outline" onClick={() => setNuevoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                Crear
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>{editando?.email}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={onEditar}>
            <div className="space-y-1.5">
              <Label>Nombre completo</Label>
              <Input name="fullName" defaultValue={editando?.full_name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>Nueva contraseña (opcional)</Label>
              <InputClave
                name="password"
                minLength={10}
                autoComplete="new-password"
                placeholder="Vacío = no cambiar · 10+ con letras y números"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
