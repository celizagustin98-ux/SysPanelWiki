import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  Pencil,
  Printer,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/integrations/api/client";
import { useAuth, type AppRole, type PermRow } from "@/lib/auth";
import { actualizarUsuario, crearUsuario, eliminarUsuario } from "@/lib/usuarios.functions";

export const Route = createFileRoute("/_app/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración | SysIntranet | Área Wiki" },
      {
        name: "description",
        content:
          "Administración general, usuarios, roles, permisos y estado de versión de SysIntranet | Área Wiki.",
      },
      { property: "og:title", content: "Configuración | SysIntranet | Área Wiki" },
      {
        property: "og:description",
        content: "Centro administrativo de usuarios, roles, permisos y estado de la wiki.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracionPage,
});

const MODULOS: { key: string; label: string }[] = [
  { key: "instructivos", label: "Instructivos" },
  { key: "guardias", label: "Guardias" },
  { key: "inventario", label: "Inventario" },
  { key: "toners", label: "Tóners" },
  { key: "tareas", label: "Tareas" },
  { key: "credenciales", label: "Credenciales" },
  { key: "oficina", label: "Oficina" },
  { key: "usuarios", label: "Usuarios" },
];

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  {
    value: "administrador",
    label: "Administrador",
    hint: "Control total del sistema.",
  },
  { value: "tecnico", label: "Técnico", hint: "Operación diaria del área." },
  { value: "consulta", label: "Consulta", hint: "Solo lectura y consulta." },
];

const ACCIONES = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Crear" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
] as const;

type AccionKey = (typeof ACCIONES)[number]["key"];

type Settings = {
  version_actual: string;
  ultima_revision: string | null;
  ultima_actualizacion: string | null;
  updated_at: string | null;
};

type UsuarioRow = {
  id: string;
  full_name: string;
  email: string;
  role: AppRole;
};

type SystemStats = {
  auditoria: number;
  instructivos: number;
  toners: number;
  guardias: number;
};

