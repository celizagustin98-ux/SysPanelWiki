import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "SysIntranet | Área Wiki" },
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
    else toast.success("Bienvenido");
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
    toast.success("Cuenta creada. Bienvenido.");
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
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md rise-in">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Network className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">SysIntranet | Área Wiki</h1>
            <p className="text-sm text-muted-foreground">Wiki, inventario y operación interna</p>
          </div>
        </div>
        <Card className="panel">
          <CardHeader>
            <CardTitle>{olvide ? "Restablecer contraseña" : "Acceso"}</CardTitle>
            <CardDescription>
              {olvide
                ? "Ingresá el correo de tu cuenta y te enviamos un enlace."
                : "Ingresá con tu nombre de usuario y contraseña."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {olvide ? (
              <form className="space-y-4" onSubmit={handleReset}>
                <div className="space-y-2">
                  <Label htmlFor="reset_email">Correo</Label>
                  <Input
                    id="reset_email"
                    type="email"
                    required
                    autoComplete="email"
                    value={correoReset}
                    onChange={(ev) => setCorreoReset(ev.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Enviar enlace
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto w-full p-0 text-xs"
                  onClick={() => setOlvide(false)}
                >
                  Volver al ingreso
                </Button>
              </form>
            ) : (
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger value="login">Ingresar</TabsTrigger>
                  <TabsTrigger value="signup">Registrarme</TabsTrigger>
                </TabsList>
                <TabsContent value="login">
                  <form className="space-y-4" onSubmit={handleLogin}>
                    <div className="space-y-2">
                      <Label htmlFor="username">Usuario</Label>
                      <Input id="username" name="username" required autoComplete="username" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Contraseña</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => setOlvide(true)}
                    >
                      ¿Olvidaste tu contraseña?
                    </Button>
                    <Button type="submit" className="w-full" disabled={busy}>
                      Ingresar
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="signup">
                  <form className="space-y-4" onSubmit={handleSignup}>
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Nombre y apellido</Label>
                      <Input id="full_name" name="full_name" required autoComplete="name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="username2">Nombre de usuario</Label>
                      <Input
                        id="username2"
                        name="username"
                        required
                        minLength={3}
                        maxLength={32}
                        pattern="[A-Za-z0-9._\-]{3,32}"
                        autoComplete="username"
                      />
                      <p className="text-xs text-muted-foreground">
                        Con este usuario vas a ingresar. Letras, números, punto, guion o guion bajo.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email2">Correo</Label>
                      <Input id="email2" name="email" type="email" required autoComplete="email" />
                      <p className="text-xs text-muted-foreground">
                        Se usa solo para restablecer la contraseña.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password2">Contraseña</Label>
                      <Input id="password2" name="password" type="password" minLength={8} required />
                      <p className="text-xs text-muted-foreground">
                        Mínimo 8 caracteres. Evitá contraseñas comunes (se rechazan por seguridad).
                      </p>
                    </div>
                    <Button type="submit" className="w-full" disabled={busy}>
                      Crear cuenta
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      El primer usuario registrado obtiene el rol Administrador; el resto ingresa
                      como Consulta hasta que un administrador lo promueva.
                    </p>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
