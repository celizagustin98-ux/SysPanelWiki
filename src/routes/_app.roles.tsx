import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/integrations/api/client";
import { useAuth, type AppRole, type PermRow } from "@/lib/auth";

export const Route = createFileRoute("/_app/roles")({
  head: () => ({
    meta: [
      { title: "Roles y permisos | Intranet Área de Sistemas" },
      {
        name: "description",
        content:
          "Administración de roles: matriz de permisos por módulo y asignación de roles a los usuarios de la intranet.",
      },
      { property: "og:title", content: "Roles y permisos | Intranet Área de Sistemas" },
      {
        property: "og:description",
        content: "Definí qué puede ver, crear, editar y eliminar cada rol, y asignalos a usuarios.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RolesPage,
});

const MODULOS = [
  { key: "instructivos", label: "Instructivos" },
  { key: "guardias", label: "Guardias" },
  { key: "inventario", label: "Inventario" },
  { key: "toners", label: "Tóners" },
  { key: "tareas", label: "Tareas" },
  { key: "credenciales", label: "Credenciales" },
  { key: "usuarios", label: "Usuarios" },
] as const;

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  {
    value: "administrador",
    label: "Administrador",
    hint: "Control total del sistema. No puede restringirse.",
  },
  { value: "tecnico", label: "Técnico", hint: "Operación diaria del área." },
  { value: "consulta", label: "Consulta", hint: "Pensado para solo lectura." },
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

function RolesPage() {
  const { isAdmin, perms, refreshPerms, user } = useAuth();
  const [rolActivo, setRolActivo] = useState<AppRole>("tecnico");
  const [rows, setRows] = useState<PermRow[]>(perms);
  const [saving, setSaving] = useState<string | null>(null);

  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    setRows(perms);
  }, [perms]);

  const cargarUsuarios = useCallback(async () => {
    setCargando(true);
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
    setCargando(false);
  }, []);

  useEffect(() => {
    if (isAdmin) void cargarUsuarios();
  }, [isAdmin, cargarUsuarios]);

  const togglePerm = async (row: PermRow, key: AccionKey) => {
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
    setCambiando(usuarioId);
    const { error } = await api.rpc("set_user_role", {
      _user_id: usuarioId,
      _role: nuevo,
    });
    setCambiando(null);
    if (error) return toast.error(error.message);
    setUsuarios((prev) => prev.map((u) => (u.id === usuarioId ? { ...u, role: nuevo } : u)));
    toast.success("Rol asignado");
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
        <PageHeader title="Roles y permisos" description="Sección exclusiva de administradores." />
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldCheck className="size-5" />
            No tenés permisos para administrar roles.
          </CardContent>
        </Card>
      </div>
    );
  }

  const rolRows: PermRow[] = MODULOS.map(
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
        title="Roles y permisos"
        description="Definí qué puede hacer cada rol en cada módulo y asigná roles a los usuarios."
      />

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
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" /> Matriz de permisos
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

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" /> Asignación de roles
          </CardTitle>
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

          {cargando ? (
            <div className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando usuarios…
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-4 py-2 font-medium">Usuario</th>
                    <th className="px-4 py-2 font-medium">Correo</th>
                    <th className="px-4 py-2 font-medium">Rol</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtrados.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2">
                        {u.full_name || "—"}
                        {u.id === user?.id ? (
                          <Badge variant="secondary" className="ml-2">
                            vos
                          </Badge>
                        ) : null}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                      <td className="px-4 py-2">
                        <Select
                          value={u.role}
                          disabled={cambiando === u.id}
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
                      </td>
                    </tr>
                  ))}
                  {filtrados.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                        Sin usuarios que coincidan.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
