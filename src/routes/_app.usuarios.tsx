import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Pencil, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { actualizarUsuario, crearUsuario, eliminarUsuario } from "@/lib/usuarios.functions";

export const Route = createFileRoute("/_app/usuarios")({
  head: () => ({
    meta: [
      { title: "Usuarios y permisos | Intranet Área de Sistemas" },
      {
        name: "description",
        content:
          "Alta, baja y modificación de usuarios, asignación de roles y permisos del Área de Sistemas.",
      },
      { property: "og:title", content: "Usuarios y permisos | Intranet Área de Sistemas" },
      {
        property: "og:description",
        content: "Gestión de usuarios y roles: administrador, técnico y consulta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: UsuariosPage,
});

type Row = { id: string; full_name: string; email: string; role: AppRole };

const ROLES: { value: AppRole; label: string; hint: string }[] = [
  { value: "administrador", label: "Administrador", hint: "Control total, gestiona usuarios" },
  { value: "tecnico", label: "Técnico", hint: "Crea y edita contenido operativo" },
  { value: "consulta", label: "Consulta", hint: "Solo lectura" },
];

function UsuariosPage() {
  const { isAdmin, user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editando, setEditando] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const crear = useServerFn(crearUsuario);
  const borrar = useServerFn(eliminarUsuario);
  const actualizar = useServerFn(actualizarUsuario);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email").order("created_at"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const map = new Map<string, AppRole>();
    (roles ?? []).forEach((r) => map.set(r.user_id, r.role as AppRole));
    setRows(
      (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        role: map.get(p.id) ?? "consulta",
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) => r.full_name.toLowerCase().includes(t) || r.email.toLowerCase().includes(t),
    );
  }, [rows, q]);

  const changeRole = async (userId: string, role: AppRole) => {
    const { error } = await supabase.rpc("set_user_role", { _user_id: userId, _role: role });
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, role } : r)));
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
      await load();
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
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusy(false);
    }
  };

  const onEliminar = async (row: Row) => {
    if (!window.confirm(`¿Eliminar definitivamente a ${row.full_name || row.email}?`)) return;
    try {
      await borrar({ data: { userId: row.id } });
      toast.success("Usuario eliminado");
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  };

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Usuarios y permisos" description="Sección exclusiva de administradores." />
        <Card className="panel">
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldCheck className="size-5" />
            No tenés permisos para administrar usuarios.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Usuarios y permisos"
        description="Creá, editá y eliminá usuarios, y asignales su rol. Los permisos de cada rol se ajustan en Configuración."
        action={
          <Button onClick={() => setNuevoOpen(true)}>
            <UserPlus className="mr-2 size-4" /> Nuevo usuario
          </Button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <Card key={r.value} className="panel">
            <CardContent className="py-4">
              <p className="text-sm font-medium">{r.label}</p>
              <p className="text-xs text-muted-foreground">{r.hint}</p>
              <p className="mt-2 text-2xl font-semibold">
                {rows.filter((x) => x.role === r.value).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="panel">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o correo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {loading ? (
            <p className="py-6 text-sm text-muted-foreground">Cargando usuarios…</p>
          ) : filtered.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Sin usuarios para mostrar.</p>
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {filtered.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {r.full_name || "(sin nombre)"}{" "}
                      {r.id === user?.id ? (
                        <Badge variant="secondary" className="ml-1">
                          vos
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{r.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={r.role}
                      onValueChange={(v) => changeRole(r.id, v as AppRole)}
                      disabled={r.id === user?.id}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Editar nombre o contraseña"
                      onClick={() => setEditando(r)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Eliminar usuario"
                      disabled={r.id === user?.id}
                      onClick={() => void onEliminar(r)}
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

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              Se crea con el correo confirmado y el rol elegido. Los permisos del rol se definen en
              Configuración.
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
                {busy ? "Creando…" : "Crear usuario"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
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
              <Input id="e-password" name="password" type="text" minLength={8} placeholder="Dejar vacío para no cambiar" />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy}>
                {busy ? "Guardando…" : "Guardar cambios"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
