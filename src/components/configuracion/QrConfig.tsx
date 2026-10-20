import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, Loader2, QrCode, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputClave } from "@/components/InputClave";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { qrGuardarAjustes, qrGuardarPin } from "@/backend/api/qr.functions";
import { useQrAjustes } from "@/components/activos/useQrAjustes";

/** Configuración → General: cómo se comporta el QR de las etiquetas. */
export function QrConfig({ esAdmin }: { esAdmin: boolean }) {
  const qc = useQueryClient();
  const { ajustes, isLoading } = useQrAjustes();
  const [pedir, setPedir] = useState(ajustes.pedirClave);
  const [publico, setPublico] = useState(ajustes.reportePublico);
  const [ancho, setAncho] = useState(String(ajustes.anchoMm));
  const [urlBase, setUrlBase] = useState(ajustes.urlBase ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPedir(ajustes.pedirClave);
    setPublico(ajustes.reportePublico);
    setAncho(String(ajustes.anchoMm));
    setUrlBase(ajustes.urlBase ?? "");
  }, [ajustes.pedirClave, ajustes.reportePublico, ajustes.anchoMm, ajustes.urlBase]);

  const guardar = async () => {
    setBusy(true);
    try {
      await qrGuardarAjustes({ data: { pedirClave: pedir, reportePublico: publico, anchoMm: Number(ancho), urlBase } });
      await qc.invalidateQueries({ queryKey: ["qr-ajustes"] });
      toast.success("Ajustes del QR guardados");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) return <div className="skeleton h-40" />;

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <header className="mb-4 flex items-center gap-2">
        <QrCode className="size-4 text-primary" />
        <h3 className="text-sm font-semibold">Etiquetas y escaneo QR</h3>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {esAdmin && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pedir clave o PIN al escanear</Label>
              <Select value={pedir} onValueChange={(v) => setPedir(v as typeof pedir)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="siempre">Siempre (cada 10 minutos)</SelectItem>
                  <SelectItem value="turno">Una vez por turno (8 horas por dispositivo)</SelectItem>
                  <SelectItem value="nunca">Nunca (alcanza con la sesión iniciada)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Impresora de etiquetas</Label>
              <Select value={ancho} onValueChange={setAncho}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="57">Térmica · rollo de 57 mm</SelectItem>
                  <SelectItem value="80">Térmica · rollo de 80 mm</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-url">Dirección impresa en el QR</Label>
              <Input
                id="qr-url"
                value={urlBase}
                onChange={(e) => setUrlBase(e.target.value)}
                placeholder={typeof window === "undefined" ? "" : window.location.origin}
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                La que van a abrir los celulares al escanear (ej. la dirección HTTPS). Vacía: la de esta pantalla.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-sm">
              <Checkbox className="mt-0.5" checked={publico} onCheckedChange={(v) => setPublico(!!v)} />
              <span>
                Permitir reportar fallas sin cuenta
                <span className="block text-xs text-muted-foreground">
                  Quien escanee una etiqueta ve el equipo (sin datos internos) y puede crear un ticket.
                </span>
              </span>
            </label>
            <Button size="sm" onClick={() => void guardar()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Save />} Guardar
            </Button>
          </div>
        )}
        <MiPin tienePin={ajustes.tienePin} />
      </div>
    </section>
  );
}

function MiPin({ tienePin }: { tienePin: boolean }) {
  const qc = useQueryClient();
  const [clave, setClave] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const enviar = async (e: FormEvent, quitar = false) => {
    e.preventDefault();
    setBusy(true);
    try {
      await qrGuardarPin({ data: { clave, pin: quitar ? null : pin } });
      toast.success(quitar ? "PIN eliminado" : tienePin ? "PIN cambiado" : "PIN creado");
      setClave("");
      setPin("");
      void qc.invalidateQueries({ queryKey: ["qr-ajustes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void enviar(e)} className="space-y-3 rounded-lg bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <p className="text-sm font-medium">Mi PIN de escaneo</p>
        <span className="ml-auto text-xs text-muted-foreground">{tienePin ? "Configurado" : "Sin PIN"}</span>
      </div>
      <p className="text-xs text-muted-foreground">4 a 6 números para confirmar más rápido al escanear desde el celular. Es personal.</p>
      <div className="grid grid-cols-2 gap-2">
        <InputClave value={clave} onChange={(e) => setClave(e.target.value)} placeholder="Tu contraseña" autoComplete="current-password" />
        <Input
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN nuevo"
          className="num tracking-widest"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy || !clave || pin.length < 4}>
          {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} {tienePin ? "Cambiar PIN" : "Crear PIN"}
        </Button>
        {tienePin && (
          <Button type="button" size="sm" variant="ghost" disabled={busy || !clave} onClick={(e) => void enviar(e, true)}>
            Quitar PIN
          </Button>
        )}
      </div>
    </form>
  );
}
