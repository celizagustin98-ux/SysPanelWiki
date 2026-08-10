import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  Boxes,
  Building2,
  CalendarClock,
  History,
  KanbanSquare,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Moon,
  Printer,
  Settings2,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth, type Modulo } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, modulo: null, adminOnly: false },
  { to: "/instructivos", label: "Instructivos", icon: BookOpen, modulo: "instructivos", adminOnly: false },
  { to: "/guardias", label: "Guardias", icon: CalendarClock, modulo: "guardias", adminOnly: false },
  { to: "/inventario", label: "Inventario", icon: Boxes, modulo: "inventario", adminOnly: false },
  { to: "/toners", label: "Tóners", icon: Printer, modulo: "toners", adminOnly: false },
  { to: "/tareas", label: "Tareas", icon: KanbanSquare, modulo: "tareas", adminOnly: false },
  { to: "/credenciales", label: "Credenciales", icon: ShieldCheck, modulo: "credenciales", adminOnly: false },
  { to: "/usuarios", label: "Usuarios", icon: Users, modulo: "usuarios", adminOnly: true },
  { to: "/roles", label: "Roles y permisos", icon: KeyRound, modulo: null, adminOnly: true },
  { to: "/auditoria", label: "Auditoría", icon: History, modulo: null, adminOnly: true },
  { to: "/configuracion", label: "Configuración", icon: Settings2, modulo: null, adminOnly: true },
] as const;

export function AppShell() {
  const { profile, role, signOut, user, isAdmin, can } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = NAV.filter(
    (item) =>
      (!item.adminOnly || isAdmin) && (!item.modulo || can(item.modulo as Modulo, "view")),
  );


  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 md:flex">
        <div className="flex items-center gap-2 px-2 pb-5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">SysIntranet</p>
            <p className="text-xs text-muted-foreground">Panel operativo</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-4 rounded-lg border border-sidebar-border p-3">
          <p className="truncate text-sm font-medium">{profile?.full_name || user?.email}</p>
          <Badge variant="secondary" className="mt-1 capitalize">
            {role ?? "—"}
          </Badge>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" className="flex-1" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                await signOut();
                navigate({ to: "/auth", replace: true });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 overflow-x-auto border-b border-border px-3 py-2 md:hidden">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium",
                pathname.startsWith(item.to)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-8">
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
