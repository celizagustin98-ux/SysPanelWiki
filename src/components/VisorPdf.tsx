import { useEffect, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

// pdf.js se carga recién cuando hace falta (la build "legacy" también anda en tablets y celulares viejos).
let pdfjs: Promise<typeof import("pdfjs-dist")> | null = null;
function cargarPdfjs() {
  pdfjs ??= Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib as unknown as typeof import("pdfjs-dist");
  });
  return pdfjs;
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/**
 * Visor de PDF propio: dibuja cada página en un canvas, así se ve igual en celulares, tablets
 * y navegadores sin visor integrado (Thorium, Android, etc.), donde un <iframe> queda en blanco.
 */
export function VisorPdf({ src, className }: { src: string; className?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState("");
  const [ancho, setAncho] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let vivo = true;
    let abierto: PdfDoc | null = null;
    setDoc(null);
    setError("");
    (async () => {
      const lib = await cargarPdfjs();
      const datos = new Uint8Array(await (await fetch(src)).arrayBuffer());
      abierto = await lib.getDocument({ data: datos, isEvalSupported: false }).promise;
      if (vivo) setDoc(abierto);
      else void abierto.destroy();
    })().catch(() => vivo && setError("No se pudo mostrar el PDF. Probá descargarlo."));
    return () => {
      vivo = false;
      void abierto?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const paso = (d: number) => setZoom((z) => ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, ZOOMS.indexOf(z) + d))]);

  return (
    <div className={cn("relative flex flex-col bg-muted", className)}>
      <div className="flex items-center justify-end gap-1 border-b border-border bg-card px-2 py-1.5">
        {doc && <span className="mr-auto pl-1 text-xs text-muted-foreground">{doc.numPages} {doc.numPages === 1 ? "página" : "páginas"}</span>}
        <Button variant="ghost" size="icon" className="size-8" onClick={() => paso(-1)} disabled={zoom === ZOOMS[0]} aria-label="Alejar">
          <Minus />
        </Button>
        <button type="button" className="num w-12 text-center text-xs text-muted-foreground" onClick={() => setZoom(1)} title="Ajustar al ancho">
          {Math.round(zoom * 100)}%
        </button>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => paso(1)} disabled={zoom === ZOOMS[ZOOMS.length - 1]} aria-label="Acercar">
          <Plus />
        </Button>
      </div>
      <div ref={caja} className="min-h-0 flex-1 overflow-auto p-2 sm:p-4">
        {error ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{error}</p>
        ) : !doc || !ancho ? (
          <div className="grid h-full min-h-40 place-items-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : (
          <div className="mx-auto flex w-max min-w-full flex-col items-center gap-3">
            {Array.from({ length: doc.numPages }, (_, i) => (
              <Pagina key={i} doc={doc} numero={i + 1} ancho={Math.max(200, ancho - 16) * zoom} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Una página: se dibuja recién cuando se acerca a la pantalla. */
function Pagina({ doc, numero, ancho }: { doc: PdfDoc; numero: number; ancho: number }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [alto, setAlto] = useState(ancho * 1.414);
  const [visible, setVisible] = useState(numero <= 2);

  useEffect(() => {
    const el = lienzo.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let tarea: { cancel: () => void } | null = null;
    let vivo = true;
    void doc.getPage(numero).then((pagina) => {
      const el = lienzo.current;
      if (!vivo || !el) return;
      const base = pagina.getViewport({ scale: 1 });
      const escala = ancho / base.width;
      const vista = pagina.getViewport({ scale: escala });
      // Nitidez en pantallas de alta densidad, con tope para no agotar la memoria del celular.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.floor(vista.width * dpr);
      el.height = Math.floor(vista.height * dpr);
      setAlto(vista.height);
      const ctx = el.getContext("2d");
      if (!ctx) return;
      const render = pagina.render({ canvasContext: ctx, viewport: vista, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined });
      tarea = render;
      render.promise.catch(() => undefined);
    });
    return () => {
      vivo = false;
      tarea?.cancel();
    };
  }, [doc, numero, ancho, visible]);

  return <canvas ref={lienzo} className="block rounded-sm bg-white shadow-sm" style={{ width: ancho, height: alto }} aria-label={`Página ${numero}`} />;
}
