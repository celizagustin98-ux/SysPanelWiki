import { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2, ScanLine } from "lucide-react";
import jsQR from "jsqr";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Saca el id del activo de la URL que codifica la etiqueta (/inventario?item=…). */
export function idDesdeQr(texto: string) {
  try {
    const u = new URL(texto, window.location.origin);
    return u.searchParams.get("item");
  } catch {
    return null;
  }
}

/** Escáner de QR con la cámara (celular, tablet o webcam). */
export function EscanerQR({ open, onOpenChange, onResult }: { open: boolean; onOpenChange: (o: boolean) => void; onResult: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [estado, setEstado] = useState<"iniciando" | "escaneando" | "error">("iniciando");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let activo = true;
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    const detector = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;

    const leer = async () => {
      if (!activo || !video.current || !canvas.current) return;
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
            activo = false;
            navigator.vibrate?.(60);
            onResult(texto);
            return;
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
        setError(window.isSecureContext ? "Este navegador no permite usar la cámara." : "La cámara solo funciona con HTTPS (o desde el mismo servidor). Usá la cámara del celular para escanear la etiqueta.");
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
      activo = false;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="flex items-center gap-2"><ScanLine className="size-5 text-primary" /> Escanear etiqueta</DialogTitle>
          <DialogDescription>Apuntá la cámara al QR del equipo.</DialogDescription>
        </DialogHeader>
        <div className="relative mt-3 aspect-square w-full bg-black">
          <video ref={video} className="size-full object-cover" playsInline muted />
          <canvas ref={canvas} className="hidden" />
          {estado === "escaneando" && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="relative size-3/5 rounded-2xl border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,.45)]">
                <div className="absolute inset-x-3 top-0 h-0.5 bg-primary shadow-[0_0_12px_var(--primary)] [animation:scan-line_1.8s_ease-in-out_infinite_alternate]" />
              </div>
            </div>
          )}
          {estado === "iniciando" && (
            <div className="absolute inset-0 grid place-items-center text-white/80"><Loader2 className="size-7 animate-spin" /></div>
          )}
          {estado === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/90">
              <CameraOff className="size-8" />
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
