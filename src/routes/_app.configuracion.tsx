import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Database,
  History,
  Info,
  KeyRound,
  ShieldCheck,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { BrandMark } from "@/components/brand/BrandMark";
import { FeriadosConfig } from "@/components/configuracion/FeriadosConfig";
import { ReporteMensual } from "@/components/configuracion/ReporteMensual";
import { QrConfig } from "@/components/configuracion/QrConfig";
import { GuiaSistema } from "@/components/configuracion/GuiaSistema";
import { RolesPermisos } from "@/components/configuracion/RolesPermisos";
import { MantenimientoDatos } from "@/components/configuracion/MantenimientoDatos";
import { UsuariosAdmin, useUsuariosAdmin } from "@/components/configuracion/UsuariosAdmin";
import { useMarca } from "@/lib/brand";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useRoles } from "@/lib/roles";
import { cn } from "@/lib/utils";

type SeccionKey = "general" | "usuarios" | "roles" | "feriados" | "reportes" | "datos" | "guia";

const SECCIONES: {
  grupo: string;
  items: { key: SeccionKey; label: string; hint: string; icon: LucideIcon }[];
}[] = [
  {
    grupo: "Sistema",
    items: [
      { key: "general", label: "General", hint: "Versión, estado y escaneo QR", icon: Info },
      {
        key: "feriados",
        label: "Feriados",
        hint: "Calendario para guardias y plazos",
        icon: CalendarDays,
      },
    ],
  },
  {
    grupo: "Accesos",
    items: [
      { key: "usuarios", label: "Usuarios", hint: "Cuentas, estado y contraseñas", icon: Users },
      {
        key: "roles",
        label: "Roles y permisos",
        hint: "Qué puede hacer cada rol",
        icon: ShieldCheck,
      },
    ],
  },
  {
    grupo: "Información",
    items: [
      { key: "reportes", label: "Reportes", hint: "Reporte mensual del área", icon: BarChart3 },
      { key: "datos", label: "Datos", hint: "Tamaño de la base y depuración", icon: Database },
      { key: "guia", label: "Guía del sistema", hint: "Cómo se usa cada módulo", icon: BookOpen },
    ],
  },
];

const TODAS = SECCIONES.flatMap((g) => g.items);

export const Route = createFileRoute("/_app/configuracion")({
  validateSearch: (s: Record<string, unknown>): { seccion?: SeccionKey } => ({
    seccion: TODAS.some((x) => x.key === s.seccion) ? (s.seccion as SeccionKey) : undefined,
  }),
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
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { seccion = "general" } = Route.useSearch();
  const actual = TODAS.find((x) => x.key === seccion)!;
  const ir = (key: SeccionKey) =>
    navigate({ to: "/configuracion", search: { seccion: key === "general" ? undefined : key } });

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
    <div className="space-y-4">
      <PageHeader
        title="Configuración"
        description="Accesos, calendario, reportes y estado del sistema."
      />

      <div className="grid gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Navegación: columna lateral en pantallas anchas, fila de botones en el resto. */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 xl:hidden">
          {TODAS.map((it) => {
            const Icono = it.icon;
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => ir(it.key)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors",
                  it.key === seccion
                    ? "border-primary/50 bg-primary/10 font-medium text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icono className="size-4" /> {it.label}
              </button>
            );
          })}
        </div>
        <nav
          className="hidden h-fit space-y-4 xl:sticky xl:top-4 xl:block"
          aria-label="Secciones de configuración"
        >
          {SECCIONES.map((g) => (
            <div key={g.grupo}>
              <p className="eyebrow px-2.5 pb-1.5">{g.grupo}</p>
              <div className="space-y-0.5">
                {g.items.map((it) => {
                  const Icono = it.icon;
                  const sel = it.key === seccion;
                  return (
                    <button
                      key={it.key}
                      type="button"
                      onClick={() => ir(it.key)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                        sel
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icono className="size-4 shrink-0" />
                      <span className="truncate">{it.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="border-t border-border pt-3">
            <Link
              to="/auditoria"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <History className="size-4" /> Auditoría
              <ChevronRight className="ml-auto size-3.5" />
            </Link>
          </div>
        </nav>

        <section className="min-w-0 space-y-4">
          <div className="border-b border-border pb-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
              <actual.icon className="size-5 text-primary" /> {actual.label}
            </h2>
            <p className="text-sm text-muted-foreground">{actual.hint}</p>
          </div>

          {seccion === "general" && <General onIr={ir} />}
          {seccion === "usuarios" && <UsuariosAdmin />}
          {seccion === "roles" && <RolesPermisos />}
          {seccion === "feriados" && <FeriadosConfig canEdit={isAdmin} />}
          {seccion === "reportes" && <ReporteMensual />}
          {seccion === "datos" && <MantenimientoDatos />}
          {seccion === "guia" && <GuiaSistema />}
        </section>
      </div>
    </div>
  );
}

function General({ onIr }: { onIr: (k: SeccionKey) => void }) {
  const marca = useMarca();
  const { data: roles = [] } = useRoles();
  const { data: usuarios = [] } = useUsuariosAdmin();
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    api.system
      .info<SystemInfo>()
      .then(setSystemInfo)
      .catch(() => setSystemInfo(null));
  }, []);

  const activos = usuarios.filter((u) => u.activo).length;
  const suspendidos = usuarios.length - activos;
  const sinIngresar = usuarios.filter((u) => u.activo && !u.ultimo_acceso).length;

  return (
    <div className="space-y-4">
      <Card className="panel">
        <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandMark className="size-12" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {marca.nombre} · {marca.personalizada ? marca.area : marca.tagline}
              </p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-tight">
                {systemInfo?.displayVersion ?? formatVersion(systemInfo?.appVersion)}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <Atajo
          icono={UserCheck}
          titulo="Usuarios activos"
          valor={activos}
          detalle={suspendidos ? `${suspendidos} suspendido(s)` : "Ninguno suspendido"}
          onClick={() => onIr("usuarios")}
        />
        <Atajo
          icono={ShieldCheck}
          titulo="Roles"
          valor={roles.length}
          detalle={`${roles.filter((r) => !r.sistema).length} personalizado(s)`}
          onClick={() => onIr("roles")}
        />
        <Atajo
          icono={KeyRound}
          titulo="Nunca ingresaron"
          valor={sinIngresar}
          detalle={
            sinIngresar ? "Revisá si recibieron su contraseña" : "Todos ingresaron al menos una vez"
          }
          onClick={() => onIr("usuarios")}
          alerta={sinIngresar > 0}
        />
      </div>

      <QrConfig esAdmin />
    </div>
  );
}

function Atajo({
  icono: Icono,
  titulo,
  valor,
  detalle,
  onClick,
  alerta,
}: {
  icono: LucideIcon;
  titulo: string;
  valor: ReactNode;
  detalle: string;
  onClick: () => void;
  alerta?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40"
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg",
          alerta ? "bg-amber-500/12 text-amber-600" : "bg-primary/10 text-primary",
        )}
      >
        <Icono className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className="num text-xl font-semibold leading-tight">{valor}</p>
        <p className="truncate text-[11px] text-muted-foreground">{detalle}</p>
      </div>
      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
