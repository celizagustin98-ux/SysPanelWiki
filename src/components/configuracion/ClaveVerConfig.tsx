import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Clock, Eye, KeyRound, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { InputClave } from "@/components/InputClave";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { claveVerEstado, claveVerGuardar, type EstadoClaveVer } from "@/backend/api/seguridad.functions";
import { formatFecha } from "@/lib/utils";

/** Configuración → Seguridad: clave que se pide para ver o copiar claves guardadas en todo el sistema. */
export function ClaveVerConfig({ esAdmin }: { esAdmin: boolean }) {
  const estadoFn = useServerFn(claveVerEstado);
  const guardarFn = useServerFn(claveVerGuardar);
  const [estado, setEstado] = useState<EstadoClaveVer | null>(null);
  const [miClave, setMiClave] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = () => estadoFn().then(setEstado).catch(() => setEstado(null));
  useEffect(() => {
    void cargar();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    if (nueva !== repetir) return toast.error("Las claves no coinciden");
    setGuardando(true);
    try {
      await guardarFn({ data: { miClave, nueva } });
      toast.success(estado?.configurada ? "Clave de visualización cambiada" : "Clave de visualización definida");
      setMiClave("");
      setNueva("");
      setRepetir("");
      void cargar();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" /> Clave de visualización
          </CardTitle>
          <CardDescription>
            Se pide al tocar el ojito o copiar cualquier clave guardada: Credenciales y los emails de la empresa en Oficina → Agenda.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {estado === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Cargando…
            </div>
          ) : estado.configurada ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2.5 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
              <div>
                <p className="font-medium">Clave definida</p>
                <p className="text-xs text-muted-foreground">
                  Último cambio: {estado.actualizada ? formatFecha(estado.actualizada, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">Todavía no hay clave</p>
                <p className="text-xs text-muted-foreground">Hasta que la definas, nadie puede ver ni copiar las claves guardadas.</p>
              </div>
            </div>
          )}

          {esAdmin ? (
            <form onSubmit={guardar} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{estado?.configurada ? "Nueva clave" : "Clave"}</Label>
                  <InputClave value={nueva} onChange={(e) => setNueva(e.target.value)} autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
                </div>
                <div className="space-y-1.5">
                  <Label>Repetir clave</Label>
                  <InputClave value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Tu contraseña de usuario (para confirmar)</Label>
                <InputClave value={miClave} onChange={(e) => setMiClave(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" disabled={guardando || !nueva || !repetir || !miClave}>
                {guardando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                {estado?.configurada ? "Cambiar clave" : "Definir clave"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">Solo un administrador puede definir o cambiar esta clave.</p>
          )}
        </CardContent>
      </Card>

      <Card className="panel">
        <CardHeader>
          <CardTitle className="text-base">Cómo funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            <Punto icono={Eye} titulo="Ojito en cada clave">
              Las claves siempre se muestran como ••••. Al tocar el ojito o copiar, el sistema pide esta clave.
            </Punto>
            <Punto icono={Clock} titulo={`Visible ${estado?.segundos ?? 60} segundos`}>
              La clave revelada se ve con una cuenta regresiva y se oculta sola. Durante ese minuto se pueden ver otras sin volver a escribirla.
            </Punto>
            <Punto icono={ShieldAlert} titulo="Intentos limitados">
              Después de 5 intentos fallidos se bloquea por 5 minutos para ese usuario.
            </Punto>
            <Punto icono={ShieldCheck} titulo="Todo queda registrado">
              Cada vez que alguien ve o copia una clave queda en Auditoría. Las claves se guardan cifradas en la base.
            </Punto>
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Al cambiar la clave, los permisos abiertos se cierran al instante. Tiene que ser distinta a tu contraseña de ingreso.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Punto({ icono: Icono, titulo, children }: { icono: typeof Eye; titulo: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icono className="size-4" />
      </span>
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="text-[13px] text-muted-foreground">{children}</p>
      </div>
    </li>
  );
}
