import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, ScanLine } from "lucide-react";
import jsQR from "jsqr";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { leerQr } from "@/lib/qr";
import { cn } from "@/lib/utils";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Saca el id del activo de una etiqueta vieja (/inventario?item=…). Se mantiene por compatibilidad. */
export function idDesdeQr(texto: string) {
  return leerQr(texto)?.id ?? null;
}

/** Sonido corto de confirmación (sin archivos externos). */
export function pitido(ok = true) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1046 : 330;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.09 : 0.25));
    osc.onended = () => void ctx.close();
  } catch {
    /* sin audio */
  }
  navigator.vibrate?.(ok ? 50 : [80, 60, 80]);
}

/**
 * Visor de cámara que lee QR. En modo `continuo` sigue leyendo y avisa cada código nuevo
 * (el mismo código no se repite hasta pasados unos segundos), ideal para auditorías.
 */
export function VisorQr({
  activo,
  continuo,
  onResult,
  className,
}: {
  activo: boolean;
  continuo?: boolean;
  onResult: (texto: string) => void;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const [estado, setEstado] = useState<"iniciando" | "escaneando" | "error">("iniciando");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    if (!activo) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let vivo = true;
    const ultimos = new Map<string, number>();
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    const detector = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;

    const leer = async () => {
      if (!vivo || !video.current || !canvas.current) return;
      const v = video.current;
      if (v.readyState >= 2) {
        try {
          let texto: string | null = null;
          if (detector) {
            const r = await detector.detect(v);
            texto = r[0]?.rawValue ?? null;
          } else {
            const c = canvas.current;
            c.width = v.videoWidth;
            c.height = v.videoHeight;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const img = ctx.getImageData(0, 0, c.width, c.height);
              texto = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
          }
          if (texto) {
            const ahora = Date.now();
            if (!continuo) {
              vivo = false;
              navigator.vibrate?.(60);
              onResultRef.current(texto);
              return;
            }
            if (ahora - (ultimos.get(texto) ?? 0) > 4000) {
              ultimos.set(texto, ahora);
              setFlash(true);
              setTimeout(() => setFlash(false), 350);
              onResultRef.current(texto);
            }
          }
        } catch {
          /* cuadro sin QR */
        }
      }
      raf = requestAnimationFrame(() => void leer());
    };

    (async () => {
      setEstado("iniciando");
      if (!navigator.mediaDevices?.getUserMedia) {
        setEstado("error");
        setError(
          window.isSecureContext
            ? "Este navegador no permite usar la cámara."
            : "La cámara solo funciona con HTTPS. Podés usar un lector USB o escribir el código.",
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setEstado("escaneando");
        void leer();
      } catch {
        setEstado("error");
        setError("No se pudo acceder a la cámara. Revisá el permiso del navegador.");
      }
    })();

    return () => {
      vivo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [activo, continuo]);

  return (
    <div className={cn("relative aspect-square w-full overflow-hidden bg-black", className)}>
      <video ref={video} className="size-full object-cover" playsInline muted />
      <canvas ref={canvas} className="hidden" />
      {estado === "escaneando" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={cn(
              "relative size-3/5 rounded-2xl border-2 shadow-[0_0_0_9999px_rgba(0,0,0,.45)] transition-colors",
              flash ? "border-ok" : "border-white/80",
            )}
          >
            <div className="absolute inset-x-3 top-0 h-0.5 bg-primary shadow-[0_0_12px_var(--primary)] [animation:scan-line_1.8s_ease-in-out_infinite_alternate]" />
          </div>
        </div>
      )}
      {estado === "iniciando" && (
        <div className="absolute inset-0 grid place-items-center text-white/80">
          <Loader2 className="size-7 animate-spin" />
        </div>
      )}
      {estado === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
          <CameraOff className="size-8" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}

/** Escáner de QR con la cámara (celular, tablet o webcam) en un diálogo. */
export function EscanerQR({ open, onOpenChange, onResult }: { open: boolean; onOpenChange: (o: boolean) => void; onResult: (texto: string) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="size-5 text-primary" /> Escanear etiqueta
          </DialogTitle>
          <DialogDescription>Apuntá la cámara al QR del equipo.</DialogDescription>
        </DialogHeader>
        <VisorQr activo={open} onResult={onResult} className="mt-3" />
      </DialogContent>
    </Dialog>
  );
}
