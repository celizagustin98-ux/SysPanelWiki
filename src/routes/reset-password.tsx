import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/integrations/api/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Restablecer contraseña | SysIntranet | Wiki Area" },
      {
        name: "description",
        content: "Definí una nueva contraseña para tu cuenta de la intranet.",
      },
      { property: "og:title", content: "Restablecer contraseña | SysIntranet | Wiki Area" },
      {
        property: "og:description",
        content: "Definí una nueva contraseña para acceder a la intranet.",
      },
    ],
  }),
  component: ResetPasswordPage,
});

type Estado = "verificando" | "listo" | "invalido";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [estado, setEstado] = useState<Estado>("verificando");

  // Procesa el enlace del correo (formato hash con tokens, PKCE con ?code=
  // o token_hash) y deja una sesión de recuperación activa.
  useEffect(() => {
    let cancelado = false;

    (async () => {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

      const errorDesc = query.get("error_description") ?? hash.get("error_description");
      if (errorDesc) {
        toast.error(decodeURIComponent(errorDesc));
        if (!cancelado) setEstado("invalido");
        return;
      }

      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      const code = query.get("code");
      const tokenHash = query.get("token_hash") ?? query.get("token");

      try {
        if (accessToken && refreshToken) {
          await api.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else if (code) {
          await api.auth.exchangeCodeForSession(code);
        } else if (tokenHash) {
          await api.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
        }
      } catch {
        /* se valida abajo con getSession */
      }

      // Limpia los tokens de la URL.
      window.history.replaceState({}, "", window.location.pathname);

      const { data } = await api.auth.getSession();
      if (cancelado) return;
      setEstado(data.session ? "listo" : "invalido");
    })();

    return () => {
      cancelado = true;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pass = String(fd.get("password"));
    if (pass !== String(fd.get("password2"))) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setBusy(true);
    const { error } = await api.auth.updateUser({ password: pass });
    if (error) {
      setBusy(false);
      toast.error(
        error.message.toLowerCase().includes("weak") || error.message.toLowerCase().includes("pwned")
          ? "Esa contraseña es demasiado común. Elegí una más segura."
          : error.message,
      );
      return;
    }
    // Cierra la sesión de recuperación para que ingrese con la contraseña nueva.
    await api.auth.signOut();
    setBusy(false);
    toast.success("Contraseña actualizada. Ingresá con tu nueva contraseña.");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <Card className="panel w-full max-w-md">
        <CardHeader>
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>
            {estado === "invalido"
              ? "El enlace de recuperación no es válido o ya expiró."
              : "Ingresá y confirmá tu nueva contraseña."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {estado === "verificando" ? (
            <p className="text-sm text-muted-foreground">Verificando el enlace…</p>
          ) : estado === "invalido" ? (
            <Button className="w-full" onClick={() => navigate({ to: "/auth", replace: true })}>
              Volver al acceso y pedir un enlace nuevo
            </Button>
          ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input id="password" name="password" type="password" minLength={8} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">Repetir contraseña</Label>
                <Input id="password2" name="password2" type="password" minLength={8} required />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                Guardar contraseña
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
