import type { CSSProperties, MouseEvent } from "react";

/**
 * Hace clicable toda la fila (junto con la clase `fila-clic`): abre el detalle salvo que el clic
 * haya sido en un botón, enlace o campo de la fila, o que se esté seleccionando texto.
 */
export function clicDeFila(e: MouseEvent, abrir: () => void) {
  const destino = e.target as HTMLElement;
  if (destino.closest("button, a, input, select, textarea, label, [role='menuitem'], [role='checkbox'], [data-sin-fila]")) return;
  if (window.getSelection()?.toString()) return;
  abrir();
}

/** Posición en una secuencia animada (las clases `crece-x` y `paso-actual` la usan para escalonar). */
export const pasoAnimado = (i: number) => ({ "--i": i }) as CSSProperties;
