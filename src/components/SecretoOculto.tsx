import { useCallback, useState } from "react";
import { Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

/**
 * Claves guardadas (Credenciales, emails de la Agenda): se guardan cifradas y se muestran como ••••.
 * El ojito las trae del servidor (queda en auditoría) y las muestra u oculta.
 */
type Fetcher = () => Promise<string>;

/** Llama a la función del servidor que revela la clave (revelar_credencial, revelar_contacto…). */
export function rpcRevelar(nombre: string, args: Record<string, unknown>): Fetcher {
  return async () => {
    const { data, error } = await api.rpc(nombre, args);
    if (error) throw new Error(error.message);
    return String((data as { secreto?: string } | null)?.secreto ?? "");
  };
}

export function useSecretos() {
  const [visibles, setVisibles] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState<string | null>(null);

  const obtener = useCallback(async (clave: string, fetcher: Fetcher) => {
    setCargando(clave);
    try {
      return await fetcher();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo obtener la clave");
      return null;
    } finally {
      setCargando(null);
    }
  }, []);

  /** Muestra la clave, o la oculta si ya se veía. */
  const alternar = useCallback(
    async (clave: string, fetcher: Fetcher) => {
      if (clave in visibles) {
        setVisibles((v) => {
          const next = { ...v };
          delete next[clave];
          return next;
        });
        return;
      }
      const secreto = await obtener(clave, fetcher);
      if (secreto !== null) setVisibles((v) => ({ ...v, [clave]: secreto }));
    },
    [obtener, visibles],
  );

  const copiar = useCallback(
    async (clave: string, fetcher: Fetcher) => {
      const secreto = clave in visibles ? visibles[clave] : await obtener(clave, fetcher);
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

  return { visibles, alternar, copiar, cargando };
}

/** Celda de una clave guardada: puntos o la clave, con botones de ver/ocultar y copiar. */
export function SecretoOculto({
  id,
  tiene,
  fetcher,
  ctl,
  compacto,
}: {
  id: string;
  tiene: boolean;
  fetcher: Fetcher;
  ctl: ReturnType<typeof useSecretos>;
  compacto?: boolean;
}) {
  if (!tiene) return <span className="text-muted-foreground">—</span>;
  const visible = id in ctl.visibles;
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      {visible ? (
        <span className="min-w-0 truncate rounded bg-warn/15 px-1.5 py-0.5 font-mono text-xs text-foreground select-all">
          {ctl.visibles[id] || "(vacía)"}
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
        title={visible ? "Ocultar" : "Ver"}
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
        title="Copiar"
        disabled={ctl.cargando === id}
        onClick={() => void ctl.copiar(id, fetcher)}
      >
        <Copy className="size-4" />
      </Button>
    </span>
  );
}
