import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  History,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Settings2,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, type Modulo } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, modulo: null, adminOnly: false },
  {
    to: "/oficina",
    label: "Oficina",
    icon: BriefcaseBusiness,
    modulo: "oficina",
    adminOnly: false,
  },
  {
    to: "/instructivos",
    label: "Instructivos",
    icon: BookOpen,
    modulo: "instructivos",
    adminOnly: false,
  },
  { to: "/guardias", label: "Guardias", icon: CalendarClock, modulo: "guardias", adminOnly: false },
  { to: "/inventario", label: "Inventario", icon: Boxes, modulo: "inventario", adminOnly: false },
  { to: "/toners", label: "Tóners", icon: Printer, modulo: "toners", adminOnly: false },
  { to: "/tareas", label: "Tareas", icon: KanbanSquare, modulo: "tareas", adminOnly: false },
  {
    to: "/credenciales",
    label: "Credenciales",
    icon: ShieldCheck,
    modulo: "credenciales",
    adminOnly: false,
  },
  { to: "/auditoria", label: "Auditoría", icon: History, modulo: null, adminOnly: true },
  { to: "/configuracion", label: "Configuración", icon: Settings2, modulo: null, adminOnly: true },
] as const;

export function AppShell() {
  const { profile, role, signOut, user, isAdmin, can } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const nav = NAV.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.modulo || can(item.modulo as Modulo, "view")),
  );

  const handleSignOut = async () => {
    await signOut();
    await navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full">
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 px-3 py-4 backdrop-blur-xl transition-[width] duration-200 ease-out md:flex",
          sidebarCollapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex items-center gap-2 px-2 pb-5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/25">
            <Building2 className="size-5" />
          </div>
          <div className={cn("min-w-0", sidebarCollapsed && "hidden")}>
            <p className="truncate text-sm font-semibold leading-tight tracking-tight">
              SysIntranet
            </p>
            <p className="eyebrow">Panel operativo</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className={cn("ml-auto size-8", sidebarCollapsed && "mx-auto")}
            title={sidebarCollapsed ? "Mostrar menú" : "Contraer menú"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "bg-primary/12 text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
                  sidebarCollapsed && "justify-center px-2",
                )}
                title={sidebarCollapsed ? item.label : undefined}
              >
                <item.icon className="size-4 shrink-0" />
                <span className={cn(sidebarCollapsed && "sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div
          className={cn(
            "mt-4 rounded-xl border border-sidebar-border bg-sidebar-accent/35 p-3",
            sidebarCollapsed && "px-2",
          )}
        >
          <div className={cn(sidebarCollapsed && "hidden")}>
            <p className="truncate text-sm font-semibold">{profile?.full_name || user?.email}</p>
            <Badge variant="secondary" className="mt-1 capitalize">
              {role ?? "—"}
            </Badge>
          </div>
          <div className="mt-3 grid gap-2">
            <Button
              size={sidebarCollapsed ? "icon" : "sm"}
              variant="ghost"
              className={cn(!sidebarCollapsed && "justify-start")}
              title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              onClick={toggle}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className={cn("ml-2", sidebarCollapsed && "sr-only")}>
                {theme === "dark" ? "Modo claro" : "Modo oscuro"}
              </span>
            </Button>
            <Button
              size={sidebarCollapsed ? "icon" : "sm"}
              variant="outline"
              className={cn(
                "text-destructive hover:bg-destructive/10 hover:text-destructive",
                !sidebarCollapsed && "justify-start",
              )}
              title="Cerrar sesión"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              <span className={cn("ml-2", sidebarCollapsed && "sr-only")}>Cerrar sesión</span>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">SysIntranet</p>
              <p className="truncate text-xs text-muted-foreground">
                {profile?.full_name || user?.email}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              <span className="ml-2">Cerrar sesión</span>
            </Button>
          </div>
          <nav className="flex flex-wrap items-center gap-2 px-3 pb-2">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  pathname.startsWith(item.to)
                    ? "border-primary/25 bg-primary/12 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-[1600px] flex-1 p-4 sm:p-6 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rise-in">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[1.375rem] font-semibold leading-tight tracking-tight sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
