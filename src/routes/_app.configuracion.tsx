import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CheckCircle2,
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
import { api } from "@/integrations/api/client";
import { useAuth, type AppRole, type PermRow } from "@/lib/auth";
import type { UpdateInfo } from "@/lib/updates.functions";

export const Route = createFileRoute("/_app/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración | SysIntranet | Área Wiki" },
      {
        name: "description",
        content:
          "Permisos por rol y búsqueda de actualizaciones para SysIntranet | Área Wiki.",
      },
      { property: "og:title", content: "Configuración | SysIntranet | Área Wiki" },
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

const NO_UPDATE_MESSAGE = "En estos momentos no hay actualización disponible.";
const INSTALL_UPDATE_MESSAGE = "Hay una nueva versión disponible. ¿Quiere instalar una nueva versión?";

type Settings = {
  version_actual: string;
  ultima_revision: string | null;
  ultima_actualizacion: string | null;
};

function ConfiguracionPage() {
  const { isAdmin, perms, refreshPerms } = useAuth();
  const [rolActivo, setRolActivo] = useState<AppRole>("tecnico");
  const [rows, setRows] = useState<PermRow[]>(perms);
  const [saving, setSaving] = useState<string | null>(null);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setRows(perms);
  }, [perms]);

  const loadSettings = async () => {
    const { data } = await api
      .from("app_settings")
      .select("version_actual, ultima_revision, ultima_actualizacion")
      .maybeSingle();
    if (data) {
      setSettings(data as Settings);
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
    const { error } = await api.from("role_permissions").update(patch).eq("id", row.id);
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
      const res = await api.updates.check<UpdateInfo>();
      setInfo(res);
      if (isAdmin) {
        await api
          .from("app_settings")
          .update({
            version_actual: res.currentVersion,
            ultima_revision: new Date().toISOString(),
          })
          .eq("singleton", true);
        await loadSettings();
      }
      if (res.error) {
        toast.error(res.error);
        return;
      }
      if (!res.hasUpdate) {
        toast.success(NO_UPDATE_MESSAGE);
        return;
      }
      toast.info(INSTALL_UPDATE_MESSAGE);
      if (window.confirm(INSTALL_UPDATE_MESSAGE)) {
        await onApply(res);
      }
    } catch {
      toast.error("No se pudo verificar actualizaciones");
    } finally {
      setChecking(false);
    }
  };

  const onApply = async (selectedInfo = info) => {
    if (!selectedInfo?.latestVersion) return;
    setApplying(true);
    try {
      await api.updates.apply<{ ok: true; version: string }>(selectedInfo.latestVersion);
      await loadSettings();
      setInfo({
        ...selectedInfo,
        currentVersion: selectedInfo.latestVersion,
        hasUpdate: false,
      });
      toast.success("Actualización instalada. Recargando...");
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo aplicar la actualización");
    } finally {
      setApplying(false);
    }
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
            <RefreshCw className="size-4" /> Actualizaciones
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={onCheck} disabled={checking}>
              {checking ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Buscar actualización
            </Button>
            {settings?.ultima_revision ? (
              <span className="text-xs text-muted-foreground">
                Última revisión: {new Date(settings.ultima_revision).toLocaleString("es-AR")}
              </span>
            ) : null}
          </div>

          {info ? (
            info.error ? (
              <p className="text-sm text-destructive" role="alert">
                {info.error}
              </p>
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
                  <Button onClick={() => onApply()} disabled={applying}>
                    {applying ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 size-4" />
                    )}
                    Instalar nueva versión
                  </Button>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-primary" />
                {NO_UPDATE_MESSAGE}
              </p>
            )
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
