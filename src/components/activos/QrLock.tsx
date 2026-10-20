import { useState, type FormEvent } from "react";
import { Loader2, LockKeyhole, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const KEY = "syswiki.qr.ok";
const VIGENCIA_MS = 10 * 60_000;

/** True si la clave se confirmó hace menos de 10 minutos en esta pestaña. */
export function qrVerificado() {
  try {
    return Date.now() - Number(sessionStorage.getItem(KEY) || 0) < VIGENCIA_MS;
  } catch {
    return false;
  }
}

/** Pantalla que pide la clave del usuario al abrir un activo escaneando su QR. */
export function QrLock({ codigo, onOk }: { codigo?: string; onOk: () => void }) {
  const { profile, signOut } = useAuth();
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clave || busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = (await api.rpc("verificar_clave", { _clave: clave })) as { error: Error | null };
    setBusy(false);
    if (err) {
      setError(err.message);
      setShaking(true);
      setClave("");
      return;
    }
    try {
      sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* sin almacenamiento */
    }
    onOk();
  };

  return (
    <div className="grid min-h-[70vh] place-items-center px-2">
      <form
        onSubmit={submit}
        onAnimationEnd={(e) => e.target === e.currentTarget && setShaking(false)}
        className={cn("panel w-full max-w-sm p-6 text-center rise-in", shaking && "shake")}
      >
        <div className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
          <LockKeyhole className="size-6" />
          <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-card text-muted-foreground ring-2 ring-background">
            <ScanLine className="size-3.5" />
          </span>
        </div>
        <p className="eyebrow mt-4">Acceso por QR</p>
        <h1 className="mt-1 text-lg font-semibold">Confirmá tu clave</h1>
        <p className="mt-1.5 text-[13px] text-muted-foreground">
          Escaneaste {codigo ? <span className="num font-medium text-foreground">{codigo}</span> : "la etiqueta de un activo"}. Para ver su planilla técnica ingresá la contraseña de{" "}
          <span className="font-medium text-foreground">{profile?.full_name ?? "tu usuario"}</span>.
        </p>
        <Input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Contraseña"
          aria-invalid={!!error}
          className="mt-5 h-11 text-center"
        />
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <Button type="submit" className="mt-4 h-11 w-full" disabled={busy || !clave}>
          {busy ? <Loader2 className="animate-spin" /> : <LockKeyhole />} Ver activo
        </Button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          No soy {profile?.full_name?.split(" ")[0] ?? "yo"} · cerrar sesión
        </button>
        <p className="mt-3 text-[11px] text-muted-foreground/80">No se vuelve a pedir durante 10 minutos.</p>
      </form>
    </div>
  );
}
