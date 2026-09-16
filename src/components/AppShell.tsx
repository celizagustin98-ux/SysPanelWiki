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
  admin: "Admin",
};

function BrandMark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <span className="text-[11px] font-bold tracking-tight">SI</span>
      </div>
      <div className={cn("min-w-0", collapsed && "hidden")}>
        <p className="truncate text-[14px] font-semibold tracking-tight text-sidebar-foreground">SysIntranet</p>
        <p className="truncate text-[11px] text-sidebar-foreground/45">Área sistemas</p>
      </div>
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

  const initials = (profile?.full_name || user?.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:flex",
          sidebarCollapsed ? "w-[72px]" : "w-[240px]",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 pb-2 pt-5", sidebarCollapsed && "justify-center px-2")}>
          <BrandMark collapsed={sidebarCollapsed} />
          {!sidebarCollapsed && (
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto size-8 rounded-full text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              title="Contraer"
              onClick={() => setSidebarCollapsed(true)}
            >
              <PanelLeftClose className="size-4" />
            </Button>
          )}
          {sidebarCollapsed && (
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-full text-sidebar-foreground/40 hover:bg-sidebar-accent"
              title="Expandir"
              onClick={() => setSidebarCollapsed(false)}
            >
              <PanelLeftOpen className="size-4" />
            </Button>
          )}
        </div>

        <nav className="mt-4 flex flex-1 flex-col gap-5 overflow-y-auto px-3 pb-3">
          {groups.map(({ group, items }) => (
            <div key={group} className="flex flex-col gap-1">
              <p
                className={cn(
                  "mb-1 px-3 text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/30",
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
                      "ops-nav-item",
                      active
                        ? "bg-primary/20 text-primary"
                        : "text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      sidebarCollapsed && "justify-center px-2",
                    )}
                    title={sidebarCollapsed ? item.label : undefined}
                  >
                    <item.icon className={cn("size-[18px] shrink-0", active && "text-primary")} />
                    <span className={cn(sidebarCollapsed && "sr-only")}>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={cn("mt-auto border-t border-sidebar-border/80 p-3", sidebarCollapsed && "px-2")}>
          <div
            className={cn(
              "mb-2 flex items-center gap-2.5 rounded-2xl bg-sidebar-accent/50 px-2.5 py-2",
              sidebarCollapsed && "justify-center px-1",
            )}
          >
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">
              {initials || "?"}
            </div>
            <div className={cn("min-w-0 flex-1", sidebarCollapsed && "hidden")}>
              <p className="truncate text-[13px] font-medium">{profile?.full_name || user?.email}</p>
              <p className="truncate text-[11px] capitalize text-sidebar-foreground/40">{role ?? "—"}</p>
            </div>
          </div>
          <div className={cn("grid gap-0.5", sidebarCollapsed && "justify-items-center")}>
            <Button
              size={sidebarCollapsed ? "icon" : "sm"}
              variant="ghost"
              className={cn(
                "h-8 rounded-xl text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                !sidebarCollapsed && "w-full justify-start px-2.5 text-[12px]",
              )}
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
              variant="ghost"
              className={cn(
                "h-8 rounded-xl text-red-400/70 hover:bg-red-500/10 hover:text-red-300",
                !sidebarCollapsed && "w-full justify-start px-2.5 text-[12px]",
              )}
              title="Cerrar sesión"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              <span className={cn("ml-2", sidebarCollapsed && "sr-only")}>Salir</span>
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border/60 bg-card/70 backdrop-blur-md md:hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
                <span className="text-[10px] font-bold">SI</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">SysIntranet</p>
                <p className="truncate text-[11px] text-muted-foreground">{profile?.full_name || user?.email}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="icon" variant="ghost" className="size-8 rounded-full" onClick={toggle}>
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button size="icon" variant="ghost" className="size-8 rounded-full text-destructive" onClick={handleSignOut}>
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
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 rise-in">
      <div className="min-w-0 space-y-1">
        <h1 className="text-[1.55rem] font-semibold tracking-tight sm:text-[1.7rem]">{title}</h1>
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
