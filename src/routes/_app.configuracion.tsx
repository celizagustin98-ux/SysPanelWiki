import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
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
      { title: "Configuración | SysPanelWiki" },
      {
        name: "description",
        content: "Usuarios, roles, permisos, estado del sistema y auditoría.",
      },
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
  { value: "administrador", label: "Administrador", hint: "Control total del sistema." },
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

type UsuarioRow = {
  id: string;
  full_name: string;
  email: string;
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

type AuditRow = {
  id: string;
  actor_id: string | null;
  actor_nombre: string | null;
  actor_email: string | null;
  modulo: string;
  accion: string;
  entidad_id: string | null;
  entidad_desc: string | null;
  detalle: Record<string, unknown>;
  created_at: string;
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
  const { isAdmin, perms, refreshPerms, user } = useAuth();
  const [rolActivo, setRolActivo] = useState<AppRole>("tecnico");
  const [rows, setRows] = useState<PermRow[]>(perms);
  const [saving, setSaving] = useState<string | null>(null);

  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargandoUsuarios, setCargandoUsuarios] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editando, setEditando] = useState<UsuarioRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [cambiandoRol, setCambiandoRol] = useState<string | null>(null);

  const [auditRows, setAuditRows] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditModulo, setAuditModulo] = useState<string>("all");
  const [auditQ, setAuditQ] = useState("");

  const crear = useServerFn(crearUsuario);
  const borrar = useServerFn(eliminarUsuario);
  const actualizar = useServerFn(actualizarUsuario);

  useEffect(() => {
    setRows(perms);
  }, [perms]);

  const loadSystemInfo = useCallback(async () => {
    try {
      setSystemInfo(await api.system.info<SystemInfo>());
    } catch {
      setSystemInfo(null);
    }
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

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await api
        .from("audit_log")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const list = (data as AuditRow[]) ?? [];
      setAuditRows(list.slice(0, 100));
    } catch {
      setAuditRows([]);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSystemInfo();
  }, [loadSystemInfo]);

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

  const auditFiltrada = useMemo(() => {
    let list = auditRows;
    if (auditModulo !== "all") list = list.filter((r) => r.modulo === auditModulo);
    const q = auditQ.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          (r.actor_nombre ?? "").toLowerCase().includes(q) ||
          (r.actor_email ?? "").toLowerCase().includes(q) ||
          r.accion.toLowerCase().includes(q) ||
          r.modulo.toLowerCase().includes(q) ||
          (r.entidad_desc ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [auditRows, auditModulo, auditQ]);

  const auditModulos = useMemo(() => {
    const s = new Set(auditRows.map((r) => r.modulo).filter(Boolean));
    return Array.from(s).sort();
  }, [auditRows]);

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
        description="Quién entra, qué puede hacer y actividad del sistema."
      />

      <Tabs
        defaultValue="general"
        className="space-y-4"
        onValueChange={(v) => {
          if (v === "actividad" && auditRows.length === 0) void loadAudit();
        }}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="roles">Roles y permisos</TabsTrigger>
          <TabsTrigger value="actividad">Actividad</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card className="panel">
            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Sistema
                </p>
                <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                  {systemInfo?.displayVersion ?? formatVersion(installedVersion)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {systemInfo?.commit ? `Commit ${systemInfo.commit}` : "Sin commit"}
                  {" · "}
                  Entorno {systemInfo?.environment ?? "production"}
                  {systemInfo?.httpsEnabled ? " · HTTPS" : ""}
                </p>
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

          <div className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <Card key={r.value} className="panel">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{r.label}</p>
                    <Badge variant="secondary">{conteoPorRol[r.value]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.hint}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por nombre o email…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
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
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No hay usuarios para mostrar.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {filtrados.map((u) => (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {u.full_name || "Sin nombre"}
                          {u.id === user?.id && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              (vos)
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={u.role}
                          disabled={cambiandoRol === u.id}
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
              <Button
                size="sm"
                variant="secondary"
                disabled={saving === "preset" || rolActivo === "administrador"}
                onClick={() => aplicarPreset("lectura")}
              >
                Preset lectura
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={saving === "preset" || rolActivo === "administrador"}
                onClick={() => aplicarPreset("operativo")}
              >
                Preset operativo
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saving === "preset" || rolActivo === "administrador"}
                onClick={() => aplicarPreset("ninguno")}
              >
                Quitar todo
              </Button>
            </div>
          </div>

          {rolActivo === "administrador" && (
            <p className="text-xs text-muted-foreground">
              El administrador siempre tiene acceso total; la matriz es solo referencia.
            </p>
          )}

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
                                checked={!!row[a.key] || rolActivo === "administrador"}
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

        <TabsContent value="actividad" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar actor, acción o entidad…"
                value={auditQ}
                onChange={(e) => setAuditQ(e.target.value)}
              />
            </div>
            <Select value={auditModulo} onValueChange={setAuditModulo}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Módulo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                {auditModulos.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadAudit()} disabled={auditLoading}>
              {auditLoading ? <Loader2 className="size-4 animate-spin" /> : <Activity className="size-4" />}
              Actualizar
            </Button>
          </div>

          <Card className="panel overflow-hidden">
            <CardContent className="p-0">
              {auditLoading && auditRows.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Cargando actividad…
                </div>
              ) : auditFiltrada.length === 0 ? (
                <div className="py-12 text-center">
                  <Activity className="mx-auto mb-2 size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No hay eventos de auditoría.</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {auditFiltrada.map((ev) => (
                    <div key={ev.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              {ev.modulo}
                            </Badge>
                            <span className="text-sm font-medium">{ev.accion}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {ev.actor_nombre || ev.actor_email || "Sistema"}
                            {ev.entidad_desc ? ` · ${ev.entidad_desc}` : ""}
                          </p>
                        </div>
                        <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                          {formatDate(ev.created_at)}
                        </time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
              <Input
                name="password"
                type="password"
                minLength={6}
                placeholder="Dejar vacío para no cambiar"
              />
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
