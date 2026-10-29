import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Boxes,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  History,
  LayoutDashboard,
  LogOut,
  UserRound,
  Moon,
  Pin,
  PinOff,
  Printer,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Sun,
  Ticket,
} from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/brand/BrandMark";
import { Button } from "@/components/ui/button";
import { Notificaciones } from "@/components/Notificaciones";
import { Bienvenida } from "@/components/Bienvenida";
import { EscanerQR } from "@/components/activos/EscanerQR";
import { useRoles } from "@/lib/roles";
import { leerQr, marcarQrDesbloqueado } from "@/lib/qr";
import { toast } from "sonner";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api/client";
import { getMarca, useMarca } from "@/lib/brand";
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
  hint: string;
};

export const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, modulo: null, adminOnly: false, group: "principal", hint: "Resumen operativo" },
  { to: "/oficina", label: "Oficina", icon: BriefcaseBusiness, modulo: "oficina", adminOnly: false, group: "principal", hint: "Internos y teléfonos" },
  { to: "/tareas", label: "Tickets", icon: Ticket, modulo: "tareas", adminOnly: false, group: "operacion", hint: "Mesa de ayuda" },
  { to: "/inventario", label: "Activos IT", icon: Boxes, modulo: "inventario", adminOnly: false, group: "operacion", hint: "Equipos, QR y reparaciones" },
  { to: "/toners", label: "Tóners", icon: Printer, modulo: "toners", adminOnly: false, group: "operacion", hint: "Stock y pedidos" },
  { to: "/guardias", label: "Guardias", icon: CalendarClock, modulo: "guardias", adminOnly: false, group: "operacion", hint: "Turnos y cobertura" },
  { to: "/instructivos", label: "Instructivos", icon: BookOpen, modulo: "instructivos", adminOnly: false, group: "operacion", hint: "Procedimientos" },
  { to: "/credenciales", label: "Credenciales", icon: ShieldCheck, modulo: "credenciales", adminOnly: false, group: "operacion", hint: "Accesos cifrados" },
  { to: "/auditoria", label: "Auditoría", icon: History, modulo: "auditoria", adminOnly: false, group: "admin", hint: "Registro de cambios" },
  { to: "/configuracion", label: "Configuración", icon: Settings2, modulo: null, adminOnly: true, group: "admin", hint: "Usuarios, roles y sistema" },
];

const GROUP_LABEL: Record<NavItem["group"], string> = {
  principal: "General",
  operacion: "Operación",
  admin: "Administración",
};

const ROLE_LABEL: Record<string, string> = {
  administrador: "Administrador",
  tecnico: "Técnico",
  consulta: "Consulta",
};

// "1" = menú desacoplado: queda como barra de íconos y se despliega encima al pasar el mouse.
const COLLAPSE_KEY = "syswiki.sidebar.collapsed";

const sinAcentos = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

function useVisibleNav() {
  const { isAdmin, can } = useAuth();
  return NAV.filter((item) => (!item.adminOnly || isAdmin) && (!item.modulo || can(item.modulo, "view")));
}

