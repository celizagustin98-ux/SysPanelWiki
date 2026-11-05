import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  ShieldCheck,
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

  const online = !!health.data?.ok && !health.isError;

  return (
    <div className="relative flex min-h-[var(--av)] flex-col overflow-hidden bg-background">
      {/* Fondo: grilla suave y dos luces que se mueven despacio. */}
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="pointer-events-none absolute -left-40 -top-40 size-[34rem] rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_65%)] blur-2xl [animation:drift_20s_ease-in-out_infinite]" />
      <div className="pointer-events-none absolute -bottom-48 -right-40 size-[30rem] rounded-full bg-[radial-gradient(circle,oklch(0.6_0.13_250/0.18),transparent_65%)] blur-2xl [animation:drift_24s_ease-in-out_infinite_reverse]" />

      <header className="relative flex items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <BrandLockup tone="default" />
        <span
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur"
          title={health.data?.version ?? undefined}
        >
          <span className="led" data-tone={health.data ? (online ? "ok" : "crit") : health.isError ? "crit" : undefined} data-pulse={online} />
          {health.data ? (online ? (health.data.maintenance ? "En mantenimiento" : "En línea") : "Sin respuesta") : health.isError ? "Sin respuesta" : "Conectando…"}
        </span>
      </header>

      <main className="relative mx-auto grid w-full max-w-5xl flex-1 items-center gap-10 px-5 pb-10 sm:px-8 lg:grid-cols-[1.1fr_minmax(0,400px)] lg:gap-16">
        <Reloj />

        <div className="w-full rounded-2xl border border-border bg-card/85 p-6 shadow-xl backdrop-blur-md rise-in sm:p-8 lg:justify-self-end">
          {mode === "login" ? <LoginForm onSubmit={signIn} /> : <SignupForm setupRequired={setupRequired} onSubmit={signUp} />}

          {!setupRequired && signupEnabled && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {mode === "login" ? "¿No tenés cuenta? " : "¿Ya tenés cuenta? "}
              <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
                {mode === "login" ? "Crear cuenta" : "Ingresar"}
              </button>
            </p>
          )}
        </div>
      </main>

      <footer className="relative flex items-center justify-center gap-2 px-5 pb-5 text-[11px] text-muted-foreground/80">
        <ShieldCheck className="size-3.5" />
        Uso interno · cada ingreso queda registrado
      </footer>
    </div>
  );
}

/** Hora y fecha en vivo, con saludo según el momento del día. */
function Reloj() {
  const now = useClock();
  const h = now?.getHours() ?? 12;
  const saludo = h < 6 ? "Buenas noches" : h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const ss = now ? String(now.getSeconds()).padStart(2, "0") : "--";
  return (
    <section className="text-center lg:text-left" suppressHydrationWarning>
      <p className="eyebrow text-primary">{saludo}</p>
      <p className="num mt-2 flex items-baseline justify-center font-semibold leading-none tracking-tight text-foreground lg:justify-start">
        <span className="text-[4.5rem] sm:text-[6rem] xl:text-[7.5rem]">{hh}</span>
        <span className="reloj-dos-puntos mx-1 text-[4rem] text-primary sm:text-[5.5rem] xl:text-[7rem]">:</span>
        <span className="text-[4.5rem] sm:text-[6rem] xl:text-[7.5rem]">{mm}</span>
        <span key={ss} className="ml-3 w-[2ch] text-2xl text-muted-foreground animate-in fade-in slide-in-from-bottom-1 sm:text-3xl">
          {ss}
        </span>
      </p>
      <p className="mt-3 text-base text-muted-foreground first-letter:uppercase sm:text-lg">
        {now?.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) ?? "\u00a0"}
      </p>
    </section>
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
      <h2 className="text-xl font-semibold tracking-tight">Ingresá</h2>
      <p className="mt-1 text-sm text-muted-foreground">Con tu usuario o correo del área.</p>

      <form
        className={cn("mt-6 space-y-4", shaking && "shake")}
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
