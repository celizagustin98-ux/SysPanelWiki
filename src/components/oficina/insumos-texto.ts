/** "3 x Mouse USB", "Mouse USB x3", "2 cajas Cable UTP" o solo "Mouse USB" (1 u.). */
export function leerLineaInsumo(linea: string): { descripcion: string; cantidad: number; unidad: string } | null {
  let t = linea.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, "").trim();
  if (!t) return null;
  let cantidad = 1;
  let unidad = "u.";
  const alFinal = t.match(/^(.*?)[\s,;:-]+(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(?:u\.?|unid(?:ades)?\.?)?$/i);
  const alPrincipio = t.match(/^(\d+(?:[.,]\d+)?)(?:\s*x\s+|\s+(?:u\.?\s+|unid(?:ades)?\.?\s+)?)(.*)$/i);
  if (alPrincipio && alPrincipio[2]) {
    cantidad = Number(alPrincipio[1].replace(",", "."));
    t = alPrincipio[2].trim();
  } else if (alFinal && alFinal[1] && /x\s*\d|\d\s*(u|unid)/i.test(linea)) {
    cantidad = Number(alFinal[2].replace(",", "."));
    t = alFinal[1].trim();
  }
  // Unidad escrita al principio: "2 cajas de Cable UTP".
  const u = t.match(/^(cajas?|bolsas?|packs?|metros?|rollos?|resmas?|litros?)\s+(?:de\s+)?(.*)$/i);
  if (u && u[2]) {
    unidad = u[1].toLowerCase().replace(/s$/, "");
    t = u[2].trim();
  }
  if (!t) return null;
  return { descripcion: t.charAt(0).toUpperCase() + t.slice(1), cantidad: cantidad > 0 ? cantidad : 1, unidad };
}
