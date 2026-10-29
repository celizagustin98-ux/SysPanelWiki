import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Copy, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { InputClave } from "@/components/InputClave";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

/**
 * Ver claves guardadas (Credenciales, emails de la Agenda): se pide la clave de visualización
 * que define un administrador en Configuración → Seguridad. Lo revelado se ve 1 minuto y se oculta solo;
 * durante ese minuto no se vuelve a pedir la clave.
 */
export const SEGUNDOS_VISIBLE = 60;

type Credencial = { _clave?: string; _permiso?: string };
type Respuesta = { secreto?: string; permiso?: string; expira?: number };

/** Permiso vigente (compartido por toda la app, vive solo en memoria). */
let permiso: { token: string; expira: number } | null = null;

/** Llama a la función del servidor que revela la clave (revelar_credencial, revelar_contacto…). */
export function rpcRevelar(nombre: string, args: Record<string, unknown>) {
  return async (cred: Credencial): Promise<Respuesta> => {
    const { data, error } = await api.rpc(nombre, { ...args, ...cred });
    if (error) throw new Error(error.message);
    return (data ?? {}) as Respuesta;
  };
}

type Pendiente = {
  fetcher: (cred: Credencial) => Promise<Respuesta>;
  resolve: (secreto: string | null) => void;
};

export function useClaveVer() {
  const [visibles, setVisibles] = useState<Record<string, { valor: string; hasta: number }>>({});
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [, setTic] = useState(0);

  // Cuenta regresiva y ocultado automático.
  useEffect(() => {
    if (!Object.keys(visibles).length) return;
    const t = window.setInterval(() => {
      const ahora = Date.now();
      setVisibles((v) => {
        const quedan = Object.fromEntries(Object.entries(v).filter(([, x]) => x.hasta > ahora));
        return Object.keys(quedan).length === Object.keys(v).length ? v : quedan;
      });
      setTic((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(t);
  }, [visibles]);

  const obtener = useCallback(async (fetcher: Pendiente["fetcher"]): Promise<string | null> => {
    if (permiso && permiso.expira > Date.now() + 1500) {
      try {
        const r = await fetcher({ _permiso: permiso.token });
        if (r.permiso && r.expira) permiso = { token: r.permiso, expira: r.expira };
        return r.secreto ?? "";
      } catch {
        // El permiso venció o se cambió la clave: se vuelve a pedir.
        permiso = null;
      }
    }
    return new Promise((resolve) => setPendiente({ fetcher, resolve }));
  }, []);

  /** Muestra la clave por 1 minuto (o la oculta si ya se veía). */
  const alternar = useCallback(
    async (clave: string, fetcher: Pendiente["fetcher"]) => {
      if (visibles[clave]) {
        setVisibles((v) => {
          const next = { ...v };
          delete next[clave];
          return next;
        });
        return;
      }
      setCargando(clave);
      const secreto = await obtener(fetcher);
      setCargando(null);
      if (secreto === null) return;
      setVisibles((v) => ({ ...v, [clave]: { valor: secreto, hasta: Date.now() + SEGUNDOS_VISIBLE * 1000 } }));
    },
    [obtener, visibles],
  );

  /** Copia la clave al portapapeles (también pide la clave de visualización). */
  const copiar = useCallback(
    async (clave: string, fetcher: Pendiente["fetcher"]) => {
      let secreto: string | null = visibles[clave]?.valor ?? null;
      if (secreto === null) {
        setCargando(clave);
        secreto = await obtener(fetcher);
        setCargando(null);
      }
      if (secreto === null) return;
      try {
        await navigator.clipboard.writeText(secreto);
        toast.success("Clave copiada (queda registrado en auditoría)");
      } catch {
        toast.error("No se pudo copiar");
      }
    },
    [obtener, visibles],
  );

  const restante = (clave: string) => {
    const v = visibles[clave];
    return v ? Math.max(0, Math.ceil((v.hasta - Date.now()) / 1000)) : 0;
  };

  const dialogo = (
    <PedirClave
      abierto={!!pendiente}
      onCancelar={() => {
        pendiente?.resolve(null);
        setPendiente(null);
      }}
      onEnviar={async (clave) => {
        if (!pendiente) return null;
        try {
          const r = await pendiente.fetcher({ _clave: clave });
          if (r.permiso && r.expira) permiso = { token: r.permiso, expira: r.expira };
          pendiente.resolve(r.secreto ?? "");
          setPendiente(null);
          return null;
        } catch (e) {
          return e instanceof Error ? e.message : "No se pudo verificar la clave";
        }
      }}
    />
  );

  return { visibles, alternar, copiar, restante, cargando, dialogo };
}

function PedirClave({
  abierto,
  onCancelar,
  onEnviar,
}: {
  abierto: boolean;
  onCancelar: () => void;
  onEnviar: (clave: string) => Promise<string | null>;
}) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (abierto) {
      setClave("");
      setError(null);
      window.setTimeout(() => ref.current?.focus(), 50);
    }
  }, [abierto]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!clave) return;
    setEnviando(true);
    const err = await onEnviar(clave);
    setEnviando(false);
    if (err) {
      setError(err === "PEDIR_CLAVE" ? "Ingresá la clave" : err);
      setClave("");
      ref.current?.focus();
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCancelar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Clave de visualización
          </DialogTitle>
          <DialogDescription>
            Para ver o copiar claves guardadas. Lo que se muestre se oculta solo en {SEGUNDOS_VISIBLE} segundos.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          <InputClave ref={ref} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" placeholder="Clave de visualización" />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onCancelar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!clave || enviando}>
              {enviando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Ver
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Celda de una clave guardada: puntos, o la clave con la cuenta regresiva; botones de ver y copiar. */
export function SecretoOculto({
  id,
  tiene,
  fetcher,
  ctl,
  compacto,
}: {
  id: string;
  tiene: boolean;
  fetcher: (cred: Credencial) => Promise<Respuesta>;
  ctl: ReturnType<typeof useClaveVer>;
  compacto?: boolean;
}) {
  if (!tiene) return <span className="text-muted-foreground">—</span>;
  const visible = ctl.visibles[id];
  const seg = ctl.restante(id);
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {visible ? (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded bg-warn/15 px-1.5 py-0.5 font-mono text-xs text-foreground">
          <span className="truncate select-all">{visible.valor || "(vacía)"}</span>
          <span className={cn("num shrink-0 text-[10px] font-semibold", seg <= 10 ? "text-destructive" : "text-muted-foreground")} title="Se oculta sola">
            {seg}s
          </span>
        </span>
      ) : (
        <span className="font-mono text-xs tracking-widest text-muted-foreground">••••••••</span>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={compacto ? "size-7" : "size-8"}
        aria-label={visible ? "Ocultar clave" : "Ver clave"}
        title={visible ? "Ocultar" : "Ver (pide la clave de visualización)"}
        disabled={ctl.cargando === id}
        onClick={() => void ctl.alternar(id, fetcher)}
      >
        {ctl.cargando === id ? <Loader2 className="size-4 animate-spin" /> : visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={compacto ? "size-7" : "size-8"}
        aria-label="Copiar clave"
        title="Copiar (pide la clave de visualización)"
        disabled={ctl.cargando === id}
        onClick={() => void ctl.copiar(id, fetcher)}
      >
        <Copy className="size-4" />
      </Button>
    </span>
  );
}
