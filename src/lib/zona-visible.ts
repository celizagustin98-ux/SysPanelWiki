import { useEffect } from "react";

/**
 * Si la ventana del navegador queda por detrás de la barra de tareas (no está maximizada y se
 * extiende más abajo del área útil de la pantalla), mide cuántos píxeles quedan tapados y los
 * publica en la variable CSS --zona-oculta. Todo el sistema usa --av (alto visible) en lugar de
 * 100dvh, así nada importante queda escondido detrás de la barra.
 */
function medir() {
  const raiz = document.documentElement;
  const s = window.screen as Screen & { availTop?: number };
  let oculto = 0;
  if (s?.availHeight && window.outerHeight) {
    const abajoVentana = window.screenY + window.outerHeight;
    const abajoUtil = (s.availTop ?? 0) + s.availHeight;
    oculto = Math.round(abajoVentana - abajoUtil);
  }
  // Valores razonables: nunca más del 40 % de la ventana, e ignorar diferencias mínimas.
  oculto = Math.max(0, Math.min(oculto, Math.round(window.innerHeight * 0.4)));
  if (oculto < 6) oculto = 0;
  const actual = raiz.style.getPropertyValue("--zona-oculta");
  const nuevo = `${oculto}px`;
  if (actual !== nuevo) raiz.style.setProperty("--zona-oculta", nuevo);
}

export function useZonaVisible() {
  useEffect(() => {
    medir();
    window.addEventListener("resize", medir);
    // Mover la ventana no dispara eventos: se vuelve a medir cada tanto.
    const t = window.setInterval(medir, 1500);
    return () => {
      window.removeEventListener("resize", medir);
      window.clearInterval(t);
    };
  }, []);
}
