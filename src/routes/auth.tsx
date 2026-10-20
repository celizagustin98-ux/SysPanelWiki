import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Boxes,
  CalendarClock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Printer,
  ShieldCheck,
  Ticket,
  UserRound,
} from "lucide-react";
import { BrandLockup } from "@/components/brand/BrandMark";
import { marcarBienvenida } from "@/components/Bienvenida";
import { marcarQrDesbloqueado, olvidarQrDesbloqueo } from "@/lib/qr";
import { Button } from "@/components/ui/button";
import { InputClave } from "@/components/InputClave";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { useMarca } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => (typeof s.redirect === "string" ? { redirect: s.redirect } : {}),
  head: () => ({
    meta: [
      { title: "Acceso · Nodara" },
      { name: "description", content: "Acceso al centro de operaciones del Área de Sistemas." },
    ],
  }),
  component: AuthPage,
});

const MODULOS = [
  { icon: Ticket, label: "Tickets" },
  { icon: Boxes, label: "Inventario" },
  { icon: Printer, label: "Tóners" },
  { icon: CalendarClock, label: "Guardias" },
  { icon: BookOpen, label: "Instructivos" },
  { icon: KeyRound, label: "Credenciales" },
];

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function AuthPage() {
  const { session, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">("login");

  const health = useQuery({
    queryKey: ["system-health"],
    queryFn: () => api.system.health(),
    refetchInterval: 30_000,
    retry: false,
  });

  useEffect(() => {
    if (!session) return;
    // Solo rutas internas: evita redirecciones a otros sitios.
    const destino = redirect && redirect.startsWith("/") && !redirect.startsWith("//") && !redirect.startsWith("/auth") ? redirect : "/dashboard";
    navigate({ href: destino, replace: true });
  }, [session, navigate, redirect]);

  const setupRequired = !!health.data?.setupRequired;
  const signupEnabled = !!health.data?.signupEnabled;

  useEffect(() => {
    if (setupRequired) setMode("signup");
  }, [setupRequired]);

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(420px,1fr)_minmax(460px,0.9fr)]">
      <ConsolePanel health={health.data} healthError={health.isError} />

      <main className="relative grid place-items-center px-5 py-12 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-grid opacity-70 [mask-image:radial-gradient(ellipse_at_center,black,transparent_72%)]" />
        <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)]" />
        <div className="relative w-full max-w-[380px] rise-in">
          <div className="mb-10 lg:hidden">
            <BrandLockup tone="default" />
          </div>

          {mode === "login" ? (
            <LoginForm onSubmit={signIn} />
          ) : (
            <SignupForm setupRequired={setupRequired} onSubmit={signUp} />
          )}

          {!setupRequired && signupEnabled && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {mode === "login" ? "¿No tenés cuenta? " : "¿Ya tenés cuenta? "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => setMode(mode === "login" ? "signup" : "login")}
              >
                {mode === "login" ? "Crear cuenta" : "Ingresar"}
              </button>
            </p>
          )}

          <p className="mt-10 flex items-center justify-center gap-2 text-[11px] text-muted-foreground/80">
            <ShieldCheck className="size-3.5" />
            Acceso de uso interno · cada ingreso queda registrado
          </p>
        </div>
      </main>
    </div>
  );
}

