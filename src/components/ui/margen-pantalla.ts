/** Margen para menús y listas desplegables: nunca quedan debajo de la barra de tareas. */
export function margenPantalla() {
  if (typeof window === "undefined") return 8;
  const oculto = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--zona-oculta")) || 0;
  return { top: 8, right: 8, left: 8, bottom: 8 + oculto };
}
