import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
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

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  modulo: Modulo | null;
  adminOnly: boolean;
  group: "principal" | "operacion" | "admin";
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, modulo: null, adminOnly: false, group: "principal" },
  { to: "/oficina", label: "Oficina", icon: BriefcaseBusiness, modulo: "oficina", adminOnly: false, group: "principal" },
  { to: "/instructivos", label: "Instructivos", icon: BookOpen, modulo: "instructivos", adminOnly: false, group: "operacion" },
  { to: "/guardias", label: "Guardias", icon: CalendarClock, modulo: "guardias", adminOnly: false, group: "operacion" },
  { to: "/inventario", label: "Inventario", icon: Boxes, modulo: "inventario", adminOnly: false, group: "operacion" },
  { to: "/toners", label: "Tóners", icon: Printer, modulo: "toners", adminOnly: false, group: "operacion" },
  { to: "/tareas", label: "Tickets", icon: Ticket, modulo: "tareas", adminOnly: false, group: "operacion" },
  { to: "/credenciales", label: "Credenciales", icon: ShieldCheck, modulo: "credenciales", adminOnly: false, group: "operacion" },
  { to: "/auditoria", label: "Auditoría", icon: History, modulo: null, adminOnly: true, group: "admin" },
  { to: "/configuracion", label: "Configuración", icon: Settings2, modulo: null, adminOnly: true, group: "admin" },
];

const GROUP_LABEL: Record<NavItem["group"], string> = {
  principal: "Inicio",
  operacion: "Operación",
  admin: "Administración",
};

function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/25",
        className,
      )}
    >
      <span className="text-[11px] font-bold tracking-tight">SI</span>
    </div>
  );
}

export function AppShell() {
  const { profile, role, signOut, user, isAdmin, can } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const nav = NAV.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.modulo || can(item.modulo, "view")),
  );

  const groups = (["principal", "operacion", "admin"] as const)
    .map((group) => ({ group, items: nav.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);

  const handleSignOut = async () => {
    await signOut();
    await navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
          sidebarCollapsed ? "w-[72px]" : "w-[15.5rem]",
        )}
      >
        <div className="flex items-center gap-2.5 px-3 pb-4 pt-4">
          <BrandMark />
          <div className={cn("min-w-0", sidebarCollapsed && "hidden")}>
            <p className="text-sm font-semibold leading-tight tracking-tight">SysIntranet</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
              Panel operativo
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "ml-auto size-8 text-muted-foreground hover:text-foreground",
              sidebarCollapsed && "mx-auto",
            )}
            title={sidebarCollapsed ? "Mostrar menú" : "Contraer menú"}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-2 pb-3">
          {groups.map(({ group, items }) => (
            <div key={group} className="flex flex-col gap-0.5">
              <p
                className={cn(
                  "mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70",
                  sidebarCollapsed && "sr-only",
                )}
              >
                {GROUP_LABEL[group]}
              </p>
              {items.map((item) => {
                const active = pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors duration-150",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                      sidebarCollapsed && "justify-center px-2",
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                    )}
                    <item.icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-muted-foreground",
                      )}
                    />
                    <span className={cn(sidebarCollapsed && "sr-only")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          className={cn(
            "mx-2 mb-3 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/30 p-2.5",
            sidebarCollapsed && "px-1.5",
          )}
        >
          <div className={cn("mb-2 px-0.5", sidebarCollapsed && "hidden")}>
            <p className="truncate text-[13px] font-medium tracking-tight">
              {profile?.full_name || user?.email}
            </p>
            <Badge variant="secondary" className="mt-1.5 h-5 px-1.5 text-[10px] capitalize">
              {role ?? "—"}
            </Badge>
          </div>
          <div className="grid gap-1">
            <Button
              size={sidebarCollapsed ? "icon" : "sm"}
              variant="ghost"
              className={cn("h-8", !sidebarCollapsed && "justify-start px-2")}
              title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
              onClick={toggle}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className={cn("ml-2 text-[13px]", sidebarCollapsed && "sr-only")}>
                {theme === "dark" ? "Modo claro" : "Modo oscuro"}
              </span>
            </Button>
            <Button
              size={sidebarCollapsed ? "icon" : "sm"}
              variant="ghost"
              className={cn(
                "h-8 text-destructive hover:bg-destructive/10 hover:text-destructive",
                !sidebarCollapsed && "justify-start px-2",
              )}
              title="Cerrar sesión"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              <span className={cn("ml-2 text-[13px]", sidebarCollapsed && "sr-only")}>
                Cerrar sesión
              </span>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-background/90 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark className="size-8 rounded-lg" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-tight">SysIntranet</p>
                <p className="truncate text-xs text-muted-foreground">
                  {profile?.full_name || user?.email}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="icon" variant="ghost" className="size-8" onClick={toggle} title="Tema">
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-destructive hover:bg-destructive/10"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  pathname.startsWith(item.to)
                    ? "bg-primary/15 text-primary"
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 rise-in sm:mb-6">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[1.65rem] font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {right ? <div className="responsive-actions">{right}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state panel">
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
