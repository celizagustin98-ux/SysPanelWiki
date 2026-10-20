import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CheckCircle2, KeyRound, Loader2, LockKeyhole, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputClave } from "@/components/InputClave";
import { qrGuardarPin, qrVerificar } from "@/backend/api/qr.functions";
import { useAuth } from "@/lib/auth";
import { marcarQrDesbloqueado } from "@/lib/qr";
import { cn } from "@/lib/utils";
import { useQrAjustes } from "./useQrAjustes";

/** Pantalla que pide PIN o contraseña al abrir un activo escaneando su QR. */
export function QrLock({ codigo, onOk }: { codigo?: string; onOk: () => void }) {
  const { profile, signOut } = useAuth();
  const qc = useQueryClient();
  const { ajustes, isLoading } = useQrAjustes();
  const [modo, setModo] = useState<"pin" | "clave" | null>(null);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  // Después de entrar con la contraseña se ofrece crear un PIN para la próxima.
  const [ofrecerPin, setOfrecerPin] = useState<string | null>(null);
  const [pinNuevo, setPinNuevo] = useState("");

  const usandoPin = (modo ?? (ajustes.tienePin ? "pin" : "clave")) === "pin";

  const listo = () => {
    marcarQrDesbloqueado();
    onOk();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valor || busy) return;
    setBusy(true);
    setError(null);
    try {
      await qrVerificar({ data: usandoPin ? { pin: valor } : { clave: valor } });
      if (!usandoPin && !ajustes.tienePin) {
        setOfrecerPin(valor);
        return;
      }
      listo();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo verificar");
      setShaking(true);
      setValor("");
    } finally {
      setBusy(false);
    }
  };

  const guardarPin = async (e: FormEvent) => {
    e.preventDefault();
    if (!ofrecerPin || busy) return;
    setBusy(true);
    try {
      await qrGuardarPin({ data: { clave: ofrecerPin, pin: pinNuevo } });
      toast.success("PIN creado: la próxima vez entrás con esos números");
      void qc.invalidateQueries({ queryKey: ["qr-ajustes"] });
      listo();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar el PIN");
    } finally {
      setBusy(false);
    }
  };

  if (ofrecerPin) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-2">
        <form onSubmit={guardarPin} className="panel w-full max-w-sm p-6 text-center rise-in">
          <CheckCircle2 className="mx-auto size-10 text-ok" />
          <h1 className="mt-3 text-lg font-semibold">Clave confirmada</h1>
          <p className="mt-1.5 text-[13px] text-muted-foreground">
            ¿Querés crear un <span className="font-medium text-foreground">PIN de 4 a 6 números</span> para escanear más rápido
            desde el celular?
          </p>
          <Input
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={pinNuevo}
            onChange={(e) => setPinNuevo(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            className="num mt-5 h-12 text-center text-2xl tracking-[0.5em]"
          />
          <Button type="submit" className="mt-4 h-11 w-full" disabled={busy || pinNuevo.length < 4}>
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Crear PIN
          </Button>
          <Button type="button" variant="ghost" className="mt-2 w-full" onClick={listo}>
            Ahora no
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="grid min-h-[70vh] place-items-center px-2">
      <form
        onSubmit={submit}
        onAnimationEnd={(e) => e.target === e.currentTarget && setShaking(false)}
        className={cn("panel w-full max-w-sm p-6 text-center rise-in", shaking && "shake")}
      >
        <div className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          <LockKeyhole className="size-6" />
          <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-card ring-2 ring-card">
            <ScanLine className="size-3.5" />
          </span>
        </div>
        <p className="eyebrow mt-4">Acceso por QR</p>
        <h1 className="mt-1 text-lg font-semibold">{usandoPin ? "Ingresá tu PIN" : "Confirmá tu clave"}</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Escaneaste {codigo ? <span className="num font-medium text-foreground">{codigo}</span> : "la etiqueta de un activo"}.{" "}
          {usandoPin ? "Usá el PIN de escaneo de" : "Ingresá la contraseña de"}{" "}
          <span className="font-medium text-foreground">{profile?.full_name ?? "tu usuario"}</span>.
        </p>
        {isLoading ? (
          <div className="skeleton mt-5 h-11" />
        ) : usandoPin ? (
          <Input
            inputMode="numeric"
            maxLength={6}
            autoFocus
            autoComplete="off"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            aria-invalid={!!error}
            className="num mt-5 h-12 text-center text-2xl tracking-[0.5em]"
          />
        ) : (
          <div className="mt-5">
            <InputClave
              autoFocus
              autoComplete="current-password"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Contraseña"
              aria-invalid={!!error}
              className="h-11 pl-10 text-center"
            />
          </div>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <Button type="submit" className="mt-4 h-11 w-full" disabled={busy || !valor}>
          {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Ver equipo
        </Button>
        <div className="mt-3 flex flex-col gap-1.5 text-xs">
          {ajustes.tienePin && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => {
                setModo(usandoPin ? "clave" : "pin");
                setValor("");
                setError(null);
              }}
            >
              {usandoPin ? "Usar la contraseña" : "Usar el PIN"}
            </button>
          )}
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void signOut()}>
            No soy {profile?.full_name?.split(" ")[0] ?? "yo"} · cerrar sesión
          </button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground/80">
          {ajustes.pedirClave === "turno"
            ? "No se vuelve a pedir por 8 horas en este dispositivo."
            : "No se vuelve a pedir durante 10 minutos."}
        </p>
      </form>
    </div>
  );
}
