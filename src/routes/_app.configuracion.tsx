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
  if (!value) return "Sin registro";
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
  if (!version || /^[a-f0-9]{7,40}$/i.test(version)) return "V 1.3.0";
  if (/^v\s/i.test(version)) return version.replace(/^v/i, "V");
  if (/^\d/.test(version)) return `V ${version}`;
  return version;
}

function parseVersion(value?: string | null) {
  const version = String(value ?? "").trim().replace(/^v\s*/i, "");
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return { major: 1, minor: 3, patch: 0 };
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function versionLabel(major: number, minor: number, patch: number) {
  return `V ${major}.${minor}.${patch}`;
}

function getVersionPolicy(version?: string | null) {
  const current = parseVersion(version);
  return {
    current: versionLabel(current.major, current.minor, current.patch),
    patch: versionLabel(current.major, current.minor, current.patch + 1),
    minor: versionLabel(current.major, current.minor + 1, 0),
    major: versionLabel(current.major + 1, 0, 0),
  };
}

function updateSourceLabel(source?: SystemInfo["ultimaActualizacionFuente"]) {
  if (source === "commit") return "último commit desplegado";
  if (source === "variable") return "variable APP_UPDATED_AT";
  if (source === "build") return "build del servidor";
  return "registro del sistema";
}

function ConfiguracionPage() {
  const { isAdmin, perms, refreshPerms, user } = useAuth();
  const [rolActivo, setRolActivo] = useState<AppRole>("tecnico");
  const [rows, setRows] = useState<PermRow[]>(perms);
  const [saving, setSaving] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
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
    try {
      setSystemInfo(await api.system.info<SystemInfo>());
    } catch {
      setSystemInfo(null);
    }
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
  const installedVersion = systemInfo?.appVersion ?? "1.3.0";
  const versionPolicy = getVersionPolicy(installedVersion);

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
        description="Usuarios, roles, permisos, versión instalada y estado del sistema."
      />

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="roles">Roles y permisos</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="panel border-primary/20">
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Versión del sistema
                </p>
                <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">
                  {systemInfo?.displayVersion ?? formatVersion(installedVersion)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {systemInfo?.commit ? `Commit ${systemInfo.commit}` : "Build local"}
                  {systemInfo?.buildTime
                    ? ` · build ${new Date(systemInfo.buildTime).toLocaleString("es-AR")}`
                    : ""}
                </p>
              </CardContent>
            </Card>
            <Card className="panel">
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Última actualización
                </p>
                <p className="mt-2 text-sm font-medium">
                  {formatDate(systemInfo?.ultimaActualizacion)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sale de {updateSourceLabel(systemInfo?.ultimaActualizacionFuente)}. Entorno:{" "}
                  {systemInfo?.environment ?? "production"}
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
                <Settings2 className="size-4" /> Criterio de versión
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="font-semibold text-foreground">Versión instalada: {versionPolicy.current}</p>
                <p className="mt-1">
                  Formato <span className="font-mono">MAJOR.MINOR.PATCH</span> · cada release se
                  publica con{" "}
                  <span className="font-mono">npm run version:fix|module|official</span> y queda
                  registrada en el build (<span className="font-mono">build-info.json</span>).
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="font-semibold text-foreground">Patch</p>
                  <p className="mt-1">
                    Bugfix o polish. Comando: <span className="font-mono">version:fix</span>
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">{versionPolicy.patch}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="font-semibold text-foreground">Minor</p>
                  <p className="mt-1">
                    Módulo nuevo o rediseño. Comando:{" "}
                    <span className="font-mono">version:module</span>
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">{versionPolicy.minor}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                  <p className="font-semibold text-foreground">Major</p>
                  <p className="mt-1">
                    Hito o cambio disruptivo. Comando:{" "}
                    <span className="font-mono">version:official</span>
                  </p>
                  <p className="mt-2 font-mono text-sm text-foreground">{versionPolicy.major}</p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                <Server className="size-4" /> Inventario del sistema
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile icon={<Database className="size-4" />} title="Auditoría" value={systemStats.auditoria} detail="eventos registrados" />
              <StatTile icon={<HardDrive className="size-4" />} title="Instructivos" value={systemStats.instructivos} detail="documentos wiki" />
              <StatTile icon={<Printer className="size-4" />} title="Tóners" value={systemStats.toners} detail="modelos en depósito" />
              <StatTile icon={<Users className="size-4" />} title="Guardias" value={systemStats.guardias} detail="registros de guardia" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nombre o email…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
            <Button onClick={() => setNuevoOpen(true)}>
              <UserPlus className="size-4" /> Nuevo usuario
            </Button>
          </div>

          <Card className="panel overflow-hidden">
            <CardContent className="p-0">
              {cargandoUsuarios ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Cargando usuarios…
                </div>
              ) : filtrados.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">No hay usuarios para mostrar.</p>
              ) : (
                <div className="divide-y divide-border">
                  {filtrados.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.full_name || "Sin nombre"}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={u.role}
                          disabled={cambiandoRol === u.id || u.id === user?.id}
                          onValueChange={(v) => cambiarRol(u.id, v as AppRole)}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
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
                        <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(u)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          disabled={u.id === user?.id}
                          onClick={() => onEliminar(u)}
                        >
                          <Trash2 className="size-4" />
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
              <Button size="sm" variant="secondary" disabled={saving === "preset" || rolActivo === "administrador"} onClick={() => aplicarPreset("lectura")}>
                Preset lectura
              </Button>
              <Button size="sm" variant="secondary" disabled={saving === "preset" || rolActivo === "administrador"} onClick={() => aplicarPreset("operativo")}>
                Preset operativo
              </Button>
              <Button size="sm" variant="outline" disabled={saving === "preset" || rolActivo === "administrador"} onClick={() => aplicarPreset("ninguno")}>
                Quitar todo
              </Button>
            </div>
          </div>

          <Card className="panel overflow-hidden">
            <CardHeader className="border-b border-border/70 pb-3">
              <CardTitle className="text-base">
                Permisos · {ROLES.find((r) => r.value === rolActivo)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Módulo</th>
                      {ACCIONES.map((a) => (
                        <th key={a.key} className="px-3 py-2.5 text-center font-medium">
                          {a.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rolRows.map((row) => (
                      <tr key={row.id} className="border-b border-border/60">
                        <td className="px-4 py-2.5 font-medium">
                          {MODULOS.find((m) => m.key === row.modulo)?.label ?? row.modulo}
                        </td>
                        {ACCIONES.map((a) => (
                          <td key={a.key} className="px-3 py-2.5 text-center">
                            <div className="flex justify-center">
                              <Checkbox
                                checked={!!row[a.key]}
                                disabled={
                                  rolActivo === "administrador" ||
                                  saving === `${row.id}-${a.key}`
                                }
                                onCheckedChange={() => togglePerm(row as PermRow, a.key)}
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
              <Input name="password" type="password" required minLength={6} />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select name="role" defaultValue="consulta">
                <SelectTrigger>
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNuevoOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
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
              <Input name="password" type="password" minLength={6} placeholder="Dejar vacío para no cambiar" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatTile({
  icon,
  title,
  value,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/15 p-3">
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
