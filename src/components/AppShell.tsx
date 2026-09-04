import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  History,
  LayoutDashboard,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  Settings2,
  ShieldCheck,
  Sun,
  Ticket,
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
    label: "Directorio",
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
  { to: "/tareas", label: "Tickets", icon: Ticket, modulo: "tareas", adminOnly: false },
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
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 px-3 py-4 backdrop-blur-md transition-[width] duration-200 md:flex",
          sidebarCollapsed ? "w-[76px]" : "w-64",
        )}
      >
        <div className="flex items-center gap-2.5 px-2 pb-5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <Building2 className="size-5" />
          </div>
          <div className={cn("min-w-0", sidebarCollapsed && "hidden")}>
            <p className="text-sm font-semibold leading-tight tracking-tight">SysIntranet</p>
            <p className="text-xs text-muted-foreground">Panel operativo</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className={cn("ml-auto size-8", sidebarCollapsed && "mx-auto")}
            title={sidebarCollapsed ? "Mostrar menú" : "Contraer menú"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary shadow-xs"
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
            "mt-4 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3",
            sidebarCollapsed && "px-2",
          )}
        >
          <div className={cn(sidebarCollapsed && "hidden")}>
            <p className="truncate text-sm font-medium tracking-tight">{profile?.full_name || user?.email}</p>
            <Badge variant="secondary" className="mt-1.5 capitalize">
              {role ?? "—"}
            </Badge>
          </div>
          <div className="mt-3 grid gap-1.5">
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
        <header className="border-b border-border bg-background/80 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
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
          <nav className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150",
                  pathname.startsWith(item.to)
                    ? "bg-accent text-accent-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
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
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
}) {
  const right = action ?? children;
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rise-in sm:mb-8">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.65rem]">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {right}
    </div>
  );
}