function initialsOf(text: string) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function useServerStatus() {
  return useQuery({
    queryKey: ["system-health"],
    queryFn: () => api.system.health(),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

export function AppShell() {
  const { profile, role, signOut, user } = useAuth();
  const marca = useMarca();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nav = useVisibleNav();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [asomado, setAsomado] = useState(false);
  const asomarTimer = useRef<number | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [escaner, setEscaner] = useState(false);
  const contenidoRef = useRef<HTMLDivElement>(null);
  const { data: roles = [] } = useRoles();
  const alEscanear = (texto: string) => {
    setEscaner(false);
    const leido = leerQr(texto);
    if (!leido) return toast.error(`Ese QR no es una etiqueta de ${getMarca().nombre}`);
    // Escaneado desde adentro del sistema: la sesión ya está verificada.
    marcarQrDesbloqueado();
    if (leido.codigo) void navigate({ to: "/q/$codigo", params: { codigo: leido.codigo } });
    else void navigate({ to: "/inventario", search: { item: leido.id } });
  };
  const status = useServerStatus();

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* almacenamiento no disponible */
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((v) => !v);
        setAsomado(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = (["principal", "operacion", "admin"] as const)
    .map((group) => ({ group, items: nav.filter((item) => item.group === group) }))
    .filter((entry) => entry.items.length > 0);

  const current = NAV.find((item) => pathname.startsWith(item.to));
  const displayName = profile?.full_name || user?.email || "";
  const initials = initialsOf(displayName) || "?";

  const handleSignOut = async () => {
    await signOut();
    await navigate({ to: "/auth", replace: true });
  };

  const online = status.data?.ok && status.data.database !== false;

  // Desacoplado: se despliega sobre el contenido con una pequeña demora (evita abrirlo al cruzar con el mouse).
  const mini = collapsed && !asomado;
  const asomar = (v: boolean) => {
    window.clearTimeout(asomarTimer.current);
    if (!collapsed) return;
    if (v) asomarTimer.current = window.setTimeout(() => setAsomado(true), 140);
    else setAsomado(false);
  };
  useEffect(() => () => window.clearTimeout(asomarTimer.current), []);

  // Al cambiar de módulo el contenido vuelve arriba (el menú queda fijo).
  useEffect(() => {
    contenidoRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-[var(--av)] w-full max-w-[100vw] overflow-hidden bg-background">
        {/* El hueco reserva el ancho del menú acoplado; desacoplado reserva solo la barra de íconos. */}
        <div
          className={cn(
            "relative hidden h-[var(--av)] shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] md:block",
            collapsed ? "w-[68px]" : "w-[248px]",
          )}
        >
          <aside
            onMouseEnter={() => asomar(true)}
            onMouseLeave={() => asomar(false)}
            onFocus={() => collapsed && setAsomado(true)}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setAsomado(false)}
            className={cn(
              "absolute inset-y-0 left-0 z-40 flex h-[var(--av)] flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              mini ? "w-[68px]" : "w-[248px]",
              collapsed && asomado && "shadow-lg",
            )}
          >
            <div className={cn("flex h-14 shrink-0 items-center gap-2 px-4", mini && "justify-center px-0")}>
              {mini ? <BrandMark /> : <BrandLockup />}
            </div>

            <nav
              className={cn(
                "mt-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                mini && "px-2.5",
              )}
            >
              {groups.map(({ group, items }) => (
                <div key={group} className="flex flex-col gap-0.5">
                  <p
                    className={cn(
                      "mb-1 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/40",
                      mini && "sr-only",
                    )}
                  >
                    {GROUP_LABEL[group]}
                  </p>
                  {items.map((item) => {
                    const active = pathname.startsWith(item.to);
                    return (
                      <SidebarTooltip key={item.to} label={item.label} enabled={mini}>
                        <Link
                          to={item.to}
                          data-active={active}
                          className={cn(
                            "ops-nav-item",
                            active
                              ? "bg-sidebar-accent text-white"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                            mini && "justify-center px-0",
                          )}
                        >
                          <item.icon
                            className={cn("size-[17px] shrink-0", active ? "text-sidebar-primary" : "text-current")}
                          />
                          <span className={cn("truncate", mini && "sr-only")}>{item.label}</span>
                        </Link>
                      </SidebarTooltip>
                    );
                  })}
                </div>
              ))}
            </nav>

            <div className={cn("shrink-0 border-t border-sidebar-border p-2.5", mini && "px-2")}>
              <div
                className={cn("flex items-center gap-2.5 rounded-lg bg-white/[0.04] p-2", mini && "flex-col bg-transparent p-0")}
                title={online ? `En línea${status.data?.version ? ` · ${status.data.version}` : ""}` : "Sin conexión con el servidor"}
              >
                <Link
                  to="/perfil"
                  title="Mi perfil"
                  aria-label="Mi perfil"
                  className="relative grid size-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-sidebar-primary/35 to-sidebar-primary/10 font-mono text-[11px] font-semibold text-sidebar-primary ring-1 ring-sidebar-primary/25 transition hover:ring-sidebar-primary/60"
                >
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="size-full rounded-md object-cover" />
                  ) : (
                    initials
                  )}
                  <span
                    className="led absolute -bottom-0.5 -right-0.5 ring-2 ring-sidebar"
                    data-tone={status.isLoading ? undefined : online ? "ok" : "crit"}
                    data-pulse={!!online}
                  />
                </Link>
                {!mini && (
                  <Link to="/perfil" className="min-w-0 flex-1 rounded-sm hover:[&>p:first-child]:text-white">
                    <p className="truncate text-[13px] font-medium text-sidebar-foreground">{displayName}</p>
                    <p className="truncate text-[11px] text-sidebar-foreground/45">
                      {roles.find((r) => r.clave === role)?.nombre ?? ROLE_LABEL[role ?? ""] ?? "—"} · {status.isLoading ? "verificando…" : online ? "en línea" : "sin conexión"}
                    </p>
                  </Link>
                )}
                <div className={cn("flex shrink-0 gap-0.5", mini && "flex-col items-center")}>
                  <SidebarIconButton label={theme === "dark" ? "Modo claro" : "Modo oscuro"} onClick={toggle} icon={theme === "dark" ? <Sun /> : <Moon />} />
                  <SidebarIconButton
                    label={collapsed ? "Acoplar menú (Ctrl B)" : "Desacoplar menú: se abre al pasar el mouse (Ctrl B)"}
                    onClick={() => {
                      setCollapsed((v) => !v);
                      setAsomado(false);
                    }}
                    icon={collapsed ? <Pin /> : <PinOff />}
                  />
                  <SidebarIconButton label="Cerrar sesión" onClick={handleSignOut} icon={<LogOut />} className="hover:bg-red-500/10 hover:text-red-300" />
                </div>
              </div>
            </div>
          </aside>
        </div>

        <div ref={contenidoRef} id="contenido" className="flex h-[var(--av)] min-w-0 max-w-full flex-1 flex-col overflow-y-auto overflow-x-clip">
          {/* Barra superior escritorio */}
          <header className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-border/70 bg-background/80 px-6 backdrop-blur-md md:flex lg:px-8">
            <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Ubicación">
              <span className="text-muted-foreground">{current ? GROUP_LABEL[current.group] : marca.nombre}</span>
              {current && (
                <>
                  <ChevronRight className="size-3.5 text-muted-foreground/50" />
                  <span className="truncate font-medium">{current.label}</span>
                </>
              )}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="flex h-8 w-64 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[12.5px] text-muted-foreground shadow-xs transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <Search className="size-3.5" />
                <span className="flex-1 text-left">Buscar módulo o acción…</span>
                <span className="kbd">Ctrl K</span>
              </button>
              <button
                type="button"
                onClick={() => setEscaner(true)}
                title="Escanear QR de un equipo"
                aria-label="Escanear QR de un equipo"
                className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ScanLine className="size-[18px]" />
              </button>
              <Notificaciones />
              <LiveClock />
            </div>
          </header>

          {/* Encabezado móvil */}
          <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md md:hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2.5">
              <BrandLockup tone="default" subtitle={current?.label} />
              <div className="flex shrink-0 items-center gap-0.5">
                <Button size="icon" variant="ghost" className="size-9" onClick={() => setPaletteOpen(true)} aria-label="Buscar">
                  <Search className="size-4" />
                </Button>
                <Button size="icon" variant="ghost" className="size-9" onClick={() => setEscaner(true)} aria-label="Escanear QR">
                  <ScanLine className="size-4" />
                </Button>
                <Notificaciones />
                <Button size="icon" variant="ghost" className="size-9" onClick={toggle} aria-label="Cambiar tema">
                  {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </Button>
                <Link to="/perfil" aria-label="Mi perfil" className="grid size-9 place-items-center rounded-md hover:bg-muted">
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" className="size-6 rounded-full object-cover" />
                  ) : (
                    <UserRound className="size-4" />
                  )}
                </Link>
                <Button size="icon" variant="ghost" className="size-9 text-destructive" onClick={handleSignOut} aria-label="Salir">
                  <LogOut className="size-4" />
                </Button>
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto overscroll-x-contain px-3 pb-2.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {nav.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    pathname.startsWith(item.to)
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="page-content min-w-0 flex-1 overflow-x-clip px-3 py-3.5 sm:px-4 md:px-6 md:py-5 lg:px-7">
            <div key={pathname} className="rise-in">
              <Outlet />
            </div>
          </main>
        </div>

        <Bienvenida />
        <EscanerQR open={escaner} onOpenChange={setEscaner} onResult={alEscanear} />

        <CommandPalette
          onScan={() => setEscaner(true)}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          nav={nav}
          onToggleTheme={toggle}
          onSignOut={handleSignOut}
          theme={theme}
        />
      </div>
    </TooltipProvider>
  );
}

function SidebarTooltip({ label, enabled, children }: { label: string; enabled: boolean; children: ReactNode }) {
  if (!enabled) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function SidebarIconButton({
  label,
  icon,
  onClick,
  className,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "grid size-8 place-items-center rounded-md text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-4",
            className,
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000 * 15);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="hidden items-baseline gap-2 border-l border-border pl-3 lg:flex">
      <span className="num text-[13px] font-medium">
        {now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false })}
      </span>
      <span className="text-xs text-muted-foreground first-letter:uppercase">
        {now.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}
      </span>
    </div>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  nav,
  onToggleTheme,
  onSignOut,
  theme,
  onScan,
}: {
  onScan: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nav: NavItem[];
  onToggleTheme: () => void;
  onSignOut: () => void;
  theme: string;
}) {
  const navigate = useNavigate();
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Escribí un módulo o una acción…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>
        <CommandGroup heading="Ir a">
          {nav.map((item) => (
            <CommandItem
              key={item.to}
              value={`${item.label} ${item.hint} ${sinAcentos(`${item.label} ${item.hint}`)}`}
              onSelect={() => run(() => navigate({ to: item.to }))}
            >
              <item.icon />
              <span>{item.label}</span>
              <span className="ml-2 truncate text-xs text-muted-foreground">{item.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Acciones">
          <CommandItem value="escanear qr etiqueta equipo activo camara" onSelect={() => run(onScan)}>
            <ScanLine />
            <span>Escanear QR de un equipo</span>
          </CommandItem>
          <CommandItem value="mi perfil foto contraseña datos cuenta" onSelect={() => run(() => navigate({ to: "/perfil" }))}>
            <UserRound />
            <span>Mi perfil</span>
          </CommandItem>
          <CommandItem value="cambiar tema claro oscuro" onSelect={() => run(onToggleTheme)}>
            {theme === "dark" ? <Sun /> : <Moon />}
            <span>{theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}</span>
          </CommandItem>
          <CommandItem value="cerrar sesion salir" onSelect={() => run(onSignOut)}>
            <LogOut />
            <span>Cerrar sesión</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span> navegar <span className="kbd ml-1.5">Enter</span> abrir
        </span>
        <CommandShortcut>Ctrl K</CommandShortcut>
      </div>
    </CommandDialog>
  );
}

export function PageHeader({
  title,
  description,
  action,
  children,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  eyebrow?: string;
}) {
  const right = action ?? children;
  const marca = useMarca();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item = NAV.find((n) => pathname.startsWith(n.to));
  const Icon = item?.icon;
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        {Icon && (
          <div className="hidden size-10 shrink-0 place-items-center rounded-xl border border-border bg-card text-primary shadow-xs sm:grid">
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0 space-y-1">
          <p className="eyebrow">{eyebrow ?? item?.hint ?? marca.nombre}</p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-[1.4rem]">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="responsive-actions w-full sm:w-auto">{right}</div> : null}
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
    <div className="empty-state panel bg-grid">
      {icon ? (
        <div className="mb-3 grid size-11 place-items-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold tracking-tight">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
