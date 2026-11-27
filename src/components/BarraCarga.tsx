import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Barra finita arriba de todo mientras algo se carga o se guarda. Aparece recién a los 150 ms
 * (lo rápido no parpadea) y al terminar se completa y se desvanece.
 */
export function BarraCarga() {
  const consultando = useIsFetching();
  const guardando = useIsMutating();
  const navegando = useRouterState({ select: (s) => s.status === "pending" });
  const activo = consultando + guardando > 0 || navegando;
  const [fase, setFase] = useState<"oculta" | "cargando" | "fin">("oculta");

  useEffect(() => {
    if (activo) {
      const t = window.setTimeout(() => setFase("cargando"), 150);
      return () => window.clearTimeout(t);
    }
    setFase((f) => (f === "cargando" ? "fin" : f));
    const t = window.setTimeout(() => setFase("oculta"), 350);
    return () => window.clearTimeout(t);
  }, [activo]);

  if (fase === "oculta") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] overflow-hidden">
      <div className={fase === "cargando" ? "barra-carga h-full" : "barra-carga-fin h-full"} />
    </div>
  );
}
