import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Download,
  Github,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole, type PermRow } from "@/lib/auth";
import { applyUpdate, checkForUpdates, type UpdateInfo } from "@/lib/updates.functions";

export const Route = createFileRoute("/_app/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración | Intranet Área de Sistemas" },
      {
        name: "description",
        content:
          "Permisos por rol, versión instalada y búsqueda de actualizaciones desde GitHub para la intranet del Área de Sistemas.",
      },
      { property: "og:title", content: "Configuración | Intranet Área de Sistemas" },
      {
        property: "og:description",
        content: "Matriz de permisos por rol y actualizaciones de la aplicación.",
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
  { key: "usuarios", label: "Usuarios" },
];

const ROLES: { value: AppRole; label: string }[] = [
  { value: "administrador", label: "Administrador" },
  { value: "tecnico", label: "Técnico" },
  { value: "consulta", label: "Consulta" },
];

const ACCIONES = [
  { key: "can_view", label: "Ver" },
  { key: "can_create", label: "Crear" },
  { key: "can_edit", label: "Editar" },
  { key: "can_delete", label: "Eliminar" },
] as const;

type Settings = {
  version_actual: string;
  github_repo: string;
  ultima_revision: string | null;
  ultima_actualizacion: string | null;
};

function ConfiguracionPage() {
  const { isAdmin, perms, refreshPerms } = useAuth();
  const [rolActivo, setRolActivo] = useState<AppRole>("tecnico");
  const [rows, setRows] = useState<PermRow[]>(perms);
  const [saving, setSaving] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [repo, setRepo] = useState("");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  const check = useServerFn(checkForUpdates);
  const apply = useServerFn(applyUpdate);

  useEffect(() => {
    setRows(perms);
  }, [perms]);

  const loadSettings = async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("version_actual, github_repo, ultima_revision, ultima_actualizacion")
      .maybeSingle();
    if (data) {
      setSettings(data as Settings);
      setRepo(data.github_repo);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  const togglePerm = async (row: PermRow, key: (typeof ACCIONES)[number]["key"]) => {
    if (!isAdmin) return;
    if (row.role === "administrador") {
      toast.info("El rol administrador siempre conserva todos los permisos.");
      return;
    }
    const next = !row[key];
    setSaving(`${row.id}-${key}`);
    const patch: Partial<Record<(typeof ACCIONES)[number]["key"], boolean>> = { [key]: next };
    const { error } = await supabase.from("role_permissions").update(patch).eq("id", row.id);
    setSaving(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, [key]: next } : r)));
    await refreshPerms();
    toast.success("Permiso actualizado");
  };

  const onCheck = async () => {
    setChecking(true);
    try {
      const res = await check({});
      setInfo(res);
      if (res.error) toast.error(res.error);
      else if (res.hasUpdate) toast.success(`Nueva versión disponible: ${res.latestVersion}`);
      else toast.success("La aplicación está al día");
      if (isAdmin) {
        await supabase
          .from("app_settings")
          .update({ ultima_revision: new Date().toISOString() })
          .eq("singleton", true);
        await loadSettings();
      }
    } catch {
      toast.error("No se pudo verificar actualizaciones");
    } finally {
      setChecking(false);
    }
  };

  const onApply = async () => {
    if (!info?.latestVersion) return;
    setApplying(true);
    try {
      await apply({ data: { version: info.latestVersion } });
      await loadSettings();
      setInfo({ ...info, currentVersion: info.latestVersion, hasUpdate: false });
      toast.success("Actualización aplicada. Recargando…");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar la actualización");
    } finally {
      setApplying(false);
    }
  };

  const saveRepo = async () => {
    const { error } = await supabase
      .from("app_settings")
      .update({ github_repo: repo.trim() })
      .eq("singleton", true);
    if (error) return toast.error(error.message);
    await loadSettings();
    toast.success("Repositorio guardado");
  };

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
        description="Permisos por rol y actualizaciones de la aplicación."
      />

      <Card className="panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4" /> Permisos por rol
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
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
                              rolActivo === "administrador" || saving === `${row.id}-${a.key}`
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
            <Github className="size-4" /> Actualizaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Versión instalada</p>
              <p className="text-lg font-semibold">{settings?.version_actual ?? "—"}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Última revisión</p>
              <p className="text-sm">
                {settings?.ultima_revision
                  ? new Date(settings.ultima_revision).toLocaleString("es-AR")
                  : "Nunca"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Última actualización</p>
              <p className="text-sm">
                {settings?.ultima_actualizacion
                  ? new Date(settings.ultima_actualizacion).toLocaleString("es-AR")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <Label htmlFor="repo" className="text-xs">
                Repositorio de GitHub
              </Label>
              <Input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="usuario/repositorio"
              />
            </div>
            <Button variant="outline" onClick={saveRepo}>
              Guardar
            </Button>
            <Button onClick={onCheck} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Buscar actualización
            </Button>
          </div>

          {info ? (
            info.error ? (
              <p className="text-sm text-destructive">{info.error}</p>
            ) : info.hasUpdate ? (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>Nueva versión</Badge>
                  <span className="font-medium">{info.latestVersion}</span>
                  {info.publishedAt ? (
                    <span className="text-xs text-muted-foreground">
                      {new Date(info.publishedAt).toLocaleString("es-AR")}
                    </span>
                  ) : null}
                </div>
                {info.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {info.notes.slice(0, 600)}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={onApply} disabled={applying}>
                    {applying ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 size-4" />
                    )}
                    Sí, actualizar ahora
                  </Button>
                  {info.latestUrl ? (
                    <Button variant="outline" asChild>
                      <a href={info.latestUrl} target="_blank" rel="noreferrer">
                        Ver cambios en GitHub
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                Estás en la última versión ({info.currentVersion}).
              </p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
