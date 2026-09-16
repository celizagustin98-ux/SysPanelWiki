import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acceso | SysIntranet" },
      {
        name: "description",
        content: "Ingreso con usuario y contraseña a SysIntranet | Área Wiki.",
      },
      { property: "og:title", content: "SysIntranet | Área Wiki" },
      { property: "og:description", content: "Ingreso seguro a la intranet técnica." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { session, signIn, signUp, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("login");
  const [olvide, setOlvide] = useState(false);
  const [correoReset, setCorreoReset] = useState("");

  useEffect(() => {
    if (session) navigate({ to: "/dashboard", replace: true });
  }, [session, navigate]);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await signIn(String(fd.get("username")), String(fd.get("password")));
    setBusy(false);
    if (error) toast.error(error);
    else toast.success("Sesión iniciada");
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    const { error } = await signUp(
      String(fd.get("full_name")),
      String(fd.get("username")),
      String(fd.get("email")),
      String(fd.get("password")),
    );
    setBusy(false);
    if (error) {
      toast.error(error);
      return;
    }
    form.reset();
    toast.success("Cuenta creada");
    navigate({ to: "/dashboard", replace: true });
  };

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await resetPassword(correoReset);
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success("Si el correo existe, te enviamos un enlace para restablecer la contraseña.");
      setOlvide(false);
    }
  };

  return (
    <div className="relative grid min-h-screen bg-background lg:grid-cols-[minmax(280px,0.9fr)_1.1fr]">
      <div className="relative hidden overflow-hidden bg-[oklch(0.16_0.01_260)] text-white lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md">
            <span className="text-sm font-bold">SI</span>
          </div>
          <div>
            <p className="text-[15px] font-semibold tracking-tight">SysIntranet</p>
            <p className="text-[12px] text-white/40">Área de sistemas</p>
          </div>
        </div>
        <div className="max-w-sm space-y-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Panel operativo</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight xl:text-3xl">
            Todo el día a día del equipo técnico
          </h1>
          <p className="text-sm leading-relaxed text-white/50">
            Tickets, instructivos, tóners, guardias e inventario en un solo lugar.
          </p>
        </div>
        <p className="text-[11px] text-white/25">SysIntranet · uso interno</p>
      </div>

      <div className="grid place-items-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-[400px] rise-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground">
              <span className="text-xs font-bold">SI</span>
            </div>
            <div>
              <p className="text-sm font-semibold">SysIntranet</p>
              <p className="text-[11px] text-muted-foreground">Área de sistemas</p>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              {olvide ? "Restablecer acceso" : "Bienvenido"}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {olvide
                ? "Te enviamos un enlace al correo de la cuenta."
                : "Ingresá con tu usuario del panel."}
            </p>
          </div>

          <div className="panel p-6 sm:p-7">
            {olvide ? (
              <form className="space-y-4" onSubmit={handleReset}>
                <div className="space-y-1.5">
                  <Label htmlFor="reset_email">Correo</Label>
                  <Input
                    id="reset_email"
                    type="email"
                    required
                    autoComplete="email"
                    value={correoReset}
                    onChange={(ev) => setCorreoReset(ev.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
                <Button type="submit" className="h-10 w-full rounded-xl" disabled={busy}>
                  Enviar enlace
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setOlvide(false)}
                >
                  Volver al ingreso
                </button>
              </form>
            ) : (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mb-5 grid h-10 w-full grid-cols-2 rounded-xl p-1">
                  <TabsTrigger value="login" className="rounded-lg text-xs">
                    Ingresar
                  </TabsTrigger>
                  <TabsTrigger value="signup" className="rounded-lg text-xs">
                    Registrarme
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-1.5">
                      <Label htmlFor="username">Usuario</Label>
                      <Input id="username" name="username" required autoComplete="username" className="h-10 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password">Contraseña</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setOlvide(true)}
                    >
                      ¿Olvidaste la contraseña?
                    </button>
                    <Button type="submit" className="h-10 w-full rounded-xl" disabled={busy}>
                      Entrar
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form className="space-y-3.5" onSubmit={handleSignup}>
                    <div className="space-y-1.5">
                      <Label htmlFor="full_name">Nombre y apellido</Label>
                      <Input id="full_name" name="full_name" required autoComplete="name" className="h-10 rounded-xl" />
                    </div>
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
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email2">Correo</Label>
                      <Input id="email2" name="email" type="email" required autoComplete="email" className="h-10 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="password2">Contraseña</Label>
                      <Input id="password2" name="password" type="password" minLength={8} required className="h-10 rounded-xl" />
                    </div>
                    <Button type="submit" className="h-10 w-full rounded-xl" disabled={busy}>
                      Crear cuenta
                    </Button>
                    <p className="text-[11px] leading-relaxed text-muted-foreground">
                      El primer usuario es administrador. El resto entra como consulta.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
