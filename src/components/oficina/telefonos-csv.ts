/** Lectura de una lista de internos desde CSV (el mismo formato que exporta el sistema). */

export type FilaTelefono = { sector: string; nombre: string; interno: string; notas: string | null };

const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Separa una línea CSV respetando comillas ("a;b" queda como un solo valor). */
function separar(linea: string, sep: string) {
  const out: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (comillas) {
      if (c === '"' && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') comillas = false;
      else actual += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) {
      out.push(actual);
      actual = "";
    } else actual += c;
  }
  out.push(actual);
  return out.map((v) => v.trim());
}

const ALIAS: Record<keyof FilaTelefono, string[]> = {
  sector: ["sector", "area", "servicio", "oficina"],
  nombre: ["nombre", "persona", "contacto", "puesto"],
  interno: ["interno", "int", "numero", "telefono", "tel", "extension", "ext"],
  notas: ["notas", "nota", "observaciones", "obs", "comentario"],
};

export function parsearTelefonosCsv(texto: string): { filas: FilaTelefono[]; invalidas: number; error?: string } {
  const lineas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return { filas: [], invalidas: 0, error: "El archivo no tiene datos (falta el encabezado o las filas)." };
  const primera = lineas[0];
  const sep = [";", ",", "\t"].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
  const encabezado = separar(primera, sep).map(sinAcentos);
  const col = (k: keyof FilaTelefono) => encabezado.findIndex((h) => ALIAS[k].includes(h));
  const iSector = col("sector");
  const iNombre = col("nombre");
  const iInterno = col("interno");
  const iNotas = col("notas");
  if (iSector < 0 || iNombre < 0 || iInterno < 0) {
    return { filas: [], invalidas: 0, error: "Faltan columnas: el encabezado tiene que tener Sector, Nombre e Interno." };
  }
  const filas: FilaTelefono[] = [];
  let invalidas = 0;
  for (const linea of lineas.slice(1)) {
    const v = separar(linea, sep);
    const fila = {
      sector: v[iSector] ?? "",
      nombre: v[iNombre] ?? "",
      interno: (v[iInterno] ?? "").replace(/\s+/g, ""),
      notas: iNotas >= 0 && v[iNotas] ? v[iNotas] : null,
    };
    if (!fila.sector || !fila.nombre || !fila.interno) invalidas++;
    else filas.push(fila);
  }
  return { filas, invalidas };
}

/** Clave para detectar internos repetidos (mismo sector, nombre e interno). */
export function claveTelefono(f: { sector: string; nombre: string; interno: string }) {
  return `${sinAcentos(f.sector)}|${sinAcentos(f.nombre)}|${f.interno.replace(/\s+/g, "")}`;
}