function ConsolePanel({
  health,
  healthError,
}: {
  health?: Awaited<ReturnType<typeof api.system.health>>;
  healthError: boolean;
}) {
  const now = useClock();
  const marca = useMarca();
  const online = !!health?.ok && !healthError;

  return (
    <aside className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-14">
      <div className="pointer-events-none absolute inset-0 bg-grid [--grid-line:oklch(1_0_0/4.5%)]" />
      <div className="pointer-events-none absolute -left-1/4 -top-1/4 size-[70%] rounded-full bg-[radial-gradient(circle,oklch(0.78_0.12_205/0.22),transparent_65%)] blur-2xl [animation:drift_18s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -bottom-1/3 -right-1/4 size-[65%] rounded-full bg-[radial-gradient(circle,oklch(0.6_0.13_250/0.2),transparent_65%)] blur-2xl [animation:drift_22s_ease-in-out_infinite_reverse]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-transparent via-[oklch(0.78_0.12_205/0.07)] to-transparent [animation:scan_7s_linear_infinite]" />

      <div className="relative">
        <BrandLockup />
      </div>

      <div className="relative max-w-lg space-y-8">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-sidebar-primary">
            Centro de operaciones
          </p>
          <h1 className="text-[2rem] font-semibold leading-[1.15] tracking-tight text-white xl:text-[2.35rem]">
            Soporte, infraestructura y gestión técnica en un solo lugar.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-sidebar-foreground/55">
            Tickets, inventario, tóners, guardias e instructivos del área, con trazabilidad completa de cada cambio.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm">
          <div className="flex items-end justify-between gap-4 border-b border-white/8 pb-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/40">
                Hora local
              </p>
              <p className="num mt-1 text-3xl font-medium text-white" suppressHydrationWarning>
                {now ? now.toLocaleTimeString("es-AR", { hour12: false }) : "--:--:--"}
              </p>
            </div>
            <p className="text-right text-xs text-sidebar-foreground/50 first-letter:uppercase" suppressHydrationWarning>
              {now?.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <dl className="mt-4 grid gap-2.5 text-[13px]">
            <StatusRow
              label="Servidor de aplicación"
              tone={health ? (online ? "ok" : "crit") : healthError ? "crit" : "idle"}
              value={health ? (online ? "En línea" : "Sin respuesta") : healthError ? "Sin respuesta" : "Verificando…"}
            />
            <StatusRow
              label="Base de datos"
              tone={health ? (health.database === false ? "crit" : "ok") : "idle"}
              value={health ? (health.database === false ? "Sin conexión" : "Conectada") : "—"}
            />
            <StatusRow
              label="Mantenimiento"
              tone={health?.maintenance ? "warn" : health ? "ok" : "idle"}
              value={health ? (health.maintenance ? "En curso" : "Sin tareas programadas") : "—"}
            />
            <StatusRow label="Versión" tone="info" value={health?.version ?? "—"} mono />
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 stagger">
          {MODULOS.map((m) => (
            <span
              key={m.label}
              className="inline-flex items-center gap-1.5 rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1 text-xs text-sidebar-foreground/65"
            >
              <m.icon className="size-3.5 text-sidebar-primary" />
              {m.label}
            </span>
          ))}
        </div>
      </div>

      <p className="relative font-mono text-[10.5px] uppercase tracking-[0.14em] text-sidebar-foreground/30">
        {marca.nombre} · {marca.area}
      </p>
    </aside>
  );
}

function StatusRow({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: ReactNode;
  tone: "ok" | "warn" | "crit" | "info" | "idle";
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2.5 text-sidebar-foreground/60">
        <span className="led" data-tone={tone} data-pulse={tone === "ok" || tone === "crit"} />
        {label}
      </dt>
      <dd className={cn("text-sidebar-foreground/90", mono && "num text-xs")}>{value}</dd>
    </div>
  );
}

function LoginForm({
  onSubmit,
}: {
  onSubmit: (username: string, password: string) => Promise<{ error: string | null }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shaking, setShaking] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [forgot, setForgot] = useState(false);

  const handle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    // Se marca antes de ingresar: la app se monta apenas hay sesión y la animación lee la marca al montarse.
    marcarBienvenida();
    // Recién ingresó con su contraseña: no se le vuelve a pedir al escanear un QR.
    marcarQrDesbloqueado();
    const { error: err } = await onSubmit(String(fd.get("username")), String(fd.get("password")));
    setBusy(false);
    if (err) {
      marcarBienvenida(false);
      olvidarQrDesbloqueo();
      setError(err);
      setShaking(true);
    }
  };

  return (
    <div>
      <p className="eyebrow text-primary">Acceso seguro</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Ingresá a tu cuenta</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">Usá tu usuario o correo del área.</p>

      <form
        className={cn("mt-8 space-y-4", shaking && "shake")}
        onAnimationEnd={(e) => e.target === e.currentTarget && setShaking(false)}
        onSubmit={handle}
        noValidate
      >
        <div className="space-y-1.5">
          <Label htmlFor="username">Usuario</Label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="username"
              name="username"
              required
              autoFocus
              autoComplete="username"
              placeholder="usuario o correo"
              aria-invalid={!!error}
              className="h-11 pl-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Contraseña</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              name="password"
              type={showPass ? "text" : "password"}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              aria-invalid={!!error}
              className="h-11 pl-9 pr-10"
              onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {capsLock && (
            <p className="flex items-center gap-1.5 text-xs text-[color-mix(in_oklab,var(--warn),var(--foreground)_25%)]">
              <AlertTriangle className="size-3.5" /> Bloq Mayús está activado
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-[13px] text-destructive rise-in"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}

        <Button type="submit" className="group h-11 w-full text-[13px]" disabled={busy}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Verificando…
            </>
          ) : (
            <>
              Ingresar
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-5">
        <button
          type="button"
          className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={() => setForgot((v) => !v)}
        >
          ¿Olvidaste tu contraseña?
        </button>
        {forgot && (
          <p className="mt-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground rise-in">
            Pedile a un administrador del área que la restablezca desde{" "}
            <span className="font-medium text-foreground">Configuración → Usuarios</span>. Por seguridad, al
            cambiarla se cierran tus otras sesiones.
          </p>
        )}
      </div>
    </div>
  );
}

function SignupForm({
  setupRequired,
  onSubmit,
}: {
  setupRequired: boolean;
  onSubmit: (fullName: string, username: string, email: string, password: string) => Promise<{ error: string | null }>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    marcarBienvenida();
    const { error: err } = await onSubmit(
      String(fd.get("full_name")),
      String(fd.get("username")),
      String(fd.get("email")),
      String(fd.get("password")),
    );
    setBusy(false);
    if (err) {
      marcarBienvenida(false);
      setError(err);
    }
  };

  return (
    <div>
      <p className="eyebrow text-primary">{setupRequired ? "Primera instalación" : "Nueva cuenta"}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        {setupRequired ? "Creá la cuenta de administrador" : "Crear cuenta"}
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        {setupRequired
          ? "Todavía no hay usuarios. Esta cuenta tendrá control total del sistema."
          : "Vas a entrar con rol de consulta hasta que un administrador te asigne otro."}
      </p>
      <form className="mt-8 space-y-3.5" onSubmit={handle}>
        <div className="space-y-1.5">
          <Label htmlFor="full_name">Nombre y apellido</Label>
          <Input id="full_name" name="full_name" required autoComplete="name" className="h-10" />
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="username2">Usuario</Label>
            <Input
              id="username2"
              name="username"
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9._\-]{3,32}"
              autoComplete="username"
              className="h-10 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password2">Contraseña</Label>
            <InputClave
              id="password2"
              name="password"
              minLength={10}
              required
              autoComplete="new-password"
              className="h-10"
            />
            <p className="text-[11px] text-muted-foreground">10 o más caracteres, con letras y números.</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email2">Correo</Label>
          <Input id="email2" name="email" type="email" required autoComplete="email" className="h-10" />
        </div>
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2.5 text-[13px] text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {error}
          </div>
        )}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {setupRequired ? "Crear administrador" : "Crear cuenta"}
        </Button>
      </form>
    </div>
  );
}