function formatDate(value?: string | null) {
  if (!value) return "Sin registro";
  return new Date(value).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatVersion(value?: string | null) {
  const version = (value ?? "").trim();
  if (!version || version === "v1.0.0" || /^[a-f0-9]{7,40}$/i.test(version)) return "V 0.1 beta";
  if (/^v\s/i.test(version)) return version.replace(/^v/i, "V");
  if (/^\d/.test(version)) return `V ${version}`;
  return version;
}

function ConfiguracionPage() {
  const { isAdmin, perms, refreshPerms, user } = useAuth();
  const [rolActivo, setRolActivo] = useState<AppRole>("tecnico");
  const [rows, setRows] = useState<PermRow[]>(perms);
  const [saving, setSaving] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [systemStats, setSystemStats] = useState<SystemStats>({
    auditoria: 0,
    instructivos: 0,
    toners: 0,
    guardias: 0,
  });
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editando, setEditando] = useState<UsuarioRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [cambiandoRol, setCambiandoRol] = useState<string | null>(null);

  const crear = useServerFn(crearUsuario);
  const borrar = useServerFn(eliminarUsuario);
  const actualizar = useServerFn(actualizarUsuario);

  useEffect(() => {
    setRows(perms);
  }, [perms]);

  const loadSettings = useCallback(async () => {
    const { data } = await api
      .from("app_settings")
      .select("version_actual, ultima_revision, ultima_actualizacion, updated_at")
      .maybeSingle();
    if (data) setSettings(data as Settings);
  }, []);

  const loadSystemStats = useCallback(async () => {
    const [auditoria, instructivos, toners, guardias] = await Promise.all([
      api.from("audit_log").select("id", { count: "exact", head: true }),
      api.from("wiki_docs").select("id", { count: "exact", head: true }),
      api.from("toner_modelos").select("id", { count: "exact", head: true }),
      api.from("guardias").select("id", { count: "exact", head: true }),
    ]);
    setSystemStats({
      auditoria: auditoria.count ?? 0,
      instructivos: instructivos.count ?? 0,
      toners: toners.count ?? 0,
      guardias: guardias.count ?? 0,
    });
  }, []);

  const cargarUsuarios = useCallback(async () => {
    setCargandoUsuarios(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      api.from("profiles").select("id, full_name, email").order("full_name"),
      api.from("user_roles").select("user_id, role"),
    ]);
    const mapa = new Map<string, AppRole>();
    (roles ?? []).forEach((r) => mapa.set(r.user_id, r.role as AppRole));
    setUsuarios(
      (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        role: mapa.get(p.id) ?? "consulta",
      })),
    );
    setCargandoUsuarios(false);
  }, []);

  useEffect(() => {
    void loadSettings();
    void loadSystemStats();
  }, [loadSettings, loadSystemStats]);

  useEffect(() => {
    if (isAdmin) void cargarUsuarios();
  }, [isAdmin, cargarUsuarios]);

  const togglePerm = async (row: PermRow, key: AccionKey) => {
    if (!isAdmin) return;
    if (row.role === "administrador") {
      toast.info("El rol administrador siempre conserva todos los permisos.");
      return;
    }
    const next = !row[key];
    setSaving(`${row.id}-${key}`);
    const patch: Partial<Record<AccionKey, boolean>> = { [key]: next };
    const { error } = await api.from("role_permissions").update(patch).eq("id", row.id);
    setSaving(null);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: next } : r)));
    await refreshPerms();
    toast.success("Permiso actualizado");
  };

  const aplicarPreset = async (preset: "lectura" | "operativo" | "ninguno") => {
    if (rolActivo === "administrador") {
      toast.info("El rol administrador no se puede modificar.");
      return;
    }
    const patch =
      preset === "lectura"
        ? { can_view: true, can_create: false, can_edit: false, can_delete: false }
        : preset === "operativo"
          ? { can_view: true, can_create: true, can_edit: true, can_delete: false }
          : { can_view: false, can_create: false, can_edit: false, can_delete: false };
    setSaving("preset");
    const { error } = await api.from("role_permissions").update(patch).eq("role", rolActivo);
    setSaving(null);
    if (error) return toast.error(error.message);
    await refreshPerms();
    toast.success("Permisos aplicados al rol");
  };

  const cambiarRol = async (usuarioId: string, nuevo: AppRole) => {
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
    if (!q) return usuarios;
    return usuarios.filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [usuarios, busqueda]);

  const conteoPorRol = useMemo(() => {
    const c: Record<AppRole, number> = { administrador: 0, tecnico: 0, consulta: 0 };
    usuarios.forEach((u) => (c[u.role] += 1));
    return c;
  }, [usuarios]);

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

  const rolRows = MODULOS.map(
    (m) =>
      rows.find((r) => r.role === rolActivo && r.modulo === m.key) ?? {
        id: `${rolActivo}-${m.key}`,
        role: rolActivo,
        modulo: m.key,
        can_view: false,
        can_create: false,
        can_edit: false,
        can_delete: false,
      },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Centro administrativo de la wiki: usuarios, roles, permisos y estado del sistema."
      />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="roles">Roles y permisos</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="panel">
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">Versión actual</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatVersion(settings?.version_actual)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Rama beta hasta completar la versión oficial V 1.0.
                </p>
              </CardContent>
            </Card>
            <Card className="panel">
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Última actualización
                </p>
                <p className="mt-2 text-sm font-medium">
                  {formatDate(settings?.ultima_actualizacion ?? settings?.updated_at)}
                </p>
              </CardContent>
            </Card>
            <Card className="panel">
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Usuarios activos
                </p>
                <p className="mt-2 text-2xl font-semibold">{usuarios.length}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="panel">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="size-4" /> Estado administrativo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              {ROLES.map((r) => (
                <div key={r.value} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{r.label}</p>
                    <Badge variant="secondary">{conteoPorRol[r.value]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.hint}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="panel">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4" /> Estado del sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SystemStatus
                icon={<Database className="size-4" />}
                title="Base de datos"
                value="Operativa"
                detail={`${systemStats.auditoria} eventos auditados`}
              />
              <SystemStatus
                icon={<HardDrive className="size-4" />}
                title="Almacenamiento"
                value="Local"
                detail={`${systemStats.instructivos} instructivos registrados`}
              />
              <SystemStatus
                icon={<Printer className="size-4" />}
                title="Tóners"
                value={`${systemStats.toners} modelos`}
                detail="Stock manual por carga y consumo"
              />
              <SystemStatus
                icon={<ShieldCheck className="size-4" />}
                title="Guardias"
                value={`${systemStats.guardias} turnos`}
                detail="Períodos y liquidación cargados"
              />
            </CardContent>
          </Card>

          <Card className="panel">
            <CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
              <CheckCircle2 className="mt-0.5 size-4 text-primary" />
              La instalación automática de actualizaciones fue retirada. Para actualizar la wiki,
              aplicá el despliegue desde el servidor y usá esta sección solo para consultar la
              versión instalada y la última actualización registrada.
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <Card key={r.value} className="panel">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{r.label}</p>
                    <Badge variant="secondary">{conteoPorRol[r.value]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="panel">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" /> Usuarios
                </CardTitle>
                <Button onClick={() => setNuevoOpen(true)}>
                  <UserPlus className="mr-2 size-4" /> Nuevo usuario
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre o correo"
                  className="pl-9"
                />
              </div>

              {cargandoUsuarios ? (
                <div className="flex items-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Cargando usuarios...
                </div>
              ) : filteredEmpty(filtrados) ? (
                <p className="py-8 text-sm text-muted-foreground">Sin usuarios que coincidan.</p>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border">
                  {filtrados.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {u.full_name || "(sin nombre)"}
                          {u.id === user?.id ? (
                            <Badge variant="secondary" className="ml-2">
                              vos
                            </Badge>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={u.role}
                          disabled={u.id === user?.id || cambiandoRol === u.id}
                          onValueChange={(v) => cambiarRol(u.id, v as AppRole)}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="icon"
                          title="Editar nombre o contraseña"
                          onClick={() => setEditando(u)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          title="Eliminar usuario"
                          disabled={u.id === user?.id}
                          onClick={() => void onEliminar(u)}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <Card className="panel">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" /> Roles y permisos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {ROLES.map((r) => (
                  <Button
                    key={r.value}
                    size="sm"
                    variant={rolActivo === r.value ? "default" : "outline"}
                    onClick={() => setRolActivo(r.value)}
                  >
                    {r.label}
                  </Button>
                ))}
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rolActivo === "administrador" || saving === "preset"}
                    onClick={() => aplicarPreset("lectura")}
                  >
                    Solo lectura
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rolActivo === "administrador" || saving === "preset"}
                    onClick={() => aplicarPreset("operativo")}
                  >
                    Operativo
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rolActivo === "administrador" || saving === "preset"}
                    onClick={() => aplicarPreset("ninguno")}
                  >
                    Sin acceso
                  </Button>
                </div>
              </div>

              {rolActivo === "administrador" ? (
                <p className="text-xs text-muted-foreground">
                  El administrador tiene control total y no puede ser restringido.
                </p>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-4 py-2 font-medium">Módulo</th>
                      {ACCIONES.map((a) => (
                        <th key={a.key} className="px-4 py-2 text-center font-medium">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rolRows.map((row) => (
                      <tr key={row.modulo}>
                        <td className="px-4 py-2">
                          {MODULOS.find((m) => m.key === row.modulo)?.label ?? row.modulo}
                        </td>
                        {ACCIONES.map((a) => (
                          <td key={a.key} className="px-4 py-2 text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={rolActivo === "administrador" ? true : row[a.key]}
                                disabled={
                                  rolActivo === "administrador" ||
                                  saving === `${row.id}-${a.key}` ||
                                  saving === "preset"
                                }
                                onCheckedChange={() => togglePerm(row, a.key)}
                              />
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              Se crea con el rol elegido. Los permisos específicos se administran desde Roles y
              permisos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCrear} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input id="fullName" name="fullName" required placeholder="Ana Pérez" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="username">Nombre de usuario</Label>
              <Input
                id="username"
                name="username"
                required
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9._\-]{3,32}"
                placeholder="aperez"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" name="email" type="email" required placeholder="ana@empresa.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Contraseña temporal</Label>
              <Input id="password" name="password" type="text" required minLength={8} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="role">Rol</Label>
              <select
                id="role"
                name="role"
                defaultValue="consulta"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Creando..." : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>{editando?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={onEditar} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="e-fullName">Nombre completo</Label>
              <Input id="e-fullName" name="fullName" defaultValue={editando?.full_name ?? ""} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="e-password" className="flex items-center gap-2">
                <KeyRound className="size-3.5" /> Nueva contraseña (opcional)
              </Label>
              <Input
                id="e-password"
                name="password"
                type="text"
                minLength={8}
                placeholder="Dejar vacío para no cambiar"
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando..." : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SystemStatus({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <p className="text-xs font-medium uppercase">{title}</p>
      </div>
      <p className="mt-2 text-lg font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}


function filteredEmpty(rows: UsuarioRow[]) {
  return rows.length === 0;
}
